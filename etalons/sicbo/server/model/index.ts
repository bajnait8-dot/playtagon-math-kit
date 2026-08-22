// SDK-каноническая точка модели: default-export IModel. Её грузят
// createDebugRgs / runGlobalSimulation / playtagon check — дев-контур.
//
// Конвенционный АДАПТЕР платформы (Регламент §11.1/§11.2). Несёт ровно две
// вещи: значения ручек `knobValues` и собранный от них default-экземпляр.
// В репозитории значения — валидированные дефолты schema.json, поэтому
// экземпляр строится фабрикой createModel (дев-контур валидируется полностью).
//
// ФАЙЛ РЕГЕНЕРИРУЕТСЯ ПЛАТФОРМОЙ ЦЕЛИКОМ при bake пары: `knobValues` становятся
// литералами значений опубликованной пары, а экземпляр — buildModel(knobValues)
// (в чистом окружении артефакта schema.json нет, валидировать нечем и незачем —
// значения сертифицированы воротами до впекания).
//
// СЛЕДСТВИЕ, КОТОРОЕ ОПРЕДЕЛЯЕТ СОСТАВ ЭТОГО ФАЙЛА: всё, что здесь написано
// сверх конвенции, при bake ИСЧЕЗАЕТ. Поэтому игровых экспортов тут нет и быть
// не может — ни механики, ни типов, ни классов ошибок. Внутренние потребители
// (тесты, сценарии, боты, симуляции) импортируют из фактических модулей:
//   механика и дефолтные коэффициенты — model/config.js;
//   ядро расчёта                      — model/math.js;
//   валидация и сборка конфига        — model/knobs.js;
//   фабрика и классы исключений       — model/playtagon.js (платформенный вход).
// Клиент читает model/config.js напрямую и этого файла не касается.
//
// Платформа этот файл НЕ исполняет: её вход — model/playtagon.ts
// (schema.json#entry), где значения ручек приходят аргументом createModel(values).

import type { IModel } from "@playtagon/model-sdk";
import { createModel } from "./factory.js";
import { defaultKnobValues, type SicBoKnobValues } from "./knobs.js";
import type { SicBoGameTypes } from "./types.js";

/**
 * Значения ручек адаптера — единый источник и для default-экземпляра ниже, и
 * для фолбэк-ветки worker-файлов симуляций (Регламент §11.2): прогон без
 * конверта платформы исполняет ровно эти значения.
 */
export const knobValues: SicBoKnobValues = defaultKnobValues();

export const model: IModel<SicBoGameTypes> = createModel(knobValues);

export default model;
