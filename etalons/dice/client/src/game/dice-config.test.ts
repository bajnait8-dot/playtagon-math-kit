import { describe, it, expect, beforeEach } from 'vitest'
import {
  setGameConfig,
  getMinTarget,
  getMaxTarget,
  getDefaultTarget,
  toServerTarget,
  fromServerRoll,
  calculateWinChance,
  calculateMultiplier,
  targetFromMultiplier,
} from './dice-config'

beforeEach(() => {
  // scale = 9999 - 0 + 1 = 10000 → /100 = 100
  setGameConfig({ rollMin: 0, rollMax: 9999, targetMin: 200, targetMax: 9800, defaultTarget: 5000, rtp: 0.99 })
})

describe('dice-config', () => {
  it('derives display target bounds from server scale', () => {
    expect(getMinTarget()).toBe(2)
    expect(getMaxTarget()).toBe(98)
    expect(getDefaultTarget()).toBe(50)
  })

  it('converts display target to server target', () => {
    expect(toServerTarget(50)).toBe(5000)
    expect(toServerTarget(2)).toBe(200)
  })

  it('converts server roll to display roll', () => {
    expect(fromServerRoll(5000)).toBe(50)
    expect(fromServerRoll(9999)).toBeCloseTo(99.99, 2)
  })

  it('computes win chance for over and under', () => {
    expect(calculateWinChance(50, 'over')).toBeCloseTo(0.5, 5)
    expect(calculateWinChance(25, 'under')).toBeCloseTo(0.25, 5)
  })

  it('computes multiplier from win chance using rtp', () => {
    // rtp 0.99 / 0.5 = 1.98
    expect(calculateMultiplier(0.5)).toBeCloseTo(1.98, 4)
    expect(calculateMultiplier(0)).toBe(0)
  })

  it('round-trips target ↔ multiplier for over', () => {
    const mult = calculateMultiplier(calculateWinChance(50, 'over'))
    expect(targetFromMultiplier(mult, 'over')).toBeCloseTo(50, 2)
  })

  it('clamps targetFromMultiplier to bounds when multiplier <= 1', () => {
    expect(targetFromMultiplier(0.9, 'over')).toBe(98)
    expect(targetFromMultiplier(0.9, 'under')).toBe(2)
  })

  it('round-trips target ↔ multiplier for under', () => {
    const mult = calculateMultiplier(calculateWinChance(25, 'under'))
    expect(targetFromMultiplier(mult, 'under')).toBeCloseTo(25, 2)
  })
})
