import { describe, it, expect, beforeEach } from 'vitest'
import i18n from 'i18next'
import { initI18n } from './i18n'
import en from './locales/en.json'

// i18next is a singleton; restore pristine English before each case.
beforeEach(() => {
  initI18n('en', 'gambling')
  i18n.removeResourceBundle('en', 'translation')
  i18n.addResourceBundle('en', 'translation', structuredClone(en), true, true)
})

// All language files the glob registers (must mirror i18n.ts glob).
const localeModules = import.meta.glob('./locales/*.json', { eager: true }) as Record<
  string,
  { default: Record<string, string> }
>
const langs = Object.fromEntries(
  Object.entries(localeModules).map(([p, m]) => [p.match(/\/([^/]+)\.json$/)![1], m.default]),
)

describe('i18n locale registration', () => {
  it('registers the full RGS language set (>= 24)', () => {
    expect(Object.keys(langs).length).toBeGreaterThanOrEqual(24)
  })

  it('does not register the sweeps override as a language', () => {
    expect(Object.keys(langs)).not.toContain('en-sweeps')
    expect(Object.keys(langs)).not.toContain('sweeps')
  })

  it('every language has the same translation keys as English (ignoring _draft)', () => {
    const enKeys = Object.keys(langs.en).sort()
    for (const [code, data] of Object.entries(langs)) {
      const keys = Object.keys(data).filter((k) => k !== '_draft').sort()
      expect(keys, `language ${code} key mismatch`).toEqual(enKeys)
    }
  })
})

describe('initI18n behavior', () => {
  it('normalizes an uppercase lang code', () => {
    initI18n('DE', 'gambling')
    expect(i18n.resolvedLanguage).toBe('de')
  })

  it('falls back to English for an unknown language', () => {
    initI18n('xx', 'gambling')
    expect(i18n.t('bet')).toBe('Bet')
  })

  it('gambling mode keeps gambling terms', () => {
    initI18n('en', 'gambling')
    expect(i18n.t('bet')).toBe('Bet')
    expect(i18n.t('cash_out')).toBe('Cash Out')
  })

  it('social mode overlays sweeps terms (from the subfolder)', () => {
    initI18n('en', 'social')
    expect(i18n.t('bet')).toBe('Play')
    expect(i18n.t('cash_out')).toBe('Redeem')
    expect(i18n.t('profit_on_win')).toBe('Reward on Win')
  })

  it('russian gambling is unaffected by sweeps', () => {
    initI18n('ru', 'gambling')
    expect(i18n.t('bet')).toBe('Ставка')
  })
})

// Reset-free leak guard: this block deliberately does NOT rely on the beforeEach
// reset between its two assertions — it proves the social overlay cannot mutate
// the shared base across calls (the Critical bug we fixed). If the base leaked,
// the second assertion would see 'Play'.
describe('i18n no cross-call mutation', () => {
  it('social then gambling restores the gambling base', () => {
    initI18n('en', 'social')
    expect(i18n.t('bet')).toBe('Play')
    initI18n('en', 'gambling')
    expect(i18n.t('bet')).toBe('Bet')
  })
})
