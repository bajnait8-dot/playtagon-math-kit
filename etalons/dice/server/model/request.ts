// Валидация запроса против собственной схемы модели (Б2).
//
// Регламент: «модель отклоняет любой запрос, не проходящий её схему; ответ модели
// обязан проходить её же схему всегда, включая ошибки». Считать с мусорным входом
// запрещено — до правки bet = -100 давал win = -198, то есть отрицательную выплату
// в денежном контуре и playData, не проходящий собственную схему (Р-3 отчёта).
//
// Отказ выражается исключением: канонический @playtagon/model-sdk не имеет канала
// ответа-ошибки — PlayResult типизирован playData игры, места под ошибку в нём нет.
// Следствие для инварианта «ответ всегда валиден по схеме»: модель либо возвращает
// PlayResult, проходящий схему, либо не возвращает ничего. Вопрос вынесен в отчёт.

import { modelSchema } from "./config.js";

type PropSchema = {
  type: "integer" | "string" | "number";
  enum?: string[];
  minimum?: number;
  maximum?: number;
};

type RequestSchema = {
  type: "object";
  additionalProperties: boolean;
  required: string[];
  properties: Record<string, PropSchema>;
};

/** Отказ раунда по схеме запроса. Отдельный класс — чтобы РГС мог отличить его от сбоя. */
export class RequestValidationError extends Error {
  readonly violations: string[];

  constructor(violations: string[]) {
    super(`Request does not satisfy schema.json#request: ${violations.join("; ")}`);
    this.name = "RequestValidationError";
    this.violations = violations;
  }
}

/**
 * Проверяет запрос против секции `request` схемы модели.
 * Границы, заданные ручками (target), здесь НЕ проверяются: у них единый источник —
 * действующий конфиг, и проверка живёт в play() (см. protocol.md §4).
 */
export function validateRequest(request: unknown): string[] {
  // Схема читается лениво при первом вызове (кэш в modelSchema) — чтения
  // файлов на загрузке модуля §1.5.1 не допускает.
  const requestSchema = modelSchema().request as RequestSchema;
  const violations: string[] = [];

  if (typeof request !== "object" || request === null || Array.isArray(request)) {
    return [`request должен быть объектом, получен ${describe(request)}`];
  }

  const obj = request as Record<string, unknown>;

  for (const name of requestSchema.required) {
    if (!(name in obj)) violations.push(`отсутствует обязательное поле "${name}"`);
  }

  if (requestSchema.additionalProperties === false) {
    for (const name of Object.keys(obj)) {
      if (!(name in requestSchema.properties)) {
        violations.push(`поле "${name}" не объявлено схемой (additionalProperties: false)`);
      }
    }
  }

  for (const [name, decl] of Object.entries(requestSchema.properties)) {
    if (!(name in obj)) continue; // отсутствие уже учтено выше
    violations.push(...checkProperty(name, obj[name], decl));
  }

  return violations;
}

function checkProperty(name: string, value: unknown, decl: PropSchema): string[] {
  const problems: string[] = [];

  if (decl.type === "integer" || decl.type === "number") {
    if (typeof value !== "number" || Number.isNaN(value)) {
      return [`"${name}" должен быть числом, получен ${describe(value)}`];
    }
    if (!Number.isFinite(value)) {
      return [`"${name}" должен быть конечным числом, получен ${value}`];
    }
    if (decl.type === "integer" && !Number.isInteger(value)) {
      problems.push(`"${name}" объявлен integer, получен ${value}`);
    }
    if (decl.minimum !== undefined && value < decl.minimum) {
      problems.push(`"${name}" = ${value} меньше объявленного minimum ${decl.minimum}`);
    }
    if (decl.maximum !== undefined && value > decl.maximum) {
      problems.push(`"${name}" = ${value} больше объявленного maximum ${decl.maximum}`);
    }
    return problems;
  }

  if (decl.type === "string") {
    if (typeof value !== "string") {
      return [`"${name}" должен быть строкой, получен ${describe(value)}`];
    }
    if (decl.enum && !decl.enum.includes(value)) {
      problems.push(`"${name}" = ${JSON.stringify(value)} вне enum [${decl.enum.join(", ")}]`);
    }
  }

  return problems;
}

function describe(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}
