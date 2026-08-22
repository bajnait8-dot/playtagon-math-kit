import { describe, it, expect } from "vitest";
import { defaultKnobValues } from "./config.js";
import { createModel } from "./factory.js";
import * as platformEntry from "./playtagon.js";
import canonical, { model } from "./index.js";

describe("defaultKnobValues", () => {
  it("отдаёт ровно default-значения всех ручек schema.json", () => {
    expect(defaultKnobValues()).toEqual({
      rtp: 0.99,
      target_min: 200,
      target_max: 9800,
      default_target: 5000,
    });
  });
});

describe("SDK-каноническая точка model/index.ts", () => {
  it("default-export и именованный model — один и тот же IModel", () => {
    expect(canonical).toBe(model);
    expect(canonical.rngMode).toBe("fairness");
    expect(typeof canonical.init).toBe("function");
    expect(typeof canonical.play).toBe("function");
    expect(typeof canonical.verify).toBe("function");
  });

  it("экземпляр собран из дефолтов схемы (initData совпадает с фабрикой на дефолтах)", () => {
    const reference = createModel(defaultKnobValues());
    expect(canonical.init({ roundContext: null, globalContext: null })).toEqual(
      reference.init({ roundContext: null, globalContext: null }),
    );
  });
});

describe("платформенный вход model/playtagon.ts", () => {
  it("экспортирует фабрику (та же функция, что в factory.ts)", () => {
    expect(platformEntry.createModel).toBe(createModel);
  });

  it("кривые values — ConfigValidationError с err.name", () => {
    expect(() => platformEntry.createModel({ rtp: 2 })).toThrowError(
      expect.objectContaining({ name: "ConfigValidationError" }),
    );
  });
});
