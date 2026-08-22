import type {
  IModel,
  InitArgs,
  InitResult,
  PlayArgs,
  PlayResult,
  VerifyArgs,
  VerifyResult,
} from "@playtagon/model-sdk";
import type { SicBoGameTypes } from "./types.js";
import { ALL_BET_TYPES } from "./config.js";
import {
  buildConfig,
  resolveConfig,
  type SicBoConfig,
  type SicBoKnobValues,
} from "./knobs.js";
import { rollDice, settleRound } from "./math.js";
import { RequestValidationError, validateRequest } from "./request.js";

export type { SicBoGameTypes } from "./types.js";
export { RequestValidationError } from "./request.js";
export { ConfigValidationError } from "./knobs.js";

/**
 * Фабрика модели — конвенция Регламента §4: значения ручек приходят аргументом
 * при старте сессии и валидируются против knobs собственной схемы (кривые
 * values — ConfigValidationError со списком ВСЕХ нарушений, не тихий дефолт).
 * Каждый вызов возвращает независимый экземпляр: одна версия модели держит
 * параллельные сессии с разными конфигами в одном процессе, глобального
 * состояния у модели нет.
 */
export function createModel(values: unknown): IModel<SicBoGameTypes> {
  return assembleModel(resolveConfig(values), (gameRequest) => {
    // Запрос обязан пройти собственную схему модели ДО всякого счёта. Проверка
    // идёт до розыгрыша — отвергнутый раунд не сжигает ни одного числа из
    // буфера RNG и не ломает верификацию следующего раунда (Регламент §7 п. 5).
    const violations = validateRequest(gameRequest);
    if (violations.length > 0) {
      throw new RequestValidationError(violations);
    }
  });
}

/**
 * Вторая половина пары конвенции (Регламент §11.1): сборка модели из
 * ЗАВЕДОМО-ВАЛИДНЫХ значений — ни чтения schema.json, ни валидации (значения
 * сертифицированы воротами платформы до впекания; в baked-артефакте валидация
 * не выполняется). ЕДИНСТВЕННЫЙ потребитель — генерируемый bake-адаптер
 * платформы; авторский код и все DEV-пути зовут createModel, где ENOENT схемы —
 * честная ошибка, а не тихое отключение валидации.
 */
export function buildModel(values: SicBoKnobValues): IModel<SicBoGameTypes> {
  return assembleModel(buildConfig(values), () => {});
}

function assembleModel(
  cfg: SicBoConfig,
  guardRequest: (gameRequest: unknown) => void,
): IModel<SicBoGameTypes> {
  return {
    // Provably-fair: РГС даёт детерминированный поток случайных чисел по
    // (serverSeed, clientSeed, nonce), и игрок может пересчитать бросок сам.
    rngMode: "fairness",

    init(_args: InitArgs<SicBoGameTypes>): InitResult<SicBoGameTypes> {
      return {
        initData: {
          betTypes: [...ALL_BET_TYPES],
          // Снимок коэффициентов ДЕЙСТВУЮЩЕГО конфига — источник подписей стола.
          payouts: { ...cfg.payouts },
          // История НЕ хранится на сервере: fairness-режим запрещает cross-round
          // context — раунд обязан выводиться только из пары сидов и нонса.
          // Её ведёт клиент.
          history: [],
        },
      };
    },

    /**
     * Раунд ОДНОШАГОВЫЙ: пришёл список ставок → бросок → выплата → конец.
     * roundComplete всегда true, roundContext всегда null — хранить между
     * запросами нечего.
     */
    play(args: PlayArgs<SicBoGameTypes>): PlayResult<SicBoGameTypes> {
      const { gameRequest, rng } = args;

      // Схемная проверка запроса — половина пары: DEV (createModel) валидирует
      // против schema.json#request до всякого счёта, baked-дорога (buildModel)
      // схемы не касается — валидация в артефакте не выполняется (§11.1).
      guardRequest(gameRequest);

      const bets = gameRequest.bets;
      const roll = rollDice(rng);
      const playData = settleRound(bets, roll, cfg.payouts);

      return {
        bet: playData.totalBet,
        win: playData.totalWin,
        roundComplete: true,
        roundContext: null,
        globalContext: null,
        playData,
        replayData: playData,
      };
    },

    /**
     * Пересчитать бросок из пары сидов — для окна проверки честности.
     * Расходует RNG ТОЧНО ТАК ЖЕ, как play() (три getInt подряд через
     * rollDice), иначе потоки разойдутся и проверка ничего не докажет.
     * Идемпотентен: состояния не меняет, на том же буфере даёт тот же бросок.
     */
    verify({ rng }: VerifyArgs): VerifyResult<SicBoGameTypes> {
      return { roll: rollDice(rng) };
    },
  };
}
