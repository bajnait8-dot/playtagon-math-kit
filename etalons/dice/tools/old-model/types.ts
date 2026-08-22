import type { IGameTypes } from "@playtagon/model-sdk";

export type DiceCondition = "over" | "under";

export interface DiceInitData {
  rollMin: number;
  rollMax: number;
  targetMin: number;
  targetMax: number;
  defaultTarget: number;
  rtp: number;
}

export interface DiceVerifyData {
  roll: number;
}

export interface DicePlayData {
  roll: number;
  target: number;
  condition: DiceCondition;
  multiplier: number;
  win: number;
}

export interface DiceGameRequest {
  target: number;
  condition: DiceCondition;
  bet: number;
}

export interface DiceReplayData {
  roll: number;
  target: number;
  condition: DiceCondition;
  multiplier: number;
  bet: number;
  win: number;
}

export interface DiceGameTypes extends IGameTypes {
  initData: DiceInitData;
  playData: DicePlayData;
  gameRequest: DiceGameRequest;
  roundContext: null;
  globalContext: null;
  replayData: DiceReplayData;
  verifyData: DiceVerifyData;
}
