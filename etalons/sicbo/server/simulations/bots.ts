import type { IBot } from "@playtagon/model-sdk";
import type { SicBoBet, SicBoBetType, SicBoGameTypes } from "../model/types.js";

/**
 * Боты Sic Bo: раунд ОДНОШАГОВЫЙ, roundContext всегда null, и решение у бота
 * ровно одно — какие зоны занять и на сколько.
 *
 * Область ходьбы бота приходит ПАРАМЕТРОМ (список зон), а не берётся из
 * констант модуля: worker-файл выводит её из значений ДЕЙСТВУЮЩЕГО конфига
 * (Регламент §11.2). Бот, ходящий вне области действующего конфига, измерял бы
 * несуществующий продукт.
 */

/** Бот, который каждый раунд ставит на один и тот же набор зон. */
export function createFixedBot(types: SicBoBetType[], bet?: number): IBot<SicBoGameTypes> {
  return {
    getGameRequest({ bets }) {
      const amount = bet ?? bets.default;
      return { bets: types.map((type) => ({ type, amount })) };
    },
  };
}

/**
 * Бот со случайной расстановкой: 1–4 РАЗНЫЕ зоны за раунд из переданной
 * области. Разные — потому что дубль зоны модель отвергает (фишки складывает
 * клиент).
 *
 * @param betTypes зоны действующего конфига — вся область исходов, по которой
 *                 канонический прогон измеряет математику пары.
 */
export function createRandomBot(betTypes: readonly SicBoBetType[]): IBot<SicBoGameTypes> {
  return {
    getGameRequest({ bets, rng }) {
      const count = rng.getInt(1, Math.min(4, betTypes.length));
      const picked = new Set<SicBoBetType>();
      while (picked.size < count) {
        picked.add(betTypes[rng.getInt(0, betTypes.length - 1)]!);
      }
      const out: SicBoBet[] = [...picked].map((type) => ({ type, amount: bets.default }));
      return { bets: out };
    },
  };
}

/** Набор по умолчанию для фиксированного бота — самые ходовые зоны стола. */
export const DEFAULT_SIM_BETS: SicBoBetType[] = ["small", "big"];
