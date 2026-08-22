import { useRef, useState, useCallback } from 'react'

export interface VolumeSliderProps {
  value: number              // 0..1
  onChange: (value: number) => void
  muted?: boolean            // speaker shows muted glyph; value treated as 0 visually
}

function SpeakerIcon({ muted }: { muted?: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ flex: '0 0 auto' }}>
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      {muted ? (
        <><line x1="23" y1="9" x2="17" y2="15" /><line x1="17" y1="9" x2="23" y2="15" /></>
      ) : (
        <><path d="M15.54 8.46a5 5 0 0 1 0 7.07" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14" /></>
      )}
    </svg>
  )
}

/** Volume slider — Figma Settings slider. Reuses the DiceSlider track language:
 *  a tick row, an embossed grey trough with an orange gradient fill from 0→value,
 *  a round circle knob (Figma `circleRight`) riding the value, a % label above the
 *  knob, and speaker icons flanking. Controlled 0..1, click/drag to set. */
export function VolumeSlider({ value, onChange, muted }: VolumeSliderProps) {
  const v = muted ? 0 : value
  const pct = Math.round(v * 100)
  const trackRef = useRef<HTMLDivElement | null>(null)
  const [dragging, setDragging] = useState(false)

  const calcValue = useCallback((clientX: number) => {
    const track = trackRef.current
    if (!track) return 0
    const rect = track.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    return Number(ratio.toFixed(2))
  }, [])

  const onDown = (e: React.PointerEvent) => {
    e.preventDefault()
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    setDragging(true)
    onChange(calcValue(e.clientX))
  }
  const onMove = (e: React.PointerEvent) => {
    if (!dragging) return
    e.preventDefault()
    onChange(calcValue(e.clientX))
  }
  const onUp = () => setDragging(false)

  // 11 evenly-spaced ticks above the track (Figma volume slider).
  const ticks = Array.from({ length: 11 }, (_, i) => (i / 10) * 100)

  return (
    <div className="flex w-full items-center gap-[10px]">
      <span style={{ color: 'var(--og-text)', flex: '0 0 auto' }}><SpeakerIcon muted={muted} /></span>

      <div className="relative flex-1">
        {/* % label — follows the knob */}
        <div
          className="absolute -top-[20px] text-[16px] font-semibold leading-[20px]"
          style={{ left: `${pct}%`, transform: 'translateX(-50%)', color: 'var(--og-primary)' }}
        >
          {pct}%
        </div>

        {/* tick row */}
        <div className="relative mb-[6px] h-[4px] w-full">
          {ticks.map((t, i) => (
            <div
              key={i}
              className="absolute top-0 w-px"
              style={{
                left: `${t}%`,
                height: 4,
                transform: 'translateX(-50%)',
                background: t <= pct + 0.001 ? 'rgba(244,91,33,0.7)' : 'rgba(255,255,255,0.22)',
              }}
            />
          ))}
        </div>

        {/* trough + knob share a relative box so the knob centres on the trough */}
        <div className="relative">
          {/* Embossed trough — outer bezel */}
          <div
            className="rounded-[14px] p-[4px]"
            style={{
              background: 'linear-gradient(to bottom, #202224, #16171a)',
              border: '1px solid rgba(255,255,255,0.11)',
            }}
          >
            {/* Inner well */}
            <div
              className="rounded-[10px] p-[3px]"
              style={{ background: '#09090b', border: '1px solid rgba(255,255,255,0.11)' }}
            >
              {/* Fill track */}
              <div
                ref={trackRef}
                onPointerDown={onDown}
                onPointerMove={onMove}
                onPointerUp={onUp}
                onPointerCancel={onUp}
                className="relative h-[12px] w-full touch-none overflow-hidden rounded-[8px]"
                style={{
                  background:
                    'radial-gradient(rgba(255,255,255,0.22) 1px, transparent 1.2px) 0 0/7px 7px, linear-gradient(to bottom, #989898, #5b5b5b 45%, #2f2f2f)',
                  boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.2), inset 0 -1px 0 0 rgba(0,0,0,0.4)',
                  cursor: dragging ? 'grabbing' : 'pointer',
                }}
              >
                {/* orange fill 0→value with dot texture */}
                <div
                  className="absolute inset-y-0 left-0 rounded-[8px]"
                  style={{
                    width: `${pct}%`,
                    background:
                      'radial-gradient(rgba(0,0,0,0.22) 1px, transparent 1.2px) 0 0/7px 7px, linear-gradient(to bottom, #ff7a45, #f45b21 45%, #c83f12)',
                    boxShadow: 'inset 0 2px 1px 0 rgba(255,248,248,0.28), inset 0 -3px 6px 0 rgba(0,0,0,0.35)',
                  }}
                />
              </div>
            </div>
          </div>

          {/* Knob layer — inset to the fill-track so the knob's left:% maps to the
              same range the fill uses. Figma `circleRight`: white circle, orange dot. */}
          <div className="pointer-events-none absolute inset-y-0" style={{ left: 7, right: 7 }}>
            <div
              className="absolute flex items-center justify-center rounded-full"
              style={{
                left: `${pct}%`,
                top: '50%',
                width: 20,
                height: 20,
                transform: 'translate(-50%, -50%)',
                background: '#fff',
                boxShadow: '0 1px 3px rgba(0,0,0,0.5)',
              }}
            >
              <div className="rounded-full" style={{ width: 8, height: 8, background: 'var(--og-primary)' }} />
            </div>
          </div>
        </div>
      </div>

      <span style={{ color: 'var(--og-text)', flex: '0 0 auto' }}><SpeakerIcon /></span>
    </div>
  )
}
