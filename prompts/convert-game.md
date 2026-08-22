# Conversion prompt for Claude Code

How to use: replace `{PATH_TO_MATH_KIT_CLONE}` (everywhere — it occurs
several times) with the actual path to your clone of `playtagon-math-kit`,
then copy **the entire text below the divider** and paste it into a Claude
Code session opened at the root of your game's repository.

---

You are working at the root of an SDK game repository. The task is to convert
its model to the Playtagon model convention: declared knobs, a
machine-readable contract, a per-session factory. Server side only:
not a single file of `client/` is edited. The game's owner is the author of
its math; they are nearby and answer questions in this session.

Read BEFORE starting:

- `{PATH_TO_MATH_KIT_CLONE}/Model-Reglament.md` — the MAIN and only
  normative document: bundle layout, the `createModel(values)` factory,
  `schema.json`, validation, typed errors, the `protocol.md` template, the
  submission checklist (section 13.2 — acceptance judges by it). Everything
  this task requires is explained there; no other documents are needed.
- `{PATH_TO_MATH_KIT_CLONE}/etalons/dice` — a LIVING ETALON in the target
  form: `dice/server/` (`model/` + `scenarios/` + `simulations/` + the
  manifests `schema.json`/`config.json`/`protocol.md`);
  `server/model/index.ts` — the SDK-canonical default export for the dev
  loop, `server/model/playtagon.ts` — the platform entry `createModel`,
  declared in `schema.json#entry`; `protocol.md` — per the reglament
  template. Repeat its structure. If you notice the etalon diverging from
  the reglament — the reglament governs, and the divergence goes into the
  report.
- The current game: its `server/` in full (model, scenarios, simulations,
  configs), unit tests, README.

## Start precondition — the repository builds on its own, before conversion

**Before the first math edit, make sure the game repository is
self-sufficient:** in a CLEAN clone (`git clone` + `npm install` /
`pnpm install`, with no files absent from the index) it builds and its tests
pass. Verify exactly that way — not "it works in my working copy": the
working copy may be held up by local files that are not in the repository
(a root `package.json`, `tsconfig.json`, local `link`s, the contents of
`.gitignore`), and then any green run proves nothing.

**If it does not build or the tests are red — first fix the environment in a
SEPARATE commit**, before the conversion: manifests, dependencies, TS
configs, test scripts. Separate — so that the environment fix does not mix
into history with the math edits and stays separable at review. Start the
conversion only from a green start: otherwise it is unclear what the
conversion broke versus what was broken before it, and a red test in the
middle of the work has nothing to be compared against.

If self-sufficiency requires owner decisions (which package manager, where
the SDK dependencies point) — raise the fork per the rules below: options
and an explicit recommendation.

## Stage 0 — knobs. Before any code.

Study the game's math and propose to the owner a **list of knobs** —
configurable parameters the platform will be able to change via config. For
each knob: name, type, range, step, default, control type and a
justification — why it is an input of the math and why the range is safe
(mathematical limits, market values, where the default comes from).
Separately list the parameters that will NOT become knobs, and why (derived
quantities are not knobs: a second source of truth about the math must not
be created).

Selection rules (reglament section 5.3): a knob is an **input** of the math
(RTP, weights, thresholds, bounds). **A round outcome is NOT a knob**: the
rolled face, the crash point, the drawn card — these are results of the
draw, they are declared in the `playData` section, and `secret` applies only
to inputs. Bets are the RGS's territory: the schema declares only the
technical limits of the `bet` field (section 5.6). A knob does not have to
be a scalar: composite types `array`/`object` with element declarations are
possible (section 5.7) — a payout table, weights; the semantic invariants of
such knobs ("weights sum to 1") are checked by the factory.

**STOP and wait for the owner's explicit approval of the list.** Do not
start the implementation before their answer; the owner's edits are the
truth, even if your justification was different. Record the approved list in
the spec, then draw up a plan and execute.

## Stage 1 — conversion

The work happens in place, in this repository, in a feature branch (see git
discipline below). Requirements:

1. **The math does not change by a single byte.** The calculation core is
   carried over as is; only the source of knob values changes.
2. **The `createModel(values)` factory** — the platform entry in
   `server/model/playtagon.ts`, declared in `schema.json#entry`
   (`{module, export}`); next to it the SDK-canonical default export in
   `server/model/index.ts` for the dev loop (an instance from the schema's
   default values) — as in the etalon. Hardcoding knob values and reading
   files at module load are forbidden; the only permitted read is the
   model's own `schema.json`, lazily. The factory validates `values`
   against `knobs`: types, ranges, completeness of the set, absence of
   undeclared knobs, cross-invariants; any violation is a
   `ConfigValidationError` with the list of ALL violations at once; there
   are no silent defaults and no clamping. Two instances with different
   `values` must coexist in one process — write a test for this. Next to
   `createModel`, export from the same entry point
   **`buildModel(values)`** — the second half of the convention pair
   (Reglament, section 11.1): assembly of the model from known-valid values
   WITHOUT reading the schema and without validation; it is called ONLY by
   the platform's generated bake adapter, the author's code does not call
   `buildModel`: worker files in `simulations/` on the `workerData` path
   call only `createModel`, and their fallback branch imports the ready
   default instance of the adapter `model/index.ts` (the two-branch form,
   Reglament, section 11.2).

   **The adapter `model/index.ts` is the platform's property, and at bake
   it is REGENERATED IN FULL** (Reglament, section 11.1): the platform does
   not edit values in it — it writes the file anew from scratch. Not a
   single line of the author's text remains in the artifact. Hard
   consequences follow:

   - the adapter's composition is **exactly `{default, knobValues, model}`**,
     not one export more;
   - **any author exports on the adapter are forbidden** — re-exports of
     mechanics, types, constants, error classes, in any form
     (`export { … } from "…"`, `export * from "…"`). They are not
     preserved — they vanish;
   - internal consumers (tests, `scenarios/`, `simulations/`, `dev.ts`)
     import the mechanics **from the actual modules** where it is declared;
     **from the adapter one may take only `knobValues`** (and the `default`
     instance for the worker file's fallback branch).

   This is the defect that **the dev loop passes green**: in the repository
   the re-export resolves, tests and `playtagon check` are green, and
   everything fails later and not at your desk — at the bake gate, where
   the artifact is assembled with the regenerated adapter and the consumers
   cannot find the vanished symbols. That is why the adapter's composition
   is **locked by a mandatory guard test** (Reglament, checklist 13.2),
   which checks three things: **(a)** the adapter's runtime exports are
   exactly `{default, knobValues, model}`; **(b)** the adapter's source
   contains not a single form of `export … from`; **(c)** consumers inside
   `server/` import nothing from the adapter except `knobValues`. Such a
   test is a mandatory part of the submission, not an optional extra. The
   sample is the sicbo etalon, `server/model/schema.test.ts`, the block
   "the adapter `model/index.ts` is strictly conventional".
3. **`schema.json`**: `modelId`, `sdkVersion`, `rngMode`, `entry`, `knobs`,
   the sections `request`/`initData`/`playData`/`replayData` (for fairness —
   also `verifyData`), all with `additionalProperties: false`. Request
   bounds that depend on knobs — via `x-bounds` with knob names, not
   duplicated by a number. Draw outcomes go in `playData`, not in `knobs`.
   The technical limits of `bet` are declared explicitly (a minimum strictly
   greater than zero, the overflow ceiling of the math); product bet limits
   are not declared. No external `$schema` URLs.
4. **Request validation**: the model rejects a request that does not pass
   its `request` section with a `RequestValidationError` exception
   **before the draw** — a rejected round does not spend a single RNG
   number. Bounds from `x-bounds` are checked against the active config in
   the same place. The model's response passes its own schema on any input —
   either a valid `PlayResult` or an exception, there is no third option.
5. **`config.json`** — values of all non-secret knobs (each passes its
   knob's declaration) + control metadata (`controls`).
6. **`protocol.md`** — strictly per the reglament template (section 10),
   all mandatory sections, including "Model exception types" (a table of
   `err.name` × who throws × when × fields), the `roundId` ↔ RNG buffer
   linkage for fairness games, bet bounds, the section "What the model does
   not have". Look at the etalon's `protocol.md` as the sample of tone and
   depth.
7. **`scenarios/` and `simulations/`** — a mandatory part of the contract
   (`scenarios/index.ts` and `simulations/index.ts` must exist). Those the
   game already has — carry over and adapt to the new layout; if there were
   none — write meaningful ones following the etalon's example: scenarios
   judge the real mechanics (the outcome against the request, not the `win`
   field), cover the bounds and the edges of the outcome domain; simulations
   drive a bot across the whole knob domain and put theory next to fact
   (expected RTP against measured).

   **The worker-file convention is mandatory for a model with knobs**
   (Reglament, section 11.2). The platform runs the simulations itself and
   judges by them the math of the **pair** `(model, config)` — what gets
   published, not the schema defaults. The worker file has the
   **two-branch form** (Reglament, section 11.2): the platform puts the
   active config's values into `workerData.values`, and that path must go
   **through the factory with full validation**; without `workerData` — a
   **ready instance of the conventional adapter** `model/index.ts` via a
   static import (in the repository these are the validated schema
   defaults; in the bake artifact the platform regenerates the adapter with
   the pair's literals — a run without the envelope executes the pair, and
   the schema is needed nowhere in that branch):

   ```ts
   workerSimulation((workerData?: { values?: unknown }) => {
     if (workerData?.values) {
       const cfg = resolveConfig(workerData.values);
       return {
         model: createModel(workerData.values),
         bot: createRandomDiceBot(cfg.targetMin, cfg.targetMax),
       };
     }
     const cfg = buildConfig(knobValues);
     return {
       model: defaultModel,
       bot: createRandomDiceBot(cfg.targetMin, cfg.targetMax),
     };
   });
   ```

   (`defaultModel` is the default export, `knobValues` is a named export of
   `../model/index.js`.)

   Three things this breaks on most often:

   - **the fallback branch is mandatory and executes the adapter
     instance** — without `workerData` (your local run, the canonical
     `playtagon check`, the RGS simulator) the file must work as it worked;
     calling `createModel` in this branch is forbidden — in the artifact
     the validating factory would run into the lazy schema read, and the
     artifact carries no schema;
   - **bot bounds come from the same values**, not from constants: in the
     envelope — from the validated config, in the fallback — by pure
     assembly from the adapter's `knobValues` without reading the schema. A
     bot walking outside the active config's domain measures a nonexistent
     product;
   - the `values` key in `workerData` is **reserved by the platform**: the
     game's own `workerData` survives the merge, but on a key collision the
     platform wins.

   ⚠️ **This is checked at intake by a lint.** The model declares non-empty
   `knobs`, and a worker file under `simulations/` does not use
   `workerData` → the bundle is **rejected** with
   `MODEL_WORKER_IGNORES_CONFIG` ("the model declares knobs, but its worker
   file builds the model from defaults — the canonical run would not see
   the config"), no version is created. The norm does not concern models
   without knobs. The sample of both forms is the etalon's
   `dice/server/simulations/dice.worker.ts` and `fixed.worker.ts`.

   **Metrics are computed by the canon, not by the game** (Reglament,
   section 11.3): `rtp`/`std`/`volatility`/`hitFrequency`/`winDistribution`
   and the rest are the builtin set of the canonical SDK tracker. Write the
   game's own tracker **next to** it and put into it what the builtin
   cannot: theory against fact (the etalon's `DiceTracker` keeps, next to
   the measured `hitRate`, a theoretical `expectedHitRate` and
   `expectedRtp` derived from `playData`). Duplicating the builtin with
   your own arithmetic is not needed. The tracker takes the theory from the
   adapter's `knobValues`: the SDK channel does not pass `workerData` to
   trackers, so with a non-default config the theory in a local run lags
   the fact — this is expected and is not a defect (Reglament, section
   11.3).

   Mark the knob that carries the declared RTP in `schema.json` with
   `"x-role": "target-rtp"` (Reglament, 5.3.1) — otherwise the platform has
   nothing to compare the measured RTP against. The role dictionary is
   closed: any other `x-role` value is a rejection at intake.

8. **Multiple modes (`roundTypes`)** — if the game has several round modes,
   declare them as the list `model.roundTypes` (an official SDK contract) —
   **exactly the playable modes**, not one more. The round mode arrives as
   **the `roundType` field of the play envelope**, not as a field of the
   game's `request`: do not declare it in the `request` section, take it
   from the argument in `play()`. Platform semantics (Reglament, section
   11.5): the canonical "N rounds" run drives N rounds for EACH declared
   mode, and with a declared `target-rtp` the RTP tolerance is judged for
   each mode separately — **the declared RTP must hold in every mode**, not
   on the game's average; one diverged mode turns the gate red as a whole.

9. **Key order in `values`** — the platform stores knob values in jsonb:
   the key order of objects is NOT preserved. The math has no right to
   depend on the key order of the incoming `values`; weight tables and
   everything where order matters — only in an order-independent form: an
   array of elements or an explicit traversal array in the factory code.
   **The reordering test is mandatory**: a deep reshuffle of the `values`
   keys does not change a single byte of the draw (Reglament, 5.7.6 and
   checklist 13.2).

## Stage 2 — math verification. Mandatory.

Prove that the math has not shifted, by the etalon's method (all four
checks):

1. **Bitwise diff of the core** — the calculation files are identical to
   the originals; every difference is named and explained (only edits to
   the source of values and the validator call are permissible).
2. **Fixed seed** — a deterministic RNG, per-operation comparison of the
   old and the new model: `init`/`play`/`verify` across a parameter grid,
   all response fields matching.
3. **Payout table** — multipliers and payouts across a parameter grid via
   actual calls of both models, with a large bet so rounding cannot hide a
   divergence.
4. **Statistical run** — a large sample (millions of rounds) on both
   models: the empirical RTP converges to the declared one, the old and the
   new model give the same result.

Any divergence — as a list in the report. Silent smoothing is forbidden.

## Stage 3 — checks

- The canonical `playtagon check` over the game — **fully green, no
  skips**.
- The game's regular unit tests are alive (or adapted — with an explanation
  of every edit); new factory and validation tests following the etalon's
  example; tests that are green both before and after fixing a defect prove
  nothing — verify that the new tests catch what they are supposed to.
- The final self-check — the submission checklist from reglament section
  13.2, item by item.

## Decision-making rules

If an architectural choice is needed that is not in the Reglament and the
SDK canon — stop and put the question into the report; do not decide
silently.

**A fork is raised with a recommendation, not a bare list.** When raising
any question to the owner — architectural or product — you must give:
(a) options, each with its cost and consequences; (b) **an explicit
recommendation — which option to choose** — and (c) the justification of
why that one: what makes it better than the rest and in what case the
recommendation would stop holding. A list of options without a
recommendation is unfinished work: you saw the code and the math, the
owner saw only the question, and shifting onto them the analysis you were
supposed to do is not neutrality but a waste of their time. The owner has
the right to choose otherwise; their edit is the truth. But they make the
choice **from your recommendation**, not instead of it. Product decisions
(knob ranges, defaults) — propose them and surface them in the report as a
separate list for the owner's approval. The SDK is untouchable: no edits,
no workarounds of its contract.

## Git discipline

Branch `feat/playtagon-knobs` off this repository's main branch; commit
locally, in meaningful steps. FORBIDDEN: creating pull requests, merging
branches, pushing anywhere without the owner's explicit request.

## Final report

When done, write a report and stop:

- what was done (by stage, with file names);
- a table of the approved knobs (name, type, range, default,
  justification);
- the math verification results — all four methods, with numbers;
- the result of `playtagon check` and the tests;
- product choices for approval — as a separate list;
- open questions;
- the name of the branch with the work.
