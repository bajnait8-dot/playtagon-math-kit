export type SoundEvent = 'click' | 'win' | 'lose' | 'cashout' | 'bet' | 'roll' | 'tick'

// Paths are relative to the build base (no leading slash). At play time they are
// resolved against import.meta.env.BASE_URL so the audio loads whether the game is
// served from the domain root (local dev: BASE_URL='/') or from a sub-path on the
// RGS/platform. A leading-slash absolute path 404s off-root and play() then fails
// silently — that was the "no sound on the platform" bug.
const DEFAULT_SOUNDS: Partial<Record<SoundEvent, string>> = {
  click: 'sounds/click.mp3',
  bet: 'sounds/bet.mp3',
  win: 'sounds/win.mp3',
  lose: 'sounds/lose.mp3',
  cashout: 'sounds/cashout.mp3',
  roll: 'sounds/roll.mp3',
  tick: 'sounds/tick.mp3',
}

// import.meta.env.BASE_URL always ends with '/', so a plain concat is correct.
function soundUrl(file: string): string {
  return import.meta.env.BASE_URL + file
}

// Per-event volume scale (relative to the global volume). UI feedback (click,
// tick) is kept quiet/subtle so it doesn't get in the way; wins ring out fuller.
const EVENT_GAIN: Partial<Record<SoundEvent, number>> = {
  click: 0.35,
  tick: 0.5,
}

const audioCache = new Map<string, HTMLAudioElement>()

let soundEnabled = true
let soundVolume = 0.5

function loadSound(url: string): HTMLAudioElement {
  const cached = audioCache.get(url)
  if (cached) return cached
  const audio = new Audio(url)
  audio.preload = 'auto'
  audioCache.set(url, audio)
  return audio
}

// Events that can fire in rapid succession (e.g. the slider ratchet) — these play
// on a short-lived clone so overlapping ticks layer instead of cutting each other
// off, which would otherwise sound like a stutter.
const OVERLAPPING: Partial<Record<SoundEvent, boolean>> = { tick: true, click: true }

export function playSound(event: SoundEvent): void {
  if (!soundEnabled || document.hidden) return
  const file = DEFAULT_SOUNDS[event]
  if (!file) return
  const url = soundUrl(file)

  const vol = Math.max(0, Math.min(1, soundVolume * (EVENT_GAIN[event] ?? 1)))

  if (OVERLAPPING[event]) {
    // Clone from the cached element so we reuse its buffer but get an independent
    // playback head; let it GC after it finishes.
    const base = loadSound(url)
    const inst = base.cloneNode() as HTMLAudioElement
    inst.volume = vol
    inst.play().catch(() => {})
    return
  }

  const audio = loadSound(url)
  audio.currentTime = 0
  audio.volume = vol
  audio.play().catch(() => {})
}

export function setSoundEnabled(enabled: boolean): void {
  soundEnabled = enabled
}

export function setSoundVolume(volume: number): void {
  soundVolume = Math.max(0, Math.min(1, volume))
}
