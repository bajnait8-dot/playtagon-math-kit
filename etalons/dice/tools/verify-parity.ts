/**
 * Сверка новой модели (dice/model/src) со старой (playtagon-dice/games/dice/server/model).
 *
 * Метод 2 — фиксированный seed: детерминированный RNG, пооперационная сверка playData.
 * Метод 3 — таблица выплат: множители на сетке target × condition.
 * Метод 4 — статистический прогон: эмпирический RTP против объявленного.
 *
 * Расхождения печатаются списком и НЕ сглаживаются.
 *
 * Запуск: npx tsx dice/model/tools/verify-parity.ts
 */

import { readFileSync } from "node:fs";
import { createModel } from "../server/model/factory.js";
import { model as oldModel } from "./old-model/index.js";
import { ROLL_MIN, ROLL_MAX } from "../server/model/config.js";

// Конвенция фабрики (§1.5.1): новая модель поднимается от значений config.json,
// поданных аргументом. Старая модель несёт те же числа константами — паритет
// осмыслен только на дефолтных значениях.
const configValues = JSON.parse(
  readFileSync(new URL("../server/config.json", import.meta.url), "utf8"),
).values as Record<string, number>;
const newModel = createModel(configValues);
const RTP = configValues.rtp;
const TARGET_MIN = configValues.target_min;
const TARGET_MAX = configValues.target_max;
const DEFAULT_TARGET = configValues.default_target;

type Condition = "over" | "under";

// --- Детерминированный RNG (mulberry32): один сид → одна и та же лента бросков ---
function makeRng(seed: number) {
  let s = seed >>> 0;
  let calls = 0;
  return {
    getInt(min: number, max: number): number {
      calls++;
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      const r = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      return min + Math.floor(r * (max - min + 1));
    },
    get calls() {
      return calls;
    },
  };
}

const mismatches: string[] = [];
function check(label: string, a: unknown, b: unknown): void {
  const sa = JSON.stringify(a);
  const sb = JSON.stringify(b);
  if (sa !== sb) mismatches.push(`${label}\n    старая: ${sa}\n    новая:  ${sb}`);
}

console.log("=".repeat(72));
console.log("СВЕРКА МАТЕМАТИКИ: старая модель (server/model) ↔ новая (model/src)");
console.log("=".repeat(72));

// --- Метод 2a: init ---
console.log("\n[2a] init() — сверка initData");
const oldInit = oldModel.init({ roundContext: null, globalContext: null });
const newInit = newModel.init({ roundContext: null, globalContext: null });
check("init().initData", oldInit.initData, newInit.initData);
console.log("     старая:", JSON.stringify(oldInit.initData));
console.log("     новая: ", JSON.stringify(newInit.initData));

// --- Метод 2b: play на фиксированном сиде ---
console.log("\n[2b] play() — фиксированный seed, пооперационная сверка playData");
const SEED = 20260809;
const conditions: Condition[] = ["over", "under"];
const targets = [200, 1000, 2500, 5000, 7500, 9000, 9800];
const bets = [1, 100, 12345];

let playCases = 0;
for (const target of targets) {
  for (const condition of conditions) {
    for (const bet of bets) {
      const req = { target, condition, bet };
      // Оба вызова получают СВОЙ rng с одним сидом → одинаковая лента бросков.
      const oldRes = oldModel.play({
        roundType: "normal",
        gameRequest: req,
        rng: makeRng(SEED + target + bet + (condition === "over" ? 0 : 1)),
        roundContext: null,
        globalContext: null,
      });
      const newRes = newModel.play({
        roundType: "normal",
        gameRequest: req,
        rng: makeRng(SEED + target + bet + (condition === "over" ? 0 : 1)),
        roundContext: null,
        globalContext: null,
      });
      check(`play(${target},${condition},${bet}).playData`, oldRes.playData, newRes.playData);
      check(`play(${target},${condition},${bet}).replayData`, oldRes.replayData, newRes.replayData);
      check(`play(${target},${condition},${bet}).win`, oldRes.win, newRes.win);
      check(`play(${target},${condition},${bet}).bet`, oldRes.bet, newRes.bet);
      check(
        `play(${target},${condition},${bet}).roundComplete`,
        oldRes.roundComplete,
        newRes.roundComplete,
      );
      playCases++;
    }
  }
}
console.log(`     сверено случаев: ${playCases} (по 5 полей каждый)`);

// --- Метод 2c: verify ---
console.log("\n[2c] verify() — сверка и совпадение с play() на том же сиде");
let verifyCases = 0;
for (const target of targets) {
  const rngPlay = makeRng(SEED + target);
  const played = newModel.play({
    roundType: "normal",
    gameRequest: { target, condition: "over", bet: 100 },
    rng: rngPlay,
    roundContext: null,
    globalContext: null,
  });
  const oldVerify = oldModel.verify!({ rng: makeRng(SEED + target) });
  const newVerify = newModel.verify!({ rng: makeRng(SEED + target) });
  check(`verify(target=${target})`, oldVerify, newVerify);
  check(`verify.roll == play.roll (target=${target})`, newVerify.roll, played.playData.roll);
  if (rngPlay.calls !== 1) {
    mismatches.push(`play() потребил ${rngPlay.calls} розыгрышей RNG вместо 1 (target=${target})`);
  }
  verifyCases++;
}
console.log(`     сверено случаев: ${verifyCases}; расход RNG play() = 1 розыгрыш`);

// --- Метод 3: таблица выплат ---
console.log("\n[3] Таблица выплат — множители на сетке target × condition");
console.log("     target |   chance(over)  mult(over) |  chance(under) mult(under)");
const SCALE = ROLL_MAX - ROLL_MIN + 1;
const tableTargets = [200, 1000, 2500, 5000, 7500, 9000, 9800];
for (const target of tableTargets) {
  const row: string[] = [];
  for (const condition of conditions) {
    const chance = condition === "over" ? (ROLL_MAX - target) / SCALE : target / SCALE;
    const mult = chance <= 0 ? 0 : RTP / chance;
    row.push(`${(chance * 100).toFixed(2).padStart(9)}%${mult.toFixed(4).padStart(11)}x`);
    // Сверка через фактический вызов обеих моделей (bet=1_000_000 — чтобы округление не скрыло разницу)
    const bet = 1_000_000;
    const rng = () => ({ getInt: () => (condition === "over" ? ROLL_MAX : ROLL_MIN) }); // гарантированный выигрыш
    const o = oldModel.play({
      roundType: "normal",
      gameRequest: { target, condition, bet },
      rng: rng(),
      roundContext: null,
      globalContext: null,
    });
    const n = newModel.play({
      roundType: "normal",
      gameRequest: { target, condition, bet },
      rng: rng(),
      roundContext: null,
      globalContext: null,
    });
    check(`paytable(${target},${condition}).multiplier`, o.playData.multiplier, n.playData.multiplier);
    check(`paytable(${target},${condition}).win`, o.playData.win, n.playData.win);
  }
  console.log(`     ${String(target).padStart(6)} | ${row.join(" | ")}`);
}

// --- Метод 4: статистический прогон ---
console.log("\n[4] Статистический прогон — эмпирический RTP");
const ROUNDS = 2_000_000;
const BET = 100;

function statRun(m: typeof newModel, label: string, target: number, condition: Condition) {
  const rng = makeRng(0xc0ffee);
  let totalBet = 0;
  let totalWin = 0;
  let wins = 0;
  for (let i = 0; i < ROUNDS; i++) {
    const res = m.play({
      roundType: "normal",
      gameRequest: { target, condition, bet: BET },
      rng,
      roundContext: null,
      globalContext: null,
    });
    totalBet += BET;
    totalWin += res.win;
    if (res.win > 0) wins++;
  }
  const rtp = totalWin / totalBet;
  const hit = wins / ROUNDS;
  console.log(
    `     ${label.padEnd(22)} RTP=${(rtp * 100).toFixed(4)}%  hit=${(hit * 100).toFixed(2)}%  раундов=${ROUNDS.toLocaleString("ru")}`,
  );
  return rtp;
}

const scenarios: Array<[string, number, Condition]> = [
  ["target=5000 over", 5000, "over"],
  ["target=5000 under", 5000, "under"],
  ["target=9000 over", 9000, "over"],
  ["target=1000 under", 1000, "under"],
];

console.log(`     объявленный RTP = ${(RTP * 100).toFixed(2)}%`);
for (const [label, target, condition] of scenarios) {
  const oldRtp = statRun(oldModel, `старая · ${label}`, target, condition);
  const newRtp = statRun(newModel, `новая  · ${label}`, target, condition);
  check(`статпрогон RTP (${label})`, oldRtp, newRtp);
}

// --- Ручки: доказательство, что значения приехали из конфига ---
console.log("\n[5] Ручки — значения config.json, поданные фабрике аргументом (§1.5.1)");
console.log(`     rtp            = ${RTP}`);
console.log(`     target_min     = ${TARGET_MIN}`);
console.log(`     target_max     = ${TARGET_MAX}`);
console.log(`     default_target = ${DEFAULT_TARGET}`);

// --- Итог ---
console.log("\n" + "=".repeat(72));
if (mismatches.length === 0) {
  console.log("РАСХОЖДЕНИЙ НЕ НАЙДЕНО — модели ведут себя идентично.");
} else {
  console.log(`НАЙДЕНО РАСХОЖДЕНИЙ: ${mismatches.length}`);
  for (const m of mismatches) console.log("  • " + m);
}
console.log("=".repeat(72));
process.exit(mismatches.length === 0 ? 0 : 1);
