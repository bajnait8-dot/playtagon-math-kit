// ЕДИНСТВЕННОЕ место, где модель читает файл, — собственная schema.json.
//
// Вынесено в отдельный модуль намеренно, и причина не косметическая:
// client/ импортирует из model/config.ts чистую механику (PAYOUTS, FACES,
// TOTALS, COMBO_PAIRS, payoutFor) и собирается для БРАУЗЕРА. Если бы
// `node:fs` лежал в том же модуле, он попадал бы в клиентский граф импортов,
// и сборка клиента падала бы на «readFileSync is not exported by
// __vite-browser-external». Чтение схемы нужно только серверным дорогам
// (фабрика, валидатор запроса, дефолты адаптера), и живёт оно здесь.
//
// Чтение ЛЕНИВОЕ: на загрузке модуля файлов не открывается (Регламент §4.3),
// схема читается при первом обращении и кэшируется. Путь строится от
// import.meta.url, а не от рабочей директории процесса, — так чтение
// переживает платформенную сборку: и исходная точка (model/*.ts), и собранная
// форма (dist/index.mjs) лежат на одной глубине от корня, где живёт
// schema.json (Регламент §11).
//
// config.json модель не читает ВОВСЕ — его значения доезжают только аргументом
// фабрики.

import { readFileSync } from "node:fs";

/** Объявление скалярной ручки схемы. */
export type ScalarKnobDecl = {
  type: "int" | "number";
  min?: number;
  max?: number;
  default?: number;
};

/** Объявление составной ручки-объекта (Регламент 5.7): total_payouts. */
export type ObjectKnobDecl = {
  type: "object";
  required: string[];
  properties: Record<string, ScalarKnobDecl>;
  default?: Record<string, number>;
};

export type KnobDecl = ScalarKnobDecl | ObjectKnobDecl;

export type ModelSchema = {
  knobs: Record<string, KnobDecl>;
  request: unknown;
};

let cachedSchema: ModelSchema | undefined;

/**
 * Собственная схема модели (schema.json из бандла), лениво и с кэшем.
 *
 * Отсутствие файла — честная ошибка (ENOENT), а не повод собрать модель без
 * проверки: неявный фолбэк «нет схемы — не валидируем» Регламент §11.1
 * запрещает. Дорога без схемы существует, но она другая — buildModel.
 */
export function modelSchema(): ModelSchema {
  if (!cachedSchema) {
    cachedSchema = JSON.parse(
      readFileSync(new URL("../schema.json", import.meta.url), "utf8"),
    ) as ModelSchema;
  }
  return cachedSchema;
}
