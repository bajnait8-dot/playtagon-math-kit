const VALUE_COLOR = 'rgba(255,255,255,0.67)'

function CopyIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden style={{ flex: '0 0 auto' }}>
      <rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M5 15V5a2 2 0 0 1 2-2h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}
function ClipboardIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden style={{ flex: '0 0 auto' }}>
      <rect x="6" y="4" width="12" height="17" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M9 4V3h6v1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}
function XIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden style={{ flex: '0 0 auto' }}>
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}
function MinusIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden style={{ flex: '0 0 auto' }}>
      <path d="M5 12h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}
function PlusIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden style={{ flex: '0 0 auto' }}>
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

export type FairValuesState = 'value' | 'valueCopy' | 'number' | 'paste' | 'clear'

export interface FairListValuesProps {
  state: FairValuesState
  value?: string
  number?: number
  onCopy?: () => void
  onPaste?: () => void
  onClear?: () => void
  onIncrement?: () => void
  onDecrement?: () => void
}

/** Right-hand side of a fair-list row — Figma `Widget/Fair/List/Values`, 5 states. */
export function FairListValues({
  state, value = '', number = 0,
  onCopy, onPaste, onClear, onIncrement, onDecrement,
}: FairListValuesProps) {
  const valueText = (extra?: string) => (
    <p
      className={`overflow-hidden text-ellipsis whitespace-nowrap text-right text-[16px] font-medium leading-[20px]${extra ?? ''}`}
      style={{ color: VALUE_COLOR }}
    >
      {value}
    </p>
  )

  if (state === 'value') {
    return <div className="flex items-center justify-end pl-[5px]">{valueText()}</div>
  }
  if (state === 'valueCopy') {
    return (
      <div className="flex items-center justify-end gap-[5px] pl-[5px]">
        {valueText(' w-[110px]')}
        <button type="button" onClick={onCopy} style={{ cursor: 'pointer', color: 'var(--og-text)' }}><CopyIcon /></button>
      </div>
    )
  }
  if (state === 'clear') {
    return (
      <div className="flex items-center justify-end gap-[5px] pl-[5px]">
        {valueText(' w-[110px]')}
        <button type="button" onClick={onClear} style={{ cursor: 'pointer', color: 'var(--og-text)' }}><XIcon /></button>
      </div>
    )
  }
  if (state === 'number') {
    return (
      <div className="flex items-center justify-end gap-[5px] pl-[5px]">
        <button type="button" onClick={onDecrement} style={{ cursor: 'pointer', color: 'var(--og-text)' }}><MinusIcon /></button>
        <p className="w-[30px] text-center text-[16px] font-medium leading-[20px]" style={{ color: VALUE_COLOR }}>{number}</p>
        <button type="button" onClick={onIncrement} style={{ cursor: 'pointer', color: 'var(--og-text)' }}><PlusIcon /></button>
      </div>
    )
  }
  return (
    <button type="button" onClick={onPaste} className="flex items-center justify-end gap-[5px] pl-[5px]" style={{ cursor: 'pointer', color: 'var(--og-primary)' }}>
      <ClipboardIcon />
      <span className="text-right text-[16px] font-medium leading-[20px]">Paste</span>
    </button>
  )
}
