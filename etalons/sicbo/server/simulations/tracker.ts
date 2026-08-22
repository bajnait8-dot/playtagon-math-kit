import type { IAnalyticsTracker, IRoundResult } from "@playtagon/model-sdk";
import type { SicBoBetType, SicBoGameTypes } from "../model/types.js";

// Sicbo-специфичная аналитика ПОВЕРХ builtin-набора канонического SDK-трекера
// (Регламент §11.3): rtp/std/volatility/hitFrequency считает канон, дублировать
// его своей арифметикой не нужно. Здесь лежит то, чего builtin посчитать не
// может, — ТЕОРИЯ ПРОТИВ ФАКТА.
//
// У sicbo единого RTP нет: он зависит от того, на какие зоны игрок ставил.
// Поэтому теоретический RTP прогона выводится из ФАКТИЧЕСКИ сделанных ставок и
// коэффициентов ДЕЙСТВУЮЩЕГО конфига. Расхождение измеренного RTP с этим
// теоретическим за пределами статистической погрешности означает сломанную
// математику, а не невезение.

/** Число исходов из 216, при которых выигрывает каждая зона. Свойство костей. */
const OUTCOMES: Readonly<Record<string, number>> = (() => {
  const rolls: Array<[number, number, number]> = [];
  for (let a = 1; a <= 6; a++)
    for (let b = 1; b <= 6; b++)
      for (let c = 1; c <= 6; c++) rolls.push([a, b, c]);

  const isTriple = (r: number[]) => r[0] === r[1] && r[1] === r[2];
  const sum = (r: number[]) => r[0]! + r[1]! + r[2]!;
  const out: Record<string, number> = {};
  const count = (pred: (r: number[]) => boolean) => rolls.filter(pred).length;

  out.small = count((r) => sum(r) >= 4 && sum(r) <= 10 && !isTriple(r));
  out.big = count((r) => sum(r) >= 11 && sum(r) <= 17 && !isTriple(r));
  out.triple_any = count(isTriple);
  for (let n = 1; n <= 6; n++) {
    out[`triple_${n}`] = count((r) => isTriple(r) && r[0] === n);
    out[`double_${n}`] = count((r) => r.filter((v) => v === n).length >= 2);
    out[`single_${n}`] = count((r) => r.includes(n));
  }
  for (let s = 4; s <= 17; s++) out[`total_${s}`] = count((r) => sum(r) === s);
  for (let a = 1; a <= 6; a++)
    for (let b = a + 1; b <= 6; b++) {
      out[`combo_${a}${b}`] = count((r) => r.includes(a) && r.includes(b));
    }
  return out;
})();

const ALL_ROLLS = 216;

/**
 * Ожидаемый ВОЗВРАТ единицы ставки на зону при заданном коэффициенте (профите).
 * Для single_N возврат зависит от числа совпадений, поэтому считается точным
 * перебором, а не как p × (payout + 1).
 */
export function expectedReturn(type: SicBoBetType, payout: number): number {
  const m = /^single_([1-6])$/.exec(type);
  if (m) {
    // single платит по числу совпадений: 1 → 2×, 2 → 3×, 3 → 4× возврата.
    const face = Number(m[1]);
    let total = 0;
    for (let a = 1; a <= 6; a++)
      for (let b = 1; b <= 6; b++)
        for (let c = 1; c <= 6; c++) {
          const hits = [a, b, c].filter((v) => v === face).length;
          if (hits > 0) total += hits + 1;
        }
    return total / ALL_ROLLS;
  }
  const outcomes = OUTCOMES[type];
  if (outcomes === undefined) return 0;
  return (outcomes / ALL_ROLLS) * (payout + 1);
}

interface ZoneStats {
  rounds: number;
  staked: number;
  returned: number;
  expected: number;
}

/**
 * Трекер прогона. Таблица коэффициентов приходит ПАРАМЕТРОМ — из значений того
 * же конфига, на котором собрана модель прогона (Регламент §11.2: всё, что
 * зависит от ручек, берётся из тех же значений). Состояние — только внутри
 * замыкания: `trackers` объявлен фабрикой, чтобы прогоны не накапливали
 * состояние друг друга.
 */
export function createSicBoTracker(
  payouts: Readonly<Record<SicBoBetType, number>>,
): IAnalyticsTracker<SicBoGameTypes> {
  let rounds = 0;
  let staked = 0;
  let returned = 0;
  /** Сумма ожидаемых возвратов по всем сделанным ставкам — теория. */
  let expectedReturned = 0;
  let winningRounds = 0;
  let tripleRolls = 0;
  const byKind: Record<string, number> = { small: 0, big: 0, triple: 0 };
  const byZone = new Map<string, ZoneStats>();
  /** Множитель возврата, встреченный за прогон максимальным. */
  let maxZoneMultiplier = 0;

  return {
    name: "sicbo",

    pushRoundResult(result: IRoundResult<SicBoGameTypes>) {
      for (const stage of result.stages) {
        const { bets, wins, totalBet, totalWin, category } = stage.playData;

        rounds += 1;
        staked += totalBet;
        returned += totalWin;
        if (totalWin > 0) winningRounds += 1;
        byKind[category.kind] = (byKind[category.kind] ?? 0) + 1;
        if (category.kind === "triple") tripleRolls += 1;

        for (const w of wins) {
          const mult = w.payout / w.amount;
          if (mult > maxZoneMultiplier) maxZoneMultiplier = mult;
        }

        for (const b of bets) {
          // ТЕОРИЯ: ожидаемый возврат этой ставки при коэффициенте действующего
          // конфига. Считается и для проигравших зон — в этом весь смысл:
          // теория не зависит от того, повезло ли в этом раунде.
          const expected = b.amount * expectedReturn(b.type, payouts[b.type] ?? 0);
          expectedReturned += expected;

          const z = byZone.get(b.type) ?? { rounds: 0, staked: 0, returned: 0, expected: 0 };
          z.rounds += 1;
          z.staked += b.amount;
          z.expected += expected;
          const paid = wins.find((w) => w.type === b.type);
          if (paid) z.returned += paid.payout;
          byZone.set(b.type, z);
        }
      }
    },

    getResult() {
      const zones: Record<string, unknown> = {};
      for (const [type, z] of [...byZone.entries()].sort()) {
        zones[type] = {
          rounds: z.rounds,
          staked: z.staked,
          rtp: z.staked > 0 ? z.returned / z.staked : 0,
          expectedRtp: z.staked > 0 ? z.expected / z.staked : 0,
        };
      }
      return {
        rounds,
        /**
         * Измеренный RTP по факту. Стоит рядом с expectedRtp намеренно:
         * сравнивать их нужно на одной и той же выборке.
         */
        measuredRtp: staked > 0 ? returned / staked : 0,
        /**
         * ТЕОРИЯ: RTP, который обязан дать этот набор ставок при коэффициентах
         * действующего конфига. Выведен из playData каждого раунда, а не из
         * ручки — у sicbo единого RTP нет. Расхождение с measuredRtp за
         * пределами погрешности — сломанная математика.
         */
        expectedRtp: staked > 0 ? expectedReturned / staked : 0,
        hitRate: rounds > 0 ? winningRounds / rounds : 0,
        /** Доля троек; ожидание 6/216 = 2.7778% — равномерность костей. */
        tripleShare: rounds > 0 ? tripleRolls / rounds : 0,
        expectedTripleShare: 6 / ALL_ROLLS,
        rollKinds: byKind,
        maxZoneMultiplier,
        byZone: zones,
      };
    },
  };
}
