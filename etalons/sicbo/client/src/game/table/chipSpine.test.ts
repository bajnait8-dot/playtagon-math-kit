import { describe, it, expect } from "vitest";
import { breakIntoChips } from "./chipSpine";

/**
 * Размен выплаты на фишки пака. Логика денежная, поэтому проверяется здесь,
 * а не глазами: сумма фишек ОБЯЗАНА совпадать с выплатой, иначе игрок увидит
 * на столе не то, что зачислено.
 */
describe("breakIntoChips", () => {
  const sum = (xs: number[]): number => Math.round(xs.reduce((a, b) => a + b, 0) * 100) / 100;

  it("раскладывает от крупных к мелким", () => {
    expect(breakIntoChips(180)).toEqual([100, 50, 25, 5]);
  });

  it("точная сумма сохраняется", () => {
    for (const v of [1, 5, 7, 12.5, 33, 180, 500, 1000]) {
      expect(sum(breakIntoChips(v))).toBeCloseTo(v, 2);
    }
  });

  it("номиналы пака: точное совпадение даёт одну фишку", () => {
    expect(breakIntoChips(100)).toEqual([100]);
    expect(breakIntoChips(0.5)).toEqual([0.5]);
  });

  it("при упоре в лимит остаток сворачивается в последнюю — сумма не теряется", () => {
    const chips = breakIntoChips(5000, 3);
    expect(chips).toHaveLength(3);
    expect(sum(chips)).toBeCloseTo(5000, 2);
  });

  it("сумма меньше самого мелкого номинала всё равно показывается", () => {
    // Пак начинается с 0.5, а RGS допускает ставки и мельче.
    const chips = breakIntoChips(0.2);
    expect(chips).toHaveLength(1);
    expect(sum(chips)).toBeCloseTo(0.2, 2);
  });

  it("ноль не даёт фишек", () => {
    expect(breakIntoChips(0)).toEqual([]);
  });
});
