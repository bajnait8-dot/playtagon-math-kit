/*
 * 3D dice cube — matches Figma `Items/Dice` (6 DiceSide faces in perspective with an
 * orange neon edge halo). Used as the slider result marker. Spins via the `spinning`
 * prop (og-cube-spin keyframes in index.css), mirroring Oleg's prototype choreography.
 */
const LOGO_PATH =
  'M16.5819 0.85205C17.1332 -0.215781 18.6543 -0.211996 19.2025 0.85205C19.2051 0.857064 19.2078 0.862354 19.2103 0.867416L29.5307 21.4549C30.1408 22.6371 28.8727 24.0473 27.5456 24.0474L26.6286 24.046C25.8179 24.0447 25.0586 23.6909 24.4182 23.1936C22.9912 22.0854 21.2005 21.4259 19.2561 21.4259C17.3177 21.4259 15.532 22.0814 14.1071 23.1834C13.4655 23.6797 12.7052 24.0323 11.8941 24.0318L7.94475 24.0292C6.61759 24.0292 5.34964 22.6189 5.95964 21.4367L16.5819 0.85205ZM10.7872 0.795225C11.394 -0.396863 13.1477 -0.207246 13.4872 1.08718C13.6099 1.55503 13.5541 2.05196 13.331 2.48084L2.49186 23.3151C2.15078 23.9704 1.31316 24.1759 0.709114 23.7523C0.0300288 23.2759 -0.195072 22.37 0.181743 21.6297L10.7872 0.795225ZM19.2329 4.95071C18.8661 3.91716 17.4463 3.82113 16.9443 4.79589L9.054 20.1245C8.85765 20.5059 8.99191 20.9749 9.36016 21.1937C10.0909 21.6276 11.0353 21.3602 11.4317 20.6069L19.1642 5.90774C19.3195 5.6125 19.3445 5.26521 19.2329 4.95071Z'

function Face({ transform, size }: { transform: string; size: number }) {
  return (
    <div
      className="absolute inset-0 grid place-items-center"
      style={{
        transform,
        borderRadius: Math.round(size * 0.2),
        padding: Math.round(size * 0.1),
        background: 'linear-gradient(to bottom, #2e2d2e, #111112)',
        border: '2px solid #c73f10',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08), inset 0 -8px 14px rgba(0,0,0,0.42)',
      }}
    >
      <div
        className="grid h-full w-full place-items-center"
        style={{
          borderRadius: Math.round(size * 0.14),
          background: '#14181a',
          border: '1px solid rgba(255,255,255,0.11)',
          boxShadow: 'inset 0 4px 4px rgba(0,0,0,0.25)',
        }}
      >
        <svg viewBox="0 0 29.6883 24.0474" style={{ width: '52%', height: '52%', opacity: 0.6 }} aria-hidden>
          <path d={LOGO_PATH} fill="#4B4D50" />
        </svg>
      </div>
    </div>
  )
}

export function DiceCube({ size = 56, spinning = false }: { size?: number; spinning?: boolean }) {
  const half = size / 2
  // Slightly inset faces so the light silver body shows through the seams as
  // bevelled edges (Figma `figure` is a bright white→#353535 hexagon body).
  const faceInset = Math.max(2, Math.round(size * 0.06))
  const faces: string[] = [
    `rotateY(0deg) translateZ(${half}px)`,
    `rotateY(180deg) translateZ(${half}px)`,
    `rotateY(90deg) translateZ(${half}px)`,
    `rotateY(-90deg) translateZ(${half}px)`,
    `rotateX(90deg) translateZ(${half}px)`,
    `rotateX(-90deg) translateZ(${half}px)`,
  ]
  return (
    <div
      style={{
        width: size,
        height: size,
        perspective: 840,
        filter: 'drop-shadow(0 0 16px rgba(255,79,25,0.72)) drop-shadow(0 10px 24px rgba(0,0,0,0.76))',
      }}
    >
      <div
        className={spinning ? 'og-cube-spin' : ''}
        style={{
          position: 'relative',
          width: size,
          height: size,
          transformStyle: 'preserve-3d',
          transform: 'rotateX(-22deg) rotateY(38deg)',
        }}
      >
        {/* Light silver cube body (Figma `figure`): a slightly larger solid cube
            behind the faces whose bright edges read as the bevelled corpus. */}
        {faces.map((t, i) => (
          <div
            key={`body-${i}`}
            className="absolute"
            style={{
              inset: -faceInset,
              transform: t,
              borderRadius: Math.round(size * 0.22),
              background: 'linear-gradient(155deg, #ffffff, #9a9a9a 45%, #353535)',
              boxShadow: 'inset 0 0 6px rgba(255,255,255,0.5)',
            }}
          />
        ))}
        {faces.map((t, i) => (
          <Face key={i} transform={t} size={size} />
        ))}
        {/* orange neon edge contour */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: -4,
            borderRadius: Math.round(size * 0.27),
            transform: `translateZ(${Math.round(size * 0.53)}px)`,
            border: '2px solid rgba(255,108,39,0.82)',
            boxShadow: '0 0 22px rgba(255,79,25,0.72), inset 0 0 12px rgba(255,79,25,0.25)',
            pointerEvents: 'none',
          }}
        />
      </div>
    </div>
  )
}
