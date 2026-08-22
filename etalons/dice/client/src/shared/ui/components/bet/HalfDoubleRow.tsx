interface HalfDoubleRowProps {
  value: number
  onChange: (v: number) => void
  minBet: number
  maxBet: number
  balance: number
  disabled?: boolean
}

/**
 * Standalone ½ / ×2 row — matches Figma `Blocks/Sidebar` (Type=Manual) `row`.
 * Two equal buttons, h-59, border #373737, radius 16, gradient #1a1c1e→#17171b,
 * #a9a9a9 text with a top inset highlight. ½ is a 22px glyph; ×2 is a 12px
 * close/× icon followed by "2" at 16px. Used in Manual mode, where the adjust
 * buttons live below the input rather than inside it.
 */
export function HalfDoubleRow({ value, onChange, minBet, maxBet, balance, disabled }: HalfDoubleRowProps) {
  const half = () => onChange(Math.max(minBet, Number((value / 2).toFixed(2))))
  const double = () => onChange(Math.min(maxBet, balance, Number((value * 2).toFixed(2))))
  const btnCls =
    'relative flex h-[59px] flex-1 items-center justify-center gap-1 overflow-hidden rounded-[16px] disabled:opacity-40'
  const btnStyle = {
    border: '1px solid #373737',
    background: 'linear-gradient(to bottom, #1a1c1e, #17171b)',
    boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.04)',
    color: '#a9a9a9',
  } as const
  return (
    <div className="flex w-full items-center gap-[10px]">
      <button type="button" onClick={half} disabled={disabled} className={btnCls} style={btnStyle}>
        <span className="text-[22px] font-semibold leading-none">½</span>
      </button>
      <button type="button" onClick={double} disabled={disabled} className={btnCls} style={btnStyle}>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
          <path d="M2.5 2.5 9.5 9.5M9.5 2.5 2.5 9.5" stroke="#a9a9a9" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
        <span className="text-[16px] font-semibold leading-none">2</span>
      </button>
    </div>
  )
}
