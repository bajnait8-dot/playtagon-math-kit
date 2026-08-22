import { useTranslation } from 'react-i18next'
import type { ReactNode } from 'react'
import type { AutoBetConfig } from './types'

interface AutoBetSettingsProps {
  config: AutoBetConfig
  onChange: (c: AutoBetConfig) => void
  disabled?: boolean
  isRunning?: boolean
  remaining?: number
}

/**
 * Auto-bet settings — matches Figma `Blocks/Sidebar` (Type=Auto) 1:1.
 * Fields stack with a 10px gap: NUMBER OF BETS (full width, ∞ adornment),
 * then INCREASE ON WIN / INCREASE ON LOSS paired in a row (each with a % icon),
 * then STOP ON PROFIT / STOP ON LOSS paired (plain). Each field reuses the same
 * shell as the bet input: h-70, 1px #474747 border, radius 17, #1c2025→#181c20
 * gradient, inset shadow, with an Inter Bold 14 uppercase #5c5c5c label above.
 */
export function AutoBetSettings({ config, onChange, disabled }: AutoBetSettingsProps) {
  const { t } = useTranslation()
  return (
    <div className="flex w-full flex-col gap-[10px]">
      {/* Number of bets — full width, ∞ resets to "infinite" (0) */}
      <AutoField
        label={t('number_of_bets')}
        value={config.numberOfBets}
        onChange={(v) => onChange({ ...config, numberOfBets: v })}
        disabled={disabled}
        adornment={
          <AdornmentButton
            onClick={() => onChange({ ...config, numberOfBets: 0 })}
            disabled={disabled}
            active={config.numberOfBets === 0}
            title="Infinite"
          >
            ∞
          </AdornmentButton>
        }
      />

      {/* Increase on win / loss — paired, percent input (0 = reset to base bet) */}
      <div className="flex w-full items-start gap-[10px]">
        <div className="min-w-0 flex-1">
          <AutoField
            label={t('increase_on_win')}
            value={config.onWinPercent}
            onChange={(v) => onChange({ ...config, onWinPercent: v })}
            disabled={disabled}
            adornment={<PercentIcon />}
          />
        </div>
        <div className="min-w-0 flex-1">
          <AutoField
            label={t('increase_on_loss')}
            value={config.onLossPercent}
            onChange={(v) => onChange({ ...config, onLossPercent: v })}
            disabled={disabled}
            adornment={<PercentIcon />}
          />
        </div>
      </div>

      {/* Stop on profit / loss — paired, plain decimal inputs (0 = disabled) */}
      <div className="flex w-full items-start gap-[10px]">
        <div className="min-w-0 flex-1">
          <AutoField
            label={t('stop_on_profit')}
            value={config.stopOnProfit}
            onChange={(v) => onChange({ ...config, stopOnProfit: v })}
            disabled={disabled}
            decimal
          />
        </div>
        <div className="min-w-0 flex-1">
          <AutoField
            label={t('stop_on_loss')}
            value={config.stopOnLoss}
            onChange={(v) => onChange({ ...config, stopOnLoss: v })}
            disabled={disabled}
            decimal
          />
        </div>
      </div>
    </div>
  )
}

/* ─── Sub-components ─── */

function AutoField({
  label,
  value,
  onChange,
  disabled,
  adornment,
  decimal,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  disabled?: boolean
  adornment?: ReactNode
  decimal?: boolean
}) {
  return (
    <div className="flex w-full flex-col items-start">
      <p className="w-full text-[14px] font-bold uppercase leading-[30px]" style={{ color: '#5c5c5c' }}>
        {label}
      </p>
      <div
        className="relative flex h-[70px] w-full items-center overflow-hidden rounded-[17px] p-px"
        style={{
          border: '1px solid #474747',
          background: 'linear-gradient(to bottom, #1c2025, #181c20)',
          boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.4)',
        }}
      >
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(Math.max(0, Number(e.target.value)))}
          min={0}
          step={decimal ? 0.1 : 1}
          disabled={disabled}
          className="min-w-0 flex-1 bg-transparent px-[15px] text-[22px] font-medium leading-[19.5px] outline-none disabled:opacity-50"
          style={{ color: '#ffffff' }}
        />
        {adornment}
      </div>
    </div>
  )
}

/** Right-aligned adornment glyph (e.g. ∞), Inter Bold 22 #374151. */
function AdornmentButton({
  children,
  onClick,
  disabled,
  active,
  title,
}: {
  children: ReactNode
  onClick: () => void
  disabled?: boolean
  active?: boolean
  title?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="shrink-0 px-[15px] text-[22px] font-bold leading-[26px]"
      style={{ color: active ? 'var(--og-primary)' : '#374151', letterSpacing: '0.5px' }}
    >
      {children}
    </button>
  )
}

/** Percent glyph adornment — #374151, matching Figma's muted input adornments. */
function PercentIcon() {
  return (
    <span className="shrink-0 px-[15px] text-[22px] font-bold leading-[26px]" style={{ color: '#374151' }} aria-hidden>
      %
    </span>
  )
}
