import type { IScenarioValidator } from "@playtagon/model-sdk";
import type { DiceGameTypes, DiceGameRequest, DicePlayData } from "../model/types.js";

// Сценарии Debug Tool (12-scenarios.md): brute-force по RNG до исхода, который
// примет validate(). Раунд дайса одношаговый и без контекстов, поэтому каждый
// сценарий применим всегда. Валидаторы судят исход через реальную механику
// (соотношение roll ↔ target ↔ condition из запроса), а не по полю win: сценарий
// «Win» не найдётся у модели, у которой сломано само сравнение.
//
// Fairness-режим не подменяет закоммиченные сиды: Debug RGS продвигает nonce,
// пока поток не даст нужный исход, — форсированный раунд остаётся верифицируемым
// (21-fairness-game.md «Сценарии»).
//
// «Отказ невалидного запроса» сценарием не выражается по построению механизма:
// поиск исполняет play() с запросом, который прислал клиент, а невалидный запрос
// модель отвергает исключением ДО розыгрыша — RNG-поиску нечего перебирать.
// Отказ покрыт юнит-тестами модели (model/factory.test.ts) и negative-воротами
// оракула devРГС.

function wins(request: DiceGameRequest, playData: DicePlayData): boolean {
  return request.condition === "over"
    ? playData.roll > request.target
    : playData.roll < request.target;
}

function always(): boolean {
  return true;
}

const scenarios: IScenarioValidator<DiceGameTypes>[] = [
  {
    name: "Win",
    isApplicable: always,
    validate: (gameRequest, _before, _after, playData) => wins(gameRequest, playData),
  },
  {
    name: "Lose",
    isApplicable: always,
    validate: (gameRequest, _before, _after, playData) => !wins(gameRequest, playData),
  },
  {
    // Граница, которой protocol.md посвящает отдельный раздел: roll === target
    // проигрывает при ОБОИХ направлениях (over требует строго больше, under — строго меньше).
    name: "Roll = target (edge, both lose)",
    isApplicable: always,
    validate: (gameRequest, _before, _after, playData) => playData.roll === gameRequest.target,
  },
  {
    // Минимальные зазоры: для over target+1 — выигрыш с наименьшим запасом,
    // для under — почти-попадание; target−1 зеркально.
    name: "Roll = target + 1 (narrow over)",
    isApplicable: always,
    validate: (gameRequest, _before, _after, playData) => playData.roll === gameRequest.target + 1,
  },
  {
    name: "Roll = target - 1 (narrow under)",
    isApplicable: always,
    validate: (gameRequest, _before, _after, playData) => playData.roll === gameRequest.target - 1,
  },
  {
    // Края области броска: 0 — гарантированный проигрыш over и выигрыш under,
    // 9999 — зеркально (target всегда внутри [target_min, target_max] ⊂ (0, 9999)).
    name: "Roll 0 (min)",
    isApplicable: always,
    validate: (_gameRequest, _before, _after, playData) => playData.roll === 0,
  },
  {
    name: "Roll 9999 (max)",
    isApplicable: always,
    validate: (_gameRequest, _before, _after, playData) => playData.roll === 9999,
  },
  {
    // По образцу test-game «Sector 6 (impossible)»: недостижимый исход для проверки
    // остановки и переключения поиска — брошенный roll не бывает вне [0, 9999].
    name: "Roll 10000 (impossible)",
    isApplicable: always,
    validate: (_gameRequest, _before, _after, playData) => playData.roll === 10000,
  },
];

export default scenarios;
