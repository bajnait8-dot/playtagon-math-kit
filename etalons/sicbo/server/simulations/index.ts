import type { ISimulationConfig } from "@playtagon/model-sdk";
import type { SicBoGameTypes } from "../model/types.js";
import { buildConfig } from "../model/knobs.js";
import { knobValues } from "../model/index.js";
import { createSicBoTracker } from "./tracker.js";

// Конфиг глобального прогона: один воркер на игру, трекеры — фабрика (свежие на
// каждый roundType, чтобы прогоны не накапливали состояние друг друга).
//
// Ожидание отчёта: builtin-набор канонического трекера (rtp, std, volatility,
// hitFrequency, …) плюс sicbo-трекер с теорией против факта —
// sicbo.measuredRtp ≈ sicbo.expectedRtp, sicbo.tripleShare ≈ 6/216.
// Единого заявленного RTP у игры нет (ручки x-role: "target-rtp" в схеме нет):
// RTP зависит от того, на какие зоны ставит бот, поэтому судить его можно
// только против теории, выведенной из тех же ставок.
//
// Таблица коэффициентов трекера — из значений адаптера (Регламент §11.2: всё,
// что зависит от ручек, берётся из тех же значений). Сборка чистая, без чтения
// схемы: значения адаптера уже провалидированы им самим.
const simulations: ISimulationConfig<SicBoGameTypes> = {
  workerPath: new URL("./sicbo.worker.ts", import.meta.url),
  trackers: () => [createSicBoTracker(buildConfig(knobValues).payouts)],
};

export default simulations;
