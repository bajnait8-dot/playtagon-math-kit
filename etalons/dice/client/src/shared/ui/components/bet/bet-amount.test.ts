import { describe, it, expect } from 'vitest'
import { halfBet, doubleBet, maxBetAmount } from './bet-amount'

describe('bet-amount helpers', () => {
  it('halfBet halves and rounds to 2dp', () => {
    expect(halfBet(10, 1)).toBe(5)
    expect(halfBet(2.5, 1)).toBe(1.25)
  })
  it('halfBet never goes below minBet', () => {
    expect(halfBet(1.5, 1)).toBe(1) // 0.75 clamped up to 1
  })
  it('doubleBet doubles and rounds to 2dp', () => {
    expect(doubleBet(10, 1000, 1000)).toBe(20)
  })
  it('doubleBet clamps to maxBet and balance', () => {
    expect(doubleBet(600, 1000, 1000)).toBe(1000) // 1200 -> maxBet 1000
    expect(doubleBet(600, 1000, 800)).toBe(800)   // 1200 -> balance 800
  })
  it('maxBetAmount clamps the table maximum to the current balance', () => {
    expect(maxBetAmount(1000, 800)).toBe(800) // table max 1000 but balance is only 800
    expect(maxBetAmount(500, 800)).toBe(500) // table max 500 is below balance, so 500
  })
})
