import { Container, Graphics, Text } from "pixi.js";
import type { Zone } from "./tableGeometry";

/**
 * Подсказка над зоной: что это за ставка, сколько на ней лежит и сколько
 * платит. Всплывает по наведению.
 *
 * Живёт в СВОЁМ слое поверх стола, а не внутри зоны: зоны рисуются по порядку,
 * и подсказка, вложенная в свою, уходила бы под соседние справа и снизу.
 */

const PAD_X = 22;
const PAD_Y = 18;
const RADIUS = 18;
const TAIL_W = 22;
const TAIL_H = 14;
/** Зазор между кончиком хвостика и верхней кромкой зоны. */
const GAP = 6;

const FONT = "Oswald, system-ui, sans-serif";
const GOLD = 0xd9c07a;
const CREAM = 0xf2efe0;

/** Подложка карточки — темнее плашек зон: подсказка лежит ПОВЕРХ стола. */
const BODY = 0x081b1b;

/**
 * Заголовок подсказки. У зон сумм label — голое число («10»), и само по себе
 * оно ничего не объясняет: добавляем «SUM».
 */
export function tooltipTitle(zone: Zone): string {
  return zone.type.startsWith("total_") ? `SUM ${zone.label}` : zone.label;
}

export interface ZoneTooltip {
  view: Container;
  /**
   * Показать у зоны.
   * @param at верхняя кромка зоны, центр — в осях СТОЛА
   * @param bet текущая ставка на зоне, уже отформатированная
   * @param bounds прямоугольник стола, за который нельзя вылезать: подсказка
   *   сама выберет сторону и подвинется вдоль края
   */
  show(
    zone: Zone,
    at: { x: number; y: number },
    bet: string,
    bounds: { minX: number; maxX: number; minY: number },
  ): void;
  hide(): void;
  dispose(): void;
}

export function makeZoneTooltip(): ZoneTooltip {
  const root = new Container();
  root.visible = false;
  // Подсказка только рисует — тапы должны доходить до зоны под ней.
  root.eventMode = "none";

  const bg = new Graphics();
  const title = new Text({
    text: "",
    style: { fontFamily: FONT, fontSize: 26, fontWeight: "700", fill: GOLD },
  });
  title.anchor.set(0.5, 0);

  // Две строки «подпись: значение». Держим тексты парами, чтобы выравнивать
  // подписи по левому краю, а значения по правому — как в макете.
  const betKey = new Text({ text: "BET:", style: { fontFamily: FONT, fontSize: 20, fontWeight: "700", fill: CREAM } });
  const betVal = new Text({ text: "", style: { fontFamily: FONT, fontSize: 20, fontWeight: "700", fill: CREAM } });
  const payKey = new Text({ text: "PAYS:", style: { fontFamily: FONT, fontSize: 20, fontWeight: "700", fill: CREAM } });
  const payVal = new Text({ text: "", style: { fontFamily: FONT, fontSize: 20, fontWeight: "700", fill: CREAM } });
  betVal.anchor.set(1, 0);
  payVal.anchor.set(1, 0);

  root.addChild(bg, title, betKey, betVal, payKey, payVal);

  const show = (
    zone: Zone,
    at: { x: number; y: number },
    bet: string,
    bounds: { minX: number; maxX: number; minY: number },
  ): void => {
    title.text = tooltipTitle(zone);
    betVal.text = bet;
    payVal.text = zone.payoutLabel;

    // Ширина — по самой длинной строке: заголовку или паре «ключ + значение».
    const rowW = Math.max(
      betKey.width + betVal.width,
      payKey.width + payVal.width,
    ) + 28;                                  // зазор между колонками
    const w = Math.max(title.width, rowW) + PAD_X * 2;
    const h = PAD_Y * 2 + title.height + 10 + betKey.height + 6 + payKey.height;

    // ── выбор стороны ────────────────────────────────────────────────────────
    // СНИЗУ, если сверху не помещается: у верхнего ряда зон (SMALL/BIG) над
    // ними места нет, и подсказка уезжала за кромку стола.
    const below = at.y - GAP - h - TAIL_H < bounds.minY;
    // По горизонтали двигаем вдоль края, а хвостик оставляем НАД ЗОНОЙ: он
    // должен показывать на сектор, даже когда карточка сдвинута.
    const half = w / 2;
    const cx = Math.max(bounds.minX + half, Math.min(at.x, bounds.maxX - half));
    const tailX = at.x - cx;                 // смещение хвостика внутри карточки

    const x0 = -half;
    // Тело: над точкой (y0 отрицательный) или под ней.
    const y0 = below ? TAIL_H : -h;
    bg.clear()
      .roundRect(x0, y0, w, h, RADIUS).fill({ color: BODY, alpha: 0.97 })
      .roundRect(x0, y0, w, h, RADIUS).stroke({ width: 1, color: CREAM, alpha: 0.55 });

    // Хвостик смотрит НА зону: вниз у верхней подсказки, вверх у нижней.
    // Кламп по краям карточки — чтобы он не съезжал за её скругления.
    const tx = Math.max(x0 + RADIUS + TAIL_W, Math.min(tailX, x0 + w - RADIUS - TAIL_W));
    const ty = below ? TAIL_H : 0;
    const tip = below ? 0 : TAIL_H;
    const tail = (g: Graphics): Graphics =>
      g.moveTo(tx - TAIL_W / 2, ty).lineTo(tx, tip).lineTo(tx + TAIL_W / 2, ty);
    tail(bg).fill({ color: BODY, alpha: 0.97 });
    tail(bg).stroke({ width: 1, color: CREAM, alpha: 0.55 });

    title.position.set(0, y0 + PAD_Y);
    const rowY = y0 + PAD_Y + title.height + 10;
    betKey.position.set(x0 + PAD_X, rowY);
    betVal.position.set(x0 + w - PAD_X, rowY);
    payKey.position.set(x0 + PAD_X, rowY + betKey.height + 6);
    payVal.position.set(x0 + w - PAD_X, rowY + betKey.height + 6);

    root.position.set(cx, below ? at.y + zone.h + GAP : at.y - GAP);
    root.visible = true;
  };

  return {
    view: root,
    show,
    hide: () => { root.visible = false; },
    dispose: () => { if (!root.destroyed) root.destroy({ children: true }); },
  };
}
