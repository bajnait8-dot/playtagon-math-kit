interface DiceLogoProps {
  /** outer size in px (Figma DiceSide is 62) */
  size?: number
  /** orange win glow halo for the result marker */
  glow?: boolean
  /** muted/loss variant: dims the orange border + logo */
  dim?: boolean
  /**
   * As a slider knob: tint only the contour edge facing the orange win zone.
   * 'right' → orange on the right side, 'left' → orange on the left; the rest of
   * the border stays neutral. Omit for the standalone (all-orange) dice side.
   */
  edge?: 'left' | 'right'
  /** Animate the win-facing edge contour (breathing pulse) — used on the live knob */
  pulse?: boolean
}

/** Playtagon mark used inside a dice side. Inherits the given color. */
function LogoMark({ color, opacity = 0.6 }: { color: string; opacity?: number }) {
  return (
    <svg viewBox="0 0 29.6883 24.0474" fill="none" style={{ width: '52%', height: '52%', opacity }} aria-hidden>
      <path
        d="M16.5819 0.85205C17.1332 -0.215781 18.6543 -0.211996 19.2025 0.85205C19.2051 0.857064 19.2078 0.862354 19.2103 0.867416L29.5307 21.4549C30.1408 22.6371 28.8727 24.0473 27.5456 24.0474L26.6286 24.046C25.8179 24.0447 25.0586 23.6909 24.4182 23.1936C22.9912 22.0854 21.2005 21.4259 19.2561 21.4259C17.3177 21.4259 15.532 22.0814 14.1071 23.1834C13.4655 23.6797 12.7052 24.0323 11.8941 24.0318L7.94475 24.0292C6.61759 24.0292 5.34964 22.6189 5.95964 21.4367L16.5819 0.85205ZM10.7872 0.795225C11.394 -0.396863 13.1477 -0.207246 13.4872 1.08718C13.6099 1.55503 13.5541 2.05196 13.331 2.48084L2.49186 23.3151C2.15078 23.9704 1.31316 24.1759 0.709114 23.7523C0.0300288 23.2759 -0.195072 22.37 0.181743 21.6297L10.7872 0.795225ZM19.2329 4.95071C18.8661 3.91716 17.4463 3.82113 16.9443 4.79589L9.054 20.1245C8.85765 20.5059 8.99191 20.9749 9.36016 21.1937C10.0909 21.6276 11.0353 21.3602 11.4317 20.6069L19.1642 5.90774C19.3195 5.6125 19.3445 5.26521 19.2329 4.95071Z"
        fill={color}
      />
    </svg>
  )
}

/**
 * One dice side — matches Figma `Items/DiceSide` 1:1.
 * Outer: 2px #c73f10 border, gradient #2e2d2e→#111112, radius 16, 6px padding.
 * Inner 50px square: #14181a, 1px rgba(255,255,255,.11), radius 11, inset shadow,
 * with the Playtagon logo mark centered. `glow` adds the orange win halo; `dim`
 * mutes it for the loss result marker.
 */
export function DiceLogo({ size = 62, glow = false, dim = false, edge, pulse = false }: DiceLogoProps) {
  const pad = Math.round(size * 0.097) // 6/62
  const radius = Math.round(size * 0.258) // 16/62
  const orange = '#c73f10'
  // Base contour: neutral when used as a knob with an edge tint, otherwise the
  // standalone all-orange dice side (or dim/neutral when muted).
  const baseBorder = edge
    ? 'rgba(255,255,255,0.18)'
    : dim
      ? 'rgba(255,255,255,0.2)'
      : orange
  // Reveal the orange edge ring on only the win-facing HALF, fading out at centre.
  const edgeMask =
    edge === 'right'
      ? 'linear-gradient(to right, transparent 50%, #000 100%)'
      : 'linear-gradient(to left, transparent 50%, #000 100%)'
  const edgeGlow =
    edge && !dim
      ? `${edge === 'right' ? '6px' : '-6px'} 0 16px -6px rgba(255,79,25,0.6)`
      : null
  return (
    <div
      style={{
        position: 'relative',
        width: size,
        height: size,
        boxSizing: 'border-box',
        display: 'grid',
        placeItems: 'center',
        padding: pad,
        borderRadius: radius,
        border: `2px solid ${baseBorder}`,
        background: 'linear-gradient(to bottom, #2e2d2e, #111112)',
        boxShadow: [
          glow ? '0 0 20px rgba(255,79,25,0.7), 0 8px 24px rgba(0,0,0,0.64)' : '0 8px 24px rgba(0,0,0,0.5)',
          edgeGlow,
        ]
          .filter(Boolean)
          .join(', '),
      }}
    >
      {/* Orange contour overlay, masked to the win-facing half (fades at centre).
          On the live knob it breathes (og-edge-pulse) to draw the eye to the win side. */}
      {edge && !dim && (
        <span
          aria-hidden
          className={pulse ? 'og-edge-pulse' : undefined}
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: radius,
            border: `2px solid ${orange}`,
            pointerEvents: 'none',
            WebkitMaskImage: edgeMask,
            maskImage: edgeMask,
          }}
        />
      )}
      <div
        style={{
          display: 'grid',
          placeItems: 'center',
          width: '100%',
          height: '100%',
          borderRadius: Math.round(size * 0.177), // 11/62
          background: '#14181a',
          border: '1px solid rgba(255,255,255,0.11)',
          boxShadow: 'inset 0 4px 4px rgba(0,0,0,0.25)',
        }}
      >
        <LogoMark color="#4B4D50" />
      </div>
    </div>
  )
}
