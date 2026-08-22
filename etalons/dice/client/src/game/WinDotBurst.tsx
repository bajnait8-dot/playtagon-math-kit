/*
 * Win celebration dot-burst — matches Figma `Panel/Symbols` 8×8 dot blocks that
 * flank the digital display. Each block is an 8×8 grid of 4px dots on an 8px
 * pitch, flashing orange on a win. There are 10 distinct burst variants; one is
 * picked per win (see `variant`) so the celebration doesn't feel repetitive.
 */
interface WinDotBurstProps {
  /** which side of the display this block sits on */
  side: 'left' | 'right'
  /** run the celebration */
  active: boolean
  /** 0..9 — which burst pattern to play */
  variant?: number
}

const N = 8 // 8×8 grid
const DOT = 4 // px
const PITCH = 8 // px

type Motion = 'pop' | 'blink' | 'drop' | 'swell' | 'twinkle'

interface Variant {
  motion: Motion
  duration: number
  /** per-dot delay in ms; cc is the column measured from the display edge */
  delay: (cc: number, r: number) => number
}

const C = N - 1 // last index
const mid = (N - 1) / 2

// 10 distinct orderings. `cc` = column distance from the display (so both blocks
// ripple symmetrically outward); `r` = row from top.
const VARIANTS: Variant[] = [
  // 0 — ripple outward from the display
  { motion: 'pop', duration: 900, delay: (cc, r) => cc * 70 + r * 12 },
  // 1 — rain: top rows first, cascading down
  { motion: 'drop', duration: 850, delay: (cc, r) => r * 80 + cc * 10 },
  // 2 — diagonal sweep
  { motion: 'pop', duration: 900, delay: (cc, r) => (cc + r) * 55 },
  // 3 — explosion from centre outward (Chebyshev radius)
  { motion: 'swell', duration: 800, delay: (cc, r) => Math.max(Math.abs(cc - mid), Math.abs(r - mid)) * 75 },
  // 4 — converge toward the display (reverse ripple)
  { motion: 'pop', duration: 900, delay: (cc, r) => (C - cc) * 70 + r * 12 },
  // 5 — random sparkle (deterministic pseudo-random by cell)
  { motion: 'twinkle', duration: 1100, delay: (cc, r) => ((cc * 73 + r * 149) % 12) * 70 },
  // 6 — columns bounce one after another
  { motion: 'pop', duration: 700, delay: (cc) => cc * 110 },
  // 7 — checkerboard two-phase blink
  { motion: 'blink', duration: 800, delay: (cc, r) => ((cc + r) % 2) * 260 },
  // 8 — vertical travelling wave (rows)
  { motion: 'swell', duration: 850, delay: (_cc, r) => r * 95 },
  // 9 — ring pulse from centre (Euclidean radius)
  { motion: 'twinkle', duration: 1000, delay: (cc, r) => Math.round(Math.hypot(cc - mid, r - mid) * 80) },
]

const MOTION_NAME: Record<Motion, string> = {
  pop: 'og-win-pop',
  blink: 'og-win-blink',
  drop: 'og-win-drop',
  swell: 'og-win-swell',
  twinkle: 'og-win-twinkle',
}

export function WinDotBurst({ side, active, variant = 0 }: WinDotBurstProps) {
  const size = (N - 1) * PITCH + DOT // 60px
  const v = VARIANTS[((variant % VARIANTS.length) + VARIANTS.length) % VARIANTS.length]
  const dots = []
  for (let c = 0; c < N; c++) {
    for (let r = 0; r < N; r++) {
      // column distance from the display edge (left block: rightmost is nearest)
      const cc = side === 'left' ? C - c : c
      const delay = v.delay(cc, r)
      dots.push(
        <span
          key={`${c}-${r}`}
          style={{
            position: 'absolute',
            left: c * PITCH,
            top: r * PITCH,
            width: DOT,
            height: DOT,
            borderRadius: 1,
            background: '#f45b21',
            opacity: 0,
            animation: active ? `${MOTION_NAME[v.motion]} ${v.duration}ms ease-in-out ${delay}ms infinite` : 'none',
          }}
        />,
      )
    }
  }
  return (
    <span
      aria-hidden
      style={{
        display: 'inline-block',
        position: 'relative',
        width: size,
        height: size,
        flex: '0 0 auto',
        pointerEvents: 'none',
      }}
    >
      {dots}
    </span>
  )
}
