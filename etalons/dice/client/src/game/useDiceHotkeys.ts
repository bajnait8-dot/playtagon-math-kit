import { useEffect, useRef } from 'react'

export interface HotkeyActions {
  bet: () => void
  toggleMute: () => void
  openGameInfo: () => void
  toggleAnimations: () => void
  halfBet: () => void
  doubleBet: () => void
  sliderLeft: () => void
  sliderRight: () => void
  rollOver: () => void
  rollUnder: () => void
}

/** True when keyboard focus is in a text-entry control — hotkeys must yield so
 *  the user can type bet amounts / seeds. */
function isTypingTarget(): boolean {
  const el = document.activeElement as HTMLElement | null
  if (!el) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable
}

/**
 * Global dice hotkeys (Figma Hotkeys table). Active only while `enabled`.
 * `actions` is read through a ref so the listener stays attached across renders
 * (it doesn't re-bind every time a closure identity changes).
 */
export function useDiceHotkeys(enabled: boolean, actions: HotkeyActions): void {
  const actionsRef = useRef(actions)
  actionsRef.current = actions

  useEffect(() => {
    if (!enabled) return
    function onKeyDown(e: KeyboardEvent) {
      if (isTypingTarget()) return
      const a = actionsRef.current
      let handled = true
      switch (e.key) {
        case ' ': a.bet(); break
        case 'm': case 'M': a.toggleMute(); break
        case 'i': case 'I': a.openGameInfo(); break
        case 'p': case 'P': a.toggleAnimations(); break
        case '-': a.halfBet(); break
        case '=': a.doubleBet(); break
        case 'ArrowLeft': a.sliderLeft(); break
        case 'ArrowRight': a.sliderRight(); break
        case 'ArrowUp': a.rollOver(); break
        case 'ArrowDown': a.rollUnder(); break
        default: handled = false
      }
      if (handled) e.preventDefault()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [enabled])
}
