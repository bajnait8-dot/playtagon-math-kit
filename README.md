# Playtagon Math Kit — your game's math under Playtagon knobs

Hi! This kit is everything you need for your SDK game's **model** — the math
— to live by the Playtagon model convention: configurable knobs, a
machine-readable contract, a per-session factory. You know your game and the
SDK better than we do, so the kit does not teach you how to make games — it
carries the reglament, two living etalons and ready-made prompts for Claude
Code (or another AI assistant) that do the mechanical part of the work under
your control.

This kit covers the **model** (server math) half of a game. Its symmetric
counterpart for the client half (ClientCad) is a separate kit,
`playtagon-client-kit`, shipped separately — nothing client-side is
prescribed here, and the model prompts never touch `client/`.

## Where to start — two scenarios

**I have a finished SDK game; it needs to be brought under the convention** →
[`guides/convert.md`](guides/convert.md), prompt
[`prompts/convert-game.md`](prompts/convert-game.md).

The conversion's chief principle: **the game's math does not change by a
single byte.** Only where it takes its parameter values from changes, and a
machine-readable contract declaration appears. Every conversion must prove
this by comparison against the old model (a bitwise diff of the core, a
fixed-seed match, the payout table, a statistical run) — this is built into
the prompt.

**I am writing a new game and want to do it right from day one** →
[`guides/new-game.md`](guides/new-game.md), prompt
[`prompts/new-game.md`](prompts/new-game.md).

The convention is laid in from the first day — cheaper than reworking later.
There is nothing to compare against, so the proof of the math is built
differently: the declared formula against a measured run. The prompt leads
from mechanics and knobs to a green `playtagon check`.

Everything after that is shared: in both paths you approve the knobs, the AI
works in a feature branch of your repository, and the output is a branch and
a report.

## What is in the kit

| Path | What it is |
|---|---|
| `README.md` | this instruction |
| `guides/new-game.md` | step-by-step guide for the "new game" path, from prerequisites to bake |
| `guides/convert.md` | step-by-step guide for the "convert an existing game" path, from prerequisites to bake |
| `prompts/new-game.md` | the prompt for the "new game under the convention from day one" scenario |
| `prompts/convert-game.md` | the prompt for the "finished game → convention" scenario |
| `Model-Reglament.md` | Playtagon Model Reglament v1 — the single normative document; nothing else needs reading |
| `troubleshooting.md` | typical red states of the platform pipeline and what they mean |
| `etalons/dice` | minimal etalon: an atomic round, scalar knobs. Shows the bundle layout in its simplest form |
| `etalons/sicbo` | etalon of a game with composite knobs (a zone payout table) and the sample **adapter guard test** (`server/model/schema.test.ts`) — the test the Reglament requires in the submission checklist |

> The Reglament is currently in Russian; an English edition ships before the
> public launch.

The etalons are **living games in the target form**. Both prompts tell the
AI to repeat their structure, and you will want them to see what the result
looks like. They build and test right from a clone of this kit (see below).

## What you will need

- Your game's repository. For a conversion — with the usual SDK layout
  (`server/` with `model/` + `scenarios/` + `simulations/`, `client/`). For
  a new game an empty repository is enough: the prompt sets the layout
  itself.
- Node 22 and npm (or pnpm).
- A checkout of the canonical SDK, **`playtagon-sdk`, cloned next to this
  kit** (as a sibling directory) with its dependencies installed
  (`npm install` inside it). The kit does not carry the SDK: the etalons
  reference the sibling checkout with `file:` dependencies, and the
  `playtagon` CLI lives there. The SDK's documentation is in its repo under
  `docs/ru/` — the model interface (`IModel`), scenarios, simulations,
  trackers, RNG, CLI.
- Claude Code (or another AI coding assistant that accepts a long prompt).

## How to use with an AI assistant

1. **Clone this repository** (`playtagon-math-kit`) somewhere near your
   game's folder and remember the path to the clone — the prompt needs it.

2. **Open Claude Code in YOUR game's folder** (at the root of its
   repository). Make sure the working tree is clean — the work will go into
   a separate branch.

3. **Paste the prompt.** Open from the clone the prompt matching your
   scenario (`prompts/convert-game.md` or `prompts/new-game.md`), replace
   the `{PATH_TO_MATH_KIT_CLONE}` placeholder with the actual path to your
   clone, and paste the whole text of the prompt into the Claude Code
   session.

4. **Approve the knobs.** The first thing the AI does is propose a list of
   knobs — the configurable parameters of the math — with a justification
   for each: why it is a knob, what range and why it is safe, what the
   default is. (For a new game it first returns the mechanics as it
   understood them, for your confirmation.) This is the main control point:
   **you own the math**; the AI will not start implementing until you say
   "yes". Edit the list freely — remove, add, change ranges; argue if a
   justification does not convince you.

5. **Send in the result.** When done, the AI leaves a feature branch in
   your repository and a final report (what was done, the knobs, the proof
   of the math, open questions). Send us the branch name and the report
   text. Do not push or merge the branch anywhere until we agree — how the
   code gets picked up is settled separately.

## What happens on the platform

The pipeline your model goes through after submission — each step in detail
in the guides:

1. **Upload** — the model bundle (the `server/` half of your repo) is
   uploaded through the platform's Files page. A successful upload gives
   birth to an immutable **model version** (`model@v1`, `model@v2`, …);
   a rejected bundle leaves no traces.
2. **Knobs on the Math page** — the platform reads your `schema.json` and
   draws an inspector for the declared knobs.
3. **Configs** — a saved set of knob values becomes an immutable **config
   version**, pinned to the model version. At save time the platform
   **probes your factory**: `createModel(values)` runs in an isolated
   worker, and a config that fails the model's own validation is not
   recorded.
4. **Simulations** — the platform runs your `simulations/` itself and
   judges by them the math of the pair `(model version, config version)` —
   the thing that will be published, not the schema defaults.
5. **The oracle ladder** — an automatic judge of readiness: a ladder of
   machine gates over the pair (schema, build, canonical `playtagon check`,
   smoke run, simulation report, negative battery, config confirmation).
   No gate is passed by human decision.
6. **Bake** — the platform assembles the certified pair into a standalone
   artifact. Your `model/index.ts` adapter is regenerated in full at this
   point — which is why its composition is locked by a guard test.

If any of these steps goes red, see
[`troubleshooting.md`](troubleshooting.md) — the typical red states and
what they mean.

*(A note on timing: the shared DEV server is not public yet. Until it is,
we upload and verify submitted branches together — nothing in your game
will need to change for that: the branch is already in the form the
platform accepts.)*

## The etalons build from a clone of this kit

The etalons are wired to build against the sibling `playtagon-sdk`
checkout:

```bash
git clone <this-kit> playtagon-math-kit     # next to playtagon-sdk
cd playtagon-math-kit
npm ci                                      # or npm install
npm test                                    # dice + sicbo test suites

# canonical check, run from the SDK checkout:
cd ../playtagon-sdk
node sdk/cli/bin/playtagon.mjs check ../playtagon-math-kit/etalons/dice
node sdk/cli/bin/playtagon.mjs check ../playtagon-math-kit/etalons/sicbo
```

Both games' tests must be green and both checks must PASS. If they do not,
your environment differs from the expected one (Node version, SDK checkout
missing or not installed) — fix that before feeding the prompts to an AI.

## What the AI will not do

- **Decide your math for you.** In a conversion the calculation core is
  carried over as is; in a new game you approve the mechanics and the
  numbers. Any divergence goes into the report as a list, never smoothed
  over silently.
- **Touch the client.** `client/` is not edited — the work concerns the
  server half only.
- **Create PRs, merge or push.** All work is local commits in a feature
  branch; the rest is your call.

## If something goes wrong

If the AI runs into a question the Reglament (`Model-Reglament.md`) does
not answer — it must stop and put the question into the report, not decide
silently. Bring such questions (and any others) to us — we will sort them
out together and, if needed, extend the reglament. For red states on the
platform side, start with [`troubleshooting.md`](troubleshooting.md).
