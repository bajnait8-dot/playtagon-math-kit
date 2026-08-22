import { describe, it, expect } from "vitest";
import { createModel, RequestValidationError } from "./playtagon.js";
import { DEFAULT_KNOB_VALUES } from "./config.js";
import type { IRng } from "@playtagon/model-sdk";

const rng: IRng = { getInt: () => 1 };
const model = createModel(structuredClone(DEFAULT_KNOB_VALUES));

/** Прогон раунда с произвольным (в том числе заведомо кривым) запросом. */
function play(gameRequest: unknown) {
  return model.play({
    roundType: "main",
    gameRequest: gameRequest as never,
    rng,
    roundContext: null,
    globalContext: null,
  });
}

function violationsOf(gameRequest: unknown): string[] {
  try {
    play(gameRequest);
  } catch (e) {
    if (e instanceof Error && e.name === "RequestValidationError") {
      return (e as RequestValidationError).violations;
    }
    throw e;
  }
  throw new Error("ожидался RequestValidationError, но раунд прошёл");
}

describe("секция request — отказ до розыгрыша", () => {
  it("валидный запрос проходит", () => {
    expect(() => play({ bets: [{ type: "small", amount: 100 }] })).not.toThrow();
  });

  it("пустой список ставок отвергается (minItems: 1)", () => {
    expect(violationsOf({ bets: [] }).join("; ")).toMatch(/минимум 1/);
  });

  it("отсутствующее обязательное поле отвергается", () => {
    expect(violationsOf({}).join("; ")).toMatch(/отсутствует обязательное поле "bets"/);
  });

  it("необъявленное лишнее поле отвергается (additionalProperties: false)", () => {
    const v = violationsOf({ bets: [{ type: "small", amount: 10 }], cheat: true });
    expect(v.join("; ")).toMatch(/поле "cheat" не объявлено схемой/);
  });

  it("лишнее поле ВНУТРИ ставки отвергается", () => {
    const v = violationsOf({ bets: [{ type: "small", amount: 10, multiplier: 99 }] });
    expect(v.join("; ")).toMatch(/bets\[0\]: поле "multiplier" не объявлено схемой/);
  });

  it("неизвестная зона стола отвергается", () => {
    const v = violationsOf({ bets: [{ type: "combo_99", amount: 10 }] });
    expect(v.join("; ")).toMatch(/bets\[0\]\.type.*неизвестная зона стола/);
  });

  it("дубль зоны отвергается — фишки складывает клиент", () => {
    const v = violationsOf({
      bets: [{ type: "small", amount: 10 }, { type: "small", amount: 20 }],
    });
    expect(v.join("; ")).toMatch(/bets\[1\]\.type.*зона уже занята/);
  });

  it("request не-объект отвергается", () => {
    expect(violationsOf(null).join("; ")).toMatch(/должен быть объектом/);
    expect(violationsOf([]).join("; ")).toMatch(/должен быть объектом/);
  });

  it("bets не-массив отвергается", () => {
    expect(violationsOf({ bets: { type: "small", amount: 1 } }).join("; "))
      .toMatch(/"bets" должен быть массивом/);
  });
});

describe("технические пределы поля amount (Регламент 5.6)", () => {
  it("нулевая ставка отвергается — минимум строго больше нуля", () => {
    expect(violationsOf({ bets: [{ type: "small", amount: 0 }] }).join("; "))
      .toMatch(/amount = 0 меньше объявленного minimum 1/);
  });

  it("отрицательная ставка отвергается — до конверсии она давала отрицательную выплату", () => {
    const v = violationsOf({ bets: [{ type: "small", amount: -100 }] });
    expect(v.join("; ")).toMatch(/amount = -100 меньше объявленного minimum 1/);
  });

  it("нецелая ставка отвергается", () => {
    expect(violationsOf({ bets: [{ type: "small", amount: 10.5 }] }).join("; "))
      .toMatch(/amount объявлен integer/);
  });

  it("ставка выше потолка представимости отвергается", () => {
    const v = violationsOf({ bets: [{ type: "small", amount: Number.MAX_SAFE_INTEGER + 10 }] });
    expect(v.join("; ")).toMatch(/больше объявленного maximum/);
  });

  it("NaN и Infinity отвергаются", () => {
    expect(violationsOf({ bets: [{ type: "small", amount: NaN }] }).join("; "))
      .toMatch(/должен быть числом/);
    expect(violationsOf({ bets: [{ type: "small", amount: Infinity }] }).join("; "))
      .toMatch(/должен быть конечным числом/);
  });

  it("ставка строкой отвергается", () => {
    expect(violationsOf({ bets: [{ type: "small", amount: "100" }] }).join("; "))
      .toMatch(/amount должен быть числом, получен string/);
  });

  it("ставка ровно 1 принимается — граница включительна", () => {
    expect(() => play({ bets: [{ type: "small", amount: 1 }] })).not.toThrow();
  });
});

describe("все нарушения запроса приходят одним списком", () => {
  it("несколько дефектов сразу — каждый со своим путём", () => {
    const v = violationsOf({
      bets: [
        { type: "small", amount: 0 },        // ниже minimum
        { type: "combo_99", amount: 10 },    // неизвестная зона
        { type: "big", amount: 1.5 },        // нецелая
      ],
      extra: 1,                              // лишнее поле
    });
    expect(v.length).toBe(4);
    const joined = v.join(" | ");
    expect(joined).toMatch(/bets\[0\]\.amount/);
    expect(joined).toMatch(/bets\[1\]\.type/);
    expect(joined).toMatch(/bets\[2\]\.amount/);
    expect(joined).toMatch(/"extra"/);
  });
});

describe("ответ модели проходит собственную схему на любом входе", () => {
  it("либо валидный PlayResult, либо исключение — третьего нет", () => {
    const inputs: unknown[] = [
      null, undefined, [], "строка", 42,
      {}, { bets: [] }, { bets: [{ type: "small", amount: -1 }] },
      { bets: [{ type: "нет такой зоны", amount: 10 }] },
    ];
    for (const input of inputs) {
      let result: unknown;
      let threw = false;
      try {
        result = play(input);
      } catch (e) {
        threw = true;
        expect((e as Error).name).toBe("RequestValidationError");
      }
      if (!threw) {
        const r = result as { bet: number; win: number };
        expect(Number.isInteger(r.bet)).toBe(true);
        expect(r.bet).toBeGreaterThan(0);
        expect(r.win).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
