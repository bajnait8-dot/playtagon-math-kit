# Sic Bo

Classic three-dice table game. The player spreads chips across the zones of the
table, the server rolls three dice, and every occupied zone settles
independently against that one roll. Bet, roll, payout — one round, no phases,
no state carried between rounds.

## Genre markers

```yaml
mechanics: [dice, table, multi-bet, instant-win]
genre: table
rounds: single
volatility: player-controlled
zones: 50
provably_fair: true
```

| Marker | Value |
|---|---|
| Round class | atomic — one set of bets, one roll, one settlement |
| State between rounds | none |
| Sub-rounds, bonuses, free spins | none |
| Bets per round | 1 to 50, one per occupied zone |
| Who sets the volatility | the player, by choosing zones |
| Payout range | 1:1 on small/big up to 180:1 on a specific triple |
| Provably fair | yes, `verify()` reproduces the roll |

## How it plays

The table carries 50 zones: small/big, any triple and each specific triple,
each double, every total from 4 to 17, each single face, and the fifteen
two-face combinations. The player places chips on as many zones as they like,
then rolls.

Randomness decides exactly one thing — which three faces came up. Everything
else follows deterministically. Each zone is settled on its own, so a single
roll can win several zones at once: 3,3,3 wins `triple_any`, `triple_3` and
`double_3` together. That is the canon of the game, not a double payout for
the same event. The round result is the sum of the winning zones.

## Volatility in the player's hands

The zone menu is the volatility control. Small/big pays 1:1 and wins on close
to half the rolls; a specific triple pays 180:1 and lands once in 216. Both
live on the same table with the same dice, and the player mixes them freely
within one round — that is why the game has held catalogue space for decades
without separate bet modes.

## Configurable

Five knobs (`server/schema.json`), all of them payout coefficients: the
per-total table `total_payouts` (a composite `object` knob — one coefficient
per sum from 4 to 17), `triple_specific_payout`, `triple_any_payout`,
`double_payout` and `combo_payout`. Coefficients are profit, excluding the
returned stake.

The declared bounds of every knob are the mathematical limits of the game, not
round numbers: a zone may not be configured to pay above 100% RTP. That is
locked by a test — `server/model/schema.test.ts` derives each ceiling from all
216 outcomes and compares it with the declaration.

There is no RTP knob. RTP is derived from the payout table, not set next to it:
a second source of truth about the math is exactly what the convention forbids.
The roll is not a knob either — it is the round outcome, declared in `playData`.
The model has no secret knobs.

## Provably fair

The RGS fixes the randomness buffer before the round, and `verify()` re-derives
the same three faces from it. The player can check at any time that the dice
were not chosen after the bets. Message order is in `server/protocol.md`.

## Reference notes

Sic Bo is the second reference game in this repository, next to `dice`. Two
things are worth copying from it specifically:

- **composite knobs** — `total_payouts` is an `object` knob with declared
  element bounds, and its meaning invariants are checked by the factory
  (Reglament 5.7);
- **the adapter guard test** — `server/model/schema.test.ts`, block
  "адаптер `model/index.ts` — строго конвенционный": it locks the adapter's
  export set to `{default, knobValues, model}`, forbids `export … from` in its
  source, and checks that no consumer under `server/` imports anything but
  `knobValues` from it. The Reglament requires this test in the delivery
  checklist (13.2) because the defect it catches passes the whole dev loop
  green and only surfaces at the bake gate.
