import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import type { ClientMode } from '@playtagon/front-sdk'
import enSweeps from './locales/sweeps/en.json'

// Auto-register every locale file under locales/ (non-recursive glob, so the
// sweeps/ subfolder is excluded). Adding a new language = drop in a JSON file.
const localeModules = import.meta.glob('./locales/*.json', { eager: true })
const resources: Record<string, { translation: Record<string, string> }> = {}
for (const [path, mod] of Object.entries(localeModules)) {
  const code = path.match(/\/([^/]+)\.json$/)![1]
  const data = (mod as { default: Record<string, string> }).default
  resources[code] = { translation: structuredClone(data) }
}

export function initI18n(lang: string, mode: ClientMode = 'gambling') {
  // Rebuild resources fresh each call so i18next's by-reference store + deep-merge
  // can never mutate the module-level base across calls (idempotent init).
  const freshResources: Record<string, { translation: Record<string, string> }> = {}
  for (const [code, bundle] of Object.entries(resources)) {
    freshResources[code] = { translation: structuredClone(bundle.translation) }
  }

  i18n.use(initReactI18next).init({
    resources: freshResources,
    lng: (lang || 'en').toLowerCase(),
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false,
    },
  })

  // Sweeps terminology applies only in social mode, which is always English.
  if (mode === 'social') {
    i18n.addResourceBundle('en', 'translation', structuredClone(enSweeps), true, true)
  }
}
