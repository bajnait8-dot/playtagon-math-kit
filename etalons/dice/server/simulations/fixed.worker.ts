import { workerSimulation } from "@playtagon/runtime";
import { createModel } from "../model/factory.js";
import defaultModel from "../model/index.js";
import { createFixedDiceBot } from "./bots.js";
import type { DiceCondition } from "../model/types.js";

// Та же двухветочная форма (§11.2, вердикт вечера 2026-08-19): values в
// конверте — фабрика с полной валидацией; без values — готовый экземпляр
// конвенционного адаптера (в репозитории — валидированные дефолты, в
// bake-артефакте — впечённая пара). target/condition точечного прогона —
// как были (simulate-fixed.ts передаёт их без values).
workerSimulation(
  (workerData: { target: number; condition: DiceCondition; values?: unknown }) => ({
    model: workerData?.values ? createModel(workerData.values) : defaultModel,
    bot: createFixedDiceBot(workerData.target, workerData.condition),
  }),
);
