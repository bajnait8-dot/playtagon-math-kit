import { useTranslation } from 'react-i18next'
import { DottedDecor } from '../DottedDecor'
import type { BetMode } from './types'

/**
 * Manual/Auto toggle — matches Figma `Blocks/ToggleBar` 1:1.
 * Container: #09090b, 1px rgba(255,255,255,.09) border, radius 18, p-3, gap-3.
 * Active segment: gradient #1a1c1e→#17171b, radius 16, p-20, orange 9px dot + #f45b21 text,
 *   dark (#0c0c0c) dotted-decor corners, inset highlight.
 * Default segment: #d9d9d9 text, no background. Text: Inter Semi Bold 16px.
 */
export function ModeToggle({ mode, onChange, disabled }: { mode: BetMode; onChange: (m: BetMode) => void; disabled?: boolean }) {
  const { t } = useTranslation()
  return (
    <div
      className={`flex items-center rounded-[18px] ${disabled ? 'pointer-events-none opacity-40' : ''}`}
      style={{
        // Plain #09090b container (Figma ToggleBar) — the dot texture belongs to the
        // active plate's corner decor, not the bar background.
        backgroundColor: '#09090b',
        border: '1px solid rgba(255,255,255,0.09)',
        // Padding + gap as inline styles: the active plate sits inset from the bar
        // on every side by this amount (an arbitrary `p-[8px]` utility wasn't being
        // generated reliably across the workspace, so set it directly).
        padding: 4,
        gap: 4,
      }}
    >
      {(['manual', 'auto'] as const).map((m) => {
        const active = mode === m
        return (
          <button
            key={m}
            type="button"
            onClick={() => !disabled && onChange(m)}
            disabled={disabled}
            className={`relative flex flex-1 items-center justify-center gap-[10px] overflow-hidden rounded-[16px] py-[20px] text-[16px] font-semibold leading-[20px]${active ? '' : ' og-toggle-seg'}`}
            style={
              active
                ? {
                    background: 'linear-gradient(to bottom, #1a1c1e, #17171b)',
                    color: '#f45b21',
                    boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.04)',
                  }
                : { background: 'transparent', color: '#d9d9d9' }
            }
          >
            {active && (
              <>
                <DottedDecor corner="tl" color="#0c0c0c" />
                <DottedDecor corner="br" color="#0c0c0c" />
                <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#f45b21', flex: '0 0 auto' }} />
              </>
            )}
            {t(m)}
          </button>
        )
      })}
    </div>
  )
}
