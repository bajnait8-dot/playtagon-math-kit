// Ручки модели: валидация значений против объявления в schema.json и сборка
// конфига математики (Регламент §4).
//
// Значения ручек приходят аргументом createModel(values) при старте сессии —
// не файлом и не константами модуля. config.json кодом модели не читается
// вовсе: его содержимое доезжает до модели только через аргумент фабрики
// (Регламент §4.3).
//
// Модуль СЕРВЕРНЫЙ: он тянет чтение схемы (model/schema-source.ts, node:fs).
// Чистая механика, которую импортирует браузерный client/, живёт отдельно —
// в model/config.ts, и `node:fs` в её граф импортов не попадает.

import type { SicBoBetType } from "./types.js";
import { buildPayouts, TOTALS, type SicBoPayoutKnobs } from "./math.js";
import {
  modelSchema,
  type ObjectKnobDecl,
  type ScalarKnobDecl,
} from "./schema-source.js";

export { modelSchema } from "./schema-source.js";

/**
 * Отказ подъёма модели: values не проходят объявление ручек. Отдельный класс —
 * рантайм узнаёт его по err.name и отвечает 422 MODEL_CONFIG_INVALID, а не
 * маскирует кривой конфиг под сбой математики (Регламент §8).
 */
export class ConfigValidationError extends Error {
  readonly violations: string[];

  constructor(violations: string[]) {
    super(`Values do not satisfy schema.json#knobs: ${violations.join("; ")}`);
    this.name = "ConfigValidationError";
    this.violations = violations;
  }
}

/** Конфиг математики — то, что фабрика отдаёт ядру расчёта. */
export interface SicBoConfig {
  /** Таблица коэффициентов стола, собранная из значений ручек. */
  payouts: Record<SicBoBetType, number>;
}

/**
 * Вероятность каждой суммы трёх костей: число исходов из 216. Свойство костей,
 * не настраивается. Нужна фабрике, чтобы проверить инвариант смысла «выплата
 * не уводит RTP суммы выше 100%» — объявлением такое не выражается (5.7.2).
 */
const TOTAL_OUTCOMES: Readonly<Record<number, number>> = {
  4: 3, 5: 6, 6: 10, 7: 15, 8: 21, 9: 25, 10: 27,
  11: 27, 12: 25, 13: 21, 14: 15, 15: 10, 16: 6, 17: 3,
};

const ALL_ROLLS = 216;

/**
 * Инвариант смысла для группы ставок: коэффициент не должен уводить RTP выше
 * 100%. RTP = p × (payout + 1), где p — вероятность выигрыша группы. Граница
 * ВКЛЮЧИТЕЛЬНАЯ: RTP ровно 100% (сумма 10 при коэффициенте 7) законна — это
 * игра в ноль, а не в минус дому.
 */
function rtpOf(outcomes: number, payout: number): number {
  return (outcomes / ALL_ROLLS) * (payout + 1);
}

/** Число исходов для групп, не зависящих от суммы. */
const GROUP_OUTCOMES = {
  tripleSpecific: 1,   // одна конкретная тройка из 216
  tripleAny: 6,        // шесть троек
  double: 16,          // грань выпала >= 2 раз
  combo: 30,           // обе заданные грани присутствуют
} as const;

/**
 * Валидирует values против knobs из schema.json и собирает конфиг математики.
 * Значение вне диапазона, кривой тип, отсутствующая или необъявленная ручка,
 * нарушенный инвариант смысла — падение ОДНИМ исключением со списком ВСЕХ
 * нарушений, а не тихий дефолт: Регламент §4.2 запрещает менять математику
 * продукта молча.
 *
 * Валидация дешёвая — никакой тяжёлой подготовки математики до неё нет
 * (Регламент 5.7.3: платформа зовёт фабрику пробой при записи конфига).
 */
export function resolveConfig(values: unknown): SicBoConfig {
  const violations: string[] = [];

  if (typeof values !== "object" || values === null || Array.isArray(values)) {
    throw new ConfigValidationError([
      `values должны быть объектом {ручка: значение}, получено ${describe(values)}`,
    ]);
  }

  const knobs = modelSchema().knobs;
  const obj = values as Record<string, unknown>;

  // Необъявленные ручки — нарушение: молча игнорировать лишний ключ значит
  // принять конфиг, которого модель не понимает.
  for (const name of Object.keys(obj)) {
    if (!(name in knobs)) {
      violations.push(`ручка "${name}" не объявлена в schema.json#knobs`);
    }
  }

  for (const [name, declared] of Object.entries(knobs)) {
    if (!(name in obj)) {
      // Тихий дефолт из схемы здесь запрещён: default — начальное значение для
      // инспектора, а не подмена отсутствующего значения конфига (§4.2).
      violations.push(`ручка "${name}" объявлена в schema.json, но значения в values нет`);
      continue;
    }
    if (declared.type === "object") {
      violations.push(...checkObjectKnob(name, obj[name], declared));
    } else {
      violations.push(...checkScalarKnob(name, obj[name], declared));
    }
  }

  // Форму проверили — дальше инварианты смысла. Считать их можно только на
  // значениях, прошедших форму, иначе арифметика поедет на строках и NaN.
  if (violations.length === 0) {
    violations.push(...checkPayoutInvariants(obj));
  }

  if (violations.length > 0) {
    throw new ConfigValidationError(violations);
  }

  // Форма и смысл проверены выше — значения заведомо валидны, приведение честно.
  return buildConfig(obj as unknown as SicBoKnobValues);
}

/** Проверка скалярной ручки: тип, целочисленность, границы. */
function checkScalarKnob(name: string, value: unknown, decl: ScalarKnobDecl): string[] {
  const problems: string[] = [];
  if (typeof value !== "number" || Number.isNaN(value) || !Number.isFinite(value)) {
    return [`ручка "${name}" должна быть числом, получено ${describe(value)}`];
  }
  if (decl.type === "int" && !Number.isInteger(value)) {
    problems.push(`ручка "${name}" объявлена int, получено ${value}`);
  }
  if (decl.min !== undefined && value < decl.min) {
    problems.push(`ручка "${name}" = ${value} ниже объявленного min ${decl.min}`);
  }
  if (decl.max !== undefined && value > decl.max) {
    problems.push(`ручка "${name}" = ${value} выше объявленного max ${decl.max}`);
  }
  return problems;
}

/**
 * Проверка составной ручки-объекта. Нарушение называет ПУТЬ ДО ЭЛЕМЕНТА
 * (`total_payouts.9`), а не имя ручки: «конфиг невалиден» математику
 * подтверждать нечего (Регламент 5.7.2).
 */
function checkObjectKnob(name: string, value: unknown, decl: ObjectKnobDecl): string[] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return [`ручка "${name}" должна быть объектом, получено ${describe(value)}`];
  }
  const problems: string[] = [];
  const obj = value as Record<string, unknown>;

  for (const key of Object.keys(obj)) {
    if (!(key in decl.properties)) {
      problems.push(`${name}.${key}: поле не объявлено в schema.json#knobs.${name}.properties`);
    }
  }

  for (const key of decl.required) {
    if (!(key in obj)) {
      problems.push(`${name}.${key}: обязательное поле отсутствует в values`);
      continue;
    }
    const elemDecl = decl.properties[key];
    if (!elemDecl) continue; // required без properties — дефект схемы, не конфига
    problems.push(...checkScalarKnob(`${name}.${key}`, obj[key], elemDecl).map(rewritePath));
  }

  return problems;
}

/** checkScalarKnob формулирует «ручка "X"»; для элемента путь читается лучше без слова «ручка». */
function rewritePath(message: string): string {
  return message.replace(/^ручка "([^"]+)" /, "$1: ");
}

/**
 * Инварианты СМЫСЛА (Регламент 5.7.2): то, что связывает значение ручки с
 * математикой игры и объявлением не выражается. Здесь такой инвариант один и
 * он общий для всех настраиваемых групп — коэффициент не должен уводить RTP
 * группы выше 100%.
 *
 * Формально max-границы схемы уже удерживают каждую группу ниже предела, и на
 * значениях, прошедших форму, этот список пуст. Проверка стоит здесь потому,
 * что источник границ и источник смысла разные: границы схемы платформа может
 * перенести клампом на новую версию модели (Регламент 12.3), а вот RTP > 100%
 * — это математика, и её обязана ловить фабрика, последний рубеж (12.3).
 */
function checkPayoutInvariants(values: Record<string, unknown>): string[] {
  const problems: string[] = [];

  const totals = values.total_payouts as Record<string, number>;
  for (const s of TOTALS) {
    const payout = totals[String(s)]!;
    const outcomes = TOTAL_OUTCOMES[s]!;
    const rtp = rtpOf(outcomes, payout);
    if (rtp > 1) {
      problems.push(
        `total_payouts.${s}: коэффициент ${payout} даёт RTP ${(rtp * 100).toFixed(2)}% — ` +
          `выше 100% (сумма ${s} выпадает ${outcomes} раз из 216, предел ${ALL_ROLLS / outcomes - 1})`,
      );
    }
  }

  const scalarGroups: Array<[string, number, number]> = [
    ["triple_specific_payout", values.triple_specific_payout as number, GROUP_OUTCOMES.tripleSpecific],
    ["triple_any_payout", values.triple_any_payout as number, GROUP_OUTCOMES.tripleAny],
    ["double_payout", values.double_payout as number, GROUP_OUTCOMES.double],
    ["combo_payout", values.combo_payout as number, GROUP_OUTCOMES.combo],
  ];

  for (const [name, payout, outcomes] of scalarGroups) {
    const rtp = rtpOf(outcomes, payout);
    if (rtp > 1) {
      problems.push(
        `${name}: коэффициент ${payout} даёт RTP ${(rtp * 100).toFixed(2)}% — ` +
          `выше 100% (группа выигрывает ${outcomes} раз из 216, предел ${ALL_ROLLS / outcomes - 1})`,
      );
    }
  }

  return problems;
}

/** Форма значений ручек этой модели после успешной валидации. */
export interface SicBoKnobValues {
  total_payouts: Record<string, number>;
  triple_specific_payout: number;
  triple_any_payout: number;
  double_payout: number;
  combo_payout: number;
}

/**
 * Сборка SicBoConfig из ЗАВЕДОМО-ВАЛИДНЫХ значений — вторая половина пары
 * конвенции (Регламент §11.1): ни чтения schema.json, ни валидации — значения
 * сертифицированы воротами платформы до впекания. Дорогой buildModel ходит
 * ЕДИНСТВЕННЫЙ потребитель — генерируемый bake-адаптер; все DEV-пути идут через
 * resolveConfig выше, и ENOENT схемы там остаётся честной ошибкой, а не поводом
 * не валидировать.
 */
export function buildConfig(values: SicBoKnobValues): SicBoConfig {
  const knobs: SicBoPayoutKnobs = {
    totalPayouts: toNumericKeys(values.total_payouts),
    tripleSpecific: values.triple_specific_payout,
    tripleAny: values.triple_any_payout,
    double: values.double_payout,
    combo: values.combo_payout,
  };
  return { payouts: buildPayouts(knobs) };
}

/** total_payouts объявлен строковыми ключами (JSON), математика ждёт числовые. */
function toNumericKeys(table: Record<string, number>): Record<number, number> {
  const out: Record<number, number> = {};
  for (const [k, v] of Object.entries(table)) out[Number(k)] = v;
  return out;
}

function describe(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "number" && Number.isNaN(value)) return "NaN";
  if (typeof value === "string") return `string ${JSON.stringify(value)}`;
  return typeof value;
}

/**
 * Значения ручек по умолчанию — из default-объявлений schema.json#knobs.
 * Потребитель — SDK-канонический адаптер model/index.ts (Debug RGS, симуляции,
 * playtagon check): дев-сессия играет на дефолтах инспектора. Платформенный
 * вход (model/playtagon.ts) этим не пользуется — значения приходят аргументом
 * createModel(values) из конфигов платформы.
 */
export function defaultKnobValues(): SicBoKnobValues {
  const values: Record<string, unknown> = {};
  const missing: string[] = [];
  for (const [name, decl] of Object.entries(modelSchema().knobs)) {
    if (decl.default !== undefined) values[name] = decl.default;
    else missing.push(`ручка "${name}" не имеет default в schema.json — дев-модель собрать не из чего`);
  }
  if (missing.length > 0) throw new ConfigValidationError(missing);
  return values as unknown as SicBoKnobValues;
}
