import { describe, it, expect } from "vitest";
import { createModel, buildModel, ConfigValidationError } from "./playtagon.js";
import { DEFAULT_KNOB_VALUES } from "./config.js";
import { defaultKnobValues, modelSchema, type SicBoKnobValues } from "./knobs.js";
import type { IRng } from "@playtagon/model-sdk";

/** Детерминированный RNG: выдаёт заданную последовательность граней. */
function seqRng(values: number[]): IRng {
  let i = 0;
  return { getInt: () => values[i++ % values.length]! };
}

/** RNG, который считает, сколько раз его дёрнули. */
function countingRng(): IRng & { draws: number } {
  const r = {
    draws: 0,
    getInt(_min: number, _max: number) {
      r.draws += 1;
      return 1;
    },
  };
  return r;
}

const valid = (): SicBoKnobValues => structuredClone(DEFAULT_KNOB_VALUES);

describe("createModel — валидация values против schema.json#knobs", () => {
  it("дефолты схемы проходят и дают рабочую модель", () => {
    const model = createModel(defaultKnobValues());
    expect(model.rngMode).toBe("fairness");
    expect(typeof model.play).toBe("function");
    expect(typeof model.verify).toBe("function");
  });

  it("литерал DEFAULT_KNOB_VALUES совпадает с default-объявлениями schema.json", () => {
    // Литерал существует потому, что PAYOUTS нужен клиенту на загрузке модуля,
    // а чтение файлов на загрузке запрещено. Второго источника правды это не
    // создаёт ровно постольку, поскольку этот тест зелёный.
    expect(DEFAULT_KNOB_VALUES).toEqual(defaultKnobValues());
  });

  it("отсутствующая ручка — падение, а не тихий дефолт", () => {
    const v = valid() as unknown as Record<string, unknown>;
    delete v.combo_payout;
    expect(() => createModel(v)).toThrow(ConfigValidationError);
    try {
      createModel(v);
    } catch (e) {
      expect((e as ConfigValidationError).name).toBe("ConfigValidationError");
      expect((e as ConfigValidationError).violations.join("; ")).toMatch(
        /combo_payout.*значения в values нет/,
      );
    }
  });

  it("необъявленная ручка отвергается", () => {
    const v = { ...valid(), house_edge: 0.05 };
    expect(() => createModel(v)).toThrow(/не объявлена в schema.json#knobs/);
  });

  it("значение выше max РОНЯЕТ модель, а не клампится", () => {
    // combo_payout max = 6: при 7 RTP комбинации был бы 111.11%.
    const v = { ...valid(), combo_payout: 7 };
    expect(() => createModel(v)).toThrow(/combo_payout.*выше объявленного max 6/);
  });

  it("значение ниже min роняет модель", () => {
    const v = { ...valid(), triple_specific_payout: 99 };
    expect(() => createModel(v)).toThrow(/triple_specific_payout.*ниже объявленного min 100/);
  });

  it("нецелое значение int-ручки отвергается", () => {
    const v = { ...valid(), double_payout: 10.5 };
    expect(() => createModel(v)).toThrow(/double_payout.*объявлена int/);
  });

  it("все нарушения приходят ОДНИМ списком, а не по одному", () => {
    const v = valid() as unknown as Record<string, unknown>;
    v.combo_payout = 99;              // выше max
    v.double_payout = 0;              // ниже min
    delete v.triple_any_payout;       // отсутствует
    v.nonsense = 1;                   // необъявленная

    try {
      createModel(v);
      throw new Error("ожидалось падение");
    } catch (e) {
      const violations = (e as ConfigValidationError).violations;
      expect(violations.length).toBe(4);
      const joined = violations.join(" | ");
      expect(joined).toMatch(/combo_payout/);
      expect(joined).toMatch(/double_payout/);
      expect(joined).toMatch(/triple_any_payout/);
      expect(joined).toMatch(/nonsense/);
    }
  });

  it("values не-объект отвергается", () => {
    expect(() => createModel(null)).toThrow(ConfigValidationError);
    expect(() => createModel([1, 2])).toThrow(/должны быть объектом/);
    expect(() => createModel("конфиг" as unknown)).toThrow(ConfigValidationError);
  });
});

describe("createModel — составная ручка total_payouts", () => {
  it("нарушение называет ПУТЬ до элемента, а не имя ручки", () => {
    const v = valid();
    v.total_payouts["9"] = 8; // max для суммы 9 равен 7
    try {
      createModel(v);
      throw new Error("ожидалось падение");
    } catch (e) {
      const violations = (e as ConfigValidationError).violations;
      expect(violations).toHaveLength(1);
      expect(violations[0]).toMatch(/^total_payouts\.9:/);
      expect(violations[0]).toMatch(/выше объявленного max 7/);
    }
  });

  it("отсутствующая сумма в таблице — нарушение с путём", () => {
    const v = valid();
    delete (v.total_payouts as Record<string, number>)["13"];
    expect(() => createModel(v)).toThrow(/total_payouts\.13: обязательное поле отсутствует/);
  });

  it("лишний ключ в таблице отвергается", () => {
    const v = valid();
    (v.total_payouts as Record<string, number>)["18"] = 100;
    expect(() => createModel(v)).toThrow(/total_payouts\.18: поле не объявлено/);
  });

  it("несколько битых элементов — все сразу, каждый со своим путём", () => {
    const v = valid();
    v.total_payouts["4"] = 999;
    v.total_payouts["10"] = 0;
    try {
      createModel(v);
      throw new Error("ожидалось падение");
    } catch (e) {
      const violations = (e as ConfigValidationError).violations;
      expect(violations).toHaveLength(2);
      expect(violations.join(" | ")).toMatch(/total_payouts\.4/);
      expect(violations.join(" | ")).toMatch(/total_payouts\.10/);
    }
  });

  it("таблица не-объект отвергается", () => {
    const v = { ...valid(), total_payouts: 60 };
    expect(() => createModel(v)).toThrow(/total_payouts.*должна быть объектом/);
  });

  it("граничные значения принимаются включительно", () => {
    const v = valid();
    v.total_payouts["10"] = 7;  // ровно max: RTP суммы 10 равен ровно 100%
    v.total_payouts["4"] = 71;  // ровно max
    v.combo_payout = 6;              // ровно max
    v.triple_specific_payout = 215;  // ровно max: RTP тройки ровно 100%
    v.triple_any_payout = 35;        // ровно max
    expect(() => createModel(v)).not.toThrow();
  });
});

describe("два экземпляра с разными values сосуществуют в одном процессе", () => {
  it("дают разные initData одновременно, без рестарта", () => {
    const a = createModel({ ...valid(), triple_any_payout: 30 });
    const b = createModel({ ...valid(), triple_any_payout: 34 });

    const initA = a.init({ roundContext: null, globalContext: null });
    const initB = b.init({ roundContext: null, globalContext: null });

    expect(initA.initData.payouts.triple_any).toBe(30);
    expect(initB.initData.payouts.triple_any).toBe(34);

    // Перекрёстная проверка ПОСЛЕ обоих init: если бы состояние было общим,
    // второй вызов затёр бы первый.
    expect(a.init({ roundContext: null, globalContext: null }).initData.payouts.triple_any).toBe(30);
    expect(initA.initData.payouts.triple_any).toBe(30);
  });

  it("считают РАЗНЫЕ выплаты на одном и том же броске", () => {
    const cheap = createModel({ ...valid(), double_payout: 5 });
    const rich = createModel({ ...valid(), double_payout: 12 });
    const request = { bets: [{ type: "double_3" as const, amount: 100 }] };

    const rc = cheap.play({
      roundType: "main", gameRequest: request, rng: seqRng([3, 3, 1]),
      roundContext: null, globalContext: null,
    });
    const rr = rich.play({
      roundType: "main", gameRequest: request, rng: seqRng([3, 3, 1]),
      roundContext: null, globalContext: null,
    });

    expect(rc.win).toBe(600);   // (5 + 1) × 100
    expect(rr.win).toBe(1300);  // (12 + 1) × 100
  });
});

describe("buildModel — сборка без чтения схемы и без валидации", () => {
  it("собирает рабочую модель из валидных значений", () => {
    const model = buildModel(valid());
    const init = model.init({ roundContext: null, globalContext: null });
    expect(init.initData.payouts.total_4).toBe(60);
  });

  it("НЕ валидирует: заведомо кривое значение доезжает до математики", () => {
    // Это и есть разделение пары (Регламент §11.1): buildModel доверяет
    // воротам платформы. Тест фиксирует именно отсутствие валидации — если
    // однажды buildModel начнёт валидировать, он покраснеет и назовёт причину.
    const broken = { ...valid(), combo_payout: 999 };
    expect(() => buildModel(broken)).not.toThrow();
    const model = buildModel(broken);
    expect(model.init({ roundContext: null, globalContext: null }).initData.payouts.combo_12)
      .toBe(999);
  });
});

describe("валидация до розыгрыша — отвергнутый раунд не тратит RNG", () => {
  it("невалидный запрос не сжигает ни одного числа", () => {
    const model = createModel(valid());
    const rng = countingRng();
    expect(() =>
      model.play({
        roundType: "main",
        gameRequest: { bets: [] } as never,
        rng,
        roundContext: null,
        globalContext: null,
      }),
    ).toThrow();
    expect(rng.draws).toBe(0);
  });

  it("валидный раунд тратит ровно три числа", () => {
    const model = createModel(valid());
    const rng = countingRng();
    model.play({
      roundType: "main",
      gameRequest: { bets: [{ type: "small", amount: 100 }] },
      rng,
      roundContext: null,
      globalContext: null,
    });
    expect(rng.draws).toBe(3);
  });
});

describe("verify — паритет траты RNG и идемпотентность", () => {
  it("тратит RNG идентично play: три getInt", () => {
    const model = createModel(valid());
    const playRng = countingRng();
    const verifyRng = countingRng();

    model.play({
      roundType: "main",
      gameRequest: { bets: [{ type: "big", amount: 10 }] },
      rng: playRng,
      roundContext: null,
      globalContext: null,
    });
    model.verify!({ rng: verifyRng });

    expect(verifyRng.draws).toBe(playRng.draws);
    expect(verifyRng.draws).toBe(3);
  });

  it("на том же буфере даёт тот же бросок, что и play", () => {
    const model = createModel(valid());
    const buffer = [4, 2, 6];
    const played = model.play({
      roundType: "main",
      gameRequest: { bets: [{ type: "big", amount: 10 }] },
      rng: seqRng(buffer),
      roundContext: null,
      globalContext: null,
    });
    const verified = model.verify!({ rng: seqRng(buffer) });
    expect(verified.roll).toEqual(played.playData.roll);
  });

  it("идемпотентен: сколько ни зови — тот же результат", () => {
    const model = createModel(valid());
    const first = model.verify!({ rng: seqRng([1, 5, 3]) });
    const second = model.verify!({ rng: seqRng([1, 5, 3]) });
    expect(second).toEqual(first);
  });
});

describe("контракт ответа модели", () => {
  it("fairness: globalContext всегда null, раунд завершён", () => {
    const model = createModel(valid());
    const r = model.play({
      roundType: "main",
      gameRequest: { bets: [{ type: "small", amount: 100 }] },
      rng: seqRng([1, 2, 3]),
      roundContext: null,
      globalContext: null,
    });
    expect(r.globalContext).toBeNull();
    expect(r.roundContext).toBeNull();
    expect(r.roundComplete).toBe(true);
  });

  it("денежные дубли сходятся: bet/win против playData", () => {
    const model = createModel(valid());
    const r = model.play({
      roundType: "main",
      gameRequest: { bets: [{ type: "small", amount: 100 }, { type: "total_6", amount: 50 }] },
      rng: seqRng([1, 2, 3]),
      roundContext: null,
      globalContext: null,
    });
    expect(r.bet).toBe(r.playData.totalBet);
    expect(r.win).toBe(r.playData.totalWin);
    expect(r.playData.totalWin).toBe(r.playData.wins.reduce((s, w) => s + w.payout, 0));
    expect(r.replayData).toEqual(r.playData);
  });

  it("initData отдаёт коэффициенты ДЕЙСТВУЮЩЕГО конфига, а не дефолты", () => {
    const model = createModel({ ...valid(), triple_specific_payout: 214 });
    const init = model.init({ roundContext: null, globalContext: null });
    expect(init.initData.payouts.triple_1).toBe(214);
    expect(init.initData.betTypes).toHaveLength(50);
    expect(init.initData.history).toEqual([]);
  });
});

describe("схема модели", () => {
  it("объявляет непустые knobs — значит worker-файл обязан быть двухветочным", () => {
    expect(Object.keys(modelSchema().knobs).length).toBeGreaterThan(0);
  });
});
