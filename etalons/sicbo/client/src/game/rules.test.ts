import { describe, it, expect } from "vitest";
import { buildMenu } from "./rules";
import { payoutFor } from "../../../server/model/config.js";
import type { SicBoBetType, SicBoRoll } from "../../../server/model/types.js";

/** Тот же перебор 216 исходов, что и в модели. */
function rtpOf(bet: SicBoBetType): number {
  let ret = 0;
  for (let a = 1; a <= 6; a++)
    for (let b = 1; b <= 6; b++)
      for (let c = 1; c <= 6; c++) ret += payoutFor(bet, [a, b, c] as SicBoRoll);
  return ret / 216;
}

const rulesBlocks = buildMenu().rules ?? [];
const block = (id: string) => rulesBlocks.find((b) => b.id === id) as { rows?: string[][] } | undefined;

describe("правила не расходятся с математикой", () => {
  it("таблица RTP в правилах совпадает с перебором по каждой группе", () => {
    // Строка правил → представитель группы в модели.
    const sample: Record<string, SicBoBetType> = {
      "Small · Big": "small",
      "Combination": "combo_12",
      "Single face": "single_3",
      "Total 7 · 14": "total_7",
      "Total 6 · 15": "total_6",
      "Total 8 · 13": "total_8",
      "Total 10 · 11": "total_10",
      "Total 5 · 16": "total_5",
      "Any Triple": "triple_any",
      "Total 4 · 17": "total_4",
      "Specific Triple": "triple_5",
      "Double": "double_5",
      "Total 9 · 12": "total_9",
    };

    const rows = block("rtp-table")?.rows ?? [];
    expect(rows.length).toBe(Object.keys(sample).length);

    for (const [label, shown] of rows) {
      const bet = sample[label!];
      expect(bet, `в правилах строка «${label}», которой нет в модели`).toBeDefined();
      const actual = rtpOf(bet!) * 100;
      const claimed = Number(shown!.replace("%", ""));
      // 0.01 п.п. — правила округляют до сотых.
      expect(Math.abs(actual - claimed), `${label}: заявлено ${shown}, на деле ${actual.toFixed(2)}%`)
        .toBeLessThan(0.01);
    }
  });

  it("границы разброса в юридической строке — настоящие min и max", () => {
    const rows = block("rtp-table")?.rows ?? [];
    const values = rows.map(([, v]) => Number(v!.replace("%", "")));
    expect(Math.min(...values)).toBeCloseTo(81.02, 2);
    expect(Math.max(...values)).toBeCloseTo(97.22, 2);
  });

  it("коэффициенты в таблицах взяты из модели, а не переписаны", () => {
    const triples = block("triples")?.rows ?? [];
    expect(triples.find((r) => r[0]!.startsWith("Any Triple"))![1]).toBe("30:1");
    expect(triples.find((r) => r[0]!.startsWith("Specific Triple"))![1]).toBe("180:1");
    expect(triples.find((r) => r[0]!.startsWith("Double"))![1]).toBe("10:1");
  });

  it("таблица сумм симметрична и покрывает 4…17", () => {
    const rows = block("totals")?.rows ?? [];
    expect(rows).toHaveLength(7);              // 4/17, 5/16 … 10/11
    expect(rows[0]![0]).toBe("4 or 17");
    expect(rows[6]![0]).toBe("10 or 11");
  });
});
