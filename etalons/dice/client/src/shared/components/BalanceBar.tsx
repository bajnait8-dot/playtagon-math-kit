import { fmt } from '../ui'

interface BalanceBarProps {
  balance: number
  currency: string
  formattedBalance?: string
}

/** Wallet glyph for the balance chip. Inherits currentColor. */
function WalletIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden style={{ flex: '0 0 auto' }}>
      <path
        d="M11.333 6.667h.007M2 4.667A1.333 1.333 0 0 1 3.333 3.333h8A1.333 1.333 0 0 1 12.667 4.667M2 4.667v6.666A1.333 1.333 0 0 0 3.333 12.667h9.334A1.333 1.333 0 0 0 14 11.333v-4.666A1.333 1.333 0 0 0 12.667 5.333H3.333A1.333 1.333 0 0 1 2 4.667Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/**
 * Balance chip — compact single-line pill matching the Figma desktop top line
 * (wallet icon + amount + currency). Sits left of the drop-stats strip.
 */
export function BalanceBar({ balance, currency, formattedBalance }: BalanceBarProps) {
  return (
    <div
      className="flex h-[30px] shrink-0 items-center gap-[6px] rounded-[8px] px-[10px] text-[16px] font-medium leading-[20px] tabular-nums"
      style={{ background: '#272727', color: '#d9d9d9' }}
    >
      <span style={{ color: '#939393' }}>
        <WalletIcon />
      </span>
      <span>{formattedBalance ?? `${fmt(balance)} ${currency}`}</span>
    </div>
  )
}
