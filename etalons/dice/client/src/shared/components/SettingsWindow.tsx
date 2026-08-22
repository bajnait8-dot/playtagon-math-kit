import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { motion, AnimatePresence } from 'framer-motion'
import { SettingsItem } from '../ui/components/SettingsItem'
import { VolumeSlider } from '../ui/components/VolumeSlider'
import { RoundHistoryTable } from '../ui/components/RoundHistoryTable'
import { HotkeysTable } from '../ui/components/HotkeysTable'
import { GameInfoBody } from '../ui/components/GameInfoBody'
import type { HistoryEntry } from '../ui/types'

export interface GameSettings {
  soundEnabled: boolean
  soundVolume: number
  animations: boolean
  instantBet: boolean
  maxBet: boolean
  hotkeysEnabled: boolean
}

type Screen = 'main' | 'gameInfo' | 'history' | 'hotkeys'

interface SettingsWindowProps {
  open: boolean
  onClose: () => void
  settings: GameSettings
  onSettingsChange: (s: GameSettings) => void
  history: HistoryEntry[]
  currency?: string
  /** Screen to show when the window opens (default 'main'). */
  initialScreen?: Screen
}

const SCREEN_TITLE_KEY: Record<Exclude<Screen, 'main'>, string> = {
  gameInfo: 'game_info', history: 'round_history', hotkeys: 'hotkeys_table',
}

function BoltIcon() { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg> }
function CoinsIcon() { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><circle cx="8" cy="8" r="6" /><path d="M18.09 10.37A6 6 0 1 1 10.34 18M7 6h1v4M16.71 13.88l.7.71-2.82 2.82" /></svg> }
function AnimIcon() { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M22 12L12 2 2 12l10 10 10-10z" /></svg> }
function KeyboardIcon() { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><rect x="2" y="6" width="20" height="12" rx="2" /><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8" /></svg> }
function NotebookIcon() { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg> }
function HistoryIcon() { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M3 3v5h5M3.05 13A9 9 0 1 0 6 5.3L3 8" /><path d="M12 7v5l3 3" /></svg> }
function FileIcon() { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg> }
function CloseIcon() { return <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M1 1l12 12M13 1L1 13" /></svg> }
function MuteIcon() { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><line x1="23" y1="9" x2="17" y2="15" /><line x1="17" y1="9" x2="23" y2="15" /></svg> }

// Drill-down slide: incoming screen enters from the side dictated by `dir`
// (+1 forward → from the right; -1 back → from the left), outgoing exits opposite.
const SLIDE = {
  enter: (dir: 1 | -1) => ({ x: `${dir * 100}%`, opacity: 0 }),
  center: { x: '0%', opacity: 1, transition: { duration: 0.28, ease: [0.4, 0, 0.2, 1] as const } },
  exit: (dir: 1 | -1) => ({ x: `${dir * -100}%`, opacity: 0, transition: { duration: 0.28, ease: [0.4, 0, 0.2, 1] as const } }),
}

// Reveal: children fade+rise in sequence once a screen slides into place.
const REVEAL_CONTAINER = {
  hidden: {},
  show: { transition: { staggerChildren: 0.045, delayChildren: 0.06 } },
}
const REVEAL_ITEM = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.25, ease: [0.4, 0, 0.2, 1] as const } },
}

export function SettingsWindow({ open, onClose, settings, onSettingsChange, history, currency, initialScreen = 'main' }: SettingsWindowProps) {
  const { t } = useTranslation()
  const [screen, setScreen] = useState<Screen>('main')
  // Slide direction for the drill-down transition: +1 = into an inner screen
  // (incoming from the right), -1 = back to Main (incoming from the left).
  const [dir, setDir] = useState<1 | -1>(1)

  useEffect(() => { if (open) { setScreen(initialScreen); setDir(1) } }, [open, initialScreen])

  const go = (next: Screen) => { setDir(next === 'main' ? -1 : 1); setScreen(next) }
  const set = (patch: Partial<GameSettings>) => onSettingsChange({ ...settings, ...patch })

  return createPortal(
    <AnimatePresence>
      {open && (
        // Overlay layer. The backdrop is transparent (the game stays visible) but
        // catches a tap anywhere outside the popup to close it.
        <div className="fixed inset-0 z-[100]">
          {/* Tap-anywhere-to-close backdrop. */}
          <div className="absolute inset-0" onClick={onClose} />
          {/* Portrait (mobile): full-width bottom sheet flush above the footer, top-
              border only. Landscape (desktop/tablet): 340px popover anchored above the
              footer Settings button (bottom-left). */}
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97, y: 8 }} transition={{ duration: 0.18 }}
            className="absolute bottom-[82px] left-0 right-0 flex w-full flex-col overflow-hidden rounded-t-[20px] border-t landscape:bottom-[86px] landscape:left-[16px] landscape:right-auto landscape:w-[340px] landscape:rounded-[20px] landscape:border"
            // Fixed height so the popup doesn't jump when switching screens; inner
            // content fills/scrolls. Matches the Figma widget (476px), capped to the
            // viewport on short screens.
            style={{ transformOrigin: 'bottom left', height: 476, maxHeight: 'calc(100dvh - 100px)', background: '#000', borderColor: 'rgba(255,255,255,0.3)', boxShadow: '0 4px 24px rgba(0,0,0,0.5)' }}
          >
            {/* Drill-down slide between screens. Each screen is an absolutely-
                positioned page; the popup clips overflow so the slide reads clean.
                custom={dir} feeds the slide direction into the variants. */}
            <AnimatePresence mode="popLayout" custom={dir} initial={false}>
              <motion.div
                key={screen}
                custom={dir}
                variants={SLIDE}
                initial="enter" animate="center" exit="exit"
                className="absolute inset-0 flex flex-col"
              >
                {screen !== 'main' && (
                  <div className="flex items-center justify-between px-[20px] py-[16px]" style={{ borderBottom: '1px solid var(--og-border-strong)' }}>
                    <button type="button" onClick={() => go('main')} className="flex items-center gap-[10px]" style={{ color: 'var(--og-text)', cursor: 'pointer' }}>
                      {screen === 'gameInfo' ? <NotebookIcon /> : screen === 'history' ? <HistoryIcon /> : <FileIcon />}
                      <span className="text-[16px] font-medium">{t(SCREEN_TITLE_KEY[screen])}</span>
                    </button>
                    {/* ✕ on an inner screen returns to Main (it doesn't close the popup —
                        the footer Settings ✕ closes it). */}
                    <button type="button" onClick={() => go('main')} style={{ color: 'var(--og-text-muted)', cursor: 'pointer' }}><CloseIcon /></button>
                  </div>
                )}

                {screen === 'main' && (
                  <motion.div variants={REVEAL_CONTAINER} initial="hidden" animate="show" className="flex flex-col gap-[20px] py-[20px]">
                    <motion.div variants={REVEAL_ITEM} className="flex flex-col gap-[18px] px-[20px]">
                      <SettingsItem variant="nav" icon={<NotebookIcon />} label={t('game_info')} onClick={() => go('gameInfo')} />
                      <SettingsItem variant="nav" icon={<HistoryIcon />} label={t('round_history')} onClick={() => go('history')} />
                      <SettingsItem variant="nav" icon={<FileIcon />} label={t('hotkeys_table')} onClick={() => go('hotkeys')} />
                    </motion.div>
                    <motion.div variants={REVEAL_ITEM} style={{ borderTop: '1px solid var(--og-border)' }} />
                    <motion.div variants={REVEAL_ITEM} className="flex flex-col gap-[18px] px-[20px]">
                      <SettingsItem variant="switch" icon={<BoltIcon />} label={t('instant_bet')} checked={settings.instantBet} onChange={(v) => set({ instantBet: v })} />
                      <SettingsItem variant="switch" icon={<CoinsIcon />} label={t('max_bet')} checked={settings.maxBet} onChange={(v) => set({ maxBet: v })} />
                      <SettingsItem variant="switch" icon={<AnimIcon />} label={t('animations')} checked={settings.animations} onChange={(v) => set({ animations: v })} />
                      <SettingsItem variant="switch" icon={<KeyboardIcon />} label={t('hotkeys')} checked={settings.hotkeysEnabled} onChange={(v) => set({ hotkeysEnabled: v })} />
                    </motion.div>
                    <motion.div variants={REVEAL_ITEM} style={{ borderTop: '1px solid var(--og-border)' }} />
                    <motion.div variants={REVEAL_ITEM} className="flex flex-col gap-[26px] px-[20px]">
                      <div className="pt-[4px]">
                        <VolumeSlider value={settings.soundVolume} muted={!settings.soundEnabled} onChange={(v) => set({ soundVolume: v, soundEnabled: v > 0 })} />
                      </div>
                      <SettingsItem variant="switch" icon={<MuteIcon />} label={t('mute_all_sounds')} checked={!settings.soundEnabled} onChange={(v) => set({ soundEnabled: !v })} />
                    </motion.div>
                  </motion.div>
                )}
                {screen !== 'main' && (
                  <div className="min-h-0 flex-1 overflow-y-auto">
                    {screen === 'gameInfo' && <GameInfoBody />}
                    {screen === 'history' && <RoundHistoryTable history={history} currency={currency} />}
                    {screen === 'hotkeys' && <HotkeysTable />}
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
