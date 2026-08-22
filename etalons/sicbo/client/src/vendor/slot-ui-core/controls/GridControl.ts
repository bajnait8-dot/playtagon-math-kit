import { Control, type StateMap } from '../control/Control';
import { Signal } from '../signal';
import { Fade } from '../transition/Transition';
import type { LayoutSpec } from '../layout/anchor';
import type { EventBus } from '../events';
import type { OpenUIEvents } from '../types';

/** Состояние одной ячейки. `marked` — выбрана, но ещё не раскрыта (keno). */
export type CellState = 'hidden' | 'revealed' | 'marked' | 'disabled';

export interface GridOptions {
  id: string;
  layout: LayoutSpec;
  /** Число ячеек (mines 5×5 = 25, keno = 80). Геометрию задаёт игра. */
  size: number;
}

/**
 * Состояние сетки кликабельных ячеек: mines 5×5, keno 80 чисел, plinko слоты.
 * В ядре — только СОСТОЯНИЕ и правила кликабельности; отрисовка и геометрия
 * (сколько колонок, какой арт) живут в игре, потому что они жанровые.
 */
export class GridControl extends Control {
  readonly states: StateMap = {
    idle: { interactable: true },
    disabled: { interactable: false, transition: new Fade(0.5, 150) },
  };

  readonly cells: Signal<readonly CellState[]>;

  constructor(opts: GridOptions, private readonly bus?: EventBus<OpenUIEvents>) {
    super({ id: opts.id, role: 'grid', layout: opts.layout }, 'idle');
    const size = Math.max(0, Math.trunc(opts.size));
    this.cells = new Signal<readonly CellState[]>(Array.from({ length: size }, () => 'hidden'));
  }

  get size(): number {
    return this.cells.get().length;
  }

  /** Состояние ячейки; за границами — 'disabled' (кликать нечего). */
  cellAt(i: number): CellState {
    return this.cells.get()[i] ?? 'disabled';
  }

  /** Иммутабельно: подписчики получают НОВЫЙ массив, иначе Signal сдедупит. */
  setCell(i: number, s: CellState): void {
    if (i < 0 || i >= this.size) return;
    const next = this.cells.get().slice();
    next[i] = s;
    this.cells.set(next);
  }

  setAll(s: CellState): void {
    this.cells.set(this.cells.get().map(() => s));
  }

  /** View зовёт это по клику. Эмитит только для реально кликабельной ячейки. */
  activateCell(i: number): void {
    if (!this.interactable) return;
    if (this.cellAt(i) !== 'hidden') return;
    this.bus?.emit('cellActivated', { id: this.id, index: i });
  }
}
