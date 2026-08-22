import { glyphFor } from './dice-glyphs'

export type DisplayTone = 'idle' | 'win' | 'loss'

interface DigitalDisplayProps {
  /** Characters to render, e.g. "50.00" or "DICE" */
  text: string
  tone?: DisplayTone
  /** dot size in px (Figma = 4). Pitch is 2× the dot size, matching Figma's 8px grid. */
  dot?: number
  /** Play the intro wave — lit dots ignite left-to-right (used for the DICE logo). */
  animateIn?: boolean
  /** Punch the whole display (scale pop + brightness flash) when a result lands. */
  reveal?: boolean
}

const TONE_COLOR: Record<DisplayTone, string> = {
  idle: 'var(--og-text)',
  win: 'var(--og-win)',
  loss: 'var(--og-text-dim)',
}

/**
 * Dot-matrix display, 1:1 with Figma `Panel/Symbols`. Each symbol is a grid of
 * rounded 4×4 dots on an 8px pitch (8 rows tall; digits 5 cols, the decimal
 * point 3 cols). Only lit dots are rendered — empty cells stay transparent, as
 * in Figma (no dim "off" dots). `tone` tints the lit dots and adds a win glow.
 */
export function DigitalDisplay({ text, tone = 'idle', dot = 4, animateIn = false, reveal = false }: DigitalDisplayProps) {
  const color = TONE_COLOR[tone]
  // Figma pitch is 8px for a 4px dot — gap equals the dot size.
  const gap = dot
  const radius = Math.max(1, Math.round(dot * 0.25)) // 1px on a 4px dot
  const litShadow = tone === 'win' ? `0 0 ${dot * 1.5}px ${color}` : 'none'

  // Running column offset so the intro wave delay is computed against the WHOLE
  // word (a global left-to-right sweep), not reset per character.
  let colOffset = 0

  return (
    <div
      // `reveal` keyed by text so the punch animation restarts on each new result.
      key={reveal ? `reveal-${text}` : undefined}
      className={`flex items-start justify-center${reveal ? ' og-display-reveal' : ''}`}
      style={{ gap: dot * 2 }}
      aria-label={text}
    >
      {[...text].map((ch, ci) => {
        const grid = glyphFor(ch)
        const cols = grid[0]?.length ?? 5
        const base = colOffset
        colOffset += cols + 1 // +1 for the inter-character gap, in column units
        return (
          <div
            key={ci}
            className="grid"
            style={{
              gridTemplateColumns: `repeat(${cols}, ${dot}px)`,
              gridTemplateRows: `repeat(8, ${dot}px)`,
              gap,
            }}
          >
            {grid.flatMap((row, ri) =>
              [...row].map((cell, xi) => {
                const lit = cell === '#'
                // Wave delay: 45ms per global column + 18ms per row so it sweeps
                // left-to-right with a slight downward tilt.
                const delay = animateIn ? (base + xi) * 45 + ri * 18 : 0
                return (
                  <div
                    key={`${ri}-${xi}`}
                    style={{
                      width: dot,
                      height: dot,
                      borderRadius: radius,
                      background: lit ? color : 'transparent',
                      boxShadow: lit ? litShadow : 'none',
                      animation: lit && animateIn ? `og-dot-wave 420ms ease-out ${delay}ms both` : undefined,
                    }}
                  />
                )
              }),
            )}
          </div>
        )
      })}
    </div>
  )
}
