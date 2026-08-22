const MONO = "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace"

function FileTextIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden style={{ flex: '0 0 auto' }}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M14 3v5h5M9 13h6M9 17h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}
function DotsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden style={{ flex: '0 0 auto' }}>
      <circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" />
    </svg>
  )
}
function CopyIcon16() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden style={{ flex: '0 0 auto' }}>
      <rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M5 15V5a2 2 0 0 1 2-2h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

export interface CodeBlockProps {
  title: string
  code: string
  totalLines?: number
  collapsed?: boolean
  onToggle?: () => void
  onCopy?: () => void
}

/** Code block — Figma `Widget/Fair/Doc` code card. Controlled collapse. */
export function CodeBlock({ title, code, totalLines, collapsed = true, onToggle, onCopy }: CodeBlockProps) {
  return (
    <div className="flex w-full flex-col overflow-hidden rounded-[6px]">
      <div className="flex w-full items-center gap-[5px] p-[5px]" style={{ background: '#1f1f21' }}>
        <span className="flex" style={{ color: 'var(--og-text-muted)', flex: '0 0 auto' }}><FileTextIcon /></span>
        <p className="whitespace-nowrap text-[14px] font-normal leading-[20px]" style={{ color: 'var(--og-text-muted)' }}>{title}</p>
      </div>
      <div className="w-full px-[10px] py-[5px]" style={{ background: '#17191a' }}>
        <pre
          className="touch-pan-y overflow-x-hidden whitespace-pre-wrap text-[12px] leading-[20px]"
          style={{ color: 'var(--og-text)', fontFamily: MONO, margin: 0, maxHeight: collapsed ? '140px' : '220px', overflowY: collapsed ? 'hidden' : 'auto' }}
        >
          {code}
        </pre>
      </div>
      <div className="flex w-full items-center justify-between p-[5px]" style={{ background: '#1f1f21' }}>
        <button type="button" onClick={onToggle} className="flex items-center gap-[5px]" style={{ cursor: 'pointer', color: 'var(--og-text-muted)' }}>
          <DotsIcon />
          <span className="whitespace-nowrap text-[14px] font-normal leading-[20px]">{collapsed ? (totalLines != null ? `See all ${totalLines} lines` : 'See all') : 'Collapse'}</span>
        </button>
        <button type="button" onClick={onCopy} className="flex items-center justify-end gap-[5px]" style={{ cursor: 'pointer', color: 'var(--og-primary)' }}>
          <CopyIcon16 />
          <span className="text-right text-[14px] font-medium leading-[20px]">Copy code</span>
        </button>
      </div>
    </div>
  )
}
