import { runSimulation } from "@playtagon/runtime";
import { createDiceTracker } from "./simulations/tracker.js";
import type { DiceCondition } from "./model/types.js";

// Локальная отладка одного среза математики (13-simulation.md, runSimulation):
//   npx tsx simulate-fixed.ts [target] [over|under] [rounds]
const target = Number(process.argv[2] ?? 5000);
const condition = (process.argv[3] ?? "over") as DiceCondition;
const rounds = Number(process.argv[4] ?? 1_000_000);

const report = await runSimulation({
  workerPath: new URL("./simulations/fixed.worker.ts", import.meta.url),
  workerData: { target, condition },
  trackers: [createDiceTracker()],
  rounds,
});
console.log(JSON.stringify(report, null, 2));
