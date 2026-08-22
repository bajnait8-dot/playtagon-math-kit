import { useEffect, useState, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { motion, AnimatePresence } from 'framer-motion'
import { FairTab } from '../ui/components/FairTab'
import { FairListRow } from '../ui/components/FairListRow'
import { CodeBlock } from '../ui/components/CodeBlock'
import { DigitalDisplay } from '../../game/DigitalDisplay'
import { DiceCube } from '../../game/DiceCube'
import { fromServerRoll } from '../../game/dice-config'
import { randomClientSeed, MAX_CLIENT_SEED_LEN, type SeedState } from '@playtagon/front-sdk'
import type { PFService } from '../lib/pf'

interface FairnessWindowProps {
  open: boolean
  onClose: () => void
  pf: PFService
}

type Screen = 'main' | 'document'
type Tab = 'seeds' | 'verify'

const SLIDE = {
  enter: (dir: 1 | -1) => ({ x: `${dir * 100}%`, opacity: 0 }),
  center: { x: '0%', opacity: 1, transition: { duration: 0.28, ease: [0.4, 0, 0.2, 1] as const } },
  exit: (dir: 1 | -1) => ({ x: `${dir * -100}%`, opacity: 0, transition: { duration: 0.28, ease: [0.4, 0, 0.2, 1] as const } }),
}

// Reveal: rows fade+rise in sequence once a screen/tab settles (matches Settings).
const REVEAL_CONTAINER = { hidden: {}, show: { transition: { staggerChildren: 0.04, delayChildren: 0.05 } } }
const REVEAL_ITEM = { hidden: { opacity: 0, y: 6 }, show: { opacity: 1, y: 0, transition: { duration: 0.22, ease: [0.4, 0, 0.2, 1] as const } } }

// Full reference implementation shown in the Provably-fair document. The preview
// (collapsed) shows the opening lines; "See all" expands to the whole thing.
const DOC_CODE = `import CryptoJS from "crypto-js";

function random(hash, seed, cursor) {
  // Generate hmac
  const hashIndex = Math.floor(cursor / 8);
  const hmac = CryptoJS.HmacSHA256(
    \`\${seed}:\${hashIndex}\`, hash
  );
  const buffer = hmac.toString(CryptoJS.enc.Hex);

  // Read 4 bytes from the cursor position
  const offset = (cursor % 8) * 4;
  const bytes = buffer.slice(offset, offset + 8);
  const value = parseInt(bytes, 16);

  // Map the 32-bit value into [0, 1)
  return value / 0x100000000;
}

function rollFromSeeds(serverSeed, clientSeed, nonce) {
  // Derive a single roll in display-space 0.00 .. 99.99
  const r = random(serverSeed, clientSeed, nonce);
  return Math.floor(r * 10000) / 100;
}

function verify(serverSeed, serverHash, clientSeed, nonce) {
  // 1. Confirm the revealed server seed matches its published hash
  const hash = CryptoJS.SHA256(serverSeed).toString();
  if (hash !== serverHash) {
    throw new Error("Server seed does not match the published hash");
  }
  // 2. Re-derive the roll the player should have received
  return rollFromSeeds(serverSeed, clientSeed, nonce);
}

// Each bet increments the nonce; the seed pair stays fixed until rotated.
// Rotating reveals the previous server seed so past rolls can be verified.`

function HashIcon() { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden><path d="M10 3L8 21M16 3l-2 18M4 8h17M3 16h17" /></svg> }
function CloudCheckIcon() { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M17.5 19a4.5 4.5 0 1 0-1.4-8.78A6 6 0 1 0 6 15.5" /><path d="M9 14l2 2 4-4" /></svg> }
function NotebookIcon() { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg> }
function ChevronRight() { return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M9 6l6 6-6 6" /></svg> }
function CloseIcon() { return <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M1 1l12 12M13 1L1 13" /></svg> }

/** Compact read-only verify scale — the game slider's track language (tick row,
 *  embossed grey trough, orange fill) at a small scale, with a DiceCube marker
 *  and a value label sitting at the verified roll. `value` is display-space 0..100
 *  (null → empty track, no marker). */
function VerifyScale({ value }: { value: number | null }) {
  const pct = value == null ? 0 : Math.max(0, Math.min(100, value))
  const ticks = Array.from({ length: 11 }, (_, i) => (i / 10) * 100)
  return (
    <div className="relative w-full pt-[18px]">
      {value != null && (
        <div className="absolute top-0 text-[14px] font-semibold leading-[16px]" style={{ left: `${pct}%`, transform: 'translateX(-50%)', color: 'var(--og-primary)' }}>
          {value.toFixed(2)}
        </div>
      )}
      {/* tick row */}
      <div className="relative mb-[5px] h-[4px] w-full">
        {ticks.map((t, i) => (
          <div key={i} className="absolute top-0 w-px" style={{ left: `${t}%`, height: 4, transform: 'translateX(-50%)', background: t <= pct + 0.001 && value != null ? 'rgba(244,91,33,0.7)' : 'rgba(255,255,255,0.22)' }} />
        ))}
      </div>
      {/* embossed trough */}
      <div className="rounded-[12px] p-[3px]" style={{ background: 'linear-gradient(to bottom, #202224, #16171a)', border: '1px solid rgba(255,255,255,0.11)' }}>
        <div className="relative h-[10px] w-full overflow-hidden rounded-[7px]" style={{ background: 'radial-gradient(rgba(255,255,255,0.22) 1px, transparent 1.2px) 0 0/7px 7px, linear-gradient(to bottom, #989898, #5b5b5b 45%, #2f2f2f)', boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.2), inset 0 -1px 0 0 rgba(0,0,0,0.4)' }}>
          {value != null && (
            <div className="absolute inset-y-0 left-0 rounded-[7px]" style={{ width: `${pct}%`, background: 'radial-gradient(rgba(0,0,0,0.22) 1px, transparent 1.2px) 0 0/7px 7px, linear-gradient(to bottom, #ff7a45, #f45b21 45%, #c83f12)' }} />
          )}
        </div>
      </div>
      {/* dice-cube marker centred on the trough at the roll position */}
      {value != null && (
        <div className="pointer-events-none absolute left-[3px] right-[3px]" style={{ top: 'calc(18px + 4px + 3px + 5px)' }}>
          <div className="absolute" style={{ left: `${pct}%`, transform: 'translate(-50%, -50%)' }}>
            <DiceCube size={26} />
          </div>
        </div>
      )}
    </div>
  )
}

export function FairnessWindow({ open, onClose, pf }: FairnessWindowProps) {
  const { t } = useTranslation()
  const [screen, setScreen] = useState<Screen>('main')
  const [dir, setDir] = useState<1 | -1>(1)
  const [tab, setTab] = useState<Tab>('seeds')
  const [newClientSeed, setNewClientSeed] = useState(() => randomClientSeed())

  // Real provably-fair seed state loaded from the transport (null until fetched).
  const [seed, setSeed] = useState<SeedState | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [vClientSeed, setVClientSeed] = useState('')
  const [vServerSeed, setVServerSeed] = useState('')
  const [vNonce, setVNonce] = useState(0)
  const [vResult, setVResult] = useState<number | null>(null)
  // True while both seeds are present and the roll is being (re)computed → shows WAIT.
  const [computing, setComputing] = useState(false)
  // Document → Unhash Server Seed: the hash the user pastes, and the revealed seed.
  const [unhashInput, setUnhashInput] = useState('')
  const [unhashResult, setUnhashResult] = useState<string | null>(null)
  // Whole-document code block expand ("See all 45 lines").
  const [codeOpen, setCodeOpen] = useState(false)
  // Which row was just copied — drives the transient "Copied" confirmation.
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => { if (open) { setScreen('main'); setDir(1); setTab('seeds'); setUnhashInput(''); setUnhashResult(null); setCodeOpen(false); setCopiedKey(null); setError(null) } }, [open])
  useEffect(() => () => { if (copiedTimer.current) clearTimeout(copiedTimer.current) }, [])

  // Load real seed state from the transport whenever the window opens.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    pf.getSeedState().then((s) => { if (!cancelled) setSeed(s) }).catch((e) => { if (!cancelled) setError((e as Error).message) })
    return () => { cancelled = true }
  }, [open, pf])

  const go = (next: Screen) => { setDir(next === 'main' ? -1 : 1); setScreen(next) }
  // Copy + flash a "Copied" confirmation on the originating row for 1.2s.
  const copy = useCallback((text: string, key: string) => {
    navigator.clipboard?.writeText(text).catch(() => {})
    setCopiedKey(key)
    if (copiedTimer.current) clearTimeout(copiedTimer.current)
    copiedTimer.current = setTimeout(() => setCopiedKey(null), 1200)
  }, [])
  const paste = useCallback(async (setter: (v: string) => void) => {
    try { const t = await navigator.clipboard?.readText(); if (t) setter(t.trim()) } catch { /* clipboard blocked — ignore */ }
  }, [])

  // Rotate the seed pair through the transport; reveal the just-retired server seed.
  const handleRotate = useCallback(async () => {
    setError(null)
    try {
      const { state } = await pf.rotateAndReveal(newClientSeed.trim() || undefined)
      setSeed(state)
      setNewClientSeed(randomClientSeed())
    } catch (e) {
      setError((e as Error).message)
    }
  }, [pf, newClientSeed])

  // Unhash a revealed epoch's server seed from its published hash (transport call).
  const handleUnhash = useCallback(async () => {
    const hash = unhashInput.trim()
    if (!hash) return
    setError(null)
    try {
      const { serverSeed } = await pf.unhash(hash)
      setUnhashResult(serverSeed)
    } catch (e) {
      setUnhashResult(null)
      setError((e as Error).message)
    }
  }, [pf, unhashInput])

  useEffect(() => {
    let cancelled = false
    if (vClientSeed.trim() && vServerSeed.trim()) {
      // Both seeds in → show WAIT while the transport re-derives the roll, then the result.
      // verify() returns one VerifyRoundResult per nonce; we ask for the single vNonce.
      setComputing(true)
      setVResult(null)
      const rollP = pf
        .verify(vServerSeed.trim(), vClientSeed.trim(), vNonce, vNonce)
        .then((rows) => (rows[0] ? fromServerRoll(rows[0].data.roll) : null))
        .catch(() => null)
      const delayP = new Promise((res) => setTimeout(res, 700))
      Promise.all([rollP, delayP]).then(([r]) => {
        if (!cancelled) { setVResult(r as number | null); setComputing(false) }
      })
    } else {
      // Missing a seed → no display at all (not WAIT).
      setComputing(false)
      setVResult(null)
    }
    return () => { cancelled = true }
  }, [pf, vClientSeed, vServerSeed, vNonce])

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[100]">
          <div className="absolute inset-0" onClick={onClose} />
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97, y: 8 }} transition={{ duration: 0.18 }}
            className="absolute bottom-[82px] left-0 right-0 flex w-full flex-col overflow-hidden rounded-t-[20px] border-t landscape:bottom-[86px] landscape:right-[16px] landscape:left-auto landscape:w-[380px] landscape:rounded-[20px] landscape:border"
            style={{ transformOrigin: 'bottom right', height: 410, maxHeight: 'calc(100dvh - 100px)', background: '#000', borderColor: 'rgba(255,255,255,0.3)', boxShadow: '0 4px 24px rgba(0,0,0,0.5)' }}
          >
            <AnimatePresence mode="popLayout" custom={dir} initial={false}>
              <motion.div key={screen} custom={dir} variants={SLIDE} initial="enter" animate="center" exit="exit" className="absolute inset-0 flex flex-col">
                {screen === 'main' && (
                  <>
                    <div className="flex flex-col items-center" style={{ borderBottom: '1px solid var(--og-border-strong)' }}>
                      <div className="flex items-center gap-[40px]">
                        <FairTab active={tab === 'seeds'} label={t('fair_seeds')} icon={<HashIcon />} onClick={() => setTab('seeds')} />
                        <FairTab active={tab === 'verify'} label={t('fair_verify')} icon={<CloudCheckIcon />} onClick={() => setTab('verify')} />
                      </div>
                    </div>

                    {/* Provably-fair calls are non-fatal: a failure surfaces inline here
                        and the player keeps playing (unlike init/play, which halt). */}
                    {error && (
                      <div className="px-[20px] py-[8px] text-[13px]" style={{ color: '#ff6b6b' }}>{error}</div>
                    )}

                    {/* Provably-fair-document nav, pinned to the bottom of the popup
                        on both tabs (mt-auto pushes it down; the tab fills the height). */}
                    {tab === 'seeds' && seed && (
                      <motion.div key="seeds" variants={REVEAL_CONTAINER} initial="hidden" animate="show" className="flex min-h-0 flex-1 flex-col gap-[20px] overflow-y-auto py-[20px]">
                        <motion.div variants={REVEAL_ITEM} className="flex flex-col gap-[18px] px-[20px]">
                          <FairListRow label={t('fair_active_client_seed')} values={{ state: 'valueCopy', value: copiedKey === 'aClient' ? t('fair_copied') : seed.clientSeed, onCopy: () => copy(seed.clientSeed, 'aClient') }} />
                          <FairListRow label={t('fair_active_server_hash')} values={{ state: 'valueCopy', value: copiedKey === 'aServer' ? t('fair_copied') : seed.serverSeedHash, onCopy: () => copy(seed.serverSeedHash, 'aServer') }} />
                        </motion.div>
                        <motion.div variants={REVEAL_ITEM} style={{ borderTop: '1px solid var(--og-border)' }} />
                        <motion.div variants={REVEAL_ITEM} className="px-[20px]">
                          <FairListRow label={t('fair_bets_with_pair')} values={{ state: 'value', value: String(seed.nonce) }} />
                        </motion.div>
                        <motion.div variants={REVEAL_ITEM} style={{ borderTop: '1px solid var(--og-border)' }} />
                        <motion.div variants={REVEAL_ITEM} className="flex flex-col gap-[18px] px-[20px]">
                          <FairListRow label={t('fair_new_client_seed')} values={{ state: 'valueCopy', value: newClientSeed, onCopy: handleRotate }} />
                          <FairListRow label={t('fair_next_server_hash')} values={{ state: 'valueCopy', value: copiedKey === 'nextServer' ? t('fair_copied') : seed.nextServerSeedHash, onCopy: () => copy(seed.nextServerSeedHash, 'nextServer') }} />
                        </motion.div>
                        <motion.div variants={REVEAL_ITEM} className="mt-auto" style={{ borderTop: '1px solid var(--og-border)' }} />
                        <motion.button variants={REVEAL_ITEM} type="button" onClick={() => go('document')} className="flex items-center justify-between px-[20px]" style={{ cursor: 'pointer' }}>
                          <span className="flex items-center gap-[10px] text-[16px] font-medium" style={{ color: 'var(--og-text)' }}><NotebookIcon /> {t('fair_document')}</span>
                          <span style={{ color: 'var(--og-text-muted)' }}><ChevronRight /></span>
                        </motion.button>
                      </motion.div>
                    )}

                    {tab === 'verify' && (
                      <motion.div key="verify" variants={REVEAL_CONTAINER} initial="hidden" animate="show" className="flex min-h-0 flex-1 flex-col gap-[18px] overflow-y-auto px-[20px] py-[20px]">
                        {/* Dot-matrix display (same glyphs as the game): WAIT until both
                            seeds are present, then the verified roll. */}
                        <motion.div variants={REVEAL_ITEM} className="flex h-[48px] items-center justify-center overflow-hidden py-[6px]">
                          {/* Empty until both seeds are entered; then WAIT while computing;
                              then the roll. The result digits draw in (reveal punch) — NOT
                              the left-to-right intro wave (that's the DICE logo). Keyed by
                              value so each fresh roll replays the draw. */}
                          {/* "WAIT" stays a literal dot-matrix token (not localized —
                              the display has a limited glyph set: digits + DICE + WAIT). */}
                          {computing
                            ? <DigitalDisplay text="WAIT" dot={3} />
                            : vResult != null
                              ? <DigitalDisplay key={vResult} text={vResult.toFixed(2)} dot={3} reveal />
                              : null}
                        </motion.div>
                        {/* Compact read-only scale (same track language as the game slider:
                            tick row, embossed grey trough, orange fill, dice-cube marker
                            at the verified roll). */}
                        <motion.div variants={REVEAL_ITEM}><VerifyScale value={vResult} /></motion.div>
                        <motion.div variants={REVEAL_ITEM}><FairListRow label={t('fair_client_seed')} values={vClientSeed ? { state: 'clear', value: vClientSeed, onClear: () => setVClientSeed('') } : { state: 'paste', onPaste: () => paste(setVClientSeed) }} /></motion.div>
                        <motion.div variants={REVEAL_ITEM}><FairListRow label={t('fair_server_seed')} values={vServerSeed ? { state: 'clear', value: vServerSeed, onClear: () => setVServerSeed('') } : { state: 'paste', onPaste: () => paste(setVServerSeed) }} /></motion.div>
                        <motion.div variants={REVEAL_ITEM}><FairListRow label={t('fair_bet_number')} values={{ state: 'number', number: vNonce, onIncrement: () => setVNonce((n) => n + 1), onDecrement: () => setVNonce((n) => Math.max(0, n - 1)) }} /></motion.div>
                        <motion.button variants={REVEAL_ITEM} type="button" onClick={() => go('document')} className="mt-auto flex items-center justify-between" style={{ cursor: 'pointer' }}>
                          <span className="flex items-center gap-[10px] text-[16px] font-medium" style={{ color: 'var(--og-text)' }}><NotebookIcon /> {t('fair_document')}</span>
                          <span style={{ color: 'var(--og-text-muted)' }}><ChevronRight /></span>
                        </motion.button>
                      </motion.div>
                    )}
                  </>
                )}

                {screen === 'document' && (
                  <>
                    <div className="flex items-center justify-between px-[20px] py-[16px]" style={{ borderBottom: '1px solid var(--og-border-strong)' }}>
                      <span className="flex items-center gap-[10px] text-[16px] font-medium" style={{ color: 'var(--og-text)' }}><NotebookIcon /> {t('fair_document')}</span>
                      <button type="button" onClick={() => go('main')} style={{ color: 'var(--og-text-muted)', cursor: 'pointer' }}><CloseIcon /></button>
                    </div>
                    <motion.div variants={REVEAL_CONTAINER} initial="hidden" animate="show" className="flex min-h-0 flex-1 flex-col gap-[20px] overflow-y-auto p-[20px]">
                      <motion.div variants={REVEAL_ITEM} className="flex flex-col gap-[10px] text-[14px] leading-[20px]">
                        <p className="uppercase" style={{ color: '#a0a0a0' }}>{t('fair_introduction')}</p>
                        <p style={{ color: 'var(--og-text)' }}>{t('fair_intro_text')}</p>
                      </motion.div>
                      <motion.div variants={REVEAL_ITEM}>
                        <CodeBlock title="Multiplayer Random (Browser)" code={DOC_CODE} totalLines={45} collapsed={!codeOpen} onToggle={() => setCodeOpen((v) => !v)} onCopy={() => copy(DOC_CODE, 'code')} />
                        {copiedKey === 'code' && <p className="mt-[6px] text-[12px]" style={{ color: 'var(--og-primary)' }}>{t('fair_copied_clipboard')}</p>}
                      </motion.div>
                      {/* Unhash Server Seed — paste the published hash of a REVEALED
                          epoch (i.e. one the pair has already rotated past); the transport
                          returns its server seed. An active/next hash is not yet revealed,
                          so the lookup rejects and the seed row stays "wait for hash". */}
                      <motion.div variants={REVEAL_ITEM} className="flex flex-col gap-[10px]">
                        <p className="text-[14px] uppercase leading-[20px]" style={{ color: '#a0a0a0' }}>{t('fair_unhash_server_seed')}</p>
                        <FairListRow label={t('fair_server_hash')} values={unhashInput ? { state: 'clear', value: unhashInput, onClear: () => { setUnhashInput(''); setUnhashResult(null) } } : { state: 'paste', onPaste: () => paste(setUnhashInput) }} />
                        {unhashInput && !unhashResult && (
                          <button type="button" onClick={handleUnhash} className="og-btn-secondary self-start px-[16px] py-[6px] text-[14px]">{t('fair_unhash_server_seed')}</button>
                        )}
                        <FairListRow label={t('fair_server_seed')} values={unhashResult ? { state: 'valueCopy', value: copiedKey === 'unhashed' ? t('fair_copied') : unhashResult, onCopy: () => copy(unhashResult, 'unhashed') } : { state: 'value', value: t('fair_wait_for_hash') }} />
                      </motion.div>
                    </motion.div>
                  </>
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
