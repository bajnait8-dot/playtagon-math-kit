import type { ReactNode } from 'react'
import { SettingsItemNav } from './SettingsItemNav'

interface SettingsItemBase {
  icon?: ReactNode
  label: string
}
interface SettingsItemNavVariant extends SettingsItemBase {
  variant: 'nav'
  onClick?: () => void
}
interface SettingsItemSwitchVariant extends SettingsItemBase {
  variant: 'switch'
  checked: boolean
  onChange?: (checked: boolean) => void
}
export type SettingsItemProps = SettingsItemNavVariant | SettingsItemSwitchVariant

/** A settings row — Figma `Settings/Item`. Left: icon + label.
 *  `variant="nav"` → whole row is a button with a chevron.
 *  `variant="switch"` → a non-interactive row whose only control is the Switch. */
export function SettingsItem(props: SettingsItemProps) {
  const { icon, label } = props
  const left = (
    <span className="flex items-center gap-[10px]">
      {icon != null && (
        <span className="flex" style={{ width: 20, height: 20, color: 'var(--og-text)', flex: '0 0 auto' }}>{icon}</span>
      )}
      <span className="text-[16px] font-medium leading-[20px]" style={{ color: 'var(--og-text)' }}>{label}</span>
    </span>
  )

  if (props.variant === 'nav') {
    return (
      <button
        type="button"
        onClick={props.onClick}
        className="flex w-full items-center justify-between"
        style={{ cursor: 'pointer' }}
      >
        {left}
        <SettingsItemNav type="nav" />
      </button>
    )
  }
  return (
    <div className="flex w-full items-center justify-between">
      {left}
      <SettingsItemNav type="switch" checked={props.checked} onChange={props.onChange} />
    </div>
  )
}
