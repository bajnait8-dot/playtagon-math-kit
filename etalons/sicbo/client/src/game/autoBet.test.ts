import { describe, it, expect, vi } from "vitest";
import { createAutoBet, type AutoBetDeps } from "./autoBet";

/**
 * Заглушка ядра автоплея. Повторяет то, что делает AutoplayControl: САМ ведёт
 * счётчик раундов и САМ останавливается по лимитам, когда хост сообщает
 * результат раунда (reportResult).
 *
 * Именно это и было источником бага: петля вела ВТОРОЙ счётчик и не смотрела,
 * остановило ли себя ядро.
 */
function fakeCore(count: number, opts: { lossLimit?: number; winLimit?: number } = {}) {
  let active = true;
  let left = count;
  let netLoss = 0;
  return {
    get isActive() { return active; },
    left: () => left,
    stop() { active = false; left = 0; },
    /** Ровно логика AutoplayControl.reportResult. */
    reportResult(win: number, bet: number) {
      if (!active) return;
      netLoss += bet - win;
      if (Number.isFinite(left)) left = Math.max(0, left - 1);
      const winHit = opts.winLimit !== undefined && win >= opts.winLimit * bet;
      const lossHit = opts.lossLimit !== undefined && netLoss >= opts.lossLimit * bet;
      if (left <= 0 || winHit || lossHit) this.stop();
    },
  };
}

/** Петля с управляемыми раундами: каждый play/rebet отдаёт заданный исход. */
function harness(core: ReturnType<typeof fakeCore>, outcomes: Array<{ win: number; bet: number }>, over: Partial<AutoBetDeps> = {}) {
  const rounds: string[] = [];
  let i = 0;
  const next = (kind: string) => {
    rounds.push(kind);
    const o = outcomes[Math.min(i, outcomes.length - 1)]!;
    i++;
    // Раунд отыгран — хост сообщает исход ядру, как это делает onRoundOver.
    core.reportResult(o.win, o.bet);
  };
  const deps: AutoBetDeps = {
    autoplay: core,
    hasBets: () => true,
    canRebet: () => true,
    play: async () => next("play"),
    rebet: async () => next("rebet"),
    gapMs: () => 0,
    onError: vi.fn(),
    ...over,
  };
  return { deps, rounds };
}

describe("автобет", () => {
  it("крутит ровно заданное число раундов", async () => {
    const core = fakeCore(3);
    const { deps, rounds } = harness(core, [{ win: 0, bet: 1 }]);
    await createAutoBet(deps).start(3);
    // Первый — play (то, что расставил игрок), остальные — rebet.
    expect(rounds).toEqual(["play", "rebet", "rebet"]);
  });

  it("СЧЁТЧИК ВЕДЁТ ЯДРО — петля не крутит лишний раунд", async () => {
    // Регрессия: петля вела свой auto.left и делала на раунд БОЛЬШЕ, чем
    // насчитало ядро (оба уменьшали счётчик на один и тот же раунд).
    const core = fakeCore(2);
    const { deps, rounds } = harness(core, [{ win: 0, bet: 1 }]);
    await createAutoBet(deps).start(2);
    expect(rounds).toHaveLength(2);
    expect(core.left()).toBe(0);
  });

  it("останавливается по лимиту ПРОИГРЫША, не докрутив счётчик", async () => {
    // Лимит 2× ставки: два проигрыша по 1 → netLoss = 2 → стоп на 2-м раунде,
    // хотя заказано 10.
    const core = fakeCore(10, { lossLimit: 2 });
    const { deps, rounds } = harness(core, [{ win: 0, bet: 1 }]);
    await createAutoBet(deps).start(10);
    expect(rounds).toHaveLength(2);
    expect(core.isActive).toBe(false);
  });

  it("останавливается по лимиту ОДИНОЧНОГО ВЫИГРЫША", async () => {
    const core = fakeCore(10, { winLimit: 5 });
    const { deps, rounds } = harness(core, [{ win: 50, bet: 1 }]);
    await createAutoBet(deps).start(10);
    expect(rounds).toHaveLength(1);
    expect(core.isActive).toBe(false);
  });

  it("бесконечный автоплей крутится, пока его не остановят", async () => {
    const core = fakeCore(Infinity);
    const { deps, rounds } = harness(core, [{ win: 0, bet: 1 }]);
    const auto = createAutoBet(deps);
    // Через 5 раундов гасим извне — как тап по кнопке.
    const orig = deps.rebet;
    deps.rebet = async () => {
      await orig();
      if (rounds.length >= 5) auto.stop();
    };
    await auto.start(Infinity);
    expect(rounds).toHaveLength(5);
  });

  it("не стартует без ставок и гасит автоплей", async () => {
    const core = fakeCore(10);
    const { deps, rounds } = harness(core, [{ win: 0, bet: 1 }], { hasBets: () => false });
    const onEmpty = vi.fn();
    await createAutoBet({ ...deps, onEmpty }).start(10);
    expect(rounds).toEqual([]);
    expect(onEmpty).toHaveBeenCalled();
    expect(core.isActive).toBe(false);
  });

  it("останавливается, когда на повтор не хватает баланса", async () => {
    const core = fakeCore(10);
    const { deps, rounds } = harness(core, [{ win: 0, bet: 1 }], { canRebet: () => false });
    await createAutoBet(deps).start(10);
    // Первый раунд прошёл, повторить нечем — молча выходим.
    expect(rounds).toEqual(["play"]);
    expect(core.isActive).toBe(false);
  });

  it("stop() обрывает петлю между раундами", async () => {
    const core = fakeCore(10);
    const { deps, rounds } = harness(core, [{ win: 0, bet: 1 }]);
    const auto = createAutoBet(deps);
    const orig = deps.rebet;
    deps.rebet = async () => { await orig(); auto.stop(); };
    await auto.start(10);
    expect(rounds).toEqual(["play", "rebet"]);
  });

  it("сбой раунда не вешает петлю — автоплей гаснет", async () => {
    const core = fakeCore(10);
    const { deps, rounds } = harness(core, [{ win: 0, bet: 1 }]);
    const onError = vi.fn();
    await createAutoBet({
      ...deps, onError,
      rebet: async () => { throw new Error("сеть"); },
    }).start(10);
    expect(rounds).toEqual(["play"]);
    expect(onError).toHaveBeenCalled();
    expect(core.isActive).toBe(false);
  });

  it("РЕГРЕССИЯ: заглушенная кнопка не должна съедать счётчик раундов", async () => {
    // Найдено в браузере: syncBetDependent звал dim(u.autoplay) на каждый
    // раунд (фаза уходит из 'betting' со снятыми ставками), ядро попадало в
    // 'disabled', и reportResult выходил по проверке `current !== 'active'`.
    // Счётчик замирал, автоплей останавливался после ПЕРВОГО раунда.
    //
    // Здесь это воспроизведено на уровне контракта: ядро, которое перестало
    // быть активным, обязано оборвать петлю, а не крутить её вечно.
    const core = fakeCore(5);
    const { deps, rounds } = harness(core, [{ win: 0, bet: 1 }]);
    const orig = deps.play;
    deps.play = async () => {
      await orig();
      core.stop();          // «кнопку заглушили» — сессия оборвана извне
    };
    await createAutoBet(deps).start(5);
    expect(rounds).toEqual(["play"]);
  });

  it("пауза между раундами берётся из gapMs на КАЖДОМ раунде", async () => {
    // Турбо переключают ПРЯМО ВО ВРЕМЯ автоплея — пауза обязана
    // перечитываться, а не замораживаться на старте.
    const core = fakeCore(3);
    const gaps: number[] = [];
    const { deps } = harness(core, [{ win: 0, bet: 1 }]);
    let call = 0;
    await createAutoBet({
      ...deps,
      gapMs: () => { const v = call++ === 0 ? 900 : 300; gaps.push(v); return v; },
    }).start(3);
    expect(gaps).toEqual([900, 300]);
  });
});
