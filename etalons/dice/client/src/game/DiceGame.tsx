import { useState, useCallback, useRef, useEffect } from 'react'
import { Transport } from '@playtagon/runtime/transport'
import type { TransportError } from '@playtagon/front-sdk'
import type { DiceGameTypes } from '../../../server/model/types.js'
import { TransportOverlay } from '../shared/components/TransportOverlay'
import { BetPanel } from '../shared/components/BetPanel'
import { BalanceBar } from '../shared/components/BalanceBar'
import { SettingsWindow, type GameSettings } from '../shared/components/SettingsWindow'
import { FairnessWindow } from '../shared/components/FairnessWindow'
import { createPFService, type PFService } from '../shared/lib/pf'
import { DigitalDisplay } from './DigitalDisplay'
import { DiceSlider } from './DiceSlider'
import { useDiceHotkeys } from './useDiceHotkeys'
import { WinDotBurst } from './WinDotBurst'
import { DropStatsStrip, Footer, InfoRow, MoveHint, MultiplyIcon, PercentGlyph, fmt, playSound, setSoundEnabled, setSoundVolume, setFormatConfig, DEFAULT_AUTO_CONFIG } from '../shared/ui'
import type { HistoryEntry, BetMode, AutoBetConfig } from '../shared/ui'
import { halfBet, doubleBet } from '../shared/ui/components/bet/bet-amount'
import { DesktopLayout } from '../layouts/DesktopLayout'
import { LandscapeLayout } from '../layouts/LandscapeLayout'
import { MobileLayout } from '../layouts/MobileLayout'
import {
  setGameConfig,
  getMinTarget,
  getMaxTarget,
  getDefaultTarget,
  calculateWinChance,
  calculateMultiplier,
  toServerTarget,
  fromServerRoll,
} from './dice-config'
import type { DiceCondition } from './dice-config'
import { useTranslation } from 'react-i18next'

const transport = new Transport<DiceGameTypes>()

export interface DiceResult {
  roll: number    // display space 0.00-99.99
  target: number  // display space 2.00-98.00
  condition: DiceCondition
  won: boolean
  multiplier: number
}

const ROLL_ANIMATION_MS = 600

export function DiceGame() {
  const [balance, setBalance] = useState(0)
  const [currency, setCurrency] = useState('USD')
  const [denomination, setDenomination] = useState(2)
  const { t } = useTranslation()
  const [bets, setBets] = useState<{ min: number; max: number; default: number; list: number[] }>({ min: 1, max: 10000, default: 100, list: [] })
  const [ready, setReady] = useState(false)
  const [transportError, setTransportError] = useState<TransportError | null>(null)
  const [networkDelayed, setNetworkDelayed] = useState(false)

  // Game settings
  const [target, setTarget] = useState(0)
  const [condition, setCondition] = useState<DiceCondition>('over')
  const [targetInput, setTargetInput] = useState('')
  const [winChanceInput, setWinChanceInput] = useState('')
  // The display reads "DICE" until the player first moves the knob; after that it
  // tracks the target (and the roll result during/after a bet).
  const [targetTouched, setTargetTouched] = useState(false)
  // Which of the 10 win dot-burst patterns to play (re-rolled on each win).
  const [winVariant, setWinVariant] = useState(0)

  // Game state
  const [rollResult, setRollResult] = useState<DiceResult | null>(null)
  const [isRolling, setIsRolling] = useState(false)
  const [rollFrame, setRollFrame] = useState(0)
  const [betState, setBetState] = useState<'idle' | 'playing' | 'result'>('idle')
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const RESULT_DISPLAY_MS = 1500
  const roundIdRef = useRef(0)
  const mountedRef = useRef(true)
  const rollingRef = useRef(false) // re-entrancy guard for handleBet
  const lastNotchRef = useRef<number>(-1) // last whole-percent the knob crossed (ratchet ticks)

  // Footer tools: settings popover, fairness modal, game-info modal.
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsScreen, setSettingsScreen] = useState<'main' | 'gameInfo'>('main')
  const [fairnessOpen, setFairnessOpen] = useState(false)
  const [settings, setSettings] = useState<GameSettings>({
    soundEnabled: true,
    soundVolume: 0.5,
    animations: true,
    instantBet: false,
    maxBet: false,
    hotkeysEnabled: false,
  })
  // Real provably-fair: the Debug-RGS transport implements IPFTransport. The service is
  // available only when the session declared fairness mode (init().rngMode === "fairness").
  const [pfEnabled, setPfEnabled] = useState(false)
  const pfRef = useRef<PFService>(createPFService(transport))
  // Mirror settings into a ref so the (memoised) bet handler reads the latest
  // values without being re-created on every settings change.
  const settingsRef = useRef(settings)
  settingsRef.current = settings
  // Push sound settings into the SDK sound module whenever they change.
  useEffect(() => {
    setSoundEnabled(settings.soundEnabled)
    setSoundVolume(settings.soundVolume)
  }, [settings.soundEnabled, settings.soundVolume])

  // Bet amount is lifted here so the Info strip can show profit-on-win (bet × (mult−1)).
  const [betAmount, setBetAmount] = useState(10)

  // Auto-bet
  const [betMode, setBetMode] = useState<BetMode>('manual')
  const [autoConfig, setAutoConfig] = useState<AutoBetConfig>(DEFAULT_AUTO_CONFIG)
  const [isAutoBetRunning, setIsAutoBetRunning] = useState(false)
  const autoBetRef = useRef({
    running: false,
    betsRemaining: 0,
    baseBet: 0,
    currentBet: 0,
    totalProfit: 0,
    totalLoss: 0,
  })

  // Derived values
  const winChance = calculateWinChance(target, condition)
  const multiplier = calculateMultiplier(winChance)

  // Init
  useEffect(() => {
    transport.onError((err) => {
      console.error('[dice] transport error:', err.message, err.code)
      setTransportError(err)
    })
    transport.onNetworkDelay(setNetworkDelayed)

    transport.init().then((result) => {
      setBalance(result.balance)
      setCurrency(result.currency)
      setDenomination(result.denomination)
      setBets(result.bets.normal)
      setGameConfig(result.initData)
      setFormatConfig(result.currency, result.denomination)
      // Start with no chips on load/refresh — the strip fills only from rounds
      // played in this session (server history is intentionally not seeded).
      setTarget(getDefaultTarget())
      setPfEnabled(result.rngMode === 'fairness')
      setReady(true)
    })

    return () => {
      mountedRef.current = false
      autoBetRef.current.running = false
    }
  }, [])

  // Slot-machine ticking: show a fresh random number on the digital display every
  // ~50ms while a roll is in flight (the value is real state, not computed in render).
  useEffect(() => {
    if (!isRolling) return
    const id = setInterval(() => setRollFrame(Math.random() * 99.99), 50)
    return () => clearInterval(id)
  }, [isRolling])

  // Global UI click sound: any enabled <button> press plays the click blip. Done
  // via one delegated listener so every button (incl. SDK components) is covered
  // without wiring each handler. The BET button has its own 'bet' sound, and the
  // slider has its ratchet ticks, so skip those to avoid doubling up.
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      const btn = (e.target as HTMLElement)?.closest('button')
      if (!btn || btn.disabled) return
      if (btn.dataset.noClickSound !== undefined) return
      playSound('click')
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [])

  // Update target from slider/input
  const handleTargetChange = useCallback((newTarget: number) => {
    const clamped = Math.max(getMinTarget(), Math.min(getMaxTarget(), Number(newTarget.toFixed(2))))
    // Ratchet tick: play one detent click each time the knob crosses a notch.
    // Notches are every 0.5% so even small drags click; the short tick + clone
    // playback keeps it from churning when dragging fast.
    const notch = Math.round(clamped / 0.5)
    if (notch !== lastNotchRef.current) {
      lastNotchRef.current = notch
      playSound('tick')
    }
    setTarget(clamped)
    setTargetTouched(true)
    setTargetInput('')
    setWinChanceInput('')
    // Moving the slider starts a new selection: clear the previous result so the
    // display shows the (new) target rather than the last round's roll.
    setRollResult((prev) => (prev ? null : prev))
  }, [])

  const handleWinChanceInputCommit = useCallback((value: string) => {
    const parsed = parseFloat(value)
    if (!isNaN(parsed) && parsed > 0 && parsed < 100) {
      const newTarget = condition === 'over' ? 100 - parsed : parsed
      const clamped = Math.max(getMinTarget(), Math.min(getMaxTarget(), Number(newTarget.toFixed(2))))
      setTarget(clamped)
    }
    setWinChanceInput('')
  }, [condition])

  const handleTargetInputCommit = useCallback((value: string) => {
    const parsed = parseFloat(value)
    if (!isNaN(parsed)) {
      handleTargetChange(parsed)
    }
    setTargetInput('')
  }, [handleTargetChange])

  const handleConditionChange = useCallback((newCondition: DiceCondition) => {
    setCondition(newCondition)
    setTargetInput('')
    setWinChanceInput('')
  }, [])

  // Bet flow
  const handleBet = useCallback(async (amount: number) => {
    // Re-entrancy guard: ignore a second manual BET while a roll is already in flight.
    // (The auto-bet loop awaits each call to completion, so this never blocks it.)
    if (rollingRef.current) return
    rollingRef.current = true
    const thisRound = ++roundIdRef.current
    setRollResult(null)
    setIsRolling(true)
    setBetState('playing')
    playSound('roll') // dice tumbling whoosh while the cube spins

    const serverTarget = toServerTarget(target)

    // Start rolling animation immediately
    const rollPromise = transport.play("normal", {
      target: serverTarget,
      condition,
      bet: amount,
    })

    // Wait for the spin animation — unless Instant Bet is on (skip straight to result).
    if (!settingsRef.current.instantBet) {
      await new Promise((r) => setTimeout(r, ROLL_ANIMATION_MS))
    }

    // Get server result
    const response = await rollPromise
    setBalance(response.balance)

    const { playData } = response
    const displayRoll = fromServerRoll(playData.roll)
    const won = playData.win > 0
    const mult = won ? playData.multiplier : 0

    const result: DiceResult = {
      roll: displayRoll,
      target,
      condition,
      won,
      multiplier: mult,
    }

    // Pick a fresh dot-burst pattern for each win so it never feels repetitive.
    if (won) setWinVariant(Math.floor(Math.random() * 10))

    setRollResult(result)
    setIsRolling(false)
    setBetState('result')
    rollingRef.current = false

    playSound(won ? 'win' : 'lose')

    // Add to history
    const divisor = Math.pow(10, denomination)
    setHistory((prev) => [
      ...prev,
      {
        multiplier: mult,
        win: won,
        roll: displayRoll,
        payout: playData.win / divisor,
        roundId: roundIdRef.current.toString(16).padStart(8, '0'),
        timestamp: Date.now(),
        balance: response.balance / divisor,
        bet: amount / divisor,
      },
    ])

    if (!autoBetRef.current.running) {
      const delay = RESULT_DISPLAY_MS
      setTimeout(() => {
        if (!mountedRef.current || roundIdRef.current !== thisRound) return
        setRollResult(null)
        setBetState('idle')
      }, delay)
    }

    return { outcome: won ? ('win' as const) : ('loss' as const), payout: playData.win, multiplier: mult }
  }, [target, condition])

  // Auto-bet
  const stopAutoBet = useCallback(() => {
    autoBetRef.current.running = false
    setIsAutoBetRunning(false)
    setBetState('idle')
  }, [])

  const startAutoBet = useCallback(async (baseBetAmount: number) => {
    const ref = autoBetRef.current
    ref.running = true
    ref.baseBet = baseBetAmount
    ref.currentBet = baseBetAmount
    ref.betsRemaining = autoConfig.numberOfBets === 0 ? Infinity : autoConfig.numberOfBets
    ref.totalProfit = 0
    ref.totalLoss = 0
    setIsAutoBetRunning(true)

    while (ref.running && ref.betsRemaining > 0) {
      const result = await handleBet(ref.currentBet)
      if (!result || !ref.running) break

      ref.betsRemaining--
      const betPlaced = ref.currentBet

      if (result.outcome === 'win') {
        const profit = result.payout - betPlaced
        ref.totalProfit += profit
        if (autoConfig.stopOnProfit > 0 && ref.totalProfit >= autoConfig.stopOnProfit) break
        // percent > 0 → increase the next bet; 0 → reset to base.
        if (autoConfig.onWinPercent > 0) {
          ref.currentBet = Math.round(ref.currentBet * (1 + autoConfig.onWinPercent / 100))
        } else {
          ref.currentBet = ref.baseBet
        }
      } else {
        ref.totalLoss += betPlaced
        if (autoConfig.stopOnLoss > 0 && ref.totalLoss >= autoConfig.stopOnLoss) break
        if (autoConfig.onLossPercent > 0) {
          ref.currentBet = Math.round(ref.currentBet * (1 + autoConfig.onLossPercent / 100))
        } else {
          ref.currentBet = ref.baseBet
        }
      }

      setRollResult(null)
      setBetState('idle')
      await new Promise((r) => setTimeout(r, 400))
    }

    ref.running = false
    setIsAutoBetRunning(false)
    setBetState('idle')
  }, [autoConfig, handleBet])

  const handleBetFromPanel = useCallback(async (amount: number) => {
    if (betMode === 'auto') {
      await startAutoBet(amount)
    } else {
      await handleBet(amount)
    }
  }, [betMode, handleBet, startAutoBet])

  // Derived consts needed by useDiceHotkeys and betPanelProps.
  // Declared here (before any early return) so that the hook call below is
  // unconditional and the closures never hit a temporal dead zone.
  const divisor = Math.pow(10, denomination)
  const displayBalance = balance / divisor
  const minBet = bets.min / divisor
  const maxBet = bets.max / divisor

  // Live hotkeys (Figma table). Gated by the Settings toggle; suppressed while any
  // popup is open so the popup's own keys/inputs win. betAmount is in display units.
  // MUST be called before any early return to satisfy the Rules of Hooks.
  useDiceHotkeys(settings.hotkeysEnabled && !settingsOpen && !fairnessOpen, {
    bet: () => handleBetFromPanel(Math.round(betAmount * divisor)),
    toggleMute: () => setSettings((s) => ({ ...s, soundEnabled: !s.soundEnabled })),
    openGameInfo: () => { setSettingsScreen('gameInfo'); setSettingsOpen(true) },
    toggleAnimations: () => setSettings((s) => ({ ...s, animations: !s.animations })),
    halfBet: () => setBetAmount((v) => halfBet(v, minBet)),
    doubleBet: () => setBetAmount((v) => doubleBet(v, maxBet, displayBalance)),
    sliderLeft: () => handleTargetChange(target - 1),
    sliderRight: () => handleTargetChange(target + 1),
    rollOver: () => handleConditionChange('over'),
    rollUnder: () => handleConditionChange('under'),
  })

  if (!ready) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <div style={{ color: 'var(--og-text-muted)' }}>{t('loading')}</div>
        <TransportOverlay error={transportError} delayed={networkDelayed} />
      </div>
    )
  }

  const canBet = betState === 'idle' || betState === 'result'
  const isBusy = isRolling || isAutoBetRunning

  const swapIcon = (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 1l4 4-4 4" />
      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
      <path d="M7 23l-4-4 4-4" />
      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </svg>
  )

  // Three-cell info row per Figma: Multiplier (computed), editable Target, editable Win chance.
  // Read-only Info strip — matches Figma `Blocks/Info`. The target is set by the
  // slider (and shown in the digital display while the knob moves), so these are
  // all display-only: Multiplier (× icon), Profit on win (value + currency), Win
  // chance (value + % icon).
  const profitOnWin = betAmount * Math.max(0, multiplier - 1)
  const gameSettings = (
    <InfoRow
      items={[
        {
          label: t('multiplier'),
          value: multiplier.toFixed(2),
          iconLeft: <MultiplyIcon />,
        },
        {
          label: t('profit_on_win'),
          value: fmt(profitOnWin),
          suffix: <span>{currency}</span>,
        },
        {
          label: t('win_chance'),
          value: (winChance * 100).toFixed(2),
          suffix: <PercentGlyph />,
        },
      ]}
    />
  )

  const conditionSwitch = (
    <button
      type="button"
      onClick={() => handleConditionChange(condition === 'under' ? 'over' : 'under')}
      disabled={isBusy}
      className="og-btn-secondary"
    >
      {swapIcon} {t('switch_side')}
    </button>
  )

  // First-run intro: the logo is showing and the player hasn't touched the slider
  // yet. We show the "Move roll position" hint where the Switch-side button
  // normally sits, and swap to the real button once they interact.
  const isIntro = betState === 'idle' && !rollResult && !isRolling && !targetTouched
  const displayValue = isIntro
    ? 'DICE'
    : (rollResult ? rollResult.roll : isRolling ? rollFrame : target).toFixed(2)
  const displayTone: 'idle' | 'win' | 'loss' =
    rollResult ? (rollResult.won ? 'win' : 'loss') : 'idle'

  // Master animation switch (Settings → Animations): gates the intro wave, result
  // reveal punch, and the win dot-bursts.
  const anim = settings.animations

  // `compact` (mobile portrait) shrinks the dot-matrix display and narrows the
  // slider so the game zone fits a phone screen.
  const gameBlock = (scaleLabels: number[], compact = false) => (
    // Vertical auto-layout. Desktop/tablet: fill the height (h-full) with flex-grow
    // spacers so the slider stays on the vertical midline. Mobile (compact): natural
    // content height — the game zone is just tall enough for its content, leaving the
    // controls card free to flex-grow down to the BET button below.
    <div className={`flex w-full max-w-3xl flex-col items-center ${compact ? '' : 'h-full'}`}>
      {/* Top spacer holds the display group, bottom-aligned toward the slider.
          Grows on desktop; content-height on mobile. */}
      <div className={`flex flex-col items-center justify-end gap-4 ${compact ? 'pb-6 pt-2' : 'flex-1 pb-10'}`}>
        {/* Caption shows only while the player is selecting a target — hidden
            during a roll and once a result is shown. Kept in flow (opacity) so the
            display below doesn't shift. */}
        <div
          className="text-lg font-semibold uppercase tracking-[0.2em]"
          style={{
            color: 'var(--og-text-muted)',
            opacity: targetTouched && !rollResult && !isRolling ? 1 : 0,
            transition: 'opacity .2s ease',
          }}
        >
          {condition === 'under' ? t('roll_under') : t('roll_over')}
        </div>
        {/* Dot-bursts flank the display in flow with a gap — the Figma composition.
            On narrow portrait the gap shrinks so the group still fits the viewport. */}
        <div className="flex items-center justify-center gap-3 landscape:gap-6">
          <WinDotBurst side="left" active={anim && displayTone === 'win'} variant={winVariant} />
          <DigitalDisplay text={displayValue} tone={displayTone} dot={compact ? 5 : 6} animateIn={anim && isIntro} reveal={anim && !!rollResult} />
          <WinDotBurst side="right" active={anim && displayTone === 'win'} variant={winVariant} />
        </div>
      </div>

      {/* Centred slider. The Switch-side button (or intro hint) is attached below
          the knob so it travels with the slider. Slightly narrowed on mobile. */}
      <div className={compact ? 'w-full px-[6px]' : 'w-full'}>
        <DiceSlider
          target={target}
          condition={condition}
          resultRoll={rollResult ? rollResult.roll : null}
          resultWon={rollResult ? rollResult.won : null}
          showResult={!!rollResult}
          isRolling={isRolling}
          rollingPos={rollFrame}
          disabled={!canBet && !isRolling}
          onTargetChange={handleTargetChange}
          scaleLabels={scaleLabels}
          animations={anim}
          belowKnob={isIntro ? <MoveHint>{t('move_roll_position')}</MoveHint> : conditionSwitch}
        />
      </div>

      {/* Bottom spacer holds the info. Grows on desktop; on mobile it's content-
          height with top room to clear the knob-attached Switch-side button. */}
      <div className={`flex w-full flex-col items-center gap-5 ${compact ? 'pt-16' : 'flex-1 justify-start pt-20'}`}>
        <div className="w-full landscape:mt-8">{gameSettings}</div>
      </div>
    </div>
  )

  const betPanelProps = {
    balance: displayBalance,
    betAmount,
    onBetAmountChange: setBetAmount,
    // Pass the real state so BetPanel disables its controls during a roll ('playing'),
    // preventing a double-bet from a second BET click mid-roll.
    betState,
    onBet: (displayAmount: number) => handleBetFromPanel(Math.round(displayAmount * divisor)),
    betMode,
    onBetModeChange: setBetMode,
    autoConfig,
    onAutoConfigChange: setAutoConfig,
    isAutoBetRunning,
    onStopAutoBet: stopAutoBet,
    showMaxBet: settings.maxBet,
    minBet,
    maxBet,
  }

  const betPanel = <BetPanel {...betPanelProps} />
  const footerProps = {
    onSettings: () => { setSettingsScreen('main'); setSettingsOpen((v) => !v) },
    onFairness: pfEnabled ? () => setFairnessOpen(true) : undefined,
    settingsActive: settingsOpen,
    fairnessActive: fairnessOpen,
  }

  return (
    <>
      <TransportOverlay error={transportError} delayed={networkDelayed} />

      {/* Footer tool modals (portaled, so they render above every layout) */}
      <SettingsWindow
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        onSettingsChange={setSettings}
        history={history}
        currency={currency}
        initialScreen={settingsScreen}
      />
      {pfEnabled && (
        <FairnessWindow
          open={fairnessOpen}
          onClose={() => setFairnessOpen(false)}
          pf={pfRef.current}
        />
      )}

      {/* Desktop — wide screens (≥1280px, landscape): fluid full-width layout */}
      <div className="hidden h-full w-full landscape:xl:block">
        <DesktopLayout
          sidebar={betPanel}
          game={gameBlock([0, 25, 50, 75, 100])}
          balance={<BalanceBar balance={displayBalance} currency={currency} />}
          dropStats={<DropStatsStrip history={history} currency={currency} />}
          footer={<Footer {...footerProps} />}
        />
      </div>

      {/* Tablet — landscape below the desktop breakpoint: 1280-capped layout */}
      <div className="hidden h-full w-full landscape:block landscape:xl:hidden">
        <LandscapeLayout
          sidebar={betPanel}
          game={gameBlock([0, 25, 50, 75, 100])}
          balance={<BalanceBar balance={displayBalance} currency={currency} />}
          dropStats={<DropStatsStrip history={history} currency={currency} />}
          footer={<Footer {...footerProps} />}
        />
      </div>

      {/* Mobile portrait */}
      <div className="block h-full w-full landscape:hidden">
        <MobileLayout
          balance={<BalanceBar balance={displayBalance} currency={currency} />}
          dropStats={<DropStatsStrip history={history} currency={currency} />}
          game={gameBlock([0, 50, 100], true)}
          controls={<BetPanel {...betPanelProps} controlsOnly />}
          action={<BetPanel {...betPanelProps} actionOnly />}
          footer={<Footer compact {...footerProps} />}
        />
      </div>
    </>
  )
}
