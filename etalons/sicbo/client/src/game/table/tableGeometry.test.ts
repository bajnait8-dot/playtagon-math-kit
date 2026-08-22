import { describe, it, expect } from "vitest";
import { tableLayout, TABLE_SIZE, type Orientation } from "./tableGeometry";

const ORIENTATIONS: Orientation[] = ["landscape", "portrait"];

describe("геометрия стола", () => {
  for (const o of ORIENTATIONS) {
    describe(o, () => {
      const zones = tableLayout(o);

      it("ровно 50 зон, типы уникальны", () => {
        expect(zones).toHaveLength(50);
        expect(new Set(zones.map((z) => z.type)).size).toBe(50);
      });

      it("зоны не пересекаются", () => {
        for (let i = 0; i < zones.length; i++) {
          for (let j = i + 1; j < zones.length; j++) {
            const a = zones[i]!, b = zones[j]!;
            const overlap =
              a.x < b.x + b.w && b.x < a.x + a.w &&
              a.y < b.y + b.h && b.y < a.y + a.h;
            expect(overlap, `${a.type} пересекается с ${b.type}`).toBe(false);
          }
        }
      });

      it("все зоны внутри стола", () => {
        const { w, h } = TABLE_SIZE[o];
        for (const z of zones) {
          expect(z.x, z.type).toBeGreaterThanOrEqual(0);
          expect(z.y, z.type).toBeGreaterThanOrEqual(0);
          expect(z.x + z.w, z.type).toBeLessThanOrEqual(w);
          expect(z.y + z.h, z.type).toBeLessThanOrEqual(h);
        }
      });

      it("у каждой зоны непустые подписи", () => {
        for (const z of zones) {
          expect(z.label.length, z.type).toBeGreaterThan(0);
          expect(z.payoutLabel.length, z.type).toBeGreaterThan(0);
        }
      });

      it("зоны достаточно крупные для тапа пальцем", () => {
        for (const z of zones) {
          expect(z.w, `${z.type} слишком узкая`).toBeGreaterThanOrEqual(40);
          expect(z.h, `${z.type} слишком низкая`).toBeGreaterThanOrEqual(40);
        }
      });

      it("все группы на месте", () => {
        const count = (p: string) => zones.filter((z) => z.type.startsWith(p)).length;
        expect(count("small") + count("big")).toBe(2);
        expect(count("triple_any")).toBe(1);
        expect(count("triple_") - count("triple_any")).toBe(6);
        expect(count("double_")).toBe(6);
        expect(count("total_")).toBe(14);
        expect(count("combo_")).toBe(15);
        expect(count("single_")).toBe(6);
      });
    });
  }

  it("портрет выше, чем шире; ландшафт наоборот", () => {
    expect(TABLE_SIZE.portrait.h).toBeGreaterThan(TABLE_SIZE.portrait.w);
    expect(TABLE_SIZE.landscape.w).toBeGreaterThan(TABLE_SIZE.landscape.h);
  });

  it("в ландшафте суммы идут ОДНИМ рядом", () => {
    const totals = tableLayout("landscape").filter((z) => z.type.startsWith("total_"));
    expect(new Set(totals.map((z) => z.y)).size).toBe(1);
  });

  it("в портрете суммы идут ДВУМЯ рядами по 7", () => {
    const totals = tableLayout("portrait").filter((z) => z.type.startsWith("total_"));
    const rows = new Set(totals.map((z) => z.y));
    expect(rows.size).toBe(2);
    for (const y of rows) expect(totals.filter((z) => z.y === y)).toHaveLength(7);
  });

  it("в ландшафте комбинации идут ОДНИМ рядом из 15", () => {
    const combos = tableLayout("landscape").filter((z) => z.type.startsWith("combo_"));
    expect(new Set(combos.map((z) => z.y)).size).toBe(1);
  });

  it("в портрете комбинации идут ТРЕМЯ рядами по 5", () => {
    const combos = tableLayout("portrait").filter((z) => z.type.startsWith("combo_"));
    const rows = new Set(combos.map((z) => z.y));
    expect(rows.size).toBe(3);
    for (const y of rows) expect(combos.filter((z) => z.y === y)).toHaveLength(5);
  });

  it("суммы идут по возрастанию слева направо", () => {
    for (const o of ORIENTATIONS) {
      const totals = tableLayout(o)
        .filter((z) => z.type.startsWith("total_"))
        .sort((a, b) => (a.y - b.y) || (a.x - b.x));
      const order = totals.map((z) => Number(z.type.slice("total_".length)));
      expect(order, o).toEqual([4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17]);
    }
  });

  it("подписи коэффициентов совпадают с математикой стола", () => {
    const zones = tableLayout("landscape");
    const by = (t: string) => zones.find((z) => z.type === t)!;
    expect(by("small").payoutLabel).toBe("1:1");
    expect(by("triple_any").payoutLabel).toBe("30:1");
    expect(by("triple_4").payoutLabel).toBe("180:1");
    expect(by("double_2").payoutLabel).toBe("10:1");
    expect(by("total_4").payoutLabel).toBe("60:1");
    expect(by("total_9").payoutLabel).toBe("6:1");
    expect(by("combo_12").payoutLabel).toBe("6:1");
  });

  it("SMALL и BIG наверху, single-ставки внизу — порядок ярусов как на столе", () => {
    for (const o of ORIENTATIONS) {
      const zones = tableLayout(o);
      const small = zones.find((z) => z.type === "small")!;
      const singles = zones.filter((z) => z.type.startsWith("single_"));
      const totals = zones.filter((z) => z.type.startsWith("total_"));
      const minSingleY = Math.min(...singles.map((z) => z.y));
      const maxTotalY = Math.max(...totals.map((z) => z.y));
      expect(small.y, `${o}: SMALL должен быть выше сумм`).toBeLessThan(maxTotalY);
      expect(minSingleY, `${o}: single ниже сумм`).toBeGreaterThan(maxTotalY);
    }
  });
});
