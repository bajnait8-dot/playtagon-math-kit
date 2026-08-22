import type { Contexts, IScenarioValidator } from "@playtagon/model-sdk";
import type { SicBoGameRequest, SicBoGameTypes, SicBoPlayData } from "../model/types.js";

/**
 * Сценарии SDK-канона. Применимы ВСЕГДА: раунд одношаговый, и весь его исход
 * определяется одним броском, который runtime подбирает перебором RNG.
 *
 * Сценарии судят РЕАЛЬНУЮ МЕХАНИКУ — исход против запроса, а не поле `win`:
 * «раунд выигран» проверяется тем, что выигравшие зоны действительно выиграли
 * по правилам костей, а не тем, что сервер прислал ненулевое число. Поэтому
 * почти каждый валидатор ниже пересчитывает исход из `roll` независимо от того,
 * что насчитала модель, и сверяет с её ответом.
 */

type Ctx = Contexts<SicBoGameTypes>;

const sum = (d: SicBoPlayData): number => d.roll[0] + d.roll[1] + d.roll[2];
const isTriple = (d: SicBoPlayData): boolean =>
  d.roll[0] === d.roll[1] && d.roll[1] === d.roll[2];

/** Ставка на зону есть в запросе — иначе сценарий про эту зону бессмыслен. */
const staked = (r: SicBoGameRequest, type: string): boolean =>
  r.bets.some((b) => b.type === type);

const scenarios: IScenarioValidator<SicBoGameTypes>[] = [
  // --- категории броска: края области исходов --------------------------------
  {
    // Тройка — 6 исходов из 216, самый край распределения.
    name: "Any triple",
    isApplicable() { return true; },
    validate(_r: SicBoGameRequest, _b: Ctx, _a: Ctx, d: SicBoPlayData): boolean {
      return isTriple(d) && d.category.kind === "triple";
    },
  },
  {
    // Минимальная сумма: 1,1,1. Одновременно и тройка — проверяем, что
    // категория тройки перебивает small, как требует канон Sic Bo.
    name: "Minimum total (3) — triple ones",
    isApplicable() { return true; },
    validate(_r: SicBoGameRequest, _b: Ctx, _a: Ctx, d: SicBoPlayData): boolean {
      return sum(d) === 3 && d.category.total === 3 && d.category.kind === "triple";
    },
  },
  {
    // Максимальная сумма: 6,6,6.
    name: "Maximum total (18) — triple sixes",
    isApplicable() { return true; },
    validate(_r: SicBoGameRequest, _b: Ctx, _a: Ctx, d: SicBoPlayData): boolean {
      return sum(d) === 18 && d.category.total === 18 && d.category.kind === "triple";
    },
  },
  {
    // Граница small/big: 10 — последняя small, 11 — первая big.
    name: "Small boundary (total 10)",
    isApplicable() { return true; },
    validate(_r: SicBoGameRequest, _b: Ctx, _a: Ctx, d: SicBoPlayData): boolean {
      return sum(d) === 10 && !isTriple(d) && d.category.kind === "small";
    },
  },
  {
    name: "Big boundary (total 11)",
    isApplicable() { return true; },
    validate(_r: SicBoGameRequest, _b: Ctx, _a: Ctx, d: SicBoPlayData): boolean {
      return sum(d) === 11 && !isTriple(d) && d.category.kind === "big";
    },
  },

  // --- механика зон: исход против запроса ------------------------------------
  {
    // Ключевой край дома: small поставлен, сумма в диапазоне small — и всё
    // равно проигрыш, потому что выпала тройка.
    name: "Small loses on a triple despite an in-range total",
    isApplicable() { return true; },
    validate(r: SicBoGameRequest, _b: Ctx, _a: Ctx, d: SicBoPlayData): boolean {
      if (!staked(r, "small")) return false;
      const t = sum(d);
      return isTriple(d) && t >= 4 && t <= 10 && !d.wins.some((w) => w.type === "small");
    },
  },
  {
    // Одним броском выигрывает несколько зон сразу — канон Sic Bo, а не
    // двойная выплата за одно и то же.
    name: "One roll wins several zones",
    isApplicable() { return true; },
    validate(_r: SicBoGameRequest, _b: Ctx, _a: Ctx, d: SicBoPlayData): boolean {
      return d.wins.length >= 2;
    },
  },
  {
    // Double выигрывает и на тройке: три штуки — это и две тоже.
    name: "Double wins on a triple",
    isApplicable() { return true; },
    validate(r: SicBoGameRequest, _b: Ctx, _a: Ctx, d: SicBoPlayData): boolean {
      if (!isTriple(d)) return false;
      const face = d.roll[0];
      const type = `double_${face}`;
      return staked(r, type) && d.wins.some((w) => w.type === type);
    },
  },
  {
    // Combo требует ОБЕ грани: на тройке одинаковых комбинация не выигрывает.
    name: "Combo does not win on a triple",
    isApplicable() { return true; },
    validate(r: SicBoGameRequest, _b: Ctx, _a: Ctx, d: SicBoPlayData): boolean {
      if (!isTriple(d)) return false;
      const combos = r.bets.filter((b) => b.type.startsWith("combo_"));
      if (combos.length === 0) return false;
      return combos.every((b) => !d.wins.some((w) => w.type === b.type));
    },
  },
  {
    // Single платит по ЧИСЛУ совпадений: три совпадения — возврат 4×.
    name: "Single pays 4x on three matching faces",
    isApplicable() { return true; },
    validate(r: SicBoGameRequest, _b: Ctx, _a: Ctx, d: SicBoPlayData): boolean {
      if (!isTriple(d)) return false;
      const type = `single_${d.roll[0]}`;
      if (!staked(r, type)) return false;
      const w = d.wins.find((x) => x.type === type);
      return w !== undefined && w.payout === w.amount * 4;
    },
  },

  // --- денежные инварианты ---------------------------------------------------
  {
    // Итог раунда обязан быть суммой выплат по зонам, а не отдельным числом.
    name: "Round won — totals reconcile",
    isApplicable() { return true; },
    validate(r: SicBoGameRequest, _b: Ctx, _a: Ctx, d: SicBoPlayData): boolean {
      if (d.totalWin <= 0) return false;
      const paid = d.wins.reduce((s, w) => s + w.payout, 0);
      const stakedSum = r.bets.reduce((s, b) => s + b.amount, 0);
      return paid === d.totalWin && stakedSum === d.totalBet;
    },
  },
  {
    // Проигрышный раунд: пустой список выигрышей и нулевой итог — вместе.
    name: "Round lost — no wins and zero total",
    isApplicable() { return true; },
    validate(_r: SicBoGameRequest, _b: Ctx, _a: Ctx, d: SicBoPlayData): boolean {
      return d.totalWin === 0 && d.wins.length === 0;
    },
  },
];

export default scenarios;
