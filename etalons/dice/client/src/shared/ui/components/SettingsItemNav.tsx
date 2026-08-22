import { Switch } from './Switch'

/** Chevron-right (Figma `chevron-right`, 24px). Inherits currentColor. */
function ChevronRight() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden style={{ flex: '0 0 auto' }}>
      <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export interface SettingsItemNavProps {
  type: 'switch' | 'nav'
  checked?: boolean
  onChange?: (checked: boolean) => void
}

/** Right-hand control of a settings row — Figma `Settings/Item/Nav`. */
export function SettingsItemNav({ type, checked = false, onChange }: SettingsItemNavProps) {
  if (type === 'switch') {
    return <Switch checked={checked} onChange={onChange} size="md" />
  }
  return <span style={{ color: 'var(--og-text-muted)' }}><ChevronRight /></span>
}
