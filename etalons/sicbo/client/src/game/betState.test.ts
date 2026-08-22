import { describe, it, expect, vi } from "vitest";
import { createBetState } from "./betState";

describe("betState", () => {
  it("копит фишки на зоне", () => {
    const s = createBetState();
    s.place("small", 10);
    s.place("small", 50);
    expect(s.onZone("small")).toBe(60);
    expect(s.total()).toBe(60);
  });

  it("UNDO снимает ПОСЛЕДНЮЮ фишку, а не всю зону", () => {
    const s = createBetState();
    s.place("small", 10);
    s.place("big", 50);
    s.undo();
    expect(s.onZone("big")).toBe(0);
    expect(s.onZone("small")).toBe(10);
    expect(s.total()).toBe(10);
  });

  it("UNDO снимает по одной фишке с одной зоны, а не обнуляет её", () => {
    const s = createBetState();
    s.place("small", 10);
    s.place("small", 10);
    s.place("small", 10);
    s.undo();
    expect(s.onZone("small")).toBe(20);
  });

  it("UNDO на пустом столе безопасен", () => {
    const s = createBetState();
    expect(() => s.undo()).not.toThrow();
    expect(s.total()).toBe(0);
  });

  it("CLEAR убирает всё", () => {
    const s = createBetState();
    s.place("small", 10);
    s.place("total_9", 20);
    s.clear();
    expect(s.total()).toBe(0);
    expect(s.bets()).toHaveLength(0);
  });

  it("bets() отдаёт по одной записи на зону, а не на фишку", () => {
    const s = createBetState();
    s.place("small", 10);
    s.place("small", 10);
    s.place("big", 30);
    const b = s.bets();
    expect(b).toHaveLength(2);
    expect(b.find((x) => x.type === "small")!.amount).toBe(20);
  });

  it("isEmpty отражает наличие ставок", () => {
    const s = createBetState();
    expect(s.isEmpty()).toBe(true);
    s.place("big", 10);
    expect(s.isEmpty()).toBe(false);
    s.clear();
    expect(s.isEmpty()).toBe(true);
  });

  it("snapshot/restore переносит расстановку — основа REBET", () => {
    const s = createBetState();
    s.place("small", 10);
    s.place("triple_any", 50);
    const snap = s.snapshot();

    s.clear();
    expect(s.total()).toBe(0);

    s.restore(snap);
    expect(s.total()).toBe(60);
    expect(s.onZone("triple_any")).toBe(50);
  });

  it("снимок НЕ меняется вслед за состоянием", () => {
    const s = createBetState();
    s.place("small", 10);
    const snap = s.snapshot();
    s.place("small", 10);
    expect(snap.find((b) => b.type === "small")!.amount).toBe(10);
  });

  it("restore не делится ссылками со снимком", () => {
    const s = createBetState();
    const snap = [{ type: "small" as const, amount: 10 }];
    s.restore(snap);
    s.place("small", 5);
    expect(snap[0]!.amount).toBe(10);
  });

  it("подписчики зовутся на каждое изменение", () => {
    const s = createBetState();
    const fn = vi.fn();
    const off = s.subscribe(fn);
    s.place("small", 10);
    s.undo();
    s.clear();
    expect(fn).toHaveBeenCalledTimes(3);
    off();
    s.place("big", 10);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("бесполезный UNDO подписчиков не тревожит", () => {
    const s = createBetState();
    const fn = vi.fn();
    s.subscribe(fn);
    s.undo();
    expect(fn).not.toHaveBeenCalled();
  });
});

/**
 * ЛИМИТЫ НА КЛИЕНТЕ. Их не было вовсе: сервер отвергал ставку сверх max bet,
 * но игрок узнавал об этом только после PLAY — набрал сумму при лимите и
 * получил ошибку вместо блокировки на входе. Баг унаследован всеми столами
 * серии (Tai Xiu, рулетка), потому что код разошёлся отсюда.
 */
describe("лимиты стола", () => {
  const make = (over: Partial<{ min: number; maxPerRound: number; balance: number }> = {}) => {
    const balance = over.balance ?? 100_000_00;
    return createBetState({
      min: over.min ?? 100,
      maxPerRound: over.maxPerRound ?? 1000_00,
      balance: () => balance,
    });
  };

  it("НЕ пускает сумму сверх max bet", () => {
    const s = make({ maxPerRound: 500 });
    expect(s.place("small", 300)).toBe(true);
    expect(s.place("big", 300)).toBe(false);
    expect(s.total()).toBe(300);
  });

  it("ставка РОВНО в потолок проходит, следующая — нет", () => {
    const s = make({ maxPerRound: 500 });
    expect(s.place("small", 500)).toBe(true);
    expect(s.headroom()).toBe(0);
    expect(s.place("big", 100)).toBe(false);
  });

  it("НЕ пускает ставку ниже min на зону", () => {
    const s = make({ min: 100 });
    expect(s.place("small", 99)).toBe(false);
    expect(s.place("small", 100)).toBe(true);
  });

  it("ограничивает БАЛАНСОМ, а не только лимитом стола", () => {
    const s = make({ maxPerRound: 1000_00, balance: 250 });
    expect(s.place("small", 200)).toBe(true);
    expect(s.place("big", 100)).toBe(false);
  });

  it("нулевая и отрицательная ставка отвергаются всегда", () => {
    const s = make();
    expect(s.place("small", 0)).toBe(false);
    expect(s.place("small", -100)).toBe(false);
  });

  it("без лимитов ведёт себя как раньше — для тестов и отладки", () => {
    const s = createBetState();
    expect(s.place("small", 1)).toBe(true);
    expect(s.place("big", 999_999_00)).toBe(true);
  });
});
