import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { modelSchema } from "./schema-source.js";
import { ALL_BET_TYPES } from "./config.js";

// Схема — «истина для проверки» (Регламент §1), и обещания, которые она даёт
// словами, обязаны быть правдой в числах. Этот файл запирает именно это:
// объявленные границы ручек равны математическим пределам игры, а не взяты
// на глаз. Разъехались — красный тест, а не тихо расширенная область конфига.

const schema = modelSchema() as unknown as {
  modelId: string;
  sdkVersion: string;
  rngMode: string;
  entry: { module: string; export: string };
  knobs: Record<string, {
    type: string;
    min?: number;
    max?: number;
    default?: unknown;
    required?: string[];
    properties?: Record<string, { type: string; min: number; max: number; default: number }>;
  }>;
  request: Record<string, unknown>;
  initData: Record<string, unknown>;
  playData: Record<string, unknown>;
  replayData: Record<string, unknown>;
  verifyData: Record<string, unknown>;
};

/** Все 216 исходов трёх костей — источник всех вероятностей игры. */
const ROLLS: Array<[number, number, number]> = (() => {
  const out: Array<[number, number, number]> = [];
  for (let a = 1; a <= 6; a++)
    for (let b = 1; b <= 6; b++)
      for (let c = 1; c <= 6; c++) out.push([a, b, c]);
  return out;
})();

const count = (pred: (r: number[]) => boolean) => ROLLS.filter(pred).length;
const sum = (r: number[]) => r[0]! + r[1]! + r[2]!;
const isTriple = (r: number[]) => r[0] === r[1] && r[1] === r[2];

/**
 * Наибольший ЦЕЛЫЙ коэффициент, при котором RTP зоны не превышает 100%.
 * RTP = p × (payout + 1) ⇒ payout ≤ 216/hits − 1. Граница включительная:
 * игра ровно в ноль законна, в минус дому — нет.
 */
const maxIntPayout = (hits: number) => Math.floor(216 / hits - 1);

describe("обязательные секции schema.json", () => {
  it("объявлены все секции Регламента §5", () => {
    for (const key of [
      "modelId", "sdkVersion", "rngMode", "entry", "knobs",
      "request", "initData", "playData", "replayData", "verifyData",
    ]) {
      expect(schema, `нет секции ${key}`).toHaveProperty(key);
    }
  });

  it("fairness-модель: rngMode и verifyData на месте", () => {
    expect(schema.rngMode).toBe("fairness");
    expect(schema.verifyData).toBeDefined();
  });

  it("секции данных закрыты: additionalProperties false", () => {
    for (const key of ["request", "initData", "playData", "replayData", "verifyData"] as const) {
      expect(schema[key].additionalProperties, `${key} открыта`).toBe(false);
    }
  });

  it("внешних $schema-URL нет ни в схеме, ни в config.json", () => {
    const schemaText = readFileSync(new URL("../schema.json", import.meta.url), "utf8");
    const configText = readFileSync(new URL("../config.json", import.meta.url), "utf8");
    expect(schemaText).not.toContain("$schema");
    expect(configText).not.toContain("$schema");
  });

  it("entry указывает на существующий модуль с фабрикой", async () => {
    expect(schema.entry.module).toBe("model/playtagon.ts");
    expect(schema.entry.export).toBe("createModel");
    const mod = await import("./playtagon.js");
    expect(typeof mod.createModel).toBe("function");
    expect(typeof mod.buildModel).toBe("function");
  });

  it("x-role в схеме нет: единого заявленного RTP у игры не существует", () => {
    // Решение владельца (Регламент 5.3.1 допускает declaredRtp: null).
    const text = readFileSync(new URL("../schema.json", import.meta.url), "utf8");
    expect(text).not.toContain("x-role");
  });

  it("x-bounds нет: ручек, задающих границы полей запроса, у модели нет", () => {
    expect(JSON.stringify(schema.request)).not.toContain("x-bounds");
  });
});

describe("типы ручек — из закрытого словаря v2 (Регламент 5.7.1)", () => {
  const allowed = new Set(["number", "int", "bool", "string", "array", "object"]);

  it("каждый узел объявления — известного типа", () => {
    for (const [name, decl] of Object.entries(schema.knobs)) {
      expect(allowed.has(decl.type), `${name}: тип ${decl.type}`).toBe(true);
      if (decl.type === "object") {
        for (const [key, elem] of Object.entries(decl.properties!)) {
          expect(allowed.has(elem.type), `${name}.${key}: тип ${elem.type}`).toBe(true);
        }
      }
    }
  });
});

describe("границы ручек равны математическим пределам игры", () => {
  it("total_payouts: max каждой суммы — предел RTP = 100% этой суммы", () => {
    const props = schema.knobs.total_payouts!.properties!;
    for (let S = 4; S <= 17; S++) {
      const hits = count((r) => sum(r) === S);
      expect(props[String(S)]!.max, `сумма ${S} (${hits}/216)`).toBe(maxIntPayout(hits));
    }
  });

  it("скалярные ручки: max — предел RTP = 100% своей группы", () => {
    const cases: Array<[string, number]> = [
      ["triple_specific_payout", count((r) => isTriple(r) && r[0] === 3)],
      ["triple_any_payout", count(isTriple)],
      ["double_payout", count((r) => r.filter((v) => v === 3).length >= 2)],
      ["combo_payout", count((r) => r.includes(1) && r.includes(2))],
    ];
    for (const [name, hits] of cases) {
      expect(schema.knobs[name]!.max, `${name} (${hits}/216)`).toBe(maxIntPayout(hits));
    }
  });

  it("на верхней границе RTP не превышает 100% ни у одной ручки", () => {
    const groups: Array<[string, number, number]> = [
      ["triple_specific_payout", count((r) => isTriple(r) && r[0] === 3), schema.knobs.triple_specific_payout!.max!],
      ["triple_any_payout", count(isTriple), schema.knobs.triple_any_payout!.max!],
      ["double_payout", count((r) => r.filter((v) => v === 3).length >= 2), schema.knobs.double_payout!.max!],
      ["combo_payout", count((r) => r.includes(1) && r.includes(2)), schema.knobs.combo_payout!.max!],
    ];
    for (const [name, hits, max] of groups) {
      const rtp = (hits / 216) * (max + 1);
      expect(rtp, `${name} при max=${max}`).toBeLessThanOrEqual(1);
    }
    const props = schema.knobs.total_payouts!.properties!;
    for (let S = 4; S <= 17; S++) {
      const hits = count((r) => sum(r) === S);
      const rtp = (hits / 216) * (props[String(S)]!.max + 1);
      expect(rtp, `total_payouts.${S} при max=${props[String(S)]!.max}`).toBeLessThanOrEqual(1);
    }
  });

  it("дефолты лежат внутри объявленных границ", () => {
    for (const [name, decl] of Object.entries(schema.knobs)) {
      if (decl.type === "int") {
        const d = decl.default as number;
        expect(d, `${name}`).toBeGreaterThanOrEqual(decl.min!);
        expect(d, `${name}`).toBeLessThanOrEqual(decl.max!);
      }
      if (decl.type === "object") {
        const table = decl.default as Record<string, number>;
        for (const [key, elem] of Object.entries(decl.properties!)) {
          expect(table[key], `${name}.${key}`).toBeGreaterThanOrEqual(elem.min);
          expect(table[key], `${name}.${key}`).toBeLessThanOrEqual(elem.max);
          // дефолт структуры обязан совпадать с поэлементными дефолтами
          expect(table[key], `${name}.${key}: структурный дефолт != элементному`).toBe(elem.default);
        }
      }
    }
  });

  it("составная ручка объявляет ФОРМУ: required и properties на все 14 сумм", () => {
    const decl = schema.knobs.total_payouts!;
    expect(decl.required).toHaveLength(14);
    expect(Object.keys(decl.properties!)).toHaveLength(14);
    for (let S = 4; S <= 17; S++) {
      expect(decl.required).toContain(String(S));
    }
  });
});

describe("технические пределы ставки (Регламент 5.6)", () => {
  const amount = (schema.request as never as {
    properties: { bets: { items: { properties: { amount: { minimum: number; maximum: number } } } } };
  }).properties.bets.items.properties.amount;

  it("минимум строго больше нуля", () => {
    expect(amount.minimum).toBeGreaterThan(0);
  });

  it("потолок — предел целочисленности double", () => {
    expect(amount.maximum).toBe(Number.MAX_SAFE_INTEGER);
  });
});

describe("состав стола в схеме совпадает с механикой", () => {
  it("enum зон запроса — ровно 50 уникальных, те же, что у модели", () => {
    const types = (schema.request as never as {
      properties: { bets: { items: { properties: { type: { enum: string[] } } } } };
    }).properties.bets.items.properties.type.enum;
    expect(types).toHaveLength(50);
    expect(new Set(types).size).toBe(50);
    expect([...types].sort()).toEqual([...ALL_BET_TYPES].sort());
  });
});

describe("адаптер model/index.ts — строго конвенционный (Регламент §11.1)", () => {
  // Платформа РЕГЕНЕРИРУЕТ этот файл целиком при bake пары: всё, что написано
  // в нём сверх конвенции, из артефакта исчезает. Прецедент, ради которого
  // тест написан: реэкспорты механики с адаптера пережили дев-контур, но
  // уронили canonical-check на воротах bake — round.test.ts не собрался
  // (TS2614: нет PAYOUTS/settleRound). Держим состав экспортов запертым.
  it("экспортирует только knobValues, model и default — ничего игрового", async () => {
    const mod = await import("./index.js");
    expect(Object.keys(mod).sort()).toEqual(["default", "knobValues", "model"]);
  });

  it("исходник адаптера не реэкспортирует механику", () => {
    const src = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
    // Реэкспорт (`export { … } from "…"`) — ровно та форма, которую съедает
    // регенерация. Импорты для сборки экземпляра при этом законны.
    expect(src).not.toMatch(/export\s*\{[^}]*\}\s*from/);
    expect(src).not.toMatch(/export\s*\*\s*from/);
  });

  it("внутренние потребители не берут игровые символы с адаптера", () => {
    // Из model/index.js законно импортировать только default и knobValues:
    // всё остальное регенерация не переживёт.
    const files = [
      new URL("../simulations/index.ts", import.meta.url),
      new URL("../simulations/sicbo.worker.ts", import.meta.url),
      new URL("../scenarios/index.ts", import.meta.url),
      new URL("../simulations/bots.ts", import.meta.url),
      new URL("../simulations/tracker.ts", import.meta.url),
      new URL("./round.test.ts", import.meta.url),
      new URL("./factory.test.ts", import.meta.url),
      new URL("./request.test.ts", import.meta.url),
    ];
    const allowed = new Set(["knobValues"]);
    for (const url of files) {
      const src = readFileSync(url, "utf8");
      const re = /import\s+([^;]*?)\s+from\s+"(?:\.\.\/model|\.)\/index\.js"/g;
      for (let m = re.exec(src); m; m = re.exec(src)) {
        const named = /\{([^}]*)\}/.exec(m[1]!);
        if (!named) continue; // только default — законно
        for (const raw of named[1]!.split(",")) {
          const name = raw.trim().split(/\s+as\s+/)[0]!.trim();
          if (!name) continue;
          expect(
            allowed.has(name),
            `${url.pathname.split("/").pop()}: импорт "${name}" с адаптера не переживёт bake`,
          ).toBe(true);
        }
      }
    }
  });
});
