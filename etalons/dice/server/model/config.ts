// Конфигурация модели по конвенции фабрики (§1.5.1).
//
// Значения ручек приходят аргументом createModel(values) при старте сессии —
// не файлом и не константами модуля. Этот файл валидирует values против
// объявления ручек в ../schema.json (§1.5: объявление принадлежит модели) и
// собирает из них DiceConfig, который математика получает на вход.
//
// Чтения файлов на загрузке модуля нет: schema.json читается лениво, при
// первом обращении фабрики или валидатора запроса. config.json кодом модели
// не читается вовсе — это объявление значений для платформы (§2.4), его
// содержимое доезжает до модели только через аргумент фабрики.

import { readFileSync } from "node:fs";

type KnobDecl = {
  type: "int" | "number";
  min?: number;
  max?: number;
  default?: number;
};

type ModelSchema = {
  knobs: Record<string, KnobDecl>;
  request: unknown;
};

let cachedSchema: ModelSchema | undefined;

/**
 * Собственная схема модели (schema.json из бандла). Путь относителен модулю:
 * работает и в репозитории (model/src/*.ts → model/schema.json), и в томе
 * devРГС (model/src/index.mjs → model/schema.json).
 */
export function modelSchema(): ModelSchema {
  if (!cachedSchema) {
    cachedSchema = JSON.parse(
      readFileSync(new URL("../schema.json", import.meta.url), "utf8"),
    ) as ModelSchema;
  }
  return cachedSchema;
}

/**
 * Отказ подъёма модели: values не проходят объявление ручек. Отдельный класс —
 * рантайм узнаёт его по err.name и отвечает 422 MODEL_CONFIG_INVALID, а не
 * маскирует кривой конфиг под сбой математики (конвенция образа generic-v1).
 */
export class ConfigValidationError extends Error {
  readonly violations: string[];

  constructor(violations: string[]) {
    super(`Values do not satisfy schema.json#knobs: ${violations.join("; ")}`);
    this.name = "ConfigValidationError";
    this.violations = violations;
  }
}

/** Границы броска — свойство механики, не ручка: клиент кодирует 0..9999 как 0.00..99.99. */
export const ROLL_MIN = 0;
export const ROLL_MAX = 9999;

export interface DiceConfig {
  /** RTP as a fraction (e.g. 0.99 = 99%) */
  rtp: number;
  targetMin: number;
  targetMax: number;
  defaultTarget: number;
}

/**
 * Валидирует values против knobs из schema.json и собирает конфиг математики.
 * Значение вне диапазона, кривой тип, отсутствующая или необъявленная ручка —
 * падение одним исключением со списком всех нарушений, а не тихий дефолт:
 * §5.1 запрещает менять математику продукта молча.
 */
export function resolveConfig(values: unknown): DiceConfig {
  const violations: string[] = [];

  if (typeof values !== "object" || values === null || Array.isArray(values)) {
    throw new ConfigValidationError([
      `values должны быть объектом {ручка: значение}, получено ${describe(values)}`,
    ]);
  }

  const knobs = modelSchema().knobs;
  const obj = values as Record<string, unknown>;

  for (const name of Object.keys(obj)) {
    if (!(name in knobs)) {
      violations.push(`ручка "${name}" не объявлена в schema.json#knobs`);
    }
  }

  for (const [name, declared] of Object.entries(knobs)) {
    if (!(name in obj)) {
      // Тихий дефолт из схемы здесь запрещён: default — начальное значение для
      // инспектора, а не подмена отсутствующего значения конфига (§5.1).
      violations.push(`ручка "${name}" объявлена в schema.json, но значения в values нет`);
      continue;
    }
    const value = obj[name];
    if (typeof value !== "number" || Number.isNaN(value) || !Number.isFinite(value)) {
      violations.push(`ручка "${name}" должна быть числом, получено ${describe(value)}`);
      continue;
    }
    if (declared.type === "int" && !Number.isInteger(value)) {
      violations.push(`ручка "${name}" объявлена int, получено ${value}`);
    }
    if (declared.min !== undefined && value < declared.min) {
      violations.push(`ручка "${name}" = ${value} ниже объявленного min ${declared.min}`);
    }
    if (declared.max !== undefined && value > declared.max) {
      violations.push(`ручка "${name}" = ${value} выше объявленного max ${declared.max}`);
    }
  }

  if (violations.length > 0) {
    throw new ConfigValidationError(violations);
  }

  const rtp = obj.rtp as number;
  const targetMin = obj.target_min as number;
  const targetMax = obj.target_max as number;
  const defaultTarget = obj.default_target as number;

  if (targetMin >= targetMax) {
    violations.push(`target_min (${targetMin}) должен быть ниже target_max (${targetMax})`);
  } else if (defaultTarget < targetMin || defaultTarget > targetMax) {
    violations.push(
      `default_target (${defaultTarget}) должен лежать внутри [${targetMin}, ${targetMax}]`,
    );
  }

  if (violations.length > 0) {
    throw new ConfigValidationError(violations);
  }

  return buildConfig(obj as Record<string, number>);
}

/**
 * Сборка DiceConfig из ЗАВЕДОМО-ВАЛИДНЫХ значений — вторая половина пары
 * конвенции (вердикт штаба (б′), 2026-08-19; Регламент §11.1): ни чтения
 * schema.json, ни валидации — значения сертифицированы воротами платформы
 * до впекания. Дорогой buildModel ходит ЕДИНСТВЕННЫЙ потребитель —
 * генерируемый bake-адаптер; все DEV-пути идут через resolveConfig выше,
 * и ENOENT схемы там остаётся честной ошибкой, а не поводом не валидировать.
 */
export function buildConfig(values: Record<string, number>): DiceConfig {
  return {
    rtp: values.rtp as number,
    targetMin: values.target_min as number,
    targetMax: values.target_max as number,
    defaultTarget: values.default_target as number,
  };
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
 * Потребитель — SDK-каноническая точка model/index.ts (Debug RGS, симуляции,
 * playtagon check): дев-сессия играет на дефолтах инспектора. Платформенный
 * вход (model/playtagon.ts) этим не пользуется — значения приходят аргументом
 * createModel(values) из model_configs (§1.5.1).
 */
export function defaultKnobValues(): Record<string, number> {
  const values: Record<string, number> = {};
  const missing: string[] = [];
  for (const [name, decl] of Object.entries(modelSchema().knobs)) {
    if (typeof decl.default === "number") values[name] = decl.default;
    else missing.push(`ручка "${name}" не имеет default в schema.json — дев-модель собрать не из чего`);
  }
  if (missing.length > 0) throw new ConfigValidationError(missing);
  return values;
}
