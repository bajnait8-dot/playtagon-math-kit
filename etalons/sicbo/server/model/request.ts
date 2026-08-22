// Валидация запроса против собственной схемы модели (Регламент §7).
//
// «Модель отклоняет любой запрос, не проходящий её схему; ответ модели обязан
// проходить её же схему всегда». Считать с мусорным входом запрещено: до
// конверсии отрицательная ставка доезжала до settleRound и давала
// отрицательную выплату в денежном контуре и playData, не проходящий
// собственную схему модели.
//
// Отказ выражается ИСКЛЮЧЕНИЕМ: канонический @playtagon/model-sdk не имеет
// канала ответа-ошибки — PlayResult типизирован playData игры, места под ошибку
// в нём нет. Следствие для инварианта «ответ всегда валиден по схеме»: модель
// либо возвращает PlayResult, проходящий схему, либо не возвращает ничего.

import { modelSchema } from "./schema-source.js";

type ItemProps = {
  type: { type: "string"; enum?: string[] };
  amount: { type: "integer"; minimum?: number; maximum?: number };
};

type BetsSchema = {
  type: "array";
  minItems?: number;
  maxItems?: number;
  items: {
    type: "object";
    additionalProperties: boolean;
    required: string[];
    properties: ItemProps;
  };
};

type RequestSchema = {
  type: "object";
  additionalProperties: boolean;
  required: string[];
  properties: { bets: BetsSchema };
};

/** Отказ раунда по схеме запроса. Отдельный класс — чтобы РГС отличил его от сбоя. */
export class RequestValidationError extends Error {
  readonly violations: string[];

  constructor(violations: string[]) {
    super(`Request does not satisfy schema.json#request: ${violations.join("; ")}`);
    this.name = "RequestValidationError";
    this.violations = violations;
  }
}

/**
 * Проверяет запрос против секции `request` схемы модели. Собирает ВСЕ
 * нарушения списком, а не бросает на первом (Регламент §7 п. 6).
 *
 * Правило «дубль зоны запрещён» проверяется здесь же: оно выразимо только через
 * связь элементов между собой, чего JSON Schema без uniqueItems-по-полю не
 * умеет, — но это свойство ЗАПРОСА, а не конфига, поэтому живёт в валидаторе
 * запроса и отвечает тем же RequestValidationError.
 */
export function validateRequest(request: unknown): string[] {
  // Схема читается лениво при первом вызове (кэш в modelSchema) — чтения
  // файлов на загрузке модуля Регламент §4.3 не допускает.
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

  if ("bets" in obj) {
    violations.push(...checkBets(obj.bets, requestSchema.properties.bets));
  }

  return violations;
}

function checkBets(value: unknown, decl: BetsSchema): string[] {
  if (!Array.isArray(value)) {
    return [`"bets" должен быть массивом, получен ${describe(value)}`];
  }

  const problems: string[] = [];

  if (decl.minItems !== undefined && value.length < decl.minItems) {
    problems.push(
      `"bets" содержит ${value.length} ставок, объявленный минимум ${decl.minItems}`,
    );
  }
  if (decl.maxItems !== undefined && value.length > decl.maxItems) {
    problems.push(
      `"bets" содержит ${value.length} ставок, объявленный максимум ${decl.maxItems}`,
    );
  }

  const seen = new Set<string>();
  const itemDecl = decl.items;

  for (let i = 0; i < value.length; i++) {
    const path = `bets[${i}]`;
    const item = value[i];

    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      problems.push(`${path} должен быть объектом, получен ${describe(item)}`);
      continue;
    }

    const rec = item as Record<string, unknown>;

    for (const name of itemDecl.required) {
      if (!(name in rec)) problems.push(`${path}: отсутствует обязательное поле "${name}"`);
    }

    if (itemDecl.additionalProperties === false) {
      for (const name of Object.keys(rec)) {
        if (!(name in itemDecl.properties)) {
          problems.push(`${path}: поле "${name}" не объявлено схемой (additionalProperties: false)`);
        }
      }
    }

    if ("type" in rec) {
      const t = rec.type;
      if (typeof t !== "string") {
        problems.push(`${path}.type должен быть строкой, получен ${describe(t)}`);
      } else if (itemDecl.properties.type.enum && !itemDecl.properties.type.enum.includes(t)) {
        problems.push(`${path}.type = ${JSON.stringify(t)}: неизвестная зона стола`);
      } else if (seen.has(t)) {
        // Дубль зоны: фишки одной зоны складывает клиент. Две записи на одну
        // зону — дефект запроса, а не повод сложить их на сервере.
        problems.push(`${path}.type = ${JSON.stringify(t)}: зона уже занята другой ставкой этого раунда`);
      } else {
        seen.add(t);
      }
    }

    if ("amount" in rec) {
      problems.push(...checkAmount(`${path}.amount`, rec.amount, itemDecl.properties.amount));
    }
  }

  return problems;
}

function checkAmount(path: string, value: unknown, decl: ItemProps["amount"]): string[] {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return [`${path} должен быть числом, получен ${describe(value)}`];
  }
  if (!Number.isFinite(value)) {
    return [`${path} должен быть конечным числом, получен ${value}`];
  }

  const problems: string[] = [];
  if (!Number.isInteger(value)) {
    problems.push(`${path} объявлен integer, получен ${value}`);
  }
  if (decl.minimum !== undefined && value < decl.minimum) {
    problems.push(`${path} = ${value} меньше объявленного minimum ${decl.minimum}`);
  }
  if (decl.maximum !== undefined && value > decl.maximum) {
    problems.push(`${path} = ${value} больше объявленного maximum ${decl.maximum}`);
  }
  return problems;
}

function describe(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "number" && Number.isNaN(value)) return "NaN";
  return typeof value;
}
