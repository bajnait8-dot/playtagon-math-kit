import { FairListValues, type FairListValuesProps } from './FairListValues'

export interface FairListRowProps {
  label: string
  values: FairListValuesProps
}

/** A fairness row — Figma `Widget/Fair/List`: label · dotted leader · values. */
export function FairListRow({ label, values }: FairListRowProps) {
  return (
    <div className="flex w-full items-end">
      <p className="whitespace-nowrap text-[16px] font-medium leading-[20px]" style={{ color: 'var(--og-text)' }}>{label}</p>
      <span
        className="mx-[5px] min-w-px flex-1"
        style={{
          height: 3,
          backgroundImage: 'radial-gradient(circle, var(--og-text-dim) 1px, transparent 1px)',
          backgroundSize: '6px 3px',
          backgroundRepeat: 'repeat-x',
          backgroundPosition: 'bottom',
        }}
        aria-hidden
      />
      <FairListValues {...values} />
    </div>
  )
}
