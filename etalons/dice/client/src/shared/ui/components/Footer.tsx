import { useTranslation } from 'react-i18next'

interface FooterProps {
  compact?: boolean
  onSettings?: () => void
  onFairness?: () => void
  /** When true the Settings popover is open — the gear swaps to a close (✕) glyph. */
  settingsActive?: boolean
  /** When true the Fairness popover is open — the shield swaps to a close (✕) glyph. */
  fairnessActive?: boolean
  /** Brand text shown in the centre (default "Dice Originals") */
  brand?: string
}

/** Gear/settings glyph — 20px, inherits currentColor. */
const GearIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
)

/** Close (✕) glyph — 20px, inherits currentColor. Shown on the Settings button
 *  while the Settings popover is open. */
const CloseIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
    <path d="M5 5l14 14M19 5L5 19" />
  </svg>
)

/** Half-filled shield/fairness glyph — 20px, inherits currentColor. */
const ShieldIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
    <path d="M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6l-8-3z" />
    <path d="M12 3v18" />
  </svg>
)

/** Playtagon brand triangle mark — Figma footer `figure`. */
const BrandMark = () => (
  <svg width="18" height="15" viewBox="0 0 29.6883 24.0474" fill="#6b6b6b" aria-hidden style={{ flex: '0 0 auto' }}>
    <path d="M16.5819 0.85205C17.1332 -0.215781 18.6543 -0.211996 19.2025 0.85205C19.2051 0.857064 19.2078 0.862354 19.2103 0.867416L29.5307 21.4549C30.1408 22.6371 28.8727 24.0473 27.5456 24.0474L26.6286 24.046C25.8179 24.0447 25.0586 23.6909 24.4182 23.1936C22.9912 22.0854 21.2005 21.4259 19.2561 21.4259C17.3177 21.4259 15.532 22.0814 14.1071 23.1834C13.4655 23.6797 12.7052 24.0323 11.8941 24.0318L7.94475 24.0292C6.61759 24.0292 5.34964 22.6189 5.95964 21.4367L16.5819 0.85205ZM10.7872 0.795225C11.394 -0.396863 13.1477 -0.207246 13.4872 1.08718C13.6099 1.55503 13.5541 2.05196 13.331 2.48084L2.49186 23.3151C2.15078 23.9704 1.31316 24.1759 0.709114 23.7523C0.0300288 23.2759 -0.195072 22.37 0.181743 21.6297L10.7872 0.795225ZM19.2329 4.95071C18.8661 3.91716 17.4463 3.82113 16.9443 4.79589L9.054 20.1245C8.85765 20.5059 8.99191 20.9749 9.36016 21.1937C10.0909 21.6276 11.0353 21.3602 11.4317 20.6069L19.1642 5.90774C19.3195 5.6125 19.3445 5.26521 19.2329 4.95071Z" />
  </svg>
)

/**
 * App footer — matches Figma `Blocks/Footer` 1:1.
 * Bar: #101213, 1px rgba(255,255,255,.1) border, 15px padding. Left: Settings
 * SecButton; centre: brand mark + "DICE ORIGINALS" (Inter 21px #6b6b6b, uppercase,
 * 3.15px tracking); right: Fairness SecButton. In compact mode the button labels
 * and the centre brand collapse to fit a narrow mobile bar.
 */
export function Footer({ compact = false, onSettings, onFairness, settingsActive = false, fairnessActive = false, brand = 'Dice Originals' }: FooterProps) {
  const { t } = useTranslation()
  return (
    <div
      className="flex items-center justify-center p-[15px]"
      style={{ background: '#101213', border: '1px solid rgba(255,255,255,0.1)' }}
    >
      <div className="flex min-w-0 flex-1 items-center gap-[10px]">
        <button
          type="button"
          aria-label={t('settings')}
          onClick={onSettings}
          // Compact (mobile): a square icon-only button sized to the icon, so there's
          // no empty space around the glyph. Full width with a label otherwise.
          className={compact ? 'og-btn-secondary aspect-square w-[52px] justify-center px-0' : 'og-btn-secondary w-[120px]'}
        >
          {settingsActive ? <CloseIcon /> : <GearIcon />}
          {!compact && <span>{settingsActive ? t('close') : t('settings')}</span>}
        </button>
      </div>

      {/* Centre brand: mark + wordmark. Smaller text on compact mobile so it fits
          between the two icon buttons. */}
      <div className="flex shrink-0 items-center gap-[10px]">
        <BrandMark />
        <span
          className={compact ? 'text-[14px] uppercase leading-normal' : 'text-[21px] uppercase leading-normal'}
          style={{ color: '#6b6b6b', letterSpacing: compact ? '1px' : '3.15px' }}
        >
          {compact ? 'Dice Original' : brand}
        </span>
      </div>

      <div className="flex min-w-0 flex-1 items-center justify-end gap-[10px]">
        {/* Fairness button only shows in a provably-fair session (onFairness provided). */}
        {onFairness && (
          <button
            type="button"
            aria-label={t('fairness')}
            onClick={onFairness}
            className={compact ? 'og-btn-secondary aspect-square w-[52px] justify-center px-0' : 'og-btn-secondary w-[120px]'}
          >
            {fairnessActive ? <CloseIcon /> : <ShieldIcon />}
            {!compact && <span>{fairnessActive ? t('close') : t('fairness')}</span>}
          </button>
        )}
      </div>
    </div>
  )
}
