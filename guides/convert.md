# Converting an existing game to the Playtagon model convention

This guide walks the whole path: from a finished SDK game to a baked,
published pair on the platform. The mechanical work is done by an AI
assistant driven by [`../prompts/convert-game.md`](../prompts/convert-game.md);
your part is the decisions only you can make — the guide tells you where
those checkpoints are and what a good answer looks like.

One principle governs everything below: **the game's math does not change
by a single byte.** The conversion changes where the math takes its
parameter values from, and adds a machine-readable declaration of its
contract. Every conversion must prove the math did not move — the proof is
built into the prompt.

## 1 · Prerequisites

- Node 22, npm (or pnpm).
- A checkout of `playtagon-sdk` next to your clone of this kit, with
  `npm install` run inside it. The SDK's own docs (`docs/ru/` in that repo)
  are the canon for the model interface, scenarios, simulations and the
  CLI; the kit's Reglament describes the submission conventions on top of
  the SDK and changes none of its types.
- Your game's repository with the usual SDK layout: `server/` holding
  `model/`, `scenarios/`, `simulations/`, and a `client/`.
- A clean working tree — the conversion happens in a feature branch.

**The repository must build on its own.** The first thing the prompt makes
the AI verify is that a *clean clone* of your repo (fresh `git clone` +
install) builds and its tests pass. If your game only works thanks to local
files that never made it into the repository, that gets fixed first, in a
separate commit — otherwise no later green run proves anything. If that fix
needs your decision (package manager, where SDK dependencies point), the AI
will ask, with a recommendation.

## 2 · Start the session

Open Claude Code (or your assistant) at the root of your game's repository.
Take `prompts/convert-game.md` from your clone of this kit, replace the
`{PATH_TO_MATH_KIT_CLONE}` placeholder with the clone's actual path, and
paste the whole prompt. The AI reads the Reglament and the `dice` etalon
from the kit, studies your game, and comes back to you with a knob list —
it will not write code before you approve it.

## 3 · The knobs checkpoint — your main decision

A **knob** is a configurable input of the math: RTP, weights, thresholds,
bounds. Knobs are declared by the model (name, type, range, step, default)
and get their *values* from a platform config — so the business can retune
the game without re-releasing it.

The AI proposes the list; you own it. For each proposed knob check:

- **Is it really an input of the math?** Round outcomes (a rolled face, a
  crash point, a drawn card) are never knobs — they are results, declared
  in the round data instead. Derived quantities are not knobs either: a
  value computable from other knobs would be a second source of truth.
- **Is the range safe?** Every range bound will be settable by an operator
  someday. The justification must convince you: mathematical limits, market
  values, where the default comes from.
- **Which knob carries the declared RTP?** Exactly one knob should be
  marked with the `target-rtp` role — that is what the platform compares
  the measured RTP against. No such knob is legal too, but then the
  platform cannot judge RTP tolerances.
- **Secret knobs.** Internal weights or house parameters can be marked
  secret: never shown in the inspector, never allowed into any client
  response — the platform lints this by the declaration.
- **Composite knobs.** A knob may be a whole structure — a payout table, a
  weight list. Two ways to make one configurable, both legal:
  *enum profiles* (recommended) — a handful of precomputed, certified sets
  the operator picks from; or an *editable structure* — arbitrary values
  within declared per-element bounds, at the price that only the concrete
  pair (model version, config version) can be certified, not "all states".
  The AI must present this fork with a recommendation when it applies.
- **Bets are not knobs.** Currencies, denominations and table limits belong
  to the RGS/operator, outside the bundle; the model declares only the
  technical limits of the `bet` field.

How to answer: edit freely — remove, add, change ranges; ask "why" until
the justification convinces you. Your edits are the truth even where the
AI argued otherwise. When satisfied, approve the list **explicitly** — the
AI is instructed to wait for that.

## 4 · Implementation — what the AI builds

You do not need to review every line, but knowing the shape helps you read
the diff and the report:

- **The factory pair.** The platform entry `createModel(values)` validates
  every incoming value set against the declared knobs — wrong type, out of
  range, missing or undeclared knob, broken cross-invariant — and fails
  with the full violation list; no silent defaults, no clamping. Next to it
  `buildModel(values)` builds from certified values without validation —
  called only by the platform's bake adapter, never by your code.
- **The adapter guard.** `server/model/index.ts` is the platform's
  property: at bake it is regenerated from scratch, so any author exports
  on it silently vanish in the artifact. Its composition is therefore
  locked by a mandatory guard test (see the sicbo etalon's
  `server/model/schema.test.ts`).
- **The contract files.** `schema.json` (knobs, request, round data — the
  machine-readable truth), `config.json` (the starting values +
  presentation metadata), `protocol.md` (the human-readable semantics: the
  written bar is that a reviewer can integrate against the model without
  opening the code).
- **Scenarios and simulations** travel in the bundle and are executed by
  the platform. Simulation worker files have a mandatory two-branch form,
  so the platform can run them on the *published config's* values, not the
  schema defaults; bots derive their bounds from those same values.
- **The key-order rule.** The platform stores knob values in a storage
  that does not preserve object key order. The math must be indifferent to
  the key order of incoming values — anything order-significant lives in
  arrays or an explicit traversal list — and a mandatory test proves that a
  deep reshuffle of the keys changes nothing in the draw.
- **Multiple modes.** If your game has several round modes, they are
  declared as the model's list of round types — exactly the playable ones.
  Be aware what this promises: the platform runs the full simulation
  distance for *each* declared mode, and the declared RTP must hold in
  every mode separately — one diverged mode reddens the gate for the whole
  game.

## 5 · The proof and the checks — what "done" means locally

The AI's submission must include, and its report must show:

1. **The four-way math verification**: a bitwise diff of the calculation
   core; a per-operation fixed-seed match between the old and new model; a
   payout-table comparison across a parameter grid with a large bet; a
   statistical run of millions of rounds on both models. Any divergence is
   listed in the report, never smoothed over.
2. **Green tests** — the game's own tests plus the new mandatory ones: the
   factory validation tests, the two-instances-in-one-process test, the
   adapter guard test, the key-reorder test.
3. **`playtagon check` fully green, no skips** — the canonical CLI check
   from the SDK.
4. **The submission checklist** from the Reglament (its final section),
   walked item by item.

You receive a feature branch and the final report. Product choices the AI
made along the way (ranges, defaults) are listed separately for your
approval. Do not push or merge until the handover is agreed.

## 6 · On the platform: upload → knobs → configs

- **Upload.** The model bundle — your repo's `server/` half — is uploaded
  on the platform's Files page. Acceptance is all-or-nothing: a bundle
  missing any mandatory part, declaring an unknown knob type or role, or
  failing the platform build is rejected with a specific error code and
  leaves no traces; a successful upload creates an immutable model version.
  Uploading again after edits creates the next version — versions are never
  mutated.
- **Knobs.** The Math page draws an inspector from your knob declarations:
  sliders, numbers, selects, structure editors — all from the schema, no
  per-game UI.
- **Configs.** Saving a set of values creates an immutable config version
  pinned to its model version. At save time the platform **probes your
  factory** with exactly those values in an isolated worker: if
  `createModel` throws its validation error, the config is not recorded and
  the editor shows the factory's violation list verbatim (that is why the
  factory must validate cheaply — before any heavy math preparation). When
  a config is *transferred* to a newer model version, every value gets a
  per-element verdict, and any value the transfer had to change parks the
  config in a "transferred, not confirmed" state — playable in the sandbox,
  but the oracle and publication wait for your explicit confirmation.

## 7 · Simulations and the oracle ladder

- **Simulations** run on the pair (model version, config version). Only the
  *canonical* mode — where your own bots generate the requests — certifies;
  the fixed-request mode is a debugging tool. The report carries the
  builtin metric set (RTP, std, volatility, hit frequency, win
  distribution…) computed by the platform's canonical tracker — one
  arithmetic for all games — plus whatever your custom tracker adds
  (typically theory next to fact). The declared RTP is read from the knob
  with the `target-rtp` role. For multi-mode games the report and the RTP
  tolerances are judged per mode.
- **The oracle** is the single judge of readiness: a ladder of machine
  gates over the pair — schema structure, buildability, the canonical
  `playtagon check`, a smoke run driven by your game's own bot, a done
  canonical simulation report, a battery of negative requests (the model
  must reject each with its typed validation error), and config
  confirmation. The first red gate stops the ladder; no gate is passed by
  human decision. The pair's status (draft → playable → simulated →
  publishable) is derived from the last run.

## 8 · Bake

Bake assembles the certified pair into a standalone artifact that runs with
no schema and no validation — the values are baked in as literals via
`buildModel`. Two things matter for you:

- your `model/index.ts` adapter is **regenerated in full** — this is where
  any smuggled author export would break, which the guard test prevents;
- the bake gate re-runs the canonical check on the artifact and proves, on
  the same seed, that the artifact reproduces the pair's math exactly —
  through both the direct path and the simulation worker path.

A model uploaded before the current convention (no factory pair, one-branch
workers) has bake closed until the sources are re-uploaded in the current
form — the error names exactly what to fix.

If any step of 6–8 goes red, look the code up in
[`../troubleshooting.md`](../troubleshooting.md).
