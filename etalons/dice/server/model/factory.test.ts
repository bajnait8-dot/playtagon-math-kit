import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { buildModel, createModel, RequestValidationError, ConfigValidationError } from "./factory.js";

// Значения ручек — вход фабрики (§1.5.1), тесты объявляют их сами и не читают
// config.json: модель обязана работать от любых валидных values, а тест —
// быть самодостаточным. Числа совпадают с дефолтами schema.json.
const DEFAULT_VALUES = {
  rtp: 0.99,
  target_min: 200,
  target_max: 9800,
  default_target: 5000,
};

const TARGET_MIN = DEFAULT_VALUES.target_min;
const TARGET_MAX = DEFAULT_VALUES.target_max;

const model = createModel(DEFAULT_VALUES);

// A deterministic rng that returns a fixed roll, so play() and verify() can be
// checked to consume RNG identically and agree on the outcome.
function fixedRng(roll: number) {
  let calls = 0;
  return {
    getInt(_min: number, _max: number) {
      calls++;
      return roll;
    },
    get calls() {
      return calls;
    },
  };
}

describe("dice fairness contract", () => {
  it("declares fairness mode and implements verify", () => {
    expect(model.rngMode).toBe("fairness");
    expect(typeof model.verify).toBe("function");
  });

  it("play() returns null globalContext (no cross-round state)", () => {
    const rng = fixedRng(4200);
    const res = model.play({
      roundType: "normal",
      gameRequest: { target: 5000, condition: "over", bet: 10 },
      rng,
      roundContext: null,
      globalContext: null,
    });
    expect(res.globalContext).toBeNull();
  });

  it("verify() re-derives the same roll as play(), consuming one draw", () => {
    const roll = 4200;
    const playRng = fixedRng(roll);
    const play = model.play({
      roundType: "normal",
      gameRequest: { target: 5000, condition: "over", bet: 10 },
      rng: playRng,
      roundContext: null,
      globalContext: null,
    });
    const verifyRng = fixedRng(roll);
    const verify = model.verify!({ rng: verifyRng });
    expect(verify).toEqual({ roll });
    expect(play.playData.roll).toBe(roll);
    expect(playRng.calls).toBe(1);
    expect(verifyRng.calls).toBe(1);
  });

  it("init() no longer returns history", () => {
    const res = model.init({ roundContext: null, globalContext: null });
    expect("history" in res.initData).toBe(false);
  });
});

// §1.5.1, конвенция фабрики: значения ручек приходят аргументом createModel и
// валидируются против knobs собственной схемы. Кривое значение — типизированное
// исключение ConfigValidationError, не тихий дефолт (§5.1).
describe("валидация values против schema.json#knobs", () => {
  const invalid: Array<[string, unknown]> = [
    ["rtp выше max", { ...DEFAULT_VALUES, rtp: 1.05 }],
    ["rtp ниже min", { ...DEFAULT_VALUES, rtp: 0.5 }],
    ["rtp не число", { ...DEFAULT_VALUES, rtp: "0.99" }],
    ["rtp NaN", { ...DEFAULT_VALUES, rtp: NaN }],
    ["target_max выше max", { ...DEFAULT_VALUES, target_max: 99999 }],
    ["target_min дробный при типе int", { ...DEFAULT_VALUES, target_min: 200.5 }],
    ["default_target вне [target_min, target_max]", { ...DEFAULT_VALUES, default_target: 9900, target_max: 9800 }],
    ["target_min == target_max", { ...DEFAULT_VALUES, target_min: 5000, target_max: 5000 }],
    ["отсутствует объявленная ручка", { rtp: 0.99, target_min: 200, target_max: 9800 }],
    ["необъявленная ручка", { ...DEFAULT_VALUES, house_edge: 0.5 }],
    ["values не объект", 42],
    ["values null", null],
    ["values массив", [0.99, 200, 9800, 5000]],
  ];

  for (const [label, values] of invalid) {
    it(`падение фабрики: ${label}`, () => {
      expect(() => createModel(values)).toThrow(ConfigValidationError);
    });
  }

  it("исключение узнаваемо рантаймом по err.name (конвенция devРГС)", () => {
    try {
      createModel({ ...DEFAULT_VALUES, rtp: 1.05 });
      expect.unreachable("ожидалось исключение");
    } catch (err) {
      expect((err as Error).name).toBe("ConfigValidationError");
    }
  });

  it("ошибка перечисляет все нарушения сразу, а не первое", () => {
    try {
      createModel({ ...DEFAULT_VALUES, rtp: 1.05, target_max: 99999 });
      expect.unreachable("ожидалось исключение");
    } catch (err) {
      expect(err).toBeInstanceOf(ConfigValidationError);
      expect((err as ConfigValidationError).violations.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("тихих дефолтов нет: отсутствующая ручка — падение, не default из схемы", () => {
    // §5.1: «либо тихий дефолт, либо падение; первое хуже — оно меняет
    // математику продукта беззвучно». Прежний config.ts подставлял default.
    expect(() => createModel({ rtp: 0.99 })).toThrow(ConfigValidationError);
  });

  it("валидные values принимаются, границы диапазонов включительны", () => {
    expect(() => createModel(DEFAULT_VALUES)).not.toThrow();
    expect(() =>
      createModel({ rtp: 0.9, target_min: 100, target_max: 9900, default_target: 5000 }),
    ).not.toThrow();
  });
});

// §1.5.1: «Одна и та же версия модели обслуживает сколько угодно сессий с
// разными конфигами одновременно — значения приходят на вход, а не считываются
// из глобального состояния процесса». Это то, на чём стоят параллельные сессии
// devРГС: два экземпляра в одном процессе, разные values → разное поведение.
describe("два экземпляра с разными values в одном процессе", () => {
  const m99 = createModel(DEFAULT_VALUES);
  const m95 = createModel({ ...DEFAULT_VALUES, rtp: 0.95 });

  function playWin(m: typeof m99, bet: number) {
    return m.play({
      roundType: "normal",
      gameRequest: { target: 5000, condition: "over", bet },
      rng: fixedRng(7500),
      roundContext: null,
      globalContext: null,
    }).win;
  }

  it("init() каждого экземпляра отдаёт свои значения", () => {
    expect(m99.init({ roundContext: null, globalContext: null }).initData.rtp).toBe(0.99);
    expect(m95.init({ roundContext: null, globalContext: null }).initData.rtp).toBe(0.95);
  });

  it("одинаковый бросок — разные выплаты (rtp доехал до математики каждого)", () => {
    // winChance(5000, over) = 0.4999 → mult = rtp / 0.4999
    expect(playWin(m99, 1_000_000)).toBe(Math.round((0.99 / 0.4999) * 1_000_000));
    expect(playWin(m95, 1_000_000)).toBe(Math.round((0.95 / 0.4999) * 1_000_000));
  });

  it("чередование вызовов не смешивает конфиги (глобального состояния нет)", () => {
    const first = playWin(m99, 1000);
    playWin(m95, 1000);
    expect(playWin(m99, 1000)).toBe(first);
  });

  it("границы target у экземпляров независимы", () => {
    const narrow = createModel({ rtp: 0.99, target_min: 1000, target_max: 9000, default_target: 5000 });
    // target = 500 валиден для дефолтного экземпляра, но вне границ узкого
    expect(() =>
      narrow.play({
        roundType: "normal",
        gameRequest: { target: 500, condition: "over", bet: 100 },
        rng: fixedRng(7500),
        roundContext: null,
        globalContext: null,
      }),
    ).toThrow(RequestValidationError);
    expect(() =>
      model.play({
        roundType: "normal",
        gameRequest: { target: 500, condition: "over", bet: 100 },
        rng: fixedRng(7500),
        roundContext: null,
        globalContext: null,
      }),
    ).not.toThrow();
  });
});

// Фабрика берёт значения ТОЛЬКО из аргумента: values, отличные от config.json,
// обязаны доехать до initData — иначе где-то остался скрытый источник.
describe("значения — только из аргумента фабрики", () => {
  it("rtp = 0.95 из аргумента доезжает до initData", () => {
    const m = createModel({ ...DEFAULT_VALUES, rtp: 0.95 });
    expect(m.init({ roundContext: null, globalContext: null }).initData.rtp).toBe(0.95);
  });

  it("границы цели из аргумента доезжают до initData", () => {
    const m = createModel({ rtp: 0.99, target_min: 1000, target_max: 9000, default_target: 4000 });
    const { initData } = m.init({ roundContext: null, globalContext: null });
    expect(initData.targetMin).toBe(1000);
    expect(initData.targetMax).toBe(9000);
    expect(initData.defaultTarget).toBe(4000);
  });
});

// Б2: модель отклоняет любой запрос, не проходящий её схему; считать с мусорным
// входом запрещено. До правки bet = -100 давал win = -198 — отрицательную выплату
// и playData, не проходящий собственную схему модели (Р-3 отчёта ревью).
describe("валидация запроса против schema.json#request", () => {
  function play(gameRequest: unknown, rng = fixedRng(7500)) {
    return model.play({
      roundType: "normal",
      gameRequest: gameRequest as never,
      rng,
      roundContext: null,
      globalContext: null,
    });
  }

  const invalid: Array<[string, unknown]> = [
    ["отрицательная ставка", { target: 5000, condition: "over", bet: -100 }],
    ["дробная ставка", { target: 5000, condition: "over", bet: 10.5 }],
    ["ставка не число", { target: 5000, condition: "over", bet: "100" }],
    ["ставка NaN", { target: 5000, condition: "over", bet: NaN }],
    ["ставка выше потолка схемы", { target: 5000, condition: "over", bet: Number.MAX_SAFE_INTEGER + 2 }],
    ["дробная цель", { target: 5000.5, condition: "over", bet: 100 }],
    ["цель не число", { target: null, condition: "over", bet: 100 }],
    ["направление вне enum", { target: 5000, condition: "sideways", bet: 100 }],
    ["лишнее поле", { target: 5000, condition: "over", bet: 100, hack: 1 }],
    ["нет обязательного bet", { target: 5000, condition: "over" }],
    ["пустой объект", {}],
    ["не объект", "give me money"],
    ["null", null],
  ];

  for (const [label, request] of invalid) {
    it(`отклоняет: ${label}`, () => {
      expect(() => play(request)).toThrow(RequestValidationError);
    });

    it(`не тратит RNG на отказе: ${label}`, () => {
      // Валидация идёт до розыгрыша — иначе отвергнутый раунд сжигал бы число
      // из буфера и ломал провабли-фэйр следующего раунда.
      const rng = fixedRng(7500);
      expect(() => play(request, rng)).toThrow();
      expect(rng.calls).toBe(0);
    });
  }

  it("валидный запрос по-прежнему считается, ответ проходит схему", () => {
    const res = play({ target: 5000, condition: "over", bet: 100 });
    expect(res.win).toBe(198);
    expect(res.playData.win).toBe(res.win);
    expect(res.playData.win).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(res.playData.win)).toBe(true);
    expect(Number.isInteger(res.playData.target)).toBe(true);
  });

  it("модель не строже своей схемы: bet на обеих границах принимается", () => {
    expect(() => play({ target: 5000, condition: "over", bet: 1 })).not.toThrow();
    expect(() =>
      play({ target: 5000, condition: "over", bet: Number.MAX_SAFE_INTEGER }),
    ).not.toThrow();
  });

  // Регламент 5.6: минимум ставки строго больше нуля. Нулевая ставка — не раунд,
  // и модель обязана отказать, а не считать розыгрыш на нулевые деньги.
  it("bet = 0 отвергается: минимум схемы строго больше нуля", () => {
    expect(() => play({ target: 5000, condition: "over", bet: 0 })).toThrow(
      RequestValidationError,
    );
  });

  it("ошибка перечисляет все нарушения сразу, а не первое", () => {
    try {
      play({ target: 5000.5, condition: "sideways", bet: -1 });
      expect.unreachable("ожидалось исключение");
    } catch (err) {
      expect(err).toBeInstanceOf(RequestValidationError);
      expect((err as RequestValidationError).violations.length).toBeGreaterThanOrEqual(3);
    }
  });
});

// Границы target задаются ручками, а не числом в схеме запроса (Р-2 отчёта).
describe("границы target — единый источник", () => {
  function play(target: number) {
    return model.play({
      roundType: "normal",
      gameRequest: { target, condition: "over", bet: 100 },
      rng: fixedRng(9999),
      roundContext: null,
      globalContext: null,
    });
  }

  it("границы ручек включительны", () => {
    expect(() => play(TARGET_MIN)).not.toThrow();
    expect(() => play(TARGET_MAX)).not.toThrow();
  });

  it("за границами ручек — отказ, а не тихая коррекция", () => {
    expect(() => play(TARGET_MIN - 100)).toThrow(RequestValidationError);
    expect(() => play(TARGET_MAX + 100)).toThrow(RequestValidationError);
  });

  it("отказ по границе ручки типизирован как дефект запроса (400, не 500)", () => {
    // Образ generic-v1 мапит err.name: RequestValidationError → 400
    // MODEL_REQUEST_INVALID; голый Error ушёл бы в 500 как сбой математики.
    try {
      play(TARGET_MIN - 100);
      expect.unreachable("ожидалось исключение");
    } catch (err) {
      expect((err as Error).name).toBe("RequestValidationError");
    }
  });

  it("initData отдаёт действующие границы — по ним клиент строит ползунок", () => {
    const { initData } = model.init({ roundContext: null, globalContext: null });
    expect(initData.targetMin).toBe(TARGET_MIN);
    expect(initData.targetMax).toBe(TARGET_MAX);
  });
});

// Граница roll == target — центральный случай механики (protocol.md §5),
// ранее не покрытый ни одним тестом модели.
describe("граница roll == target", () => {
  function outcome(roll: number, condition: "over" | "under") {
    return model.play({
      roundType: "normal",
      gameRequest: { target: 5000, condition, bet: 100 },
      rng: fixedRng(roll),
      roundContext: null,
      globalContext: null,
    }).win;
  }

  it("равенство броска и порога — проигрыш при обоих направлениях", () => {
    expect(outcome(5000, "over")).toBe(0);
    expect(outcome(5000, "under")).toBe(0);
  });

  it("строгие неравенства: соседние исходы выигрывают", () => {
    expect(outcome(5001, "over")).toBeGreaterThan(0);
    expect(outcome(4999, "under")).toBeGreaterThan(0);
  });
});

// Пара конвенции (вердикт штаба (б′), 2026-08-19, Регламент §11.1):
// createModel(values) = валидация + сборка (DEV, как было);
// buildModel(values) = сборка из ЗАВЕДОМО-ВАЛИДНЫХ значений — ни чтения
// schema.json, ни валидации. Поведение не зависит от наличия файла схемы:
// неявный фолбэк «нет схемы — не валидируем» запрещён, ENOENT в DEV —
// честная ошибка. Единственный потребитель buildModel — генерируемый
// bake-адаптер платформы; авторский код (worker-файлы, dev.ts) зовёт
// только createModel.
describe("пара createModel/buildModel", () => {
  const PAIR_VALUES = {
    rtp: 0.92,
    target_min: 200,
    target_max: 9800,
    default_target: 5000,
  };

  function playArgs(roll: number, target = 5000, condition: "over" | "under" = "over") {
    return {
      roundType: "normal",
      gameRequest: { target, condition, bet: 100 },
      rng: fixedRng(roll),
      roundContext: null,
      globalContext: null,
    };
  }

  it("математика buildModel == createModel на тех же значениях (init + play бит-в-бит)", () => {
    const dev = createModel(PAIR_VALUES);
    const baked = buildModel(PAIR_VALUES);
    expect(baked.init({ roundContext: null, globalContext: null })).toEqual(
      dev.init({ roundContext: null, globalContext: null }),
    );
    for (const roll of [0, 4999, 5000, 5001, 9999]) {
      for (const condition of ["over", "under"] as const) {
        expect(baked.play(playArgs(roll, 5000, condition))).toEqual(
          dev.play(playArgs(roll, 5000, condition)),
        );
      }
    }
  });

  it("buildModel НЕ валидирует values: заведомо-валидные — контракт вызова", () => {
    // rtp вне объявленного max схемы: createModel падает, buildModel собирает
    expect(() => createModel({ ...PAIR_VALUES, rtp: 5 })).toThrow(ConfigValidationError);
    const m = buildModel({ ...PAIR_VALUES, rtp: 5 });
    expect(m.init({ roundContext: null, globalContext: null }).initData.rtp).toBe(5);
  });

  it("границы действующего конфига в play() остаются — это математика, не схема", () => {
    const m = buildModel(PAIR_VALUES);
    expect(() => m.play(playArgs(1, 50))).toThrow(RequestValidationError);
    expect(() =>
      m.play({
        roundType: "normal",
        gameRequest: { target: 5000, condition: "sideways", bet: 100 },
        rng: fixedRng(1),
        roundContext: null,
        globalContext: null,
      } as never),
    ).toThrow(RequestValidationError);
  });

  it("verify buildModel-модели тратит RNG идентично play (fairness-инвариант)", () => {
    const m = buildModel(PAIR_VALUES);
    const rng = fixedRng(4242);
    expect(m.verify!({ rng })).toEqual({ roll: 4242 });
    expect(rng.calls).toBe(1);
  });

  it("поведение не зависит от наличия schema.json: без файла buildModel живёт, createModel — честный ENOENT", () => {
    // Чистый каталог: model/* без schema.json — форма baked-артефакта §8.2
    const root = mkdtempSync(join(tmpdir(), "dice-pair-"));
    try {
      cpSync(join(import.meta.dirname, ".."), join(root, "server"), {
        recursive: true,
        filter: (src) => !src.includes("node_modules") && !src.endsWith(".test.ts"),
      });
      rmSync(join(root, "server", "schema.json"));
      const probe = `
        import { createModel, buildModel } from "./server/model/playtagon.ts";
        const values = ${JSON.stringify(PAIR_VALUES)};
        const model = buildModel(values);
        const init = model.init({ roundContext: null, globalContext: null });
        const play = model.play({
          roundType: "normal",
          gameRequest: { target: 5000, condition: "over", bet: 100 },
          rng: { getInt: () => 7777 },
          roundContext: null,
          globalContext: null,
        });
        let createFailed = "";
        try {
          createModel(values);
        } catch (err) {
          createFailed = String(err && err.code ? err.code : err);
        }
        console.log(JSON.stringify({ init, play, createFailed }));
      `;
      writeFileSync(join(root, "probe.mts"), probe);
      const tsxLoader = pathToFileURL(createRequire(import.meta.url).resolve("tsx")).href;
      const out = execFileSync(process.execPath, ["--import", tsxLoader, join(root, "probe.mts")], {
        cwd: root,
        encoding: "utf8",
        env: { PATH: process.env["PATH"] ?? "" },
      });
      const result = JSON.parse(out.trim().split("\n").filter(Boolean).pop()!);
      // buildModel исполняется без схемы: init/play живут
      expect(result.init.initData.rtp).toBe(PAIR_VALUES.rtp);
      expect(result.play.playData.roll).toBe(7777);
      expect(result.play.win).toBeGreaterThan(0);
      // createModel без схемы — честный ENOENT, не тихое отключение валидации
      expect(result.createFailed).toBe("ENOENT");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
