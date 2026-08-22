import { describe, it, expect } from "vitest";
import { createRandomDiceBot, createFixedDiceBot } from "./bots.js";
import type { IBotContext } from "@playtagon/model-sdk";
import type { DiceGameTypes } from "../model/types.js";

// Детерминированный стаб RNG: выдаёт заданную последовательность.
function seqRng(values: number[]) {
  let i = 0;
  return {
    getInt: (min: number, max: number) => {
      const v = values[i++ % values.length];
      if (v < min || v > max) throw new Error(`стаб вне диапазона [${min},${max}]: ${v}`);
      return v;
    },
  };
}

const ctx = (rng: { getInt(min: number, max: number): number }): IBotContext<DiceGameTypes> => ({
  roundType: "normal",
  bets: { min: 100_000, max: 100_000_000, default: 100_000, list: [] },
  rng,
  roundContext: null,
  globalContext: null,
  playData: null,
});

describe("random-бот", () => {
  it("цель в [targetMin, targetMax], направление из rng, ставка = bets.default", () => {
    const bot = createRandomDiceBot(200, 9800);
    const r = bot.getGameRequest(ctx(seqRng([5000, 0])));
    expect(r).toEqual({ target: 5000, condition: "over", bet: 100_000 });
    const r2 = bot.getGameRequest(ctx(seqRng([200, 1])));
    expect(r2).toEqual({ target: 200, condition: "under", bet: 100_000 });
  });
});

describe("fixed-бот", () => {
  it("всегда одна и та же пара target/condition", () => {
    const bot = createFixedDiceBot(9800, "over");
    expect(bot.getGameRequest(ctx(seqRng([1, 2, 3])))).toEqual({
      target: 9800,
      condition: "over",
      bet: 100_000,
    });
  });
});
