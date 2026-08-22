import { runGlobalSimulation } from "@playtagon/runtime";

const report = await runGlobalSimulation();
console.log(JSON.stringify(report, null, 2));
