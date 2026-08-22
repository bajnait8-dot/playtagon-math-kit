export interface SwitchProps {
  checked: boolean
  onChange?: (checked: boolean) => void
  size?: 'md' | 'sm'
  label?: string
  disabled?: boolean
}

/** Toggle — Figma `Switch`. md: 44px track / 20px knob; sm: 36px / 16px.
 *  on → orange (md) / black (sm) track carrying a halftone dot texture, knob right
 *  (Figma `circleRight`: white knob with an orange centre dot); off → grey track,
 *  plain white knob left (`circleLeft`). Controlled. Knob glides + track cross-fades
 *  via CSS transitions (GSAP would be overkill for a two-state toggle). */
export function Switch({ checked, onChange, size = 'md', label, disabled }: SwitchProps) {
  // Figma `Switch`: 44/24 track (p-2), 20px knob, 6px centre dot (circleRight SVG:
  // r=10 white circle + r=3 #F45B21 dot). sm scales to 36/16 knob / 5px dot.
  const trackW = size === 'md' ? 44 : 36
  const knob = size === 'md' ? 20 : 16
  const pad = 2
  const dot = size === 'md' ? 6 : 5
  const trackH = knob + pad * 2
  // ON track: light halftone dots over the orange (md) / black (sm) fill.
  const onTexture = size === 'md'
    ? 'radial-gradient(rgba(255,255,255,0.22) 1px, transparent 1.2px) 0 0/7px 7px, var(--og-primary)'
    : 'radial-gradient(rgba(255,255,255,0.18) 1px, transparent 1.2px) 0 0/7px 7px, #09090b'
  const trackBg = checked ? onTexture : '#c9c9c9'
  const ease = 'cubic-bezier(0.4, 0, 0.2, 1)'
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange?.(!checked)}
      className={`flex items-center gap-[8px]${disabled ? ' pointer-events-none opacity-40' : ''}`}
      style={{ cursor: disabled ? 'default' : 'pointer' }}
    >
      <span
        className="relative rounded-full"
        style={{ width: trackW, height: trackH, background: trackBg, transition: `background 0.2s ${ease}` }}
      >
        <span
          className="absolute top-1/2 flex items-center justify-center rounded-full bg-white"
          style={{
            width: knob,
            height: knob,
            left: checked ? trackW - knob - pad : pad,
            transform: 'translateY(-50%)',
            transition: `left 0.2s ${ease}`,
          }}
        >
          <span
            className="rounded-full"
            style={{ width: dot, height: dot, background: 'var(--og-primary)', opacity: checked ? 1 : 0, transition: `opacity 0.2s ${ease}` }}
          />
        </span>
      </span>
      {label != null && (
        <span className="text-[14px] font-medium leading-[20px]" style={{ color: '#09090b' }}>{label}</span>
      )}
    </button>
  )
}
