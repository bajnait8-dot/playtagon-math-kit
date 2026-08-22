# Troubleshooting — typical red states and what they mean

The platform fails loudly and specifically: a rejected bundle leaves no
traces, a red gate names its reason. This FAQ maps the states you are most
likely to meet to their cause and the fix. The normative source for every
rule mentioned here is [`Model-Reglament.md`](Model-Reglament.md); the
correct form for every fix is in the etalons.

## At upload (Files page)

Upload is all-or-nothing: any rejection is a 422 with a code, and **no
version is created** — nothing to clean up, fix the bundle and upload
again.

### `MODEL_CONTRACT_MISSING`

The bundle is missing a mandatory part — most often `scenarios/index.ts` or
`simulations/index.ts` (the message lists *everything* missing at once).
The bundle must carry all six parts: `model/`, `scenarios/`,
`simulations/`, `schema.json`, `config.json`, `protocol.md`. Scenarios and
simulations are part of the submitted contract, not your private tools —
the platform stores and executes them.

### `MODEL_ENTRY_PAIR_MISSING`

The model declares knobs, but its entry module does not export the
convention pair — the message names which half is missing. A model with
knobs must export **both** `createModel(values)` (validate and build — the
road of every DEV path) and `buildModel(values)` (build from certified
values without validation — called only by the platform's generated bake
adapter) from the module declared in `schema.json#entry`. See the etalons'
`server/model/playtagon.ts`.

### `MODEL_WORKER_IGNORES_CONFIG`

The model declares knobs, but a worker file under `simulations/` builds the
model without reading `workerData` — so the canonical run would never see
the config, and the platform would certify the schema defaults instead of
the published pair. Bring the worker file to the two-branch form: with
`workerData.values` — build through `createModel` with full validation;
without `workerData` — statically import the ready default instance of the
adapter `model/index.ts`. The sample of both forms is the dice etalon's
`server/simulations/dice.worker.ts` and `fixed.worker.ts`. Models without
knobs are exempt.

### `MODEL_KNOBS_WITHOUT_FACTORY` / `MODEL_ENTRY_EXPORT_MISSING`

The entry does not lead to a usable form: knobs are declared but the entry
exports no factory (knob values would be impossible to apply), or the entry
leads to neither a factory nor a canonical default export. A model with
knobs must declare a factory entry; a default-export entry is legal only
for a model with empty knobs.

### `MODEL_KNOB_TYPE_UNKNOWN` / `MODEL_KNOB_ROLE_UNKNOWN`

A knob uses a type outside the closed type dictionary (scalars plus
`array`/`object` with declared elements), or an `x-role` value outside the
closed role dictionary (currently the single role `target-rtp`). Both
dictionaries are closed by design: what the platform does not understand it
can neither draw, nor validate, nor transfer. Domain types "the factory
will figure out" do not exist — express the structure in the dictionary.

### `MODEL_BUILD_FAILED`

The platform could not assemble the executable form from your sources (the
message carries the build tool's output). Usual causes: a bare import of a
package that is not the Node standard library (the model must be
self-sufficient — SDK types are compile-time only), or a relative import
reaching outside the bundle sources.

## At config save (Math page)

Saving a config runs a **factory probe**: the platform calls
`createModel(values)` with exactly the values being saved, in an isolated
worker with a timeout. An invalid state never gets recorded.

### The editor shows a violation list and refuses to save

That is your own factory speaking — `ConfigValidationError` — and the probe
doing its job: the invariant fails at save time, not on the first session.
The list is shown verbatim; for composite knobs each violation names the
**path to the element** (`total_payouts.9: …`, `symbol_weights: …`), not
just a knob name. Fix the values (or, if the factory is wrong, the
factory) and save again.

### `CONFIG_PROBE_TIMEOUT`

The factory did not finish in time — the model failed, not the config. The
factory must validate values **cheaply**, before any heavy math
preparation: a factory that builds tables for ten seconds before noticing
an invalid input runs into the probe's timeout.

### `NO_MODEL_BUNDLE` / `CONFIG_PROBE_FAILED`

The probe had nothing to execute (no bundle archive for that model
version — re-upload) or the schema declares no valid entry (a model defect,
not a config problem).

## In sessions and rounds

- `MODEL_CONFIG_INVALID` (422) — the factory rejected the session's values;
  the payload carries the factory's full violation list.
- `MODEL_REQUEST_INVALID` (400) — the model rejected the round's request
  before the draw (`RequestValidationError`): schema violation or an
  `x-bounds` bound of the active config. A rejected round spends no RNG.
- `MODEL_PLAY_FAILED` / `MODEL_INIT_FAILED` (500) — the model threw
  something other than its typed errors: a math failure. The process
  survives, neighboring sessions are unaffected, but this is a model defect
  to fix.

## Simulations and RTP tolerances

- **Only canonical runs certify.** A fixed-request run is a debugging tool;
  the tolerance gates read canonical runs only.
- **`declaredRtp: null`** in the report — no knob carries the `target-rtp`
  role, so the platform has nothing to compare the measured RTP against and
  tolerances are not judged. A legal state, not a defect — add the role if
  you want the comparison.
- **Per-mode judgment.** A model declaring several round types is run for
  the full distance on *each* mode, the report carries per-mode metrics
  plus an aggregate, and the tolerance
  (|measured − declared| within three standard errors of the mode's
  distance) must hold **for every mode**. One diverged mode reddens the
  gate for the whole game — the declared RTP is a promise per mode, not on
  average.
- **Custom tracker theory lags the fact on a non-default config.** The SDK
  does not pass `workerData` to trackers, so a custom tracker's "theory"
  side is derived from the adapter's `knobValues` while the run executes
  the pair's values. The builtin metrics and the tolerance gates use the
  actual run and are unaffected. Expected, recorded behavior — not a
  defect.

## The oracle ladder

The oracle runs a ladder of machine gates over the pair; the first red gate
stops the run and the rest report as skipped. Frequent reds:

- **`sdk_check`** — the canonical `playtagon check` failed against your
  sources; reproduce locally (`playtagon check <game-dir>` from the SDK
  checkout) — the oracle runs the same canon. A skipped check step is
  treated as red with the reason, never as silent green.
- **`smoke`** — "the game's bot could not play a round": the smoke gate
  drives rounds with requests generated by *your own bot* from
  `simulations/`. A bot that fails on a healthy model is a bundle defect —
  the bot is de facto part of the acceptance contract.
- **`sim_report`** — no completed canonical simulation for exactly this
  pair. Run one; a fixed-request run does not count.
- **`negative`** — the model computed garbage instead of throwing
  `RequestValidationError` on an invalid request built from its own schema.
- **`config_confirmed`** — the config is in the "transferred, not
  confirmed" state: a transfer changed at least one value (clamped, reset,
  dropped or missing — at any depth of a composite knob) and a human must
  explicitly confirm it before the oracle and publication.

## At bake

### `BAKE_PRE_NORM_MODEL`

The model sources are in the pre-convention form (uploaded before the
factory-pair convention, 2026-08-19) — the diagnosis names what was
detected: the entry module missing `createModel`/`buildModel`, or worker
files building the model without reading `workerData`. Old versions keep
working in DEV, but bake is closed until you **re-upload the sources in
the current convention form** — this kit carries the required form (the
prompts produce it, the etalons demonstrate it).

### `BAKE_CIRCLE_RED`

Bake refuses to hand out the artifact until its control circle is green.
The circle's gates, in order — each failure names the gate:

1. **default-build** — the artifact with the *regenerated* adapter must
   build. This is where a missing `buildModel` export surfaces.
2. **execution** — the built artifact runs with clean Node in a bare
   directory: no `schema.json`, no manifests. A model whose build path
   still lazily reads the schema dies here with a file-not-found — that is
   the point: `buildModel` must live without the schema.
3. **canonical-check** — the canonical `playtagon check` over the unpacked
   artifact.
4. **reproduction** — a canonical run with the artifact's baked values must
   equal, report-for-report on the same seed, a canonical run with the
   pair's values. Any literal drift shows up as diverged reports.
5. **worker-reproduction** — the same equality through the artifact's
   simulation worker path *without* the envelope: the worker's fallback
   branch must execute the regenerated adapter's instance. A worker whose
   fallback calls `createModel` dies here on the missing schema.

Remember the root rule behind gates 1, 2 and 5: **at bake the platform
regenerates `model/index.ts` in full** — not a line of the author's file
survives. Author exports on the adapter vanish; consumers that imported
anything but `knobValues` from it break. The mandatory adapter guard test
(sicbo etalon, `server/model/schema.test.ts`) catches all of this in the
dev loop, where it is cheap.

### `BAKE_NOT_PUBLISHABLE`

The pair's oracle status is below publishable — walk the ladder first
(see above).

## The dev loop passed green but the platform is red — why?

Because some defects are invisible by construction in the author's
repository: a re-export on the adapter resolves locally and vanishes at
bake; a one-branch worker runs fine locally and ignores the config on the
platform; a schema read works locally and has no file in the artifact.
That is exactly why the convention locks these spots with mandatory tests
and machine gates instead of agreements. If you started from this kit's
prompts and etalons, all of these guards are already in your submission.
