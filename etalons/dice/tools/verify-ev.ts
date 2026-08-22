// Сверка EV полным перебором всех 10 000 исходов броска.
// Метод из шага переноса (STATE.md §4) + метод ревью (§4.1): не статистика,
// а точный перебор — EV обязан равняться объявленному RTP при любом пороге
// и направлении.
//
// Запуск: npx tsx <этот файл>

import { readFileSync } from "node:fs";
import { createModel } from "../server/model/factory.js";

// Значения ручек — вход фабрики (§1.5.1). Инструмент разработчика читает
// config.json сам (объявление значений, §2.4) — код модели его не читает.
const values = JSON.parse(
  readFileSync(new URL("../server/config.json", import.meta.url), "utf8"),
).values;
const model = createModel(values);

const ROLL_MIN = 0;
const ROLL_MAX = 9999;
const BET = 1_000_000; // крупная ставка: округление не искажает EV

type Condition = "over" | "under";

/** RNG на фиксированном буфере — отдаёт заранее заданный бросок. */
function rngFor(roll: number) {
  let used = false;
  return {
    getInt(min: number, max: number): number {
      if (used) throw new Error("лишний розыгрыш RNG");
      used = true;
      return min + (roll % (max - min + 1));
    },
  };
}

const targets = [200, 1000, 2500, 5000, 7500, 9000, 9800];
const conditions: Condition[] = ["over", "under"];

const rows: string[] = [];
let worstDelta = 0;

for (const target of targets) {
  for (const condition of conditions) {
    let totalWin = 0;
    let wins = 0;
    let multiplier = 0;

    // Полный перебор: каждый из 10 000 исходов ровно один раз, вероятность равна.
    for (let roll = ROLL_MIN; roll <= ROLL_MAX; roll++) {
      const res = model.play({
        roundType: "default",
        gameRequest: { target, condition, bet: BET },
        rng: rngFor(roll),
        roundContext: null,
        globalContext: null,
      } as never);
      totalWin += res.win;
      if (res.win > 0) wins++;
      multiplier = (res.playData as { multiplier: number }).multiplier;
    }

    const rounds = ROLL_MAX - ROLL_MIN + 1;
    const ev = totalWin / (BET * rounds);
    const winChance = wins / rounds;
    worstDelta = Math.max(worstDelta, Math.abs(ev - 0.99));

    rows.push(
      `target=${String(target).padStart(4)} ${condition.padEnd(5)}` +
        ` winChance=${winChance.toFixed(4)}` +
        ` mult=${multiplier.toFixed(4).padStart(8)}` +
        ` EV=${ev.toFixed(6)}`,
    );
  }
}

console.log("Сверка EV полным перебором всех 10 000 исходов, ставка " + BET);
console.log("=".repeat(70));
for (const r of rows) console.log(r);
console.log("=".repeat(70));
console.log(`Максимальное отклонение EV от объявленного rtp=0.99: ${worstDelta.toExponential(3)}`);

// Контрольная сумма всех исходов: побитовый отпечаток математики.
// Любой сдвиг математики изменит её.
let fingerprint = 0;
for (const target of targets) {
  for (const condition of conditions) {
    for (let roll = ROLL_MIN; roll <= ROLL_MAX; roll++) {
      const res = model.play({
        roundType: "default",
        gameRequest: { target, condition, bet: 137 },
        rng: rngFor(roll),
        roundContext: null,
        globalContext: null,
      } as never);
      // сумма по модулю — устойчивый и дешёвый отпечаток
      fingerprint = (fingerprint + res.win) % 2_147_483_647;
    }
  }
}
console.log(`Отпечаток выплат (bet=137, все исходы × все сценарии): ${fingerprint}`);
