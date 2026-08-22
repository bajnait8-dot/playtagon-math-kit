import { describe, it, expect, beforeEach, vi } from "vitest";
import { pushHistory, historyEntries, clearHistory, subscribeHistory, MAX_ENTRIES, type HistoryEntry } from "./history";

const entry = (n: number, over: Partial<HistoryEntry> = {}): HistoryEntry => ({
  roundId: `r${n}`, at: n,
  roll: [1, 2, 3], total: 6, kind: "small",
  bet: 100, win: 0,
  ...over,
});

beforeEach(() => clearHistory());

describe("история раундов", () => {
  it("новые записи идут первыми", () => {
    pushHistory(entry(1));
    pushHistory(entry(2));
    expect(historyEntries()[0]!.roundId).toBe("r2");
  });

  it("длина не превышает лимит", () => {
    for (let i = 0; i < MAX_ENTRIES + 10; i++) pushHistory(entry(i));
    expect(historyEntries()).toHaveLength(MAX_ENTRIES);
  });

  it("при переполнении вытесняются САМЫЕ СТАРЫЕ", () => {
    for (let i = 0; i < MAX_ENTRIES + 3; i++) pushHistory(entry(i));
    const ids = historyEntries().map((e) => e.roundId);
    expect(ids).toContain(`r${MAX_ENTRIES + 2}`);   // последняя на месте
    expect(ids).not.toContain("r0");                 // первая вытеснена
  });

  it("хранит бросок, сумму и категорию — то, что показывает лента", () => {
    pushHistory(entry(1, { roll: [6, 6, 6], total: 18, kind: "triple" }));
    const e = historyEntries()[0]!;
    expect(e.roll).toEqual([6, 6, 6]);
    expect(e.total).toBe(18);
    expect(e.kind).toBe("triple");
  });

  it("подписчики узнают о новых раундах", () => {
    const fn = vi.fn();
    const off = subscribeHistory(fn);
    pushHistory(entry(1));
    expect(fn).toHaveBeenCalledTimes(1);
    off();
    pushHistory(entry(2));
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("возвращает КОПИЮ — внешняя правка не портит хранилище", () => {
    pushHistory(entry(1));
    historyEntries().pop();
    expect(historyEntries()).toHaveLength(1);
  });
});
