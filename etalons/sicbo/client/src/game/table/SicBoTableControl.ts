import { Control, Fade, type LayoutSpec, type StateMap } from "../../vendor/slot-ui-core/index";
import type { SicBoBetType } from "../../../../server/model/types.js";

export interface TableOptions {
  id: string;
  layout: LayoutSpec;
}

/**
 * Состояние стола Sic Bo.
 *
 * GridControl НЕ переиспользован намеренно: он моделирует ОДНОРОДНЫЕ ячейки с
 * состояниями hidden/revealed/marked/disabled (mines 5×5, keno 80 чисел), а
 * зона стола Sic Bo несёт другое — сумму поставленных фишек и результат
 * броска. В четыре значения CellState это не укладывается.
 *
 * Принцип разделения тот же, что заложен в GridControl: в ядре только
 * СОСТОЯНИЕ и кликабельность, геометрия и арт живут в игре (tableGeometry,
 * zoneArt), потому что они жанровые.
 */
export class SicBoTableControl extends Control {
  readonly states: StateMap = {
    idle: { interactable: true },
    // Во время броска и показа результата стол гаснет и не принимает ставки.
    disabled: { interactable: false, transition: new Fade(0.6, 150) },
  };

  /** Зона → сумма ставки в минорных юнитах. Пустые зоны в карте не хранятся. */
  private readonly amounts = new Map<SicBoBetType, number>();
  /** Зоны, выигравшие в последнем броске. */
  private winning = new Set<SicBoBetType>();
  private readonly listeners = new Set<(changed?: SicBoBetType) => void>();

  constructor(opts: TableOptions) {
    super({ id: opts.id, role: "grid", layout: opts.layout }, "idle");
  }

  private notify(changed?: SicBoBetType): void {
    for (const f of this.listeners) f(changed);
  }

  /**
   * Подписка на изменения зон — вьюха перерисовывается по ней.
   *
   * Слушателю передаётся ЗОНА, которая изменилась (или undefined, если
   * изменилось всё сразу — например, подсветка выигрышей). Вьюха по этому
   * признаку обновляет одну зону вместо всех пятидесяти: типичный тап по столу
   * шлёт десяток уведомлений подряд, и полная перерисовка на каждое сжигала
   * кадры и мешала бы анимации фишек.
   */
  onChange(fn: (changed?: SicBoBetType) => void): () => void {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }

  amountAt(type: SicBoBetType): number {
    return this.amounts.get(type) ?? 0;
  }

  setAmount(type: SicBoBetType, amount: number): void {
    // Ноль — это «зона свободна», а не «на зоне лежит 0»: иначе occupied()
    // возвращал бы пустые зоны, и вьюха рисовала бы стопки без фишек.
    if (amount <= 0) this.amounts.delete(type);
    else this.amounts.set(type, amount);
    this.notify(type);
  }

  /**
   * Занятые зоны — по ним вьюха рисует стопки фишек. КОПИЯ, а не живые ключи:
   * типичный вызывающий обнуляет зоны в цикле по этому списку, и итератор Map
   * ломался бы прямо под ним.
   */
  occupied(): SicBoBetType[] {
    return Array.from(this.amounts.keys());
  }

  /** Подсветить выигравшие зоны. Полностью заменяет прошлую подсветку. */
  highlight(types: readonly SicBoBetType[]): void {
    this.winning = new Set(types);
    this.notify();
  }

  isWinning(type: SicBoBetType): boolean {
    return this.winning.has(type);
  }

  /** Новый раунд: ни ставок, ни подсветки. */
  reset(): void {
    this.amounts.clear();
    this.winning.clear();
    this.notify();
  }
}
