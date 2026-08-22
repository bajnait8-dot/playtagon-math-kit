import type { IBot } from "@playtagon/model-sdk";
import type { DiceCondition, DiceGameTypes } from "../model/types.js";

// Боты симуляции (13-simulation.md): случайность — только из ctx.rng, ставка —
// из диапазона SDK (bets.default). Границы цели приходят параметрами — у бота
// нет собственного знания о конфиге модели.

/** Каждый раунд — случайная цель в [targetMin, targetMax] и случайное направление. */
export function createRandomDiceBot(targetMin: number, targetMax: number): IBot<DiceGameTypes> {
  return {
    getGameRequest({ bets, rng }) {
      const target = rng.getInt(targetMin, targetMax);
      const condition: DiceCondition = rng.getInt(0, 1) === 0 ? "over" : "under";
      return { target, condition, bet: bets.default };
    },
  };
}

/** Фиксированная стратегия — для локальной отладки одного среза математики. */
export function createFixedDiceBot(target: number, condition: DiceCondition): IBot<DiceGameTypes> {
  return {
    getGameRequest({ bets }) {
      return { target, condition, bet: bets.default };
    },
  };
}
