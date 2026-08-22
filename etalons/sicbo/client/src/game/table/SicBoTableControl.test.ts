import { describe, it, expect, vi } from "vitest";
import { SicBoTableControl } from "./SicBoTableControl";

const make = () => new SicBoTableControl({ id: "table", layout: { anchor: "center" } });

describe("SicBoTableControl", () => {
  it("на старте все зоны пустые", () => {
    const c = make();
    expect(c.amountAt("small")).toBe(0);
    expect(c.occupied()).toHaveLength(0);
  });

  it("хранит сумму на зоне", () => {
    const c = make();
    c.setAmount("small", 150);
    expect(c.amountAt("small")).toBe(150);
    expect(c.occupied()).toEqual(["small"]);
  });

  it("нулевая сумма освобождает зону, а не хранит ноль", () => {
    const c = make();
    c.setAmount("small", 150);
    c.setAmount("small", 0);
    expect(c.amountAt("small")).toBe(0);
    expect(c.occupied()).toHaveLength(0);
  });

  it("подсветка выигравших зон", () => {
    const c = make();
    c.highlight(["small", "total_9"]);
    expect(c.isWinning("small")).toBe(true);
    expect(c.isWinning("big")).toBe(false);
  });

  it("новая подсветка заменяет старую, а не добавляется к ней", () => {
    const c = make();
    c.highlight(["small"]);
    c.highlight(["big"]);
    expect(c.isWinning("small")).toBe(false);
    expect(c.isWinning("big")).toBe(true);
  });

  it("reset чистит и суммы, и подсветку", () => {
    const c = make();
    c.setAmount("small", 100);
    c.highlight(["small"]);
    c.reset();
    expect(c.amountAt("small")).toBe(0);
    expect(c.isWinning("small")).toBe(false);
  });

  it("в состоянии disabled стол не кликабелен", () => {
    const c = make();
    expect(c.interactable).toBe(true);
    c.setState("disabled");
    expect(c.interactable).toBe(false);
  });

  it("подписчики узнают об изменениях зон", () => {
    const c = make();
    const fn = vi.fn();
    const off = c.onChange(fn);
    c.setAmount("small", 10);
    c.highlight(["small"]);
    c.reset();
    expect(fn).toHaveBeenCalledTimes(3);
    off();
    c.setAmount("big", 10);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("роль контрола — grid, как у сетки mines: раскладка их не различает", () => {
    expect(make().role).toBe("grid");
  });
});
