import { describe, it, expect } from "vitest";
import { isBigWin, BIG_WIN_MULTIPLIER } from "./winPlate";

describe("порог крупного выигрыша", () => {
  it("порог — ×20 от ставки", () => {
    expect(BIG_WIN_MULTIPLIER).toBe(20);
  });

  it("рядовой Small/Big (2× возврата) — НЕ крупный", () => {
    expect(isBigWin(200, 100)).toBe(false);
  });

  it("ANY TRIPLE (31×) — крупный", () => {
    expect(isBigWin(3100, 100)).toBe(true);
  });

  it("тройка (181×) — крупный", () => {
    expect(isBigWin(18_100, 100)).toBe(true);
  });

  it("дабл (11×) — НЕ крупный: он ниже порога", () => {
    expect(isBigWin(1100, 100)).toBe(false);
  });

  it("ровно на пороге — крупный", () => {
    expect(isBigWin(2000, 100)).toBe(true);
  });

  it("чуть ниже порога — не крупный", () => {
    expect(isBigWin(1999, 100)).toBe(false);
  });

  it("проигрыш крупным не бывает", () => {
    expect(isBigWin(0, 100)).toBe(false);
  });

  it("нулевая ставка не делит на ноль", () => {
    expect(isBigWin(0, 0)).toBe(false);
    expect(isBigWin(500, 0)).toBe(false);
  });
});
