import { workerSimulation } from "@playtagon/runtime";
import { createModel } from "../model/factory.js";
import { resolveConfig, buildConfig } from "../model/config.js";
import defaultModel, { knobValues } from "../model/index.js";
import { createRandomDiceBot } from "./bots.js";

// Двухветочная форма worker-файла (вердикт штаба, вечер 2026-08-19;
// Регламент §11.2). Путь с workerData — через фабрику с ПОЛНОЙ валидацией:
// платформа кладёт values выбранного config@vK в workerData.values (§5.3,
// правка 2aed25a), DEV не ослаблен ни на бит. Без workerData — готовый
// ЭКЗЕМПЛЯР конвенционного адаптера model/index.ts: в репозитории это
// createModel(валидированные дефолты) — дев-контур не меняется ни на бит;
// в bake-артефакте адаптер регенерирован платформой в buildModel(литералы
// пары) — RGS-симуляция без конверта исполняет ПАРУ, и схема в этой ветке
// не нужна нигде (канонический паттерн SDK: workerSimulation({model, bot})
// с экземпляром, 13-simulation.md). Границы бота — из тех же значений:
// в конверте — из провалидированного конфига, в фолбэке — чистой сборкой
// buildConfig(knobValues) без чтения схемы: случайные target/condition
// гуляют по области исполняемого конфига.
workerSimulation((workerData?: { values?: unknown }) => {
  if (workerData?.values) {
    const cfg = resolveConfig(workerData.values);
    return {
      model: createModel(workerData.values),
      bot: createRandomDiceBot(cfg.targetMin, cfg.targetMax),
    };
  }
  const cfg = buildConfig(knobValues);
  return {
    model: defaultModel,
    bot: createRandomDiceBot(cfg.targetMin, cfg.targetMax),
  };
});
