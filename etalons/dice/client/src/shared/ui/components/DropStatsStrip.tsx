import { motion, AnimatePresence } from 'framer-motion'
import type { HistoryEntry } from '../types'
import { fmt } from '../format'

interface DropStatsStripProps {
  history: HistoryEntry[]
  currency?: string
  maxDisplay?: number
}

/** Dice/cube glyph (Figma brand-unity). Inherits currentColor. */
function DiceIcon() {
  return (
    <svg width="15" height="17" viewBox="0 0 15 16.6667" fill="currentColor" aria-hidden style={{ flex: '0 0 auto' }}>
      <path d="M15 10.0001C15 10.4603 14.6269 10.8334 14.1667 10.8334C13.7064 10.8334 13.3333 10.4603 13.3333 10.0001V5.66983L8.33333 8.79483V14.2758L12.0378 11.8067C12.4207 11.5514 12.9381 11.6549 13.1934 12.0378C13.4487 12.4208 13.3452 12.9381 12.9622 13.1934L7.96224 16.5268C7.68232 16.7134 7.31768 16.7134 7.03776 16.5268L2.03776 13.1934C1.65482 12.9381 1.55135 12.4208 1.80664 12.0378C2.06193 11.6549 2.5793 11.5514 2.96224 11.8067L6.66667 14.2758V8.79483L1.66667 5.66983V10.0001C1.66667 10.4603 1.29357 10.8334 0.833333 10.8334C0.373096 10.8334 0 10.4603 0 10.0001V4.16674C0 3.88811 0.139262 3.62794 0.371094 3.47338L5.37109 0.140048C5.75403 -0.115245 6.2714 -0.0117725 6.52669 0.371168C6.78199 0.754109 6.67852 1.27148 6.29558 1.52677L2.36898 4.14397L7.5 7.35033L12.6302 4.14397L8.70443 1.52677C8.32149 1.27148 8.21802 0.754109 8.47331 0.371168C8.7286 -0.0117729 9.24597 -0.115245 9.62891 0.140048L14.6289 3.47338C14.8607 3.62794 15 3.88811 15 4.16674V10.0001Z" />
    </svg>
  )
}

/** Cash/coin glyph (Figma cash). Inherits currentColor. */
function CashIcon() {
  return (
    <svg width="17" height="14" viewBox="0 0 16.6667 13.3333" fill="currentColor" aria-hidden style={{ flex: '0 0 auto' }}>
      <path d="M15 5.83333C15 5.61232 14.9121 5.40042 14.7559 5.24414C14.5996 5.08786 14.3877 5 14.1667 5H5.83333C5.61232 5 5.40042 5.08786 5.24414 5.24414C5.08786 5.40042 5 5.61232 5 5.83333V10.8333C5 11.0543 5.08786 11.2662 5.24414 11.4225C5.40042 11.5788 5.61232 11.6667 5.83333 11.6667H14.1667C14.3877 11.6667 14.5996 11.5788 14.7559 11.4225C14.9121 11.2662 15 11.0543 15 10.8333V5.83333ZM16.6667 10.8333C16.6667 11.4964 16.4031 12.1323 15.9342 12.6011C15.4654 13.0699 14.8297 13.3333 14.1667 13.3333H5.83333C5.1703 13.3333 4.5346 13.0699 4.06576 12.6011C3.59692 12.1323 3.33333 11.4964 3.33333 10.8333V5.83333C3.33333 5.1703 3.59692 4.5346 4.06576 4.06576C4.5346 3.59692 5.1703 3.33333 5.83333 3.33333H14.1667C14.8297 3.33333 15.4654 3.59692 15.9342 4.06576C16.4031 4.5346 16.6667 5.1703 16.6667 5.83333V10.8333ZM2.5 1.66667H11.6667C12.1269 1.66667 12.5 1.29357 12.5 0.833333C12.5 0.373096 12.1269 0 11.6667 0H2.5C1.83696 0 1.20107 0.263392 0.732233 0.732233C0.263392 1.20107 0 1.83696 0 2.5V9.16667C0 9.6269 0.373096 10 0.833333 10C1.29357 10 1.66667 9.6269 1.66667 9.16667V2.5C1.66667 2.27899 1.75446 2.06702 1.91074 1.91074C2.06702 1.75446 2.27899 1.66667 2.5 1.66667Z" />
      <path d="M10 7.5C9.53976 7.5 9.16667 7.8731 9.16667 8.33333C9.16667 8.79357 9.53976 9.16667 10 9.16667C10.4602 9.16667 10.8333 8.79357 10.8333 8.33333C10.8333 7.8731 10.4602 7.5 10 7.5Z" />
    </svg>
  )
}

/**
 * Drop-stats chip strip — matches Figma Items/DropStat.
 * Each chip: a `num` segment (dice icon + roll) and, for wins, a `money` segment
 * (cash icon + payout). Won: bg #454545, white text. Loss: num bg #272727, #939393 text.
 */
export function DropStatsStrip({ history, currency = '', maxDisplay = 12 }: DropStatsStripProps) {
  // Newest is rightmost: keep chronological order (oldest → newest) and hug the
  // right edge so the strip runs right-to-left — new chips enter on the right and
  // push older ones leftward off-screen.
  const start = Math.max(0, history.length - maxDisplay)
  const recent = history.slice(start)
  return (
    <div
      className="flex h-[30px] w-full shrink-0 items-center justify-end gap-[10px] overflow-hidden"
      // Soft left-edge fade so chips overflowing past the left clip out gracefully
      // instead of being hard-cut.
      style={{
        maskImage: 'linear-gradient(to right, transparent, #000 40px)',
        WebkitMaskImage: 'linear-gradient(to right, transparent, #000 40px)',
      }}
    >
      <AnimatePresence initial={false}>
        {recent.map((e, i) => (
          <motion.div
            key={start + i}
            layout
            initial={{ opacity: 0, scale: 0.6, x: 16 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            exit={{ opacity: 0, scale: 0.6, x: -16 }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            className="flex shrink-0 items-center gap-px overflow-hidden rounded-[8px] text-[16px] font-medium leading-[20px] tabular-nums"
          >
            <span
              className="flex items-center gap-[5px] p-[5px]"
              style={{ background: e.win ? '#454545' : '#272727', color: e.win ? '#fff' : '#939393' }}
            >
              <DiceIcon />
              {e.roll.toFixed(2)}
            </span>
            {e.win && (
              <span className="flex items-center gap-[5px] p-[5px]" style={{ background: '#454545', color: '#fff' }}>
                <CashIcon />
                {fmt(e.payout)}{currency ? ` ${currency}` : ''}
              </span>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
