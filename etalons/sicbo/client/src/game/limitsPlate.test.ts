import { describe, it, expect } from "vitest";
import { betBounds } from "./limitsPlate";

describe("границы ставки — числа приходят от RGS, не из констант", () => {
  it("берёт минимум и максимум из списка init.bets", () => {
    expect(betBounds([10, 50, 100, 500, 5000])).toEqual({ min: 10, max: 5000 });
  });

  it("порядок в списке не важен", () => {
    expect(betBounds([500, 10, 5000, 100])).toEqual({ min: 10, max: 5000 });
  });

  it("один номинал — минимум равен максимуму", () => {
    expect(betBounds([100])).toEqual({ min: 100, max: 100 });
  });

  it("пустой список не роняет игру", () => {
    expect(betBounds([])).toEqual({ min: 0, max: 0 });
  });
});
