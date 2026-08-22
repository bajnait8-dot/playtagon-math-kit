import type { ReactNode } from 'react'

/** Hash glyph (Figma `hash`, 20px). Inherits currentColor. */
function HashIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden style={{ flex: '0 0 auto' }}>
      <path d="M10 3L8 21M16 3l-2 18M4 8h17M3 16h17" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

export interface FairTabProps {
  active: boolean
  label: string
  icon?: ReactNode
  onClick?: () => void
}

/** A tab — Figma `Widget/Fair/Tab`. */
export function FairTab({ active, label, icon, onClick }: FairTabProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-[4px] py-[15px]"
      style={{
        cursor: 'pointer',
        color: active ? 'var(--og-text)' : 'var(--og-text-muted)',
        borderBottom: active ? '2px solid var(--og-primary)' : '2px solid transparent',
      }}
    >
      <span className="flex" style={{ flex: '0 0 auto' }}>{icon ?? <HashIcon />}</span>
      <span className="text-[16px] font-medium">{label}</span>
    </button>
  )
}
