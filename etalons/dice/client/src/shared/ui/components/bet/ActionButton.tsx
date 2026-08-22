import { useTranslation } from 'react-i18next'
import { DottedDecor } from '../DottedDecor'
import type { BetMode } from './types'

interface ActionButtonProps {
  betMode: BetMode
  canBet: boolean
  isRunning?: boolean
  disabled?: boolean
  onBet: () => void
  onStopAuto?: () => void
}

/**
 * Dotted-decor in the top-left and bottom-right corners (Figma Button/Bet).
 * Dots are individual elements pulsing in a diagonal wave. `dark` switches to the
 * disabled-state dot color (#0c0c0c) per Figma.
 */
function DecorCorners({ dark }: { dark?: boolean }) {
  const color = dark ? '#0c0c0c' : '#db4513'
  return (
    <>
      <DottedDecor corner="tl" color={color} />
      <DottedDecor corner="br" color={color} />
    </>
  )
}

export function ActionButton({ betMode, canBet, isRunning, disabled, onBet, onStopAuto }: ActionButtonProps) {
  const { t } = useTranslation()
  if (isRunning) {
    // Stop uses the same orange primary look as BET (brand-consistent), not red.
    return (
      <button type="button" onClick={onStopAuto} data-no-click-sound className="og-btn-primary flex h-[70px] w-full items-center justify-center text-[22px] font-semibold">
        <DecorCorners />
        {t('stop_autobet')}
      </button>
    )
  }
  const isDisabled = !canBet || disabled
  return (
    <button
      type="button"
      onClick={isDisabled ? undefined : onBet}
      disabled={isDisabled}
      // BET plays its own 'bet' sound on press — skip the global UI click blip.
      data-no-click-sound
      className="og-btn-primary flex h-[70px] w-full items-center justify-center text-[22px] font-semibold"
    >
      <DecorCorners dark={isDisabled} />
      {betMode === 'auto' ? t('start_autobet') : t('bet')}
    </button>
  )
}
