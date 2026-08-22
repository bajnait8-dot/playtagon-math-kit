import type { IAnalyticsTracker, IRoundResult } from "@playtagon/model-sdk";
import type { DiceGameTypes } from "../model/types.js";
import { ROLL_MIN, ROLL_MAX } from "../model/config.js";

// Дайс-специфичная аналитика поверх builtin: судит реальную математику.
// В playData каждого раунда есть target/condition/roll/multiplier, значит рядом
// с фактом можно накопить ТЕОРИЮ — шанс победы и EV раунда. Расхождение факта
// с теорией за пределами статистической погрешности — сломанная математика,
// а не невезение: expectedRtp у честной модели равен ручке rtp тождественно.

const SCALE = ROLL_MAX - ROLL_MIN + 1;

interface SideStats {
  rounds: number;
  wins: number;
  /** сумма теоретических winChance сыгранных запросов */
  expectedWins: number;
}

export function createDiceTracker(): IAnalyticsTracker<DiceGameTypes> {
  const side: Record<"over" | "under", SideStats> = {
    over: { rounds: 0, wins: 0, expectedWins: 0 },
    under: { rounds: 0, wins: 0, expectedWins: 0 },
  };
  let rounds = 0;
  let expectedRtpSum = 0;
  let edgeRolls = 0;
  let maxMultiplierSeen = 0;

  const sideOut = (s: SideStats) => ({
    rounds: s.rounds,
    hitRate: s.rounds > 0 ? s.wins / s.rounds : 0,
    expectedHitRate: s.rounds > 0 ? s.expectedWins / s.rounds : 0,
  });

  return {
    name: "dice",
    pushRoundResult(result: IRoundResult<DiceGameTypes>) {
      for (const stage of result.stages) {
        const { target, condition, roll, multiplier, win } = stage.playData;
        const winChance = condition === "over" ? (ROLL_MAX - target) / SCALE : target / SCALE;
        const s = side[condition];
        s.rounds += 1;
        s.expectedWins += winChance;
        if (win > 0) {
          s.wins += 1;
          if (multiplier > maxMultiplierSeen) maxMultiplierSeen = multiplier;
        }
        if (roll === target) edgeRolls += 1;
        expectedRtpSum += winChance * multiplier;
        rounds += 1;
      }
    },
    getResult() {
      const wins = side.over.wins + side.under.wins;
      const expectedWins = side.over.expectedWins + side.under.expectedWins;
      return {
        rounds,
        expectedRtp: rounds > 0 ? expectedRtpSum / rounds : 0,
        hitRate: rounds > 0 ? wins / rounds : 0,
        expectedHitRate: rounds > 0 ? expectedWins / rounds : 0,
        /** доля раундов с roll === target; ожидание ~1/10000 — равномерность края */
        edgeRollShare: rounds > 0 ? edgeRolls / rounds : 0,
        maxMultiplierSeen,
        byCondition: { over: sideOut(side.over), under: sideOut(side.under) },
      };
    },
  };
}
