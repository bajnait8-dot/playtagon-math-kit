import { describe, it, expect } from "vitest";
import { ALL_BET_TYPES, PAYOUTS, WIN_CAP, rollCategory } from "./config.js";
import { payoutFor } from "./math.js";
import type { SicBoRoll, SicBoBetType } from "./types.js";

/** Все 216 исходов трёх кубиков. */
function allRolls(): SicBoRoll[] {
  const out: SicBoRoll[] = [];
  for (let a = 1; a <= 6; a++)
    for (let b = 1; b <= 6; b++)
      for (let c = 1; c <= 6; c++) out.push([a, b, c] as SicBoRoll);
  return out;
}

describe("состав стола", () => {
  it("ровно 50 типов ставок, у каждого есть коэффициент", () => {
    expect(ALL_BET_TYPES).toHaveLength(50);
    expect(new Set(ALL_BET_TYPES).size).toBe(50);
    for (const t of ALL_BET_TYPES) expect(PAYOUTS[t]).toBeGreaterThan(0);
  });

  it("группы: 2 + 1 + 6 + 6 + 14 + 15 + 6 = 50", () => {
    const count = (p: string) => ALL_BET_TYPES.filter((t) => t.startsWith(p)).length;
    expect(count("small") + count("big")).toBe(2);
    expect(count("triple_any")).toBe(1);
    expect(count("triple_") - count("triple_any")).toBe(6);
    expect(count("double_")).toBe(6);
    expect(count("total_")).toBe(14);
    expect(count("combo_")).toBe(15);
    expect(count("single_")).toBe(6);
  });
});

/** RTP группы = средний возврат по всем 216 исходам. */
function rtpOf(bet: SicBoBetType): number {
  const rolls = allRolls();
  const ret = rolls.reduce((s, r) => s + payoutFor(bet, r, PAYOUTS), 0);
  return ret / rolls.length;
}

describe("RTP по группам — канонические коэффициенты", () => {
  // Числа посчитаны перебором 216 исходов при коэффициентах с референса.
  // Не сходится — ошибка в КОЭФФИЦИЕНТЕ, а не повод подогнать тест.
  const cases: Array<[SicBoBetType, number]> = [
    ["small", 0.972], ["big", 0.972],
    ["combo_12", 0.972],
    ["single_3", 0.9213],
    ["total_7", 0.9028], ["total_14", 0.9028],
    ["total_6", 0.8796], ["total_15", 0.8796],
    ["total_8", 0.875], ["total_10", 0.875],
    ["total_5", 0.8611], ["triple_any", 0.8611],
    ["total_4", 0.8472], ["total_17", 0.8472],
    ["triple_5", 0.838],
    ["double_5", 0.8148],
    ["total_9", 0.8102], ["total_12", 0.8102],
  ];

  for (const [bet, expected] of cases) {
    it(`${bet} → RTP ${(expected * 100).toFixed(2)}%`, () => {
      expect(rtpOf(bet)).toBeCloseTo(expected, 3);
    });
  }

  it("разброс RTP укладывается в 81%…98% — единого числа у игры нет", () => {
    const all = ALL_BET_TYPES.map(rtpOf);
    expect(Math.min(...all)).toBeGreaterThan(0.80);
    expect(Math.max(...all)).toBeLessThan(0.98);
  });

  it("ни одна ставка не платит больше WIN_CAP", () => {
    for (const t of ALL_BET_TYPES)
      for (const r of allRolls()) expect(payoutFor(t, r, PAYOUTS)).toBeLessThanOrEqual(WIN_CAP);
  });
});

describe("правила отдельных ставок", () => {
  it("small/big НЕ платят на тройке", () => {
    expect(payoutFor("small", [2, 2, 2], PAYOUTS)).toBe(0);   // сумма 6, но тройка
    expect(payoutFor("big", [5, 5, 5], PAYOUTS)).toBe(0);     // сумма 15, но тройка
  });

  it("single платит по числу совпадений: 1→2×, 2→3×, 3→4× возврата", () => {
    expect(payoutFor("single_4", [4, 1, 2], PAYOUTS)).toBe(2);
    expect(payoutFor("single_4", [4, 4, 2], PAYOUTS)).toBe(3);
    expect(payoutFor("single_4", [4, 4, 4], PAYOUTS)).toBe(4);
    expect(payoutFor("single_4", [1, 2, 3], PAYOUTS)).toBe(0);
  });

  it("combo требует ОБЕ грани; пара одинаковых не считается", () => {
    expect(payoutFor("combo_25", [2, 5, 1], PAYOUTS)).toBe(7);
    expect(payoutFor("combo_25", [2, 2, 5], PAYOUTS)).toBe(7);
    expect(payoutFor("combo_25", [2, 2, 2], PAYOUTS)).toBe(0);
  });

  it("double срабатывает и на тройке (три штуки — это и две тоже)", () => {
    expect(payoutFor("double_3", [3, 3, 1], PAYOUTS)).toBe(11);
    expect(payoutFor("double_3", [3, 3, 3], PAYOUTS)).toBe(11);
  });
});

describe("rollCategory — что показывает лента раундов", () => {
  it("тройка помечается отдельно, а не как small/big", () => {
    expect(rollCategory([1, 1, 1])).toEqual({ total: 3, kind: "triple" });
    expect(rollCategory([6, 6, 6])).toEqual({ total: 18, kind: "triple" });
  });

  it("4–10 — small, 11–17 — big", () => {
    expect(rollCategory([1, 2, 3])).toEqual({ total: 6, kind: "small" });
    expect(rollCategory([6, 5, 4])).toEqual({ total: 15, kind: "big" });
  });
});
