import { useTranslation } from 'react-i18next'
import type { HistoryEntry } from '../types'
import { fmt } from '../format'

export interface RoundHistoryTableProps {
  history: HistoryEntry[]
  currency?: string
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-[2px]">
      <span className="text-[12px] leading-[16px]" style={{ color: 'var(--og-text-muted)' }}>{label}</span>
      <span className="text-[14px] leading-[20px]" style={{ color: 'var(--og-text)' }}>{value}</span>
    </div>
  )
}

function fmtTime(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  const mon = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()]
  return `${pad(d.getDate())} ${mon} ${String(d.getFullYear()).slice(2)}, ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

/** Round history table — Figma Settings 'Round history' screen. Newest first. */
export function RoundHistoryTable({ history, currency = '' }: RoundHistoryTableProps) {
  const { t } = useTranslation()
  const cur = currency ? ` ${currency}` : ''
  const rows = [...history].reverse()
  if (rows.length === 0) {
    return <p className="px-[20px] py-[15px] text-[14px]" style={{ color: 'var(--og-text-muted)' }}>{t('no_rounds_yet')}</p>
  }
  return (
    <div className="flex flex-col">
      {rows.map((e, i) => (
        <div
          key={`${e.roundId}-${e.timestamp}`}
          className="grid grid-cols-[1fr_1fr] gap-x-[10px] gap-y-[8px] px-[20px] py-[15px]"
          style={{ background: i % 2 === 1 ? 'rgba(255,255,255,0.05)' : 'transparent', borderTop: i > 0 ? '1px solid var(--og-border)' : 'none' }}
        >
          <Cell label={t('round_id')} value={e.roundId} />
          <Cell label={t('date_time')} value={fmtTime(e.timestamp)} />
          <Cell label={t('balance')} value={`${fmt(e.balance)}${cur}`} />
          <Cell label={t('bet')} value={`${fmt(e.bet)}${cur}`} />
          <Cell label={t('win')} value={`${fmt(e.payout)}${cur}`} />
        </div>
      ))}
    </div>
  )
}
