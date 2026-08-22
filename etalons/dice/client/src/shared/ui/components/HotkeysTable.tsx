import { useTranslation } from 'react-i18next'

const HOTKEYS: { actionKey: string; key: string }[] = [
  { actionKey: 'hk_bet', key: 'Space' },
  { actionKey: 'hk_mute', key: 'M' },
  { actionKey: 'hk_game_info', key: 'I' },
  { actionKey: 'hk_toggle_animations', key: 'P' },
  { actionKey: 'hk_half_bet', key: '−' },
  { actionKey: 'hk_double_bet', key: '=' },
  { actionKey: 'hk_slider_left', key: '←' },
  { actionKey: 'hk_slider_right', key: '→' },
  { actionKey: 'hk_roll_over', key: '↑' },
  { actionKey: 'hk_roll_under', key: '↓' },
]

/** Static hotkeys reference — Figma Settings 'Hotkeys table' screen.
 *  Display only; the keydown listener is a separate sub-project. */
export function HotkeysTable() {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-[15px] px-[20px] py-[15px]">
      {HOTKEYS.map((h) => (
        <div key={h.actionKey} className="flex items-end">
          <span className="whitespace-nowrap text-[16px] font-medium leading-[20px]" style={{ color: 'var(--og-text)' }}>{t(h.actionKey)}</span>
          <span
            className="mx-[8px] min-w-px flex-1"
            style={{ height: 3, backgroundImage: 'radial-gradient(circle, var(--og-text-dim) 1px, transparent 1px)', backgroundSize: '6px 3px', backgroundRepeat: 'repeat-x', backgroundPosition: 'bottom' }}
            aria-hidden
          />
          <span className="flex items-center justify-center rounded-[8px] px-[8px] py-[4px] text-[14px] font-medium" style={{ background: '#272727', color: 'var(--og-text)', minWidth: 28 }}>
            {h.key}
          </span>
        </div>
      ))}
    </div>
  )
}
