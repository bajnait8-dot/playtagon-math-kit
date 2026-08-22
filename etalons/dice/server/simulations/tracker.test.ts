import { describe, it, expect } from "vitest";
import { createDiceTracker } from "./tracker.js";
import type { DicePlayData } from "../model/types.js";

const stage = (
  roll: number,
  target: number,
  condition: "over" | "under",
  multiplier: number,
  win: number,
): { win: number; playData: DicePlayData } => ({
  win,
  playData: { roll, target, condition, multiplier, win },
});

const round = (stages: Array<{ win: number; playData: DicePlayData }>, bet = 100) => ({
  totalBet: bet,
  totalWin: stages.reduce((s, x) => s + x.win, 0),
  stages,
  roundContext: null,
});

describe("DiceTracker судит теорию против факта", () => {
  it("копит теоретический шанс: over = (9999−target)/10000, under = target/10000", () => {
    const t = createDiceTracker();
    t.pushRoundResult(round([stage(5001, 5000, "over", 1.9804, 198)]));
    t.pushRoundResult(round([stage(100, 1000, "under", 9.9, 990)]));
    const r = t.getResult() as Record<string, number>;
    expect(r.rounds).toBe(2);
    expect(r.hitRate).toBe(1);
    expect(r.expectedHitRate).toBeCloseTo(((9999 - 5000) / 10000 + 1000 / 10000) / 2, 12);
  });

  it("expectedRtp — среднее winChance × multiplier (у честной модели = ручка rtp)", () => {
    const t = createDiceTracker();
    t.pushRoundResult(round([stage(1, 5000, "over", 1.9804, 0)]));
    const r = t.getResult() as Record<string, number>;
    expect(r.expectedRtp).toBeCloseTo(((9999 - 5000) / 10000) * 1.9804, 12);
  });

  it("edgeRollShare считает roll === target; byCondition раскладывает стороны", () => {
    const t = createDiceTracker();
    t.pushRoundResult(round([stage(700, 700, "over", 10.75, 0)]));
    t.pushRoundResult(round([stage(500, 700, "under", 14.14, 1414)]));
    const r = t.getResult() as {
      edgeRollShare: number;
      byCondition: Record<string, { rounds: number; hitRate: number }>;
    };
    expect(r.edgeRollShare).toBe(0.5);
    expect(r.byCondition.over.rounds).toBe(1);
    expect(r.byCondition.over.hitRate).toBe(0);
    expect(r.byCondition.under.hitRate).toBe(1);
  });

  it("maxMultiplierSeen — только по фактическим выигрышам", () => {
    const t = createDiceTracker();
    t.pushRoundResult(round([stage(1, 9800, "over", 49.7487, 0)]));
    t.pushRoundResult(round([stage(9999, 9800, "over", 49.7487, 4975)]));
    const r = t.getResult() as { maxMultiplierSeen: number };
    expect(r.maxMultiplierSeen).toBeCloseTo(49.7487, 4);
  });
});
