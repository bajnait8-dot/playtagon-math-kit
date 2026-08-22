import type { ISimulationConfig } from "@playtagon/model-sdk";
import type { DiceGameTypes } from "../model/types.js";
import { createDiceTracker } from "./tracker.js";

// Конфиг глобального прогона (13-simulation.md): один воркер на игру, трекеры —
// фабрика (свежие на каждый roundType). Ожидание отчёта: builtin.rtp ≈ 0.99
// (= ручка rtp дев-модели), dice.hitRate ≈ dice.expectedHitRate,
// dice.expectedRtp = 0.99 с точностью арифметики.
const simulations: ISimulationConfig<DiceGameTypes> = {
  workerPath: new URL("./dice.worker.ts", import.meta.url),
  trackers: () => [createDiceTracker()],
};

export default simulations;
