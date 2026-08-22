import { describe, it, expect } from "vitest";
import { PAYOUTS } from "./config.js";
import { settleRound } from "./math.js";
import type { SicBoBet, SicBoRoll } from "./types.js";

// Правки против доконверсионной версии — две, обе следствие конверсии:
//   1) settleRound принимает таблицу коэффициентов третьим аргументом
//      (источник значений стал ручкой, сама арифметика не тронута) — во всех
//      вызовах подставлен PAYOUTS, то есть ровно те коэффициенты, на которых
//      тест был написан и на которых считались его ожидаемые числа;
//   2) блок «validateBets — три отдельные проверки» УДАЛЁН вместе с самой
//      функцией: лимиты ставок (минимум на зону, максимум на раунд, баланс) —
//      продуктовые границы, а их объявляет РГС/оператор вне бандла модели
//      (Регламент 5.6); модель проверяет только технические пределы поля
//      amount, и они проверяются схемой запроса (см. request.test.ts).
//      Баланс РГС проверяет сам. Проверки состава запроса, которые остались
//      обязанностью модели (пустой список, неизвестная зона, дубль зоны),
//      переехали в request.test.ts как нарушения секции request.
// Все ожидаемые ЧИСЛА сохранены дословно.

describe("settleRound — расчёт раунда по списку ставок", () => {
  it("считает выплату по каждой ставке и суммирует", () => {
    const bets: SicBoBet[] = [
      { type: "small", amount: 100 },      // 4+5+2=11 → BIG, проигрыш
      { type: "total_11", amount: 50 },    // выигрыш 6:1 → возврат 7× = 350
    ];
    const roll: SicBoRoll = [4, 5, 2];
    const r = settleRound(bets, roll, PAYOUTS);

    expect(r.totalBet).toBe(150);
    expect(r.totalWin).toBe(350);
    expect(r.wins).toHaveLength(1);
    expect(r.wins[0]!.type).toBe("total_11");
  });

  it("проигрышный раунд: выплата 0, ставки не возвращаются", () => {
    const r = settleRound([{ type: "triple_any", amount: 100 }], [1, 2, 3], PAYOUTS);
    expect(r.totalWin).toBe(0);
    expect(r.wins).toHaveLength(0);
  });

  it("категория броска считается верно", () => {
    expect(settleRound([], [1, 1, 1], PAYOUTS).category).toEqual({ total: 3, kind: "triple" });
    expect(settleRound([], [1, 2, 3], PAYOUTS).category).toEqual({ total: 6, kind: "small" });
    expect(settleRound([], [6, 5, 4], PAYOUTS).category).toEqual({ total: 15, kind: "big" });
  });

  it("один бросок может выиграть по нескольким зонам сразу", () => {
    // 3,3,3: triple_any + triple_3 + double_3 выигрывают одновременно —
    // это канон Sic Bo, а не двойная выплата за одно и то же.
    const bets: SicBoBet[] = [
      { type: "triple_any", amount: 10 },
      { type: "triple_3", amount: 10 },
      { type: "double_3", amount: 10 },
    ];
    const r = settleRound(bets, [3, 3, 3], PAYOUTS);
    expect(r.wins).toHaveLength(3);
    expect(r.totalWin).toBe(310 + 1810 + 110);
  });

  it("исходные ставки сохраняются в ответе", () => {
    const bets: SicBoBet[] = [{ type: "big", amount: 25 }];
    const r = settleRound(bets, [6, 6, 5], PAYOUTS);
    expect(r.bets).toEqual(bets);
    expect(r.roll).toEqual([6, 6, 5]);
  });
});
