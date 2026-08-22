import type {
  IModel,
  InitResult,
  PlayArgs,
  PlayResult,
  VerifyArgs,
  VerifyResult,
} from "@playtagon/model-sdk";
import type { DiceGameTypes } from "./types.js";
import {
  ROLL_MIN,
  ROLL_MAX,
  TARGET_MIN,
  TARGET_MAX,
  DEFAULT_TARGET,
  RTP,
} from "./config.js";

export type { DiceGameTypes } from "./types.js";

const SCALE = ROLL_MAX - ROLL_MIN + 1; // 10000

function calculateWinChance(target: number, condition: "over" | "under"): number {
  if (condition === "over") {
    return (ROLL_MAX - target) / SCALE;
  }
  return target / SCALE;
}

function calculateMultiplier(winChance: number): number {
  if (winChance <= 0) return 0;
  return RTP / winChance;
}

export const model: IModel<DiceGameTypes> = {
  // Provably-fair: the RGS supplies a committed, deterministic rng buffer. All randomness is
  // rolled on the first (only) sub-round and no cross-round global context is kept — the roll
  // history now lives client-side (session state). Fairness games must implement verify().
  rngMode: "fairness",

  init(): InitResult<DiceGameTypes> {
    return {
      initData: {
        rollMin: ROLL_MIN,
        rollMax: ROLL_MAX,
        targetMin: TARGET_MIN,
        targetMax: TARGET_MAX,
        defaultTarget: DEFAULT_TARGET,
        rtp: RTP,
      },
    };
  },

  play(args: PlayArgs<DiceGameTypes>): PlayResult<DiceGameTypes> {
    const { gameRequest, rng } = args;
    const { target, condition, bet } = gameRequest;

    if (target < TARGET_MIN || target > TARGET_MAX) {
      throw new Error(`Invalid target: ${target}. Must be between ${TARGET_MIN} and ${TARGET_MAX}.`);
    }

    if (condition !== "over" && condition !== "under") {
      throw new Error(`Invalid condition: ${condition}. Must be "over" or "under".`);
    }

    const roll = rng.getInt(ROLL_MIN, ROLL_MAX);
    const winChance = calculateWinChance(target, condition);
    const multiplier = calculateMultiplier(winChance);

    const isWin =
      condition === "over" ? roll > target : roll < target;

    const win = isWin ? Math.round(bet * multiplier) : 0;

    return {
      bet,
      win,
      roundComplete: true,
      roundContext: null,
      globalContext: null,
      playData: {
        roll,
        target,
        condition,
        multiplier,
        win,
      },
      replayData: {
        roll,
        target,
        condition,
        multiplier,
        bet,
        win,
      },
    };
  },

  // Re-derive the round's roll from the committed rng buffer for the verification viewer.
  // Consumes RNG identically to play() (exactly one getInt draw) so the two stay in lockstep.
  verify({ rng }: VerifyArgs): VerifyResult<DiceGameTypes> {
    const roll = rng.getInt(ROLL_MIN, ROLL_MAX);
    return { roll };
  },
};

export default model;
