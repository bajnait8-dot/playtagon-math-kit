import { Container, Graphics, Text } from "pixi.js";
import { ControlView } from "../vendor/slot-ui-pixi/index";
import type { Control, OpenUI, ScreenState } from "../vendor/slot-ui-core/index";

export interface LimitsPlateOptions {
  /** Допустимые ставки от RGS (init.bets.normal), минорные юниты. */
  bets: readonly number[];
  /** Формат суммы с валютой — из init.currency. */
  format(minor: number): string;
}

/**
 * Общая ширина левой колонки: плашка лимитов и статистика бросков стоят одна
 * под другой, и разнобой по ширине читается как ошибка вёрстки. Держим здесь,
 * а не в каждой вьюхе, чтобы не разъезжались.
 */
export const PLATE_W = 220;

export interface LimitsPlate {
  root: Container;
  /** Перестроить под ориентацию: ландшафт — две строки, портрет — одна. */
  layout(orientation: "landscape" | "portrait"): void;
}

/**
 * Плашка лимитов над столом: MAX - $50 / MIN - $0.1.
 *
 * ЧИСЛА НЕ ХАРДКОДЯТСЯ. Список допустимых ставок приходит от RGS через
 * transport.init() (init.bets.normal), оттуда же валюта. Хардкод начал бы врать
 * при смене конфигурации на платформе — и заметил бы это не разработчик, а
 * игрок.
 */
/**
 * Границы ставки из списка RGS. Вынесено отдельно от вьюхи, чтобы требование
 * «числа приходят от платформы» проверялось тестом без Pixi.
 */
export function betBounds(bets: readonly number[]): { min: number; max: number } {
  if (bets.length === 0) return { min: 0, max: 0 };
  return { min: Math.min(...bets), max: Math.max(...bets) };
}

export function makeLimitsPlate(opts: LimitsPlateOptions): LimitsPlate {
  const root = new Container();
  const bg = new Graphics();
  root.addChild(bg);

  const { min, max } = betBounds(opts.bets);

  const style = {
    fontFamily: "Oswald, system-ui, sans-serif",
    fontSize: 22,
    fill: 0xe8e2cc,
  } as const;

  const maxText = new Text({ text: `MAX - ${opts.format(max)}`, style });
  const minText = new Text({ text: `MIN - ${opts.format(min)}`, style });
  root.addChild(maxText, minText);

  const PAD_X = 18;
  const PAD_Y = 10;
  const GAP = 26;

  const paint = (w: number, h: number): void => {
    bg.clear();
    // Без обводки: рамка дробила левую колонку на коробочки — плашка и
    // статистика под ней читаются как один блок.
    // Чёрная, а не зеленоватая: на сине-зелёном сукне тёмно-зелёная плашка
    // читалась как его продолжение, а не как отдельная табличка.
    bg.roundRect(0, 0, w, h, 8).fill({ color: 0x000000, alpha: 0.82 });
  };

  return {
    root,

    layout(orientation) {
      if (orientation === "landscape") {
        // Две строки по центру фиксированной ширины — она общая со статистикой
        // под плашкой, поэтому от текста не зависит.
        maxText.position.set((PLATE_W - maxText.width) / 2, PAD_Y);
        minText.position.set((PLATE_W - minText.width) / 2, PAD_Y + maxText.height + 4);
        paint(PLATE_W, maxText.height + minText.height + 4 + PAD_Y * 2);
      } else {
        // Одна строка: MAX - $50   MIN - $0.1
        maxText.position.set(PAD_X, PAD_Y);
        minText.position.set(PAD_X + maxText.width + GAP, PAD_Y);
        const w = maxText.width + GAP + minText.width + PAD_X * 2;
        paint(w, maxText.height + PAD_Y * 2);
      }
    },
  };
}

/**
 * Плашка лимитов КАК КОНТРОЛ системы раскладки.
 *
 * Раньше она висела прямо на сцене и позиционировалась руками в layoutOverlays
 * — то есть не масштабировалась со screen.scale и не переезжала по ориентации.
 * Теперь позицию задаёт LayoutSpec, а вьюха лишь перестраивает внутренний
 * порядок строк (в ландшафте две, в портрете одна).
 */
export function limitsPlateView(opts: LimitsPlateOptions) {
  return (c: Control, ui: OpenUI): ControlView => new LimitsPlateView(c, ui, opts);
}

class LimitsPlateView extends ControlView {
  private readonly plate: LimitsPlate;

  constructor(control: Control, ui: OpenUI, opts: LimitsPlateOptions) {
    super(control, ui);
    this.plate = makeLimitsPlate(opts);
    this.addChild(this.plate.root);
  }

  override applyLayout(screen: ScreenState): void {
    super.applyLayout(screen);
    // Ландшафт — две строки, портрет — одна: решает ориентация экрана, а не
    // вызывающий.
    this.plate.layout(screen.width >= screen.height ? "landscape" : "portrait");
  }
}
