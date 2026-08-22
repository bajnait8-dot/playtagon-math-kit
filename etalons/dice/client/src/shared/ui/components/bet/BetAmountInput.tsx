import { getCurrencyCode } from '../../format'
import { halfBet, doubleBet, maxBetAmount } from './bet-amount'

interface BetAmountInputProps {
  value: number
  onChange: (v: number) => void
  minBet: number
  maxBet: number
  balance: number
  disabled?: boolean
  showMax?: boolean
  /** Optional field label rendered above the input (e.g. "Bet Amount") */
  label?: string
  /**
   * Render the ½ / ×2 (and Max) buttons inside the input on the right.
   * Figma shows them inline in Auto mode; in Manual mode they live in a
   * separate row below (see HalfDoubleRow), so pass false there.
   */
  showInlineAdjust?: boolean
}

/**
 * Bet amount field — matches Figma `Items/Input` 1:1.
 * Label: Inter Bold 14px #5c5c5c uppercase. Shell: h-70, radius 17, border #474747,
 * gradient #1c2025→#181c20, inset shadow. Value: Inter Medium 22px white + currency
 * code Bold 22px #374151. ½/×2: 70px sections, border-left #474747, #a9a9a9 text.
 */
export function BetAmountInput({ value, onChange, minBet, maxBet, balance, disabled, showMax, label, showInlineAdjust = true }: BetAmountInputProps) {
  const half = () => onChange(halfBet(value, minBet))
  const double = () => onChange(doubleBet(value, maxBet, balance))
  const sectionCls =
    'flex h-full w-[70px] items-center justify-center gap-1 p-[20px] text-[#a9a9a9] disabled:opacity-40'
  return (
    <div className="flex w-full flex-col items-start">
      {label && (
        <p className="w-full text-[14px] font-bold uppercase leading-[30px]" style={{ color: '#5c5c5c' }}>
          {label}
        </p>
      )}
      <div
        className="relative flex h-[70px] w-full items-center justify-between overflow-hidden rounded-[17px] p-px"
        style={{
          border: '1px solid #474747',
          background: 'linear-gradient(to bottom, #1c2025, #181c20)',
          boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.4)',
        }}
      >
        {/* value + currency code (Items/Input/Area) */}
        <div className="flex min-w-0 flex-1 items-center justify-between px-[15px]">
          <input
            type="number"
            value={value}
            onChange={(e) => onChange(Number(e.target.value))}
            min={minBet}
            max={maxBetAmount(maxBet, balance)}
            step={0.1}
            disabled={disabled}
            className="min-w-0 flex-1 bg-transparent text-[22px] font-medium leading-[19.5px] outline-none"
            style={{ color: '#ffffff' }}
          />
          <span className="shrink-0 pl-2 text-[22px] font-bold" style={{ color: '#374151', letterSpacing: '0.5px' }}>
            {getCurrencyCode()}
          </span>
        </div>
        {/* ½ / ×2 sections (inline — Auto mode) */}
        {showInlineAdjust && (
          <div className="flex h-full shrink-0 items-center">
            <button type="button" onClick={half} disabled={disabled} className={`${sectionCls} text-[22px] font-semibold`} style={{ borderLeft: '1px solid #474747' }}>
              ½
            </button>
            <button type="button" onClick={double} disabled={disabled} className={`${sectionCls} text-[16px] font-semibold`} style={{ borderLeft: '1px solid #474747' }}>
              ×2
            </button>
            {showMax && (
              <button type="button" onClick={() => onChange(maxBetAmount(maxBet, balance))} disabled={disabled} className={`${sectionCls} text-[16px] font-semibold`} style={{ borderLeft: '1px solid #474747', color: 'var(--og-primary)' }}>
                Max
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
