import { useRef, useState, useCallback, useEffect, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import type { DiceCondition } from './dice-config'
import { getMinTarget, getMaxTarget } from './dice-config'
import { DiceLogo } from './DiceLogo'
import { DiceCube } from './DiceCube'

interface DiceSliderProps {
  target: number
  condition: DiceCondition
  /** result roll in display space 0..100, or null when idle/rolling */
  resultRoll: number | null
  resultWon: boolean | null
  /** true while the result marker should be shown */
  showResult: boolean
  /** true while a roll is in flight (cube spins) */
  isRolling?: boolean
  /** live roll position 0..100 during the spin (cube travels), falls back to target */
  rollingPos?: number
  disabled: boolean
  onTargetChange?: (target: number) => void
  scaleLabels?: number[]
  /** Master animation switch — gates the knob edge pulse (Settings → Animations) */
  animations?: boolean
  /** Content rendered just below the trough, centred on the knob (target X) and
   *  travelling with it — e.g. the Switch-side button / intro hint. */
  belowKnob?: ReactNode
}

/**
 * Dice slider — matches Figma slider + scale 1:1.
 * Scale: numeric labels (Inter SemiBold 16) over tick marks (a long 16px tick
 * under each label and short ticks between), labels turn orange over the win zone.
 * Track: a three-layer embossed trough — outer #202224→#16171a bezel (r26, p7),
 * inner #09090b well (r19, p5), and an h-24 fill (r15) carrying the orange win
 * gradient + a faint dot texture and inset highlight. The DiceLogo knob rides the
 * target position; a 3D cube appears during the roll/result.
 */
export function DiceSlider({
  target,
  condition,
  resultRoll,
  resultWon,
  showResult,
  isRolling = false,
  rollingPos,
  disabled,
  onTargetChange,
  scaleLabels = [0, 25, 50, 75, 100],
  animations = true,
  belowKnob,
}: DiceSliderProps) {
  const trackRef = useRef<HTMLDivElement | null>(null)
  const [dragging, setDragging] = useState(false)

  // Cube life-cycle after a result: 'settle' (sits on the result) → 'fly' (launches
  // off-screen) → 'gone' (unmounted; knob un-dims and points at the target again).
  const [cubePhase, setCubePhase] = useState<'settle' | 'fly' | 'gone'>('gone')
  useEffect(() => {
    if (isRolling) {
      setCubePhase('settle')
      return
    }
    if (!showResult) {
      setCubePhase('gone')
      return
    }
    // result just shown — let it settle, then fly off, then unmount
    setCubePhase('settle')
    const flyAt = setTimeout(() => setCubePhase('fly'), 650)
    const goneAt = setTimeout(() => setCubePhase('gone'), 650 + 520)
    return () => {
      clearTimeout(flyAt)
      clearTimeout(goneAt)
    }
  }, [showResult, isRolling])

  const cubeVisible = isRolling || (showResult && cubePhase !== 'gone')
  // Knob is dimmed only while the cube is present; once it flies off it re-points.
  const knobDimmed = isRolling || (showResult && cubePhase !== 'gone')

  const calcTarget = useCallback((clientX: number) => {
    const track = trackRef.current
    if (!track) return getMinTarget()
    const rect = track.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    return Math.max(getMinTarget(), Math.min(getMaxTarget(), Number((ratio * 100).toFixed(2))))
  }, [])

  const onDown = (e: React.PointerEvent) => {
    if (disabled || !onTargetChange) return
    e.preventDefault()
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    setDragging(true)
    onTargetChange(calcTarget(e.clientX))
  }
  const onMove = (e: React.PointerEvent) => {
    if (!dragging || disabled || !onTargetChange) return
    e.preventDefault()
    onTargetChange(calcTarget(e.clientX))
  }
  const onUp = () => setDragging(false)

  // win zone span (for "over", win is to the right of target; for "under", to the left)
  const winStart = condition === 'under' ? 0 : target
  const winWidth = condition === 'under' ? target : 100 - target

  return (
    <div className="w-full">
      {/* Scale: numeric labels + tick marks. Inset by the trough padding (outer p-7
          + inner p-5 + borders ≈ 14px) so 0/100 line up with the fill-track edges. */}
      <div className="px-[14px]">
        <ScaleBar labels={scaleLabels} winStart={winStart} winWidth={winWidth} />
      </div>

      {/* Trough + knob share a relative box so the knob centres on the trough */}
      <div className="relative">
      {/* Embossed trough — outer bezel */}
      <div
        className="rounded-[26px] p-[7px]"
        style={{
          background: 'linear-gradient(to bottom, #202224, #16171a)',
          border: '1px solid rgba(255,255,255,0.11)',
        }}
      >
        {/* Inner well */}
        <div
          className="rounded-[19px] p-[5px]"
          style={{ background: '#09090b', border: '1px solid rgba(255,255,255,0.11)' }}
        >
          {/* Fill track */}
          <div
            ref={trackRef}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            className="relative h-[24px] w-full touch-none overflow-hidden rounded-[15px]"
            style={{
              // Embossed grey base (Figma slider texture): top-lit #989898 → #2f2f2f,
              // with a light dot texture on top (reads on the bright grey).
              background:
                'radial-gradient(rgba(255,255,255,0.22) 1px, transparent 1.2px) 0 0/7px 7px, linear-gradient(to bottom, #989898, #5b5b5b 45%, #2f2f2f)',
              // Top-only light edge + bottom dark edge — no full outline (which would
              // leave a stray light line along the bottom).
              boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.2), inset 0 -1px 0 0 rgba(0,0,0,0.4)',
              cursor: disabled ? 'default' : dragging ? 'grabbing' : 'pointer',
            }}
          >
            {/* orange win-zone fill with dot texture */}
            <div
              className="absolute inset-y-0 rounded-[15px]"
              style={{
                left: `${winStart}%`,
                width: `${winWidth}%`,
                background:
                  'radial-gradient(rgba(0,0,0,0.22) 1px, transparent 1.2px) 0 0/7px 7px, linear-gradient(to bottom, #ff7a45, #f45b21 45%, #c83f12)',
                boxShadow: 'inset 0 2px 1px 0 rgba(255,248,248,0.28), inset 0 -3px 6px 0 rgba(0,0,0,0.35)',
              }}
            />
          </div>
        </div>
      </div>

        {/* Knob layer — overlays the trough, inset to the fill-track so the knob's
            left:% maps to the same track range the fill uses (and the scale points to) */}
        <div className="pointer-events-none absolute inset-y-0" style={{ left: 14, right: 14 }}>
          {/* flat DiceLogo knob at target — always visible, dims during roll/result.
              `edge` tints the knob's contour on the side facing the orange win zone. */}
          <motion.div
            className="absolute"
            style={{
              left: `${target}%`,
              top: '50%',
              transform: 'translate(-50%, -50%)',
              zIndex: 10,
              opacity: knobDimmed ? 0.72 : 1,
              filter: knobDimmed ? 'grayscale(1) saturate(.4)' : 'none',
              transition: 'opacity .22s ease, filter .22s ease',
            }}
            animate={{ left: `${target}%` }}
            transition={dragging ? { duration: 0 } : { type: 'spring', stiffness: 300, damping: 25 }}
          >
            <DiceLogo size={62} edge={condition === 'under' ? 'left' : 'right'} pulse={animations && !knobDimmed} />
          </motion.div>
          {/* 3D cube — spins while rolling (travels), settles on the result, then
              flies off (og-cube-fly) and unmounts so the knob re-points at target */}
          {cubeVisible && (
            <div
              className="absolute"
              style={{
                left: `${isRolling ? (rollingPos ?? target) : resultRoll ?? target}%`,
                top: '50%',
                transform: 'translate(-50%, -50%)',
                zIndex: 11,
              }}
            >
              <div className={cubePhase === 'fly' ? 'og-cube-fly' : ''}>
                {/* spawn layer: pops the cube out of the knob when the roll starts;
                    kept separate from the fly/spin transforms so they don't clash */}
                <div className="og-cube-spawn">
                  <DiceCube size={62} spinning={isRolling} />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Below-knob slot — travels with the knob (same inset band as the knob
            layer). Centred on target X; clamped via min/max so the content never
            spills past the track edges. */}
        {belowKnob != null && (
          <div className="pointer-events-none absolute" style={{ left: 14, right: 14, top: 'calc(100% + 12px)' }}>
            <motion.div
              // Centre on the knob, but clamp by ~half the button width so it never
              // spills past the track edges at target 0 / 100.
              className="pointer-events-auto absolute flex -translate-x-1/2 justify-center whitespace-nowrap"
              style={{ left: `clamp(72px, ${target}%, calc(100% - 72px))` }}
              animate={{ left: `clamp(72px, ${target}%, calc(100% - 72px))` }}
              transition={dragging ? { duration: 0 } : { type: 'spring', stiffness: 300, damping: 25 }}
            >
              {belowKnob}
            </motion.div>
          </div>
        )}
      </div>
    </div>
  )
}

/** Scale bar: numeric labels with long ticks, short ticks between. */
function ScaleBar({ labels, winStart, winWidth }: { labels: number[]; winStart: number; winWidth: number }) {
  const max = labels[labels.length - 1] || 100
  const inWin = (pct: number) => pct >= winStart - 0.001 && pct <= winStart + winWidth + 0.001
  // 4 short ticks between each pair of labels
  const minorTicks: number[] = []
  for (let i = 0; i < labels.length - 1; i++) {
    const a = labels[i]
    const b = labels[i + 1]
    for (let k = 1; k <= 4; k++) minorTicks.push(a + ((b - a) * k) / 5)
  }
  return (
    <div className="relative mb-2 h-[42px] w-full">
      {/* minor ticks */}
      {minorTicks.map((v, i) => (
        <div
          key={`m${i}`}
          className="absolute bottom-0 w-px"
          style={{
            left: `${(v / max) * 100}%`,
            height: 6,
            transform: 'translateX(-50%)',
            background: inWin(v) ? 'rgba(244,91,33,0.5)' : 'rgba(255,255,255,0.18)',
          }}
        />
      ))}
      {/* labels + long ticks */}
      {labels.map((n) => {
        const pct = (n / max) * 100
        const active = inWin(n)
        return (
          <div
            key={n}
            className="absolute flex flex-col items-center gap-[6px]"
            style={{ left: `${pct}%`, top: 0, transform: 'translateX(-50%)' }}
          >
            <span
              className="text-[16px] font-semibold leading-[20px]"
              style={{ color: active ? '#f45b21' : '#ffffff' }}
            >
              {n}
            </span>
            <div
              className="w-px"
              style={{ height: 16, background: active ? 'rgba(244,91,33,0.7)' : 'rgba(255,255,255,0.3)' }}
            />
          </div>
        )
      })}
    </div>
  )
}
