/*
 * Dotted-decor (Figma Items/Dotted-Decor): a triangular staircase of small dots in a
 * corner, dense at the corner and stepping down to a 45° diagonal. Each dot is a real
 * element so it can pulse individually in a diagonal wave (like Oleg's burstPixel).
 *
 * Grid: 8 columns × 8 rows on a 7px pitch (3px dots). Column c shows rows 0..(7-c),
 * forming the triangle. `corner` picks which corner the dense apex sits in.
 */
import type { CSSProperties } from 'react'

export type DecorCorner = 'tl' | 'tr' | 'bl' | 'br'

interface DottedDecorProps {
  corner?: DecorCorner
  /** dot color; defaults to the Figma orange */
  color?: string
  className?: string
}

const PITCH = 7 // px between dot centers
const DOT = 3 // px dot size
const N = 8 // grid size

export function DottedDecor({ corner = 'tl', color = '#db4513', className }: DottedDecorProps) {
  const dots: { x: number; y: number; wave: number }[] = []
  for (let c = 0; c < N; c++) {
    for (let r = 0; r + c < N; r++) {
      // place relative to the apex corner
      const col = corner === 'tr' || corner === 'br' ? N - 1 - c : c
      const row = corner === 'bl' || corner === 'br' ? N - 1 - r : r
      dots.push({ x: col * PITCH, y: row * PITCH, wave: r + c })
    }
  }
  const w = N * PITCH
  // Self-anchor to the chosen corner with the Figma -2px overhang.
  const anchor: CSSProperties =
    corner === 'tl' ? { top: -2, left: -2 }
    : corner === 'tr' ? { top: -2, right: -2 }
    : corner === 'bl' ? { bottom: -2, left: -2 }
    : { bottom: -2, right: -2 }
  return (
    <span
      aria-hidden
      className={className}
      style={{ position: 'absolute', width: w, height: w, pointerEvents: 'none', ...anchor }}
    >
      {dots.map((d, i) => (
        <span
          key={i}
          className="og-dot"
          style={{
            position: 'absolute',
            left: d.x,
            top: d.y,
            width: DOT,
            height: DOT,
            borderRadius: '50%',
            background: color,
            // per-dot wave delay; the pulse itself only runs on parent :hover (see theme.css)
            ['--og-dot-delay' as string]: `${d.wave * 60}ms`,
          }}
        />
      ))}
    </span>
  )
}
