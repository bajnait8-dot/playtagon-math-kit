/**
 * Проверка внутренней непротиворечивости контракта:
 *   - config.json объявляет значения только для ручек из schema.json;
 *   - значения лежат внутри объявленных диапазонов;
 *   - playData, отданный моделью, соответствует объявленной в schema.json форме;
 *   - initData/replayData/verifyData тоже соответствуют объявлениям.
 *
 * Запуск: npx tsx dice/model/tools/verify-contract.ts
 */

import { readFileSync } from "node:fs";
import { createModel } from "../server/model/factory.js";

const MODEL_DIR = new URL("../server/", import.meta.url).pathname;
const schema = JSON.parse(readFileSync(MODEL_DIR + "schema.json", "utf8"));
const config = JSON.parse(readFileSync(MODEL_DIR + "config.json", "utf8"));

// Конвенция фабрики (§1.5.1): значения ручек из config.json подаются аргументом.
const model = createModel(config.values);

const problems: string[] = [];

console.log("=".repeat(72));
console.log("ПРОВЕРКА КОНТРАКТА: schema.json ↔ config.json ↔ фактический выход модели");
console.log("=".repeat(72));

// --- 1. Ручки: значения объявлены и в диапазоне ---
console.log("\n[1] Ручки: config.values ↔ schema.knobs");
const knobs = schema.knobs as Record<string, any>;
const values = config.values as Record<string, number>;

for (const name of Object.keys(values)) {
  if (!knobs[name]) problems.push(`config.json задаёт "${name}", не объявленный в schema.knobs`);
}
for (const [name, decl] of Object.entries(knobs)) {
  if (decl.secret) {
    if (name in values) problems.push(`secret-ручка "${name}" не должна иметь значения в config.json`);
    console.log(`    ${name.padEnd(15)} secret · значения в конфиге нет — верно`);
    continue;
  }
  const v = values[name];
  if (v === undefined) {
    if (decl.default === undefined) problems.push(`ручка "${name}" без значения и без дефолта`);
    console.log(`    ${name.padEnd(15)} значения нет → дефолт ${decl.default}`);
    continue;
  }
  if (decl.min !== undefined && v < decl.min) problems.push(`"${name}"=${v} ниже min ${decl.min}`);
  if (decl.max !== undefined && v > decl.max) problems.push(`"${name}"=${v} выше max ${decl.max}`);
  if (decl.type === "int" && !Number.isInteger(v)) problems.push(`"${name}"=${v} объявлена int`);
  console.log(`    ${name.padEnd(15)} = ${String(v).padEnd(8)} в диапазоне [${decl.min}, ${decl.max}]`);
}

// --- 2. Метаданные контролов ---
console.log("\n[2] Метаданные контролов: config.controls ↔ schema.knobs");
for (const name of Object.keys(config.controls ?? {})) {
  if (!knobs[name]) problems.push(`config.controls описывает необъявленную ручку "${name}"`);
}
for (const [name, decl] of Object.entries(knobs)) {
  if (decl.secret || decl.control === "none") continue;
  if (!config.controls?.[name]) problems.push(`ручка "${name}" без метаданных контрола в config.json`);
}
console.log(`    контролов описано: ${Object.keys(config.controls ?? {}).length}`);

// --- 3. Фактический выход модели против объявленной формы ---
function checkShape(label: string, decl: any, actual: Record<string, unknown>) {
  const declared = new Set(Object.keys(decl.properties ?? {}));
  const got = new Set(Object.keys(actual));
  for (const k of declared) {
    if (!got.has(k) && (decl.required ?? []).includes(k)) {
      problems.push(`${label}: объявленное поле "${k}" отсутствует в выходе модели`);
    }
  }
  for (const k of got) {
    if (!declared.has(k)) problems.push(`${label}: модель отдаёт необъявленное поле "${k}"`);
  }
  for (const [k, v] of Object.entries(actual)) {
    const p: any = decl.properties?.[k];
    if (!p) continue;
    const t = typeof v;
    if (p.type === "integer" && (!Number.isInteger(v as number)))
      problems.push(`${label}.${k} объявлено integer, получено ${JSON.stringify(v)}`);
    if (p.type === "number" && t !== "number") problems.push(`${label}.${k} объявлено number, получено ${t}`);
    if (p.type === "string" && t !== "string") problems.push(`${label}.${k} объявлено string, получено ${t}`);
    if (p.enum && !p.enum.includes(v)) problems.push(`${label}.${k}=${v} вне enum ${JSON.stringify(p.enum)}`);
    if (p.const !== undefined && v !== p.const) problems.push(`${label}.${k}=${v} должно быть ${p.const}`);
    if (p.minimum !== undefined && (v as number) < p.minimum) problems.push(`${label}.${k}=${v} ниже minimum`);
    if (p.maximum !== undefined && (v as number) > p.maximum) problems.push(`${label}.${k}=${v} выше maximum`);
  }
  console.log(`    ${label.padEnd(12)} полей объявлено ${declared.size}, отдано ${got.size}`);
}

console.log("\n[3] Форма выхода модели ↔ объявления в schema.json");
const init = model.init({ roundContext: null, globalContext: null });
checkShape("initData", schema.initData, init.initData as Record<string, unknown>);

let seed = 12345;
const rng = {
  getInt(min: number, max: number) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return min + (seed % (max - min + 1));
  },
};

for (const condition of ["over", "under"] as const) {
  const res = model.play({
    roundType: "normal",
    gameRequest: { target: 5000, condition, bet: 100 },
    rng,
    roundContext: null,
    globalContext: null,
  });
  checkShape(`playData`, schema.playData, res.playData as Record<string, unknown>);
  checkShape(`replayData`, schema.replayData, res.replayData as Record<string, unknown>);
  if (res.playData.win !== res.win) problems.push(`playData.win (${res.playData.win}) != PlayResult.win (${res.win})`);
  if (res.roundContext !== null) problems.push("roundContext не null");
  if (res.globalContext !== null) problems.push("globalContext не null");
  if (res.roundComplete !== true) problems.push("roundComplete не true");
}
checkShape("verifyData", schema.verifyData, model.verify!({ rng }) as Record<string, unknown>);

// --- 4. Заявленные в схеме мета-поля ---
console.log("\n[4] Мета-поля схемы");
if (schema.rngMode !== model.rngMode) problems.push(`schema.rngMode=${schema.rngMode}, модель=${model.rngMode}`);
console.log(`    rngMode: schema=${schema.rngMode}, модель=${model.rngMode}`);
console.log(`    sdkVersion: ${schema.sdkVersion}`);

console.log("\n" + "=".repeat(72));
if (problems.length === 0) {
  console.log("КОНТРАКТ НЕПРОТИВОРЕЧИВ");
} else {
  console.log(`ПРОБЛЕМ: ${problems.length}`);
  for (const p of problems) console.log("  • " + p);
}
console.log("=".repeat(72));
process.exit(problems.length === 0 ? 0 : 1);
