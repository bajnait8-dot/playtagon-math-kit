// ЯДРО РАСЧЁТА. Перенесено из прежнего model/config.ts БЕЗ изменения формул:
// payoutFor / evaluateBet / rollCategory / rollDice / settleRound считают ровно
// то же, что считали до конверсии. Единственная правка — ИСТОЧНИК ЗНАЧЕНИЙ:
// там, где раньше стояла модульная константа PAYOUTS, теперь стоит таблица,
// приехавшая аргументом из значений ручек действующего конфига (Регламент §4:
// значения ручек не превращаются в код).
//
// Что НЕ является ручкой и осталось константой механики:
//   FACES / TOTALS / COMBO_PAIRS — свойства трёх шестигранных костей;
//   small/big (1:1) и single_N (по числу совпадений) — их коэффициенты целым
//   числом нерегулируемы: шаг 1 переводит RTP через 100% (small/big
//   97.22% → 145.83%, single 92.13% → 176.39%), а дробная выплата — другая
//   игра. Решение владельца: остаются константами, настраиваются только
//   правкой этого файла (protocol.md §5).

import type { IRng } from "@playtagon/model-sdk";
import type {
  DiceValue,
  RollCategory,
  SicBoBet,
  SicBoBetType,
  SicBoPlayData,
  SicBoRoll,
  SicBoWin,
} from "./types.js";

/** Грани кубика — основа для перечисления групп ставок. */
export const FACES: readonly DiceValue[] = [1, 2, 3, 4, 5, 6];

/** Суммы, за которые платит стол: 4…17. Тройные 3 и 18 сюда не входят. */
export const TOTALS: readonly number[] = [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17];

/** Комбинации двух РАЗНЫХ граней: (1,2), (1,3) … (5,6) — ровно 15. */
export const COMBO_PAIRS: ReadonlyArray<readonly [DiceValue, DiceValue]> = (() => {
  const out: Array<[DiceValue, DiceValue]> = [];
  for (let a = 0; a < FACES.length; a++)
    for (let b = a + 1; b < FACES.length; b++) out.push([FACES[a]!, FACES[b]!]);
  return out;
})();

/** Коэффициент single bet при ОДНОМ совпадении; два и три платят 2:1 и 3:1. */
const SINGLE_BASE_PAYOUT = 1;

/** Коэффициент small/big — канонический 1:1. Не ручка (см. шапку файла). */
const SMALL_BIG_PAYOUT = 1;

/**
 * Значения ручек, из которых собирается таблица коэффициентов. Приезжают из
 * действующего конфига через фабрику — модуль их не хардкодит и не читает.
 */
export interface SicBoPayoutKnobs {
  /** Коэффициент на каждую сумму 4…17 — ручка total_payouts. */
  totalPayouts: Readonly<Record<number, number>>;
  /** Ручка triple_specific_payout. */
  tripleSpecific: number;
  /** Ручка triple_any_payout. */
  tripleAny: number;
  /** Ручка double_payout. */
  double: number;
  /** Ручка combo_payout. */
  combo: number;
}

/**
 * Таблица коэффициентов стола, собранная из значений ручек. Форма и порядок
 * ключей — те же, что были у прежней модульной константы PAYOUTS: клиент и
 * initData.payouts читают её как раньше.
 */
export function buildPayouts(knobs: SicBoPayoutKnobs): Record<SicBoBetType, number> {
  const p: Partial<Record<SicBoBetType, number>> = {
    small: SMALL_BIG_PAYOUT,
    big: SMALL_BIG_PAYOUT,
    triple_any: knobs.tripleAny,
  };
  for (const n of FACES) {
    p[`triple_${n}` as SicBoBetType] = knobs.tripleSpecific;
    p[`double_${n}` as SicBoBetType] = knobs.double;
    p[`single_${n}` as SicBoBetType] = SINGLE_BASE_PAYOUT;
  }
  for (const s of TOTALS) p[`total_${s}` as SicBoBetType] = knobs.totalPayouts[s]!;
  for (const [a, b] of COMBO_PAIRS) p[`combo_${a}${b}` as SicBoBetType] = knobs.combo;
  return p as Record<SicBoBetType, number>;
}

/**
 * Потолок множителя ВОЗВРАТА за одну зону при ДЕФОЛТНЫХ коэффициентах.
 * Максимум на дефолтном столе — triple_N (181×); 200 взято с запасом, чтобы
 * тест ловил случайное задирание коэффициента, а не срабатывал на границе.
 * Это тестовый инвариант дефолтной раскладки, а не вход математики: потолок
 * произвольного конфига задают max-границы ручек в schema.json.
 */
export const WIN_CAP = 200;

const isTriple = (r: SicBoRoll): boolean => r[0] === r[1] && r[1] === r[2];
const sum = (r: SicBoRoll): number => r[0] + r[1] + r[2];

/** Категория броска для ленты раундов. Тройка — отдельная категория. */
export function rollCategory(roll: SicBoRoll): RollCategory {
  const total = sum(roll);
  if (isTriple(roll)) return { total, kind: "triple" };
  return { total, kind: total <= 10 ? "small" : "big" };
}

/**
 * Множитель ВОЗВРАТА: 0 — проигрыш, иначе (профит + 1), т.е. ставка
 * возвращается вместе с выигрышем.
 *
 * Single bet — особый случай: платит по ЧИСЛУ совпадений (1:1 / 2:1 / 3:1),
 * поэтому его выплата не выводится из таблицы одним умножением.
 *
 * Правки против прежней версии — ровно одна: таблица коэффициентов приходит
 * аргументом `payouts` вместо модульной константы PAYOUTS. Ветвление, порядок
 * проверок и арифметика не тронуты.
 */
export function payoutFor(
  bet: SicBoBetType,
  roll: SicBoRoll,
  payouts: Readonly<Record<SicBoBetType, number>>,
): number {
  const total = sum(roll);
  const triple = isTriple(roll);

  // Small/Big НЕ платят на тройке — канон Sic Bo.
  if (bet === "small") return total >= 4 && total <= 10 && !triple ? 2 : 0;
  if (bet === "big") return total >= 11 && total <= 17 && !triple ? 2 : 0;
  if (bet === "triple_any") return triple ? payouts.triple_any + 1 : 0;

  let m: RegExpMatchArray | null;

  if ((m = bet.match(/^triple_([1-6])$/))) {
    return triple && roll[0] === Number(m[1]) ? payouts[bet]! + 1 : 0;
  }

  if ((m = bet.match(/^double_([1-6])$/))) {
    const n = Number(m[1]);
    // Тройка тоже содержит пару — double при 3,3,3 выигрывает.
    return roll.filter((v) => v === n).length >= 2 ? payouts[bet]! + 1 : 0;
  }

  if ((m = bet.match(/^total_(\d+)$/))) {
    return total === Number(m[1]) ? payouts[bet]! + 1 : 0;
  }

  if ((m = bet.match(/^combo_([1-6])([1-6])$/))) {
    // Нужны ОБЕ грани: снимаем первую и ищем вторую в остатке, иначе тройка
    // одинаковых прошла бы за комбинацию с самой собой.
    const rest: DiceValue[] = [...roll];
    const i = rest.indexOf(Number(m[1]) as DiceValue);
    if (i < 0) return 0;
    rest.splice(i, 1);
    return rest.includes(Number(m[2]) as DiceValue) ? payouts[bet]! + 1 : 0;
  }

  if ((m = bet.match(/^single_([1-6])$/))) {
    const face = Number(m[1]);
    const hits = roll.filter((v) => v === face).length;
    return hits > 0 ? hits + 1 : 0;   // 1 совпадение → 2× возврата, 3 → 4×
  }

  return 0;
}

/** Выигрышна ли ставка. Производное от payoutFor — одна точка правды. */
export function evaluateBet(
  bet: SicBoBetType,
  roll: SicBoRoll,
  payouts: Readonly<Record<SicBoBetType, number>>,
): boolean {
  return payoutFor(bet, roll, payouts) > 0;
}

/** Бросок трёх кубиков. Единственное место, где игра трогает RNG. */
export function rollDice(rng: IRng): SicBoRoll {
  return [
    rng.getInt(1, 6) as DiceValue,
    rng.getInt(1, 6) as DiceValue,
    rng.getInt(1, 6) as DiceValue,
  ];
}

/**
 * Расчёт раунда. Чистая функция: бросок УЖЕ известен (его даёт rng выше по
 * стеку) — так её можно гонять тестами без RNG.
 *
 * Выплата считается по КАЖДОЙ ставке независимо: 3,3,3 выигрывает и triple_any,
 * и triple_3, и double_3 одновременно — это канон Sic Bo, а не ошибка.
 */
export function settleRound(
  bets: SicBoBet[],
  roll: SicBoRoll,
  payouts: Readonly<Record<SicBoBetType, number>>,
): SicBoPlayData {
  const wins: SicBoWin[] = [];
  let totalWin = 0;
  let totalBet = 0;

  for (const b of bets) {
    totalBet += b.amount;
    const mult = payoutFor(b.type, roll, payouts);
    if (mult > 0) {
      const payout = b.amount * mult;
      wins.push({ type: b.type, amount: b.amount, payout });
      totalWin += payout;
    }
  }

  return { roll, bets, wins, totalBet, totalWin, category: rollCategory(roll) };
}
