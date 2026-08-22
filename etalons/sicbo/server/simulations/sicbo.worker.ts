import { workerSimulation } from "@playtagon/runtime";
import { createModel } from "../model/factory.js";
import { buildConfig, resolveConfig, type SicBoConfig } from "../model/knobs.js";
import defaultModel, { knobValues } from "../model/index.js";
import type { SicBoBetType } from "../model/types.js";
import { createRandomBot } from "./bots.js";

// Двухветочная форма worker-файла (Регламент §11.2).
//
// Путь С workerData — через фабрику с ПОЛНОЙ валидацией: платформа кладёт
// values выбранного config@vK в workerData.values, и DEV не ослаблен ни на бит.
// Эту дорогу караулит приёмный линт MODEL_WORKER_IGNORES_CONFIG.
//
// Путь БЕЗ workerData — готовый ЭКЗЕМПЛЯР конвенционного адаптера
// model/index.ts: локальный прогон автора, канонический playtagon check и
// симулятор RGS конверта не передают. В репозитории это
// createModel(валидированные дефолты) — дев-контур не меняется ни на бит; в
// bake-артефакте адаптер регенерирован платформой в buildModel(литералы пары),
// и прогон без конверта исполняет ПАРУ. Звать здесь фабрику нельзя: в
// артефакте валидирующая фабрика упёрлась бы в ленивое чтение schema.json,
// которой артефакт по канону не несёт.
//
// Всё, что зависит от ручек, берётся из ТЕХ ЖЕ значений: область ходьбы бота
// (список зон стола) выводится из таблицы коэффициентов — в конверте из
// провалидированного конфига, в фолбэке чистой сборкой buildConfig(knobValues)
// без чтения схемы. Бот, ходящий вне области действующего конфига, измерял бы
// несуществующий продукт.
/** Зоны стола действующего конфига — область, по которой ходит бот. */
const zonesOf = (cfg: SicBoConfig): SicBoBetType[] =>
  Object.keys(cfg.payouts) as SicBoBetType[];

workerSimulation((workerData?: { values?: unknown }) => {
  if (workerData?.values) {
    const cfg = resolveConfig(workerData.values);
    return {
      model: createModel(workerData.values),
      bot: createRandomBot(zonesOf(cfg)),
    };
  }
  const cfg = buildConfig(knobValues);
  return {
    model: defaultModel,
    bot: createRandomBot(zonesOf(cfg)),
  };
});
