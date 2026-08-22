import { Fragment, type ReactNode } from 'react'

export interface InfoItem {
  /** Uppercase label, e.g. "Multiplier" */
  label: string
  /** Main value, e.g. "2.00" */
  value: string
  /** Glyph rendered before the value (e.g. the × multiplier icon) */
  iconLeft?: ReactNode
  /** Text or glyph rendered after the value (e.g. "EUR" or the % icon) */
  suffix?: ReactNode
  /** Override the value colour (defaults to white) */
  color?: string
}

/** × (multiply) glyph — Figma `x` icon, 24px. Inherits currentColor. */
export function MultiplyIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden style={{ flex: '0 0 auto' }}>
      <path d="M7 7l10 10M17 7L7 17" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

/** % (percentage) glyph — Figma `percentage` icon, 24px. Inherits currentColor. */
export function PercentGlyph() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden style={{ flex: '0 0 auto' }}>
      <path d="M7 17L17 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="7.5" cy="7.5" r="2" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="16.5" cy="16.5" r="2" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  )
}

/**
 * Info strip — matches Figma `Blocks/Info` 1:1.
 * Read-only columns (Multiplier / Profit on win / Win chance), each a centred
 * stack: Inter Bold 16 uppercase #959595 label over an Inter Medium 22 white
 * value row (gap 5) that may carry a left icon or a text/icon suffix. Columns
 * are separated by 92px vertical hairlines and spaced with a 50px gap.
 */
export function InfoRow({ items }: { items: InfoItem[] }) {
  // Row stretches to the full width with a light inner padding; each stat is its
  // own equal-width column (flex-1) holding a vertically + horizontally centred
  // label-over-value stack. Landscape keeps the natural width + Figma 50px gap.
  return (
    <div className="flex w-full items-stretch px-[10px] landscape:w-auto landscape:justify-center landscape:gap-[50px] landscape:px-0">
      {items.map((item, i) => (
        <Fragment key={i}>
          {/* Vertical hairline between columns (content-height, centred). */}
          {i > 0 && (
            <div
              className="mx-[10px] h-[46px] w-px shrink-0 self-center landscape:mx-0"
              style={{ background: 'rgba(255,255,255,0.09)' }}
              aria-hidden
            />
          )}
          {/* Equal-width column: centred label-over-value stack. */}
          <div className="flex flex-1 flex-col items-center justify-center gap-[6px] landscape:flex-none">
            <p
              className="whitespace-nowrap text-center text-[13px] font-bold uppercase leading-[18px] landscape:text-[16px] landscape:leading-[20px]"
              style={{ color: '#959595' }}
            >
              {item.label}
            </p>
            <div
              className="flex items-center justify-center gap-[5px] text-[18px] font-medium leading-[19.5px] tabular-nums whitespace-nowrap landscape:text-[22px]"
              style={{ color: item.color ?? '#ffffff' }}
            >
              {item.iconLeft}
              <span>{item.value}</span>
              {item.suffix}
            </div>
          </div>
        </Fragment>
      ))}
    </div>
  )
}
