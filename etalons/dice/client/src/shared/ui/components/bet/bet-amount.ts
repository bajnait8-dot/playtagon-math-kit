/** ½ bet — halve, round to 2dp, never below the table minimum. */
export const halfBet = (value: number, minBet: number) =>
  Math.max(minBet, Number((value / 2).toFixed(2)))

/** ×2 bet — double, round to 2dp, clamp to the table max and the balance. */
export const doubleBet = (value: number, maxBet: number, balance: number) =>
  Math.min(maxBet, balance, Number((value * 2).toFixed(2)))

/** Max bet — the largest stake you can actually place: the table maximum,
 *  clamped to the current balance (you can never bet more than you hold). */
export const maxBetAmount = (maxBet: number, balance: number) =>
  Math.min(maxBet, balance)
