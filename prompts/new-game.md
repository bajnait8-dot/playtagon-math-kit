# New game prompt for Claude Code

How to use: replace `{PATH_TO_MATH_KIT_CLONE}` (everywhere — it occurs
several times) with the actual path to your clone of `playtagon-math-kit`,
then copy **the entire text below the divider** and paste it into a Claude
Code session opened at the root of your new game's repository.

---

You are writing a **new** mathematical game model on the
`@playtagon/model-sdk` SDK, under the Playtagon model convention from day
one: declared knobs, a machine-readable contract, a per-session factory.
Nothing needs converting — the convention is laid in from the first day,
and that is cheaper than reworking later. The game's owner is the author of
its math; they are nearby and answer questions in this session. The math is
invented by them, not by you: your job is to fit it into the convention,
and to raise contentious product forks to them.

Read BEFORE starting:

- `{PATH_TO_MATH_KIT_CLONE}/Model-Reglament.md` — the MAIN and only
  normative document: bundle layout (section 3), the `createModel(values)`
  factory (section 4), `schema.json` (section 5), request validation
  (section 6), typed errors (section 8), the `protocol.md` template
  (section 10), the executable form and the worker-file convention
  (section 11), the submission checklist (section 13.2 — acceptance judges
  by it). Everything this task requires is explained there; no other
  documents are needed.
- The SDK documentation — the canon of the `IModel` interface
  (`init`/`play`/`verify`), scenarios, simulations and trackers. The
  reglament describes conventions ON TOP of the SDK and changes not a
  single one of its types: where the SDK says "how", the reglament says "in
  what form to submit".
- `{PATH_TO_MATH_KIT_CLONE}/etalons/dice` — a LIVING ETALON in the target
  form: `dice/server/` (`model/` + `scenarios/` + `simulations/` + the
  manifests `schema.json`/`config.json`/`protocol.md`);
  `server/model/index.ts` — the SDK-canonical default export for the dev
  loop, which is also the conventional adapter; `server/model/playtagon.ts`
  — the platform entry, declared in `schema.json#entry`; `protocol.md` —
  per the reglament template; `simulations/dice.worker.ts` and
  `fixed.worker.ts` — the sample of the two-branch form. Repeat its
  structure: it is not "one of the possible layouts" but the one the
  platform accepts. If you notice the etalon diverging from the reglament —
  the reglament governs, and the divergence goes into the report.

The etalon is a sample of **form**, not of math. The owner's game is their
own: do not drag from `dice` its mechanics, knobs or numbers.

## Start precondition — the repository builds on its own, before any code

**Before the first line of the model, make sure the game repository is
self-sufficient:** in a CLEAN clone (`git clone` + `npm install` /
`pnpm install`, with no files absent from the index) it builds and its
tests pass. Verify exactly that way — not "it works in my working copy":
the working copy may be held up by local files that are not in the
repository (a root `package.json`, `tsconfig.json`, local `link`s, the
contents of `.gitignore`), and then any green run proves nothing.

**If it does not build or the tests are red — first fix the environment in
a SEPARATE commit**, before working on the model: manifests, dependencies,
TS configs, test scripts. Separate — so that the environment fix does not
mix into history with the math and stays separable at review. If the
repository is empty, the same commit lays down a working skeleton:
manifests, `tsconfig`, a test run — so that the model's very first test has
somewhere to live and something to run it.

If self-sufficiency requires owner decisions (which package manager, where
the SDK dependencies point) — raise the fork per the rules below: options
and an explicit recommendation.

## Stage 0 — mechanics and knobs. Before any code.

First learn the mechanics from the owner: what the player does, what chance
decides, how the payout is computed, whether there is provably-fair (the
`fairness` mode — the platform supplies a fixed RNG buffer, and RNG spend
becomes part of the contract; the mode is chosen once and declared in
`schema.json#rngMode`). State what you understood **in your own words and
return it to the owner for confirmation** — a divergence in understanding
the math is cheaper to catch here than in the statistical run.

Then propose a **list of knobs** — configurable parameters the platform
will be able to change via config. For each knob: name, type, range, step,
default, control type and a justification — why it is an input of the math
and why the range is safe (mathematical limits, market values, where the
default comes from). Separately list the parameters that will NOT become
knobs, and why (derived quantities are not knobs: a second source of truth
about the math must not be created).

Selection rules (reglament section 5.3): a knob is an **input** of the math
(RTP, weights, thresholds, bounds). **A round outcome is NOT a knob**: the
rolled face, the crash point, the drawn card — these are results of the
draw, they are declared in the `playData` section, and `secret` applies
only to inputs. Bets are the RGS's territory: the schema declares only the
technical limits of the `bet` field (section 5.6). A knob does not have to
be a scalar: composite types `array`/`object` with element declarations are
possible (section 5.7) — a payout table, weights; the semantic invariants
of such knobs ("weights sum to 1") are checked by the factory.

A new game has a freedom here that a conversion does not: while there is no
code, adding or removing a knob costs nothing. Use it — but do not inflate
the list: every knob is a range someone must justify, and a domain a
simulation bot must walk.

**STOP and wait for the owner's explicit approval of the mechanics and the
knob list.** Do not start the implementation before their answer; the
owner's edits are the truth, even if your justification was different.
Record the approved list in the spec, then draw up a plan and execute.

## Stage 1 — implementation

The work happens in place, in this repository, in a feature branch (see git
discipline below). Write in the target layout right away — "somehow first,
tidy up later" does not work here: half of the requirements below are about
form, and reshaping the form after the fact is exactly the conversion you
are avoiding.

1. **The `server/` layout** (reglament section 3). The submitted bundle is
   the server half of the canonical SDK layout, that is, the `server/`
   directory of your repository:

   ```
   server/
     model/           the math sources; the source point of the platform
                      entry from schema.json#entry lives here too
     scenarios/       SDK-canon scenarios; scenarios/index.ts is mandatory
     simulations/     SDK-canon simulations; simulations/index.ts is mandatory
     schema.json      the machine-readable contract
     config.json      knob values + control metadata
     protocol.md      field semantics, message order, errors
   ```

   All six parts are mandatory: without any one of them the platform
   rejects the bundle at upload (422, with no traces in the system). Built
   artifacts (`dist/`, `.mjs`) are not in the bundle — the platform
   assembles the executable form. The game's client half (`client/`) and
   service tools do not go into the model bundle; writing from the client
   into `model/` is forbidden and checked by machine.

2. **The `createModel(values)` factory** — the platform entry in
   `server/model/playtagon.ts`, declared in `schema.json#entry`
   (`{module, export}`); next to it the SDK-canonical default export in
   `server/model/index.ts` for the dev loop (an instance from the schema's
   default values) — as in the etalon. Knob values arrive **as an argument
   on every session**: hardcoding values and reading files at module load
   are forbidden; the only permitted read is the model's own `schema.json`,
   lazily. `config.json` is not read by model code at all. The factory
   validates `values` against `knobs`: types, ranges, completeness of the
   set, absence of undeclared knobs, cross-invariants; any violation is a
   `ConfigValidationError` with the list of ALL violations at once; there
   are no silent defaults and no clamping. Two instances with different
   `values` must coexist in one process and give different `initData` —
   write a test for this from day one; it is a cheap check that catches any
   leaked global state.

   Next to `createModel`, export from the same entry point
   **`buildModel(values)`** — the second half of the convention pair
   (Reglament, section 11.1): assembly of the model from known-valid values
   WITHOUT reading the schema and without validation. It is called ONLY by
   the platform's generated bake adapter; the author's code does not call
   `buildModel` — not `dev.ts`, not the tests, not the worker files. Export
   the exception classes next to the factory.

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

   Writing a game from scratch — lay this in from day one: keep the adapter
   empty of game symbols and spread the mechanics across actual modules. A
   composition defect **passes the dev loop green** (the re-export
   resolves, tests and `playtagon check` are green) and is exposed only at
   the bake gate, where the artifact is assembled with the regenerated
   adapter. That is why the adapter's composition is **locked by a
   mandatory guard test** (Reglament, checklist 13.2), which checks three
   things: **(a)** the adapter's runtime exports are exactly
   `{default, knobValues, model}`; **(b)** the adapter's source contains
   not a single form of `export … from`; **(c)** consumers inside `server/`
   import nothing from the adapter except `knobValues`. Such a test is a
   mandatory part of the submission, not an optional extra. The sample is
   the sicbo etalon, `server/model/schema.test.ts`, the block "the adapter
   `model/index.ts` is strictly conventional".

3. **`schema.json`**: `modelId`, `sdkVersion`, `rngMode`, `entry`, `knobs`,
   the sections `request`/`initData`/`playData`/`replayData` (for fairness —
   also `verifyData`), all with `additionalProperties: false`. Request
   bounds that depend on knobs — via `x-bounds` with knob names, not
   duplicated by a number (two numbers for one bound are two sources of
   truth). Draw outcomes go in `playData`, not in `knobs`. The technical
   limits of `bet` are declared explicitly (a minimum strictly greater than
   zero, the overflow ceiling of the math); product bet limits are not
   declared. Money fields are integers in minor units. No external
   `$schema` URLs: a link to a foreign domain will survive the baking of
   the artifact and stay broken forever.

   Mark the knob that carries the declared RTP with
   `"x-role": "target-rtp"` (section 5.3.1) — otherwise the platform has
   nothing to compare the measured RTP against. The role dictionary is
   closed: any other `x-role` value is a rejection at intake.

4. **Request validation**: the model rejects a request that does not pass
   its `request` section with a `RequestValidationError` exception
   **before the draw** — a rejected round does not spend a single RNG
   number. Bounds from `x-bounds` are checked against the active config in
   the same place. The model's response passes its own schema on any
   input — either a valid `PlayResult` or an exception, there is no third
   option. Extra fields and non-integer numbers are rejected too.

5. **`config.json`** — values of all non-secret knobs (each passes its
   knob's declaration) + control metadata (`controls`).

6. **`protocol.md`** — strictly per the reglament template (section 10),
   all mandatory sections: the mechanics in one paragraph; the message
   order (an ASCII diagram); `init` — the source of knob values and the
   units of measurement; `play` — the round's invariants and errors; the
   mechanics' edge cases; provably-fair (for fairness — the `roundId` ↔ RNG
   buffer linkage); "What the model does not have" — an explicit list;
   "Model exception types" — a table (`err.name` × who throws × when ×
   fields). Look at the etalon's `protocol.md` as the sample of tone and
   depth. The bar is set by acceptance: from `schema.json` + `protocol.md`
   the reviewer must be able to write a test client **without opening the
   code** (blind integration, section 13.1). Write these two files for a
   person who will not see the code.

7. **`scenarios/` and `simulations/`** — a mandatory part of the contract,
   not the author's tools: they travel in the bundle and are executed by
   the platform. Scenarios judge the real mechanics (the outcome against
   the request, not the `win` field), cover the bounds and the edges of the
   outcome domain. Simulations drive a bot across the whole knob domain and
   put theory next to fact (expected RTP against measured).

   **The worker-file convention is mandatory for a model with knobs**
   (Reglament, section 11.2). The platform runs the simulations itself and
   judges by them the math of the **pair** `(model, config)` — what gets
   published, not the schema defaults. The worker file has the
   **two-branch form**: the platform puts the active config's values into
   `workerData.values`, and that path must go **through the factory with
   full validation**; without `workerData` — a **ready instance of the
   conventional adapter** `model/index.ts` via a static import (in the
   repository these are the validated schema defaults; in the bake artifact
   the platform regenerates the adapter with the pair's literals — a run
   without the envelope executes the pair, and the schema is needed nowhere
   in that branch):

   ```ts
   workerSimulation((workerData?: { values?: unknown }) => {
     if (workerData?.values) {
       const cfg = resolveConfig(workerData.values);
       return {
         model: createModel(workerData.values),
         bot: createRandomBot(cfg.someMin, cfg.someMax),
       };
     }
     const cfg = buildConfig(knobValues);
     return {
       model: defaultModel,
       bot: createRandomBot(cfg.someMin, cfg.someMax),
     };
   });
   ```

   (`defaultModel` is the default export, `knobValues` is a named export of
   `../model/index.js`.)

   Three things this breaks on most often:

   - **the fallback branch is mandatory and executes the adapter
     instance** — without `workerData` (your local run, the canonical
     `playtagon check`, the RGS simulator) the file must work; calling
     `createModel` in this branch is forbidden — in the artifact the
     validating factory would run into the lazy read of a schema the
     artifact does not carry;
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
   When designing the math with the owner, lay this in from stage 0.

9. **Key order in `values`** — the platform stores knob values in jsonb:
   the key order of objects is NOT preserved. The math has no right to
   depend on the key order of the incoming `values`; weight tables and
   everything where order matters — only in an order-independent form: an
   array of elements or an explicit traversal array in the factory code.
   **The reordering test is mandatory**: a deep reshuffle of the `values`
   keys does not change a single byte of the draw (Reglament, 5.7.6 and
   checklist 13.2).

## Stage 2 — proving the math

A conversion has something to compare against — the old model. A new game
has no such anchor, so the proof is built not on comparison but on
**theory against fact**:

1. **The declared math is written out explicitly** — the multiplier
   formula, the payout formula, the expected RTP as a function of the
   knobs. Its place is `protocol.md` (sections 1 and 4 of the template); in
   the report — the same formulas with their derivation.
2. **Analytics against the run** — on a grid of knob values (the corners of
   the ranges and the middle), the theoretical RTP from the formula against
   the RTP measured by a statistical run on a large sample. It converges
   within the declared tolerance — or the divergence goes into the report
   as a list, not smoothed over.
3. **Payout table** — multipliers and payouts across a parameter grid via
   actual model calls, with a large bet so rounding cannot hide a
   divergence; compare against the formula from item 1.
4. **Determinism** — on a fixed seed a repeated run gives a byte-identical
   result; for `fairness` — the RNG spend in `verify` is identical to
   `play`, `verify` is idempotent, `verifyData` matches the round's
   `playData`.

Any divergence — as a list in the report. Silent smoothing is forbidden.

## Stage 3 — checks

- The canonical `playtagon check` over the game — **fully green, no
  skips**.
- Unit tests cover: the mechanics' edge cases, the payout arithmetic
  (including rounding), the multiplier formula, failures on an invalid
  request and invalid `values`, the coexistence of two instances with
  different `values`, the money invariants. Tests that are green both
  before and after fixing a defect prove nothing — verify that the new
  tests catch what they are supposed to.
- **A blind pass over your own documents** (section 13.1): reread
  `schema.json` + `protocol.md` as an outsider and write down what remained
  non-derivable from the documents. That is exactly what acceptance will
  stumble on; every such item is either a document fix or a line in the
  report.
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
(mechanics, knob ranges, defaults, the declared RTP) — propose them and
surface them in the report as a separate list for the owner's approval. The
SDK is untouchable: no edits, no workarounds of its contract.

## Git discipline

Branch `feat/playtagon-model` off this repository's main branch; commit
locally, in meaningful steps. FORBIDDEN: creating pull requests, merging
branches, pushing anywhere without the owner's explicit request.

## Final report

When done, write a report and stop:

- what was done (by stage, with file names);
- the mechanics in two paragraphs — as you implemented it;
- a table of the approved knobs (name, type, range, default,
  justification);
- the proof of the math — all four items of stage 2, with numbers;
- the result of `playtagon check` and the tests;
- what remained non-derivable from `schema.json` + `protocol.md` (the
  blind pass);
- product choices for approval — as a separate list;
- open questions;
- the name of the branch with the work.
