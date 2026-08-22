/**
 * Проверка, что ручки действительно работают: значение, поданное фабрике,
 * доезжает до математики, а невалидное роняет подъём модели типизированным
 * исключением, а не подставляется молча (§5.1).
 *
 * С переходом на конвенцию фабрики (§1.5.1) песочницы с подменой config.json
 * не нужны: значения — аргумент createModel(values), проверка целиком
 * in-process. Ровно та невозможность «двух сессий с разными конфигами»,
 * которую прежняя реализация обходила копированием модели во временный
 * каталог, устранена самой фабрикой.
 *
 * Запуск: npx tsx dice/model/tools/verify-knobs.ts
 */

import { createModel } from "../server/model/factory.js";

const failures: string[] = [];

/** Поднимает модель от values и возвращает initData либо ошибку. */
function runWithValues(
  values: Record<string, unknown>,
): { ok: true; initData: any } | { ok: false; error: string; name: string } {
  try {
    const model = createModel(values);
    const { initData } = model.init({ roundContext: null, globalContext: null });
    return { ok: true, initData };
  } catch (e: any) {
    return { ok: false, error: String(e.message ?? e), name: String(e.name ?? "") };
  }
}

function expectConfigError(label: string, values: Record<string, unknown>): void {
  const res = runWithValues(values);
  if (res.ok) {
    failures.push(`${label}: модель поднялась вместо падения (rtp=${res.initData.rtp})`);
    console.log(`    ПРОВАЛ · ${label} — модель поднялась молча`);
  } else if (res.name !== "ConfigValidationError") {
    failures.push(`${label}: исключение ${res.name || "без имени"} вместо ConfigValidationError`);
    console.log(`    ПРОВАЛ · ${label} → ${res.name}: ${res.error.slice(0, 100)}`);
  } else {
    console.log(`    OK · ${label} → ConfigValidationError`);
  }
}

console.log("=".repeat(72));
console.log("ПРОВЕРКА РУЧЕК: значение из аргумента фабрики → математика; невалидное → падение");
console.log("=".repeat(72));

// 1. Дефолтный набор значений поднимается
console.log("\n[1] Рабочие значения (rtp=0.99)");
const base = runWithValues({ rtp: 0.99, target_min: 200, target_max: 9800, default_target: 5000 });
if (base.ok) {
  console.log(`    OK · initData.rtp = ${base.initData.rtp}`);
  if (base.initData.rtp !== 0.99) failures.push("рабочие значения: rtp не 0.99");
} else {
  failures.push(`рабочие значения не поднялись: ${base.error}`);
  console.log(`    ПАДЕНИЕ: ${base.error}`);
}

// 2. Изменённый RTP реально доезжает до математики
console.log("\n[2] Изменённый rtp=0.95 — значение обязано доехать до initData и множителя");
const changed = runWithValues({ rtp: 0.95, target_min: 200, target_max: 9800, default_target: 5000 });
if (changed.ok) {
  console.log(`    OK · initData.rtp = ${changed.initData.rtp}`);
  if (changed.initData.rtp !== 0.95) {
    failures.push(`rtp=0.95 не доехал: получено ${changed.initData.rtp}`);
  }
} else {
  failures.push(`значения с rtp=0.95 не поднялись: ${changed.error}`);
  console.log(`    ПАДЕНИЕ: ${changed.error}`);
}

// 3. Значения вне объявленного диапазона обязаны ронять модель типизированно
console.log("\n[3] Значения вне диапазона — ожидается ConfigValidationError, а не тихий дефолт");
const outOfRange: Array<[string, Record<string, unknown>]> = [
  ["rtp = 1.05 (выше max 0.99)", { rtp: 1.05, target_min: 200, target_max: 9800, default_target: 5000 }],
  ["rtp = 0.5 (ниже min 0.90)", { rtp: 0.5, target_min: 200, target_max: 9800, default_target: 5000 }],
  ["target_max = 99999 (выше max 9900)", { rtp: 0.99, target_min: 200, target_max: 99999, default_target: 5000 }],
  ["default_target = 9900 (вне [min,max])", { rtp: 0.99, target_min: 200, target_max: 9800, default_target: 9900 }],
  ["target_min > target_max", { rtp: 0.99, target_min: 5000, target_max: 5000, default_target: 5000 }],
];
for (const [label, values] of outOfRange) {
  expectConfigError(label, values);
}

// 4. Полнота набора: тихих дефолтов и молчаливого игнорирования нет (Р-9)
console.log("\n[4] Неполные и лишние values — падение, не дефолт и не молчаливое игнорирование");
expectConfigError(
  "необъявленная ручка house_edge",
  { rtp: 0.99, target_min: 200, target_max: 9800, default_target: 5000, house_edge: 0.5 },
);
expectConfigError("отсутствуют объявленные ручки (только rtp)", { rtp: 0.99 });

// 5. Два экземпляра с разными values в одном процессе (§1.5.1)
console.log("\n[5] Два экземпляра с разными values в одном процессе");
const a = runWithValues({ rtp: 0.99, target_min: 200, target_max: 9800, default_target: 5000 });
const b = runWithValues({ rtp: 0.95, target_min: 200, target_max: 9800, default_target: 5000 });
if (a.ok && b.ok && a.initData.rtp === 0.99 && b.initData.rtp === 0.95) {
  console.log(`    OK · initData.rtp = ${a.initData.rtp} и ${b.initData.rtp} одновременно`);
} else {
  failures.push("два экземпляра с разными values не дали разных initData");
  console.log("    ПРОВАЛ · экземпляры не независимы");
}

console.log("\n" + "=".repeat(72));
if (failures.length === 0) {
  console.log("ВСЕ ПРОВЕРКИ РУЧЕК ПРОЙДЕНЫ");
} else {
  console.log(`ПРОВАЛОВ: ${failures.length}`);
  for (const f of failures) console.log("  • " + f);
}
console.log("=".repeat(72));
process.exit(failures.length === 0 ? 0 : 1);
