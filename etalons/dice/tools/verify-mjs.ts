/**
 * Сверка исполняемой формы: dist/index.mjs, собранный локальным зеркалом
 * платформенной сборки (build-mjs.mjs, от точки входа schema.json#entry),
 * обязан вести себя байт в байт как TS-исходник и переживать бандлинг
 * конвенциями devРГС:
 *
 *   1. экспортирует фабрику по имени schema.json#entry.export (ровно то, что
 *      импортируют рантаймы devРГС: mod[entry.export](values) → IModel);
 *   2. initData совпадает с TS-моделью на тех же values;
 *   3. отпечаток выплат полным перебором (bet=137, сетка verify-ev) совпадает
 *      с эталоном 18986942 — математика не сдвинулась при сборке;
 *   4. err.name типизированных исключений переживает бандлинг: рантайм мапит
 *      RequestValidationError → 400, ConfigValidationError → 422 по имени;
 *   5. два экземпляра с разными values в одном процессе независимы — то, на
 *      чём стоят параллельные сессии devРГС.
 *
 * Перед запуском: node dice/tools/build-mjs.mjs
 * Запуск: npx tsx dice/tools/verify-mjs.ts
 */

import { readFileSync } from "node:fs";
import { createModel as createTsModel } from "../server/model/factory.js";

const STAGING = new URL("dist/", import.meta.url);
const stagingSchema = JSON.parse(readFileSync(new URL("schema.json", STAGING), "utf8"));
const entryExport: string = stagingSchema.entry?.export ?? "createModel";
const values = JSON.parse(readFileSync(new URL("config.json", STAGING), "utf8")).values;

const FINGERPRINT_REFERENCE = 18986942;

const problems: string[] = [];

const mjsUrl = new URL("dist/index.mjs", STAGING);
let mod: Record<string, unknown>;
try {
  mod = (await import(mjsUrl.href)) as Record<string, unknown>;
} catch (err) {
  console.error(`dist/index.mjs не импортируется: ${(err as Error).message}`);
  console.error("Сначала соберите staging-срез: node dice/tools/build-mjs.mjs");
  process.exit(1);
}

console.log("=".repeat(72));
console.log("СВЕРКА ИСПОЛНЯЕМОЙ ФОРМЫ: dist/index.mjs ↔ TS-исходник");
console.log("=".repeat(72));

// --- 1. Контракт точки входа (ровно как в рантаймах devРГС) ---
console.log(`\n[1] Экспорт фабрики (${entryExport})`);
const createModel = mod[entryExport] as (v: unknown) => any;
if (typeof createModel !== "function") {
  console.error(`    ПРОВАЛ: ${entryExport} не экспортирован — рантайм ответит MODEL_ENTRY_MISSING`);
  process.exit(1);
}
const model = createModel(values);
if (!model || typeof model.init !== "function" || typeof model.play !== "function") {
  console.error("    ПРОВАЛ: createModel(values) не вернул IModel с init и play");
  process.exit(1);
}
console.log("    OK · createModel(values) → IModel с init/play/verify");

// --- 2. initData совпадает с TS-моделью ---
console.log("\n[2] initData ↔ TS-модель");
const tsInit = JSON.stringify(
  createTsModel(values).init({ roundContext: null, globalContext: null }).initData,
);
const mjsInit = JSON.stringify(model.init({ roundContext: null, globalContext: null }).initData);
if (tsInit === mjsInit) {
  console.log(`    OK · ${mjsInit}`);
} else {
  problems.push(`initData расходится: ts=${tsInit}, mjs=${mjsInit}`);
}

// --- 3. Отпечаток выплат полным перебором ---
console.log("\n[3] Отпечаток выплат (bet=137, все 10 000 исходов × сетка сценариев)");
function rngFor(roll: number) {
  let used = false;
  return {
    getInt(min: number, max: number): number {
      if (used) throw new Error("лишний розыгрыш RNG");
      used = true;
      return min + (roll % (max - min + 1));
    },
  };
}
let fingerprint = 0;
for (const target of [200, 1000, 2500, 5000, 7500, 9000, 9800]) {
  for (const condition of ["over", "under"]) {
    for (let roll = 0; roll <= 9999; roll++) {
      const res = model.play({
        roundType: "default",
        gameRequest: { target, condition, bet: 137 },
        rng: rngFor(roll),
        roundContext: null,
        globalContext: null,
      });
      fingerprint = (fingerprint + res.win) % 2_147_483_647;
    }
  }
}
if (fingerprint === FINGERPRINT_REFERENCE) {
  console.log(`    OK · ${fingerprint} == эталон ${FINGERPRINT_REFERENCE}`);
} else {
  problems.push(`отпечаток ${fingerprint} != эталон ${FINGERPRINT_REFERENCE} — математика сдвинулась при сборке`);
}

// --- 4. err.name переживает бандлинг ---
console.log("\n[4] err.name типизированных исключений после бандлинга");
function nameOfThrown(fn: () => unknown): string {
  try {
    fn();
    return "(не бросило)";
  } catch (err) {
    return (err as Error).name;
  }
}
const reqName = nameOfThrown(() =>
  model.play({
    roundType: "default",
    gameRequest: { target: 5000, condition: "over", bet: -100 },
    rng: rngFor(1),
    roundContext: null,
    globalContext: null,
  }),
);
if (reqName === "RequestValidationError") {
  console.log("    OK · кривой запрос → RequestValidationError (образ ответит 400)");
} else {
  problems.push(`кривой запрос дал "${reqName}" вместо RequestValidationError`);
}
const cfgName = nameOfThrown(() => createModel({ ...values, rtp: 1.05 }));
if (cfgName === "ConfigValidationError") {
  console.log("    OK · кривые values → ConfigValidationError (образ ответит 422)");
} else {
  problems.push(`кривые values дали "${cfgName}" вместо ConfigValidationError`);
}

// --- 5. Две сессии с разными values в одном процессе ---
console.log("\n[5] Два экземпляра с разными values (параллельные сессии devРГС)");
const m95 = createModel({ ...values, rtp: 0.95 });
const win99 = model.play({
  roundType: "default",
  gameRequest: { target: 5000, condition: "over", bet: 1_000_000 },
  rng: rngFor(7500),
  roundContext: null,
  globalContext: null,
}).win;
const win95 = m95.play({
  roundType: "default",
  gameRequest: { target: 5000, condition: "over", bet: 1_000_000 },
  rng: rngFor(7500),
  roundContext: null,
  globalContext: null,
}).win;
if (win99 === Math.round((0.99 / 0.4999) * 1_000_000) && win95 === Math.round((0.95 / 0.4999) * 1_000_000)) {
  console.log(`    OK · одинаковый бросок, разные выплаты: ${win99} (rtp 0.99) и ${win95} (rtp 0.95)`);
} else {
  problems.push(`независимость экземпляров нарушена: win99=${win99}, win95=${win95}`);
}

// --- Итог ---
console.log("\n" + "=".repeat(72));
if (problems.length === 0) {
  console.log("ИСПОЛНЯЕМАЯ ФОРМА СООТВЕТСТВУЕТ ИСХОДНИКУ");
} else {
  console.log(`ПРОБЛЕМ: ${problems.length}`);
  for (const p of problems) console.log("  • " + p);
}
console.log("=".repeat(72));
process.exit(problems.length === 0 ? 0 : 1);
