# Locales

The dice client auto-registers every `<code>.json` in this folder via
`import.meta.glob` (see `../i18n.ts`). The full RGS language set (25 languages) is
present.

## Reviewed vs draft

- **`en.json`, `ru.json`** — reviewed, production-ready.
- **All other `<code>.json`** — **machine drafts**, each marked with a `_draft`
  key (`"_draft": "MACHINE DRAFT — needs native review"`). They are structurally
  correct (same 33 keys as `en.json`) and use the right script, but the gaming
  terminology needs a native-speaker pass before being treated as final.
  Lower-confidence terms flagged at draft time: `roll_over`/`roll_under`,
  `bet` (verb vs noun), and short `win`/`miss` labels in fi, hu, ja, el, and the
  South-Slavic group (sr, hr, sl, cs, sk).

## Sweeps terminology

Social-mode overrides live in `sweeps/en.json` (English only) and are overlaid
onto English at runtime when `mode === 'social'`. This is NOT a language and is
not registered by the language glob (the glob is non-recursive).

## Adding a language

Drop `<code>.json` (lowercase code, the same 33 keys as `en.json`) into this
folder. `i18n.ts` auto-registers it — no code change. The parity test in
`../i18n.test.ts` enforces that every locale has exactly the `en.json` key set.
