import { describe, it, expect } from "vitest";
import { NORMAL_TIMING, TURBO_TIMING, timingFor, AUTO_GAP_MS, AUTO_GAP_TURBO_MS } from "./turbo";

describe("тайминги турбо", () => {
  it("в обычном режиме отдаёт обычные тайминги", () => {
    expect(timingFor(false)).toBe(NORMAL_TIMING);
  });

  it("в турбо отдаёт турбо-тайминги", () => {
    expect(timingFor(true)).toBe(TURBO_TIMING);
  });

  it("турбо УСКОРЯЕТ физику, а не замедляет", () => {
    expect(TURBO_TIMING.timeScale).toBeGreaterThan(NORMAL_TIMING.timeScale);
  });

  it("обычный режим идёт в реальном времени", () => {
    // Иначе «обычная» скорость незаметно отличалась бы от той, под которую
    // подбирали физику.
    expect(NORMAL_TIMING.timeScale).toBe(1);
  });

  it("турбо режет паузу после оседания и полёт", () => {
    expect(TURBO_TIMING.settleHoldSec).toBeLessThan(NORMAL_TIMING.settleHoldSec);
    expect(TURBO_TIMING.flySec).toBeLessThan(NORMAL_TIMING.flySec);
    expect(TURBO_TIMING.flyStagger).toBeLessThan(NORMAL_TIMING.flyStagger);
  });

  it("паузы остаются положительными — иначе кубики не видно вовсе", () => {
    for (const t of [NORMAL_TIMING, TURBO_TIMING]) {
      expect(t.settleHoldSec).toBeGreaterThan(0);
      expect(t.flySec).toBeGreaterThan(0);
      expect(t.timeScale).toBeGreaterThan(0);
    }
  });

  it("пауза между авто-раундами в турбо короче", () => {
    expect(AUTO_GAP_TURBO_MS).toBeLessThan(AUTO_GAP_MS);
    expect(AUTO_GAP_TURBO_MS).toBeGreaterThan(0);
  });

  it("физика в турбо ровно вдвое быстрее — решение Павла", () => {
    expect(TURBO_TIMING.timeScale).toBe(2);
  });
});
