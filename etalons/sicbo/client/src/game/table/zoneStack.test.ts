import { describe, it, expect } from "vitest";

/**
 * Что вьюха выкладывает на зоне: `ставка − то, что ещё летит`.
 *
 * Проверяется ЧИСТАЯ арифметика решения, без Pixi. Именно она дважды давала
 * баги: стопка появлялась целиком в конце (когда pending был счётчиком, а не
 * суммой) и улетала при повторном тапе (когда guard сравнивал строгим `>`).
 */

/** Решение вьюхи для одной зоны. */
type Action =
  | { kind: "skip" }              // трогать стопку нельзя
  | { kind: "clear" }             // снять всё (UNDO / CLEAR)
  | { kind: "lay"; target: number }; // выложить столько минорных единиц

function decide(bet: number, inFlight: number): Action {
  // Резерв под полёт делается ДО place, поэтому bet на миг отстаёт от inFlight.
  if (inFlight > 0 && inFlight >= bet) return { kind: "skip" };
  const target = bet - inFlight;
  if (target <= 0) return { kind: "clear" };
  return { kind: "lay", target };
}

describe("что показываем на зоне", () => {
  it("первый тап: фишка ещё летит — на столе пусто, но стопку не сносим", () => {
    // holdZone(+100) прошёл, place ещё нет.
    expect(decide(0, 100)).toEqual({ kind: "skip" });
  });

  it("фишка приземлилась — выкладываем её", () => {
    expect(decide(100, 0)).toEqual({ kind: "lay", target: 100 });
  });

  it("ПОВТОРНЫЙ тап по занятой зоне не сносит лежащую стопку", () => {
    // Регресс, который это ловит: bet=100 (старый), inFlight=100 (резерв под
    // вторую фишку) → target=0 → стопка улетала, хотя игрок доложил фишку.
    expect(decide(100, 100)).toEqual({ kind: "skip" });
  });

  it("после place второй фишки выкладываем ровно разницу", () => {
    // bet уже 200, одна фишка ещё в воздухе.
    expect(decide(200, 100)).toEqual({ kind: "lay", target: 100 });
  });

  it("три быстрых тапа: показываем только приземлившиеся", () => {
    expect(decide(300, 200)).toEqual({ kind: "lay", target: 100 });
    expect(decide(300, 100)).toEqual({ kind: "lay", target: 200 });
    expect(decide(300, 0)).toEqual({ kind: "lay", target: 300 });
  });

  it("UNDO / CLEAR: ставки нет и ничего не летит — снимаем", () => {
    expect(decide(0, 0)).toEqual({ kind: "clear" });
  });
});
