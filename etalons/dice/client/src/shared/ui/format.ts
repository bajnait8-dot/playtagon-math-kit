let _currency = 'USD'
let _denomination = 2

export function setFormatConfig(currency: string, denomination: number): void {
  _currency = currency
  _denomination = denomination
}

/** ISO currency code (e.g. "EUR", "USD") — used as the input unit per Figma Input/Adds. */
export function getCurrencyCode(): string {
  return _currency
}

export function getCurrencySymbol(): string {
  try {
    const parts = new Intl.NumberFormat('en-US', { style: 'currency', currency: _currency }).formatToParts(0)
    const sym = parts.find(p => p.type === 'currency')
    return sym?.value ?? _currency
  } catch {
    return _currency
  }
}

/** Format a display value (already divided by denomination) */
export function fmt(n: number): string {
  return n.toLocaleString('en-US', {
    minimumFractionDigits: _denomination,
    maximumFractionDigits: _denomination,
  })
}
