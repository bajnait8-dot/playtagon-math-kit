import { describe, it, expect, vi } from "vitest";
import { createGameLoop } from "./gameLoop";
import { createBetState } from "./betState";
import type { SicBoBet, SicBoPlayData } from "../../../server/model/types.js";

function fakePlayData(totalWin = 0, totalBet = 100): SicBoPlayData {
  return {
    roll: [1, 2, 3], bets: [], wins: [], totalBet, totalWin,
    category: { total: 6, kind: "small" },
  };
}

/**
 * Баланс в реальной игре приходит ОТ СЕРВЕРА после каждого раунда (res.balance),
 * то есть к моменту проверки REBET он уже отражает списание ставки и выплату.
 * Мок повторяет это: ставку списываем, выигрыш начисляем.
 */
function setup(opts: { balance?: number; win?: number } = {}) {
  const bets = createBetState();
  let balance = opts.balance ?? 100_000;
  const play = vi.fn(async (b: SicBoBet[]) => {
    const staked = b.reduce((s, x) => s + x.amount, 0);
    const win = opts.win ?? 0;
    balance = balance - staked + win;
    return fakePlayData(win, staked);
  });
  const loop = createGameLoop({
    bets,
    play,
    balance: () => balance,
    minBet: 10,
    // Хост снимает busy, досмотрев раунд, — так делает main.ts в onRoundOver.
    // Без этого петля осталась бы занятой навсегда, и REBET/NEW BET не
    // сработали бы: это и есть проверяемое поведение.
    onRoundOver: () => loop.setBusy(false),
  });
  return { loop, bets, play };
}

describe("gameLoop — три фазы", () => {
  it("стартует в betting", () => {
    expect(setup().loop.phase()).toBe("betting");
  });

  it("play переводит betting → rolling → result", async () => {
    const { loop, bets } = setup();
    bets.place("small", 100);
    const p = loop.play();
    expect(loop.phase()).toBe("rolling");
    await p;
    expect(loop.phase()).toBe("result");
  });

  it("без ставок play не запускается", async () => {
    const { loop, play } = setup();
    await loop.play();
    expect(play).not.toHaveBeenCalled();
    expect(loop.phase()).toBe("betting");
  });

  it("повторный play в фазе rolling не шлёт второй запрос", async () => {
    const { loop, bets, play } = setup();
    bets.place("small", 100);
    const first = loop.play();
    await loop.play();          // прилетел, пока идёт бросок
    await first;
    expect(play).toHaveBeenCalledTimes(1);
  });

  it("newBet возвращает в betting и чистит стол", async () => {
    const { loop, bets } = setup();
    bets.place("small", 100);
    await loop.play();
    loop.newBet();
    expect(loop.phase()).toBe("betting");
    expect(bets.total()).toBe(0);
  });

  it("REBET восстанавливает расстановку И сразу бросает", async () => {
    const { loop, bets, play } = setup();
    bets.place("small", 100);
    bets.place("big", 50);
    await loop.play();

    await loop.rebet();
    expect(play).toHaveBeenCalledTimes(2);
    expect(loop.phase()).toBe("result");
    // расстановка та же самая
    expect(play.mock.calls[1]![0]).toEqual(play.mock.calls[0]![0]);
  });

  it("REBET недоступен, когда на повтор не хватает баланса", async () => {
    // 120 − 100 (ставка) = 20; на повтор нужно снова 100
    const { loop, bets } = setup({ balance: 120 });
    bets.place("small", 100);
    await loop.play();
    expect(loop.canRebet()).toBe(false);
  });

  it("REBET доступен, когда баланса хватает", async () => {
    const { loop, bets } = setup({ balance: 100_000 });
    bets.place("small", 100);
    await loop.play();
    expect(loop.canRebet()).toBe(true);
  });

  it("REBET при нехватке баланса НЕ шлёт запрос", async () => {
    const { loop, bets, play } = setup({ balance: 120 });
    bets.place("small", 100);
    await loop.play();
    await loop.rebet();
    expect(play).toHaveBeenCalledTimes(1);
  });

  it("до первого раунда REBET недоступен", () => {
    expect(setup().loop.canRebet()).toBe(false);
  });

  it("в фазах rolling и result ставки не принимаются", async () => {
    const { loop, bets } = setup();
    bets.place("small", 100);
    const p = loop.play();
    expect(loop.acceptsBets()).toBe(false);
    await p;
    expect(loop.acceptsBets()).toBe(false);
    loop.newBet();
    expect(loop.acceptsBets()).toBe(true);
  });

  it("сбой сервера возвращает в betting, а не вешает раунд", async () => {
    const bets = createBetState();
    bets.place("small", 100);
    const onError = vi.fn();
    const loop = createGameLoop({
      bets,
      play: vi.fn(async () => { throw new Error("network"); }),
      balance: () => 100_000,
      minBet: 10,
      onError,
    });
    await loop.play();
    expect(loop.phase()).toBe("betting");
    expect(onError).toHaveBeenCalled();
  });

  it("после сбоя ставки НЕ теряются — игрок может повторить", async () => {
    const bets = createBetState();
    bets.place("small", 100);
    const loop = createGameLoop({
      bets,
      play: vi.fn(async () => { throw new Error("network"); }),
      balance: () => 100_000,
      minBet: 10,
      onError: vi.fn(),
    });
    await loop.play();
    expect(bets.total()).toBe(100);
  });

  it("onRoundOver отдаёт итог раунда", async () => {
    const bets = createBetState();
    bets.place("small", 100);
    const onRoundOver = vi.fn();
    const loop = createGameLoop({
      bets,
      play: vi.fn(async () => fakePlayData(350)),
      balance: () => 100_000,
      minBet: 10,
      onRoundOver,
    });
    await loop.play();
    expect(onRoundOver).toHaveBeenCalledTimes(1);
    expect(onRoundOver.mock.calls[0]![0].totalWin).toBe(350);
  });

  it("onPhase сообщает о каждой смене фазы", async () => {
    const bets = createBetState();
    bets.place("small", 100);
    const onPhase = vi.fn();
    const loop = createGameLoop({
      bets,
      play: vi.fn(async () => fakePlayData()),
      balance: () => 100_000,
      minBet: 10,
      onPhase,
    });
    await loop.play();
    loop.setBusy(false);   // хост досмотрел раунд
    loop.newBet();
    expect(onPhase.mock.calls.map((c) => c[0])).toEqual(["rolling", "result", "betting"]);
  });
});

/**
 * Раунд не считается законченным, пока ПРЕДСТАВЛЕНИЕ его отыгрывает: фаза
 * 'result' наступает по ответу сервера, когда кубики ещё летят. Без этого
 * замка частые тапы по REBET шлют раунды внахлёст.
 */
describe("gameLoop — замок на время отыгрыша", () => {
  function setupNoAutoRelease() {
    const bets = createBetState();
    const play = vi.fn(async () => fakePlayData());
    const loop = createGameLoop({
      bets, play,
      balance: () => 100_000,
      minBet: 10,
      // Хост НЕ снимает busy — имитируем «раунд ещё показывается».
    });
    return { loop, bets, play };
  }

  it("после броска петля ЗАНЯТА, пока хост не досмотрел раунд", async () => {
    const { loop, bets } = setupNoAutoRelease();
    bets.place("small", 100);
    await loop.play();
    expect(loop.phase()).toBe("result");
    expect(loop.isBusy()).toBe(true);
  });

  it("REBET не шлёт запрос, пока раунд отыгрывается", async () => {
    const { loop, bets, play } = setupNoAutoRelease();
    bets.place("small", 100);
    await loop.play();
    await loop.rebet();
    await loop.rebet();
    expect(play).toHaveBeenCalledTimes(1);
  });

  it("NEW BET не чистит стол, пока раунд отыгрывается", async () => {
    const { loop, bets } = setupNoAutoRelease();
    bets.place("small", 100);
    await loop.play();
    loop.newBet();
    expect(loop.phase()).toBe("result");
    expect(bets.total()).toBe(100);
  });

  it("после setBusy(false) обе кнопки снова работают", async () => {
    const { loop, bets, play } = setupNoAutoRelease();
    bets.place("small", 100);
    await loop.play();
    loop.setBusy(false);
    await loop.rebet();
    expect(play).toHaveBeenCalledTimes(2);
  });

  it("сбой сервера снимает замок сам — иначе игра залипнет навсегда", async () => {
    const bets = createBetState();
    bets.place("small", 100);
    const loop = createGameLoop({
      bets,
      play: vi.fn(async () => { throw new Error("network"); }),
      balance: () => 100_000,
      minBet: 10,
      onError: vi.fn(),
    });
    await loop.play();
    expect(loop.isBusy()).toBe(false);
  });

  it("onBusy сообщает хосту обе смены", async () => {
    const bets = createBetState();
    bets.place("small", 100);
    const onBusy = vi.fn();
    const loop = createGameLoop({
      bets,
      play: vi.fn(async () => fakePlayData()),
      balance: () => 100_000,
      minBet: 10,
      onBusy,
    });
    await loop.play();
    loop.setBusy(false);
    expect(onBusy.mock.calls.map((c) => c[0])).toEqual([true, false]);
  });
});
