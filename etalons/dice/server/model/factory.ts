import type {
  IModel,
  InitResult,
  PlayArgs,
  PlayResult,
  VerifyArgs,
  VerifyResult,
} from "@playtagon/model-sdk";
import type { DiceGameTypes } from "./types.js";
import { ROLL_MIN, ROLL_MAX, buildConfig, resolveConfig, type DiceConfig } from "./config.js";
import { validateRequest, RequestValidationError } from "./request.js";

export type { DiceGameTypes } from "./types.js";
export { RequestValidationError } from "./request.js";
export { ConfigValidationError } from "./config.js";

const SCALE = ROLL_MAX - ROLL_MIN + 1; // 10000

function calculateWinChance(target: number, condition: "over" | "under"): number {
  if (condition === "over") {
    return (ROLL_MAX - target) / SCALE;
  }
  return target / SCALE;
}

/**
 * Фабрика модели — конвенция §1.5.1: значения ручек приходят аргументом при
 * старте сессии и валидируются против knobs собственной схемы (кривые values —
 * ConfigValidationError, не тихий дефолт). Каждый вызов возвращает независимый
 * экземпляр: одна версия модели держит параллельные сессии с разными конфигами
 * в одном процессе, глобального состояния у модели нет.
 */
export function createModel(values: unknown): IModel<DiceGameTypes> {
  return assembleModel(resolveConfig(values), (gameRequest) => {
    // Запрос обязан пройти собственную схему модели до всякого счёта: считать
    // с мусорным входом запрещено (§ «Валидация запроса», protocol.md §4).
    // Проверка идёт ДО розыгрыша — отвергнутый раунд не сжигает число из буфера
    // RNG и не ломает верификацию следующего раунда.
    const violations = validateRequest(gameRequest);
    if (violations.length > 0) {
      throw new RequestValidationError(violations);
    }
  });
}

/**
 * Вторая половина пары конвенции (вердикт штаба (б′), 2026-08-19; Регламент
 * §11.1): сборка модели из ЗАВЕДОМО-ВАЛИДНЫХ значений — ни чтения schema.json,
 * ни валидации (значения сертифицированы воротами платформы до впекания;
 * в baked-артефакте валидация не выполняется). Проверки против действующего
 * конфига внутри play() остаются — это математика, границы задаёт конфиг,
 * а не схема. ЕДИНСТВЕННЫЙ потребитель — генерируемый bake-адаптер платформы;
 * авторский код и все DEV-пути зовут createModel, где ENOENT схемы — честная
 * ошибка, а не тихое отключение валидации.
 */
export function buildModel(values: Record<string, number>): IModel<DiceGameTypes> {
  return assembleModel(buildConfig(values), () => {});
}

function assembleModel(
  cfg: DiceConfig,
  guardRequest: (gameRequest: unknown) => void,
): IModel<DiceGameTypes> {
  const calculateMultiplier = (winChance: number): number => {
    if (winChance <= 0) return 0;
    return cfg.rtp / winChance;
  };

  return {
    // Provably-fair: the RGS supplies a committed, deterministic rng buffer. All randomness is
    // rolled on the first (only) sub-round and no cross-round global context is kept — the roll
    // history now lives client-side (session state). Fairness games must implement verify().
    rngMode: "fairness",

    init(): InitResult<DiceGameTypes> {
      return {
        initData: {
          rollMin: ROLL_MIN,
          rollMax: ROLL_MAX,
          targetMin: cfg.targetMin,
          targetMax: cfg.targetMax,
          defaultTarget: cfg.defaultTarget,
          rtp: cfg.rtp,
        },
      };
    },

    play(args: PlayArgs<DiceGameTypes>): PlayResult<DiceGameTypes> {
      const { gameRequest, rng } = args;

      // Схемная проверка запроса — половина пары: DEV (createModel) валидирует
      // против schema.json#request до всякого счёта, baked-дорога (buildModel)
      // схемы не касается — валидация в артефакте не выполняется (§11.1).
      guardRequest(gameRequest);

      const { target, condition, bet } = gameRequest;

      // Границы задают ручки действующего конфига (x-bounds); выход за них —
      // дефект запроса, а не сбой математики: рантайм по err.name отвечает 400.
      if (target < cfg.targetMin || target > cfg.targetMax) {
        throw new RequestValidationError([
          `Invalid target: ${target}. Must be between ${cfg.targetMin} and ${cfg.targetMax}.`,
        ]);
      }

      if (condition !== "over" && condition !== "under") {
        throw new RequestValidationError([
          `Invalid condition: ${condition}. Must be "over" or "under".`,
        ]);
      }

      const roll = rng.getInt(ROLL_MIN, ROLL_MAX);
      const winChance = calculateWinChance(target, condition);
      const multiplier = calculateMultiplier(winChance);

      const isWin =
        condition === "over" ? roll > target : roll < target;

      const win = isWin ? Math.round(bet * multiplier) : 0;

      return {
        bet,
        win,
        roundComplete: true,
        roundContext: null,
        globalContext: null,
        playData: {
          roll,
          target,
          condition,
          multiplier,
          win,
        },
        replayData: {
          roll,
          target,
          condition,
          multiplier,
          bet,
          win,
        },
      };
    },

    // Re-derive the round's roll from the committed rng buffer for the verification viewer.
    // Consumes RNG identically to play() (exactly one getInt draw) so the two stay in lockstep.
    verify({ rng }: VerifyArgs): VerifyResult<DiceGameTypes> {
      const roll = rng.getInt(ROLL_MIN, ROLL_MAX);
      return { roll };
    },
  };
}
