import { Control, type StateMap } from '../control/Control';
import { Signal } from '../signal';
import type { LayoutSpec } from '../layout/anchor';

export interface LadderOptions {
  id: string;
  layout: LayoutSpec;
  /** Ступени по возрастанию (mines: множители за каждую открытую клетку). */
  steps: readonly number[];
  /** Стартовый индекс; −1 (по умолчанию) = ни одна ступень не достигнута. */
  index?: number;
  label?: string;
}

/**
 * Лестница коэффициентов с подсветкой достигнутой ступени: mines множители,
 * plinko слоты, keno попадания, crash кривая. Не интерактивна — игра двигает
 * её `advance()`/`reset()`, вид показывает.
 *
 * Геттер достигнутого значения называется `value`, а НЕ `current`: `current`
 * у базового Control уже занят именем состояния FSM.
 */
export class LadderControl extends Control {
  readonly states: StateMap = { idle: { interactable: false } };
  readonly index: Signal<number>;
  readonly label?: string;
  private steps: readonly number[];

  constructor(opts: LadderOptions) {
    super({ id: opts.id, role: 'progressbar', layout: opts.layout }, 'idle');
    this.steps = opts.steps;
    this.label = opts.label;
    this.index = new Signal<number>(this.clamp(opts.index ?? -1));
  }

  private clamp(i: number): number {
    if (!this.steps.length) return -1;
    return Math.max(-1, Math.min(this.steps.length - 1, Math.trunc(i)));
  }

  /** Достигнутая ступень, либо null, если ещё ни одной. */
  get value(): number | null {
    const i = this.index.get();
    return i >= 0 && i < this.steps.length ? this.steps[i]! : null;
  }

  /** Следующая ступень, либо null на вершине. */
  get next(): number | null {
    const i = this.index.get() + 1;
    return i < this.steps.length ? this.steps[i]! : null;
  }

  /** Все ступени — для отрисовки. */
  get all(): readonly number[] {
    return this.steps;
  }

  advance(): void {
    this.index.set(this.clamp(this.index.get() + 1));
  }

  reset(): void {
    this.index.set(-1);
  }

  setSteps(steps: readonly number[], index?: number): void {
    this.steps = steps;
    this.index.set(this.clamp(index ?? this.index.get()));
  }
}
