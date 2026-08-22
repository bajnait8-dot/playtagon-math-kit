// SDK-каноническая точка модели (06-game-contract.md): default-export IModel.
// Её грузят createDebugRgs / runGlobalSimulation / playtagon check — дев-контур.
//
// Конвенционный АДАПТЕР платформы (§8.2 контракта, Регламент §11.1/§11.2):
// несёт значения ручек `knobValues` — единый источник и для default-export'а,
// и для фолбэка worker-файлов simulations/ (прогон без конверта платформы
// исполняет ровно эти значения). В репозитории адаптер несёт default-значения
// schema.json#knobs — дев-сессия играет на дефолтах инспектора, это явный
// выбор этой двери, а не тихая подстановка внутри фабрики (§5.1 не нарушен).
// При bake пары платформа РЕГЕНЕРИРУЕТ этот файл: knobValues становятся
// литералами значений опубликованной пары — авторская математика не меняется.
//
// Платформа этот файл НЕ исполняет: её вход — model/playtagon.ts
// (schema.json#entry), где значения ручек приходят аргументом createModel(values)
// из model_configs. Поэтому чтение schema.json при загрузке этого модуля живёт
// только в дев-контуре и в платформенный граф не попадает (§1.5.1).
import type { IModel } from "@playtagon/model-sdk";
import { createModel } from "./factory.js";
import { defaultKnobValues } from "./config.js";
import type { DiceGameTypes } from "./types.js";

/** Значения ручек адаптера — фолбэк worker-файлов симуляций (Регламент §11.2). */
export const knobValues: Record<string, number> = defaultKnobValues();

export const model: IModel<DiceGameTypes> = createModel(knobValues);

export default model;
