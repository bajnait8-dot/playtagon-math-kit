export type BetMode = 'manual' | 'auto'

export interface AutoBetConfig {
  numberOfBets: number // 0 = infinity
  /** Increase the next bet by this % after a win. 0 = reset to base bet. */
  onWinPercent: number
  /** Increase the next bet by this % after a loss. 0 = reset to base bet. */
  onLossPercent: number
  stopOnProfit: number // 0 = disabled
  stopOnLoss: number // 0 = disabled
}

export const DEFAULT_AUTO_CONFIG: AutoBetConfig = {
  numberOfBets: 0,
  onWinPercent: 0,
  onLossPercent: 0,
  stopOnProfit: 0,
  stopOnLoss: 0,
}
