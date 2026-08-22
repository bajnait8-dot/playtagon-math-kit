import type { IGameTypes } from "@playtagon/model-sdk";

export type DiceValue = 1 | 2 | 3 | 4 | 5 | 6;
export type SicBoRoll = [DiceValue, DiceValue, DiceValue];

/** Все 50 типов ставок классического стола Sic Bo. */
export type SicBoBetType =
  | "small" | "big" | "triple_any"
  | `triple_${1 | 2 | 3 | 4 | 5 | 6}`
  | `double_${1 | 2 | 3 | 4 | 5 | 6}`
  | `total_${4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17}`
  | `combo_${string}`
  | `single_${1 | 2 | 3 | 4 | 5 | 6}`;

export interface SicBoBet {
  type: SicBoBetType;
  /** Ставка в МИНОРНЫХ юнитах (центах) — как везде в репозитории. */
  amount: number;
}

/** Категория броска — то, что показывает лента раундов слева от стола. */
export interface RollCategory {
  total: number;
  kind: "small" | "big" | "triple";
}

export interface SicBoWin {
  type: SicBoBetType;
  /** Ставка на этой зоне, минорные юниты. */
  amount: number;
  /** Выплата ПО ЭТОЙ зоне (включая возврат ставки), минорные юниты. */
  payout: number;
}

export interface SicBoHistoryEntry {
  roll: SicBoRoll;
  total: number;
  kind: "small" | "big" | "triple";
  bet: number;
  win: number;
}

export interface SicBoInitData {
  /** Все типы ставок, которые принимает стол — клиент строит по ним зоны. */
  betTypes: SicBoBetType[];
  /** Коэффициент (профит) по каждому типу — для подписей на столе. */
  payouts: Record<string, number>;
  history: SicBoHistoryEntry[];
}

/**
 * Раунд Sic Bo ОДНОШАГОВЫЙ: игрок расставил фишки, бросок, выплата, конец.
 * Многошаговых mines-полей (start → reveal → cashout) здесь нет, поэтому нет и
 * roundContext — он всегда null.
 */
export interface SicBoGameRequest {
  bets: SicBoBet[];
}

export interface SicBoPlayData {
  roll: SicBoRoll;
  bets: SicBoBet[];
  wins: SicBoWin[];
  /** Сумма всех ставок раунда, минорные юниты. */
  totalBet: number;
  /** Сумма всех выплат, минорные юниты. 0 — проигрыш. */
  totalWin: number;
  category: RollCategory;
}

export type SicBoReplayData = SicBoPlayData;

/** Что показывает окно проверки честности: бросок, пересчитанный из пары сидов. */
export interface SicBoVerifyData {
  roll: SicBoRoll;
}

export interface SicBoGameTypes extends IGameTypes {
  initData: SicBoInitData;
  playData: SicBoPlayData;
  gameRequest: SicBoGameRequest;
  /**
   * ВСЕГДА null: раунд одношаговый, между запросами хранить нечего.
   * (В mines здесь жило состояние поля между ходами.)
   */
  roundContext: null;
  /**
   * ВСЕГДА null: fairness-режим запрещает cross-round context — раунд обязан
   * полностью выводиться из пары сидов и нонса. История живёт на клиенте.
   */
  globalContext: null;
  replayData: SicBoReplayData;
  verifyData: SicBoVerifyData;
}
