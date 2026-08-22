import { useTranslation } from 'react-i18next'

const STATS: { key: string; value: string }[] = [
  { key: 'gi_rtp', value: '99%' },
  { key: 'gi_max_win', value: 'x9900' },
  { key: 'gi_house_edge', value: '1%' },
  { key: 'gi_roll_range', value: '0.00 – 99.99' },
  { key: 'gi_target_range', value: '2.00 – 98.00' },
  { key: 'gi_multiplier', value: '1.01× – 49.50×' },
]
const HOW_TO = ['gi_step_1', 'gi_step_2', 'gi_step_3', 'gi_step_4']

/** Game-info screen body — migrated from GameInfoModal, restyled to the Figma
 *  Settings 'Game info' state (stat pills + description + how-to-play). */
export function GameInfoBody() {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-[20px] p-[20px]">
      <div className="flex flex-wrap gap-[8px]">
        {STATS.map((s) => (
          <span key={s.key} className="flex items-center gap-[5px] rounded-[8px] px-[8px] py-[5px] text-[14px]" style={{ background: '#272727', color: 'var(--og-text-muted)' }}>
            {t(s.key)}: <span style={{ color: 'var(--og-text)' }}>{s.value}</span>
          </span>
        ))}
      </div>
      <p className="text-[14px] leading-[20px]" style={{ color: 'var(--og-text)' }}>{t('gi_description')}</p>
      <ol className="flex flex-col gap-[8px] pl-[18px] text-[14px] leading-[20px]" style={{ color: 'var(--og-text)', listStyle: 'decimal' }}>
        {HOW_TO.map((k) => <li key={k}>{t(k)}</li>)}
      </ol>
    </div>
  )
}
