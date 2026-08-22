export type DiceCondition = 'over' | 'under'

// Set from initData, no defaults — must call setGameConfig() before use
let _scale = 0
let _minTarget = 0
let _maxTarget = 0
let _defaultTarget = 0
let _rtp = 0

export function setGameConfig(initData: {
  rollMin: number
  rollMax: number
  targetMin: number
  targetMax: number
  defaultTarget: number
  rtp: number
}): void {
  _scale = initData.rollMax - initData.rollMin + 1
  _minTarget = initData.targetMin / (_scale / 100)
  _maxTarget = initData.targetMax / (_scale / 100)
  _defaultTarget = initData.defaultTarget / (_scale / 100)
  _rtp = initData.rtp
}

export function getMinTarget(): number { return _minTarget }
export function getMaxTarget(): number { return _maxTarget }
export function getDefaultTarget(): number { return _defaultTarget }
export function getRtp(): number { return _rtp }

/** Convert display target (e.g. 2.00-98.00) to server target (e.g. 200-9800) */
export function toServerTarget(displayTarget: number): number {
  return Math.round(displayTarget * (_scale / 100))
}

/** Convert server roll to display roll (e.g. 0-9999 → 0.00-99.99) */
export function fromServerRoll(serverRoll: number): number {
  return serverRoll / (_scale / 100)
}

export function calculateWinChance(target: number, condition: DiceCondition): number {
  if (condition === 'over') {
    return (100 - target) / 100
  }
  return target / 100
}

export function calculateMultiplier(winChance: number): number {
  if (winChance <= 0) return 0
  return Number((_rtp / winChance).toFixed(4))
}

export function targetFromMultiplier(multiplier: number, condition: DiceCondition): number {
  if (multiplier <= 1) return condition === 'over' ? _maxTarget : _minTarget
  const winChance = _rtp / multiplier
  if (condition === 'over') {
    return Number(Math.max(_minTarget, Math.min(_maxTarget, 100 - winChance * 100)).toFixed(2))
  }
  return Number(Math.max(_minTarget, Math.min(_maxTarget, winChance * 100)).toFixed(2))
}
