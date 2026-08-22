import { useTranslation } from 'react-i18next'
import type { BetState, BetMode, AutoBetConfig } from '../ui'
import {
  playSound,
  ModeToggle,
  BetAmountInput,
  HalfDoubleRow,
  AutoBetSettings,
  ActionButton,
} from '../ui'

interface BetPanelProps {
  balance: number
  betState: BetState
  /** Current bet amount (controlled by the parent so it can compute profit-on-win) */
  betAmount: number
  onBetAmountChange: (amount: number) => void
  onBet: (amount: number) => void
  betMode: BetMode
  onBetModeChange: (mode: BetMode) => void
  autoConfig: AutoBetConfig
  onAutoConfigChange: (config: AutoBetConfig) => void
  isAutoBetRunning?: boolean
  onStopAutoBet?: () => void
  showMaxBet?: boolean
  minBet?: number
  maxBet?: number
  /** Render action button before bet input (mobile-first layout). Drops the
   *  fixed-height Figma card framing in favour of a simple stacked flow. */
  buttonFirst?: boolean
  /** Mobile split: render only the scrollable controls (toggle / bet amount /
   *  ½×2 / auto settings) WITHOUT the BET button. Pair with `actionOnly`. */
  controlsOnly?: boolean
  /** Mobile split: render only the BET/Start action button, no controls. Meant
   *  to be pinned to the bottom of the viewport while `controlsOnly` scrolls. */
  actionOnly?: boolean
}

/**
 * Bet sidebar — matches Figma `Blocks/Sidebar` 1:1.
 * Card: gradient #27282d→#09090b, 1px #27282d border, radius 20, padding 10,
 * a flex column that pushes the BET button to the bottom (justify-between).
 * Balance is NOT shown here — it lives in a separate chip outside the sidebar.
 * Manual: ½/×2 sit in their own row under the input. Auto: ½/×2 are inline in
 * the input, followed by the auto-bet settings fields.
 */
export function BetPanel({
  balance,
  betState,
  betAmount,
  onBetAmountChange: setBetAmount,
  onBet,
  betMode,
  onBetModeChange,
  autoConfig,
  onAutoConfigChange,
  isAutoBetRunning = false,
  onStopAutoBet,
  showMaxBet = false,
  minBet = 0.1,
  maxBet = 1000,
  buttonFirst = false,
  controlsOnly = false,
  actionOnly = false,
}: BetPanelProps) {
  const { t } = useTranslation()

  const canBet = betState === 'idle' || betState === 'result'
  const controlsDisabled = betState === 'playing' || isAutoBetRunning
  const isAuto = betMode === 'auto'

  function handleBet() {
    if (betAmount < minBet || betAmount > maxBet || betAmount > balance) return
    playSound('bet')
    onBet(betAmount)
  }

  const modeToggle = (
    <ModeToggle mode={betMode} onChange={onBetModeChange} disabled={controlsDisabled} />
  )

  const betInput = (
    <BetAmountInput
      value={betAmount}
      onChange={setBetAmount}
      minBet={minBet}
      maxBet={maxBet}
      balance={balance}
      disabled={controlsDisabled}
      showMax={showMaxBet}
      label={t('bet_amount')}
      // Auto puts ½/×2 inside the input; Manual uses the standalone row below.
      showInlineAdjust={isAuto}
    />
  )

  const halfDoubleRow = !isAuto && (
    <HalfDoubleRow
      value={betAmount}
      onChange={setBetAmount}
      minBet={minBet}
      maxBet={maxBet}
      balance={balance}
      disabled={controlsDisabled}
    />
  )

  const autoSettings = isAuto && (
    <AutoBetSettings
      config={autoConfig}
      onChange={onAutoConfigChange}
      disabled={controlsDisabled}
      isRunning={isAutoBetRunning}
    />
  )

  const actionButton = (
    <ActionButton
      betMode={betMode}
      canBet={canBet}
      isRunning={isAutoBetRunning}
      // numberOfBets 0 means "infinite" (see AutoBetConfig); never disables Start.
      disabled={betAmount > balance || betAmount < minBet}
      onBet={handleBet}
      onStopAuto={onStopAutoBet}
    />
  )

  // Mobile split — scrollable controls only (no BET button). The button is
  // rendered separately via `actionOnly` and pinned to the bottom of the screen.
  // ½/×2 (and Max) ride inline inside the bet-amount input here to save vertical
  // space, so there's no standalone half/double row in Manual on mobile.
  if (controlsOnly) {
    return (
      <div className="flex flex-col gap-3">
        {modeToggle}
        <BetAmountInput
          value={betAmount}
          onChange={setBetAmount}
          minBet={minBet}
          maxBet={maxBet}
          balance={balance}
          disabled={controlsDisabled}
          showMax={showMaxBet}
          label={t('bet_amount')}
          showInlineAdjust
        />
        {autoSettings}
      </div>
    )
  }

  // Mobile split — just the BET/Start action button, pinned to the bottom.
  if (actionOnly) {
    return actionButton
  }

  // Mobile-first: controls stacked top-to-bottom with the BET button last, so it
  // sits flush above the footer (matches the Figma mobile artboard order:
  // toggle → bet amount → BET). No fixed-height card framing.
  if (buttonFirst) {
    return (
      <div className="flex flex-col gap-3 p-3">
        {modeToggle}
        {betInput}
        {halfDoubleRow}
        {autoSettings}
        {actionButton}
      </div>
    )
  }

  // Figma sidebar: fixed-framing card, content top, BET pinned to the bottom.
  return (
    <div
      className="flex h-full w-full flex-col gap-[10px] rounded-[20px] p-[10px]"
      style={{
        border: '1px solid #27282d',
        background: 'linear-gradient(to bottom, #27282d, #09090b)',
      }}
    >
      <div className="flex w-full min-h-0 flex-1 flex-col gap-[20px] overflow-y-auto">
        {modeToggle}
        <div className="flex w-full flex-col gap-[10px]">
          {betInput}
          {halfDoubleRow}
        </div>
        {autoSettings}
      </div>
      {actionButton}
    </div>
  )
}
