import { describe, it, expect } from "vitest";
import scenarios from "./index.js";
import type { DiceGameRequest, DicePlayData } from "../model/types.js";

const req = (target: number, condition: "over" | "under"): DiceGameRequest => ({
  target,
  condition,
  bet: 100,
});
const play = (
  roll: number,
  target: number,
  condition: "over" | "under",
  win: number,
): DicePlayData => ({ roll, target, condition, multiplier: 1.98, win });
const ctx = { roundContext: null, globalContext: null };
const byName = (name: string) => {
  const s = scenarios.find((v) => v.name === name);
  if (!s) throw new Error(`нет сценария ${name}`);
  return s;
};
const validate = (name: string, r: DiceGameRequest, p: DicePlayData) =>
  byName(name).validate(r, ctx, ctx, p);

describe("контракт списка", () => {
  it("имена уникальны и не содержат зарезервированного hold", () => {
    const names = scenarios.map((s) => s.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names).not.toContain("hold");
  });

  it("все применимы всегда (раунд одношаговый, контекстов нет)", () => {
    for (const s of scenarios) expect(s.isApplicable(ctx)).toBe(true);
  });
});

describe("Win/Lose судят реальную механику, а не поле win", () => {
  it("over выигрывает строго при roll > target", () => {
    expect(validate("Win", req(5000, "over"), play(5001, 5000, "over", 198))).toBe(true);
    expect(validate("Win", req(5000, "over"), play(5000, 5000, "over", 0))).toBe(false);
    expect(validate("Lose", req(5000, "over"), play(5000, 5000, "over", 0))).toBe(true);
  });

  it("under выигрывает строго при roll < target", () => {
    expect(validate("Win", req(5000, "under"), play(4999, 5000, "under", 198))).toBe(true);
    expect(validate("Lose", req(5000, "under"), play(5000, 5000, "under", 0))).toBe(true);
  });
});

describe("границы", () => {
  it("edge: ровно roll === target", () => {
    expect(
      validate("Roll = target (edge, both lose)", req(700, "over"), play(700, 700, "over", 0)),
    ).toBe(true);
    expect(
      validate("Roll = target (edge, both lose)", req(700, "over"), play(701, 700, "over", 1)),
    ).toBe(false);
  });

  it("узкие зазоры target ± 1", () => {
    expect(
      validate("Roll = target + 1 (narrow over)", req(700, "over"), play(701, 700, "over", 1)),
    ).toBe(true);
    expect(
      validate("Roll = target - 1 (narrow under)", req(700, "under"), play(699, 700, "under", 1)),
    ).toBe(true);
  });

  it("края области броска и невозможный исход", () => {
    expect(validate("Roll 0 (min)", req(700, "over"), play(0, 700, "over", 0))).toBe(true);
    expect(validate("Roll 9999 (max)", req(700, "over"), play(9999, 700, "over", 14))).toBe(true);
    expect(validate("Roll 10000 (impossible)", req(700, "over"), play(9999, 700, "over", 14))).toBe(
      false,
    );
  });
});
