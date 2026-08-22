export type BetState = 'idle' | 'betting' | 'playing' | 'cashing_out' | 'result'

export interface HistoryEntry {
  multiplier: number
  win: boolean
  roll: number      // display-space roll value (0..100)
  payout: number    // display-space payout amount
  roundId: string   // short id, e.g. "c75f0eb3"
  timestamp: number // Date.now() at round end (client display only; not the model)
  balance: number   // display-space balance after the round
  bet: number       // display-space bet amount
}
