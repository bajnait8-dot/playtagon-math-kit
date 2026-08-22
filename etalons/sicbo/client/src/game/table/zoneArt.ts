import { Container, Graphics, Text, type TextStyleOptions } from "pixi.js";
import { FACES } from "../../../../server/model/config.js";
import type { Zone } from "./tableGeometry";

/**
 * Плейсхолдерный арт зоны: рамка, подпись, коэффициент, пипсы кубиков.
 * Настоящий арт заменит только рисование — геометрия, хит-зона и состояния
 * уже правильные (тот же приём, что в mines-pixi/cellArt).
 *
 * Палитра снята с референса: тёмно-зелёное сукно, кремовые кубики, светлая
 * рамка. Пипсы рисуем кругами — арт кубиков придёт от художника.
 */

/** Состояние зоны на столе. */
export type ZoneVisual = "idle" | "hover" | "winning" | "dimmed";

/**
 * Плашки — тёмный холодный зелёный, ТЕМНЕЕ травяного сукна (BG_COLOR): в один
 * тон с фоном грид растворялся, а так он собран светлой подложкой и держит
 * форму сам.
 */
export const ZONE_DARK = 0x113535;

const FILL: Record<ZoneVisual, number> = {
  idle: ZONE_DARK,
  hover: ZONE_DARK,      // ховер плашку не подсвечивает — белеет только текст
  // Выигравшая зона — СВЕТЛО-ОХРОВАЯ, инверсия обычной: плашка загорается, а
  // печать на ней темнеет. Тёмные варианты (и зелёный #3f7d3a, и почти чёрный
  // #04120f) читались как «зона другого типа», а не как «сюда пришёл выигрыш».
  winning: 0xd8bd7e,
  dimmed: 0x16302f,
};

const STROKE: Record<ZoneVisual, number> = {
  idle: 0x8fb4ad,
  hover: 0xd8e8e4,
  winning: 0xf0c04a,
  dimmed: 0x4d6b66,
};

/** Печать на выигравшей зоне ТЁМНАЯ: плашка под ней светло-охровая. */
const WIN_DIE = 0x14332c;
const WIN_TEXT = 0x14332c;

/** Шрифт подписей на гриде — рукописный Julee (см. loadFonts в main). */
const GRID_FONT = "Julee, Oswald, system-ui, sans-serif";

/**
 * Шрифт СЛУЖЕБНЫХ строк: диапазон, коэффициент, оговорки. Рукописный Julee
 * хорош для названия ставки, но на мелком кегле цифры в нём плывут — их
 * набираем узким Oswald, как весь остальной интерфейс.
 */
const INFO_FONT = "Oswald, system-ui, sans-serif";

/** Кубик тёплой охры с тёмными пипсами — как на референсе. */
const DIE_FILL = 0xc9ad6a;
const DIE_PIP = 0x1a2420;

const RADIUS = 18;

/** Доля ширины под кубики у зон с splitPayout; остальное — под коэффициент. */
const SPLIT_DICE_COL = 0.72;

/** Толщина рамки выигравшей зоны — единственной, у которой рамка осталась. */
const STROKE_W_WIN = 5;

/**
 * ВСЕ подписи зоны рисуются БЕЛЫМИ, а нужный цвет накладывает tint в paint.
 * Иначе ховер не работает: tint умножает цвет, и кремовый текст умножением на
 * белый так кремовым и остаётся — побелеть ему не с чего.
 */
const labelStyle = (size: number): TextStyleOptions => ({
  fontFamily: GRID_FONT,
  fontSize: size,
  fill: 0xffffff,
  align: "center",
});

/**
 * Цвет служебных строк (коэффициенты, диапазоны) — тёмное золото, ТОТ ЖЕ, что
 * у корпуса кубиков: цифры и кубики на зоне читаются как один слой.
 * Держать в паре с DIE_FILL.
 */
const INFO_COLOR = 0xc9ad6a;

/** Названия ставок — светлее охры, чтобы держать иерархию с коэффициентами. */
const LABEL_COLOR = 0xe8d9a8;

/**
 * Коэффициенты набраны Oswald, а не рукописным Julee: это цифры, они несут
 * смысл, и на мелком кегле Julee их «плывущие» формы читаются плохо. Julee
 * остаётся для названий ставок.
 */
const payoutStyle = (size: number): TextStyleOptions => ({
  fontFamily: INFO_FONT,
  fontSize: size,
  fontWeight: "300",
  letterSpacing: 0.5,
  fill: 0xffffff,   // цвет накладывает tint — см. labelStyle
  align: "center",
});

/**
 * Насколько середина ВИДИМЫХ пикселей текста смещена от середины строки по
 * метрикам шрифта. У Julee сверху заложен большой запас под выносные, из-за
 * него anchor 0.5 сажает надпись ниже центра зоны.
 *
 * Меряем через 2D-канвас: `actualBoundingBoxAscent/Descent` дают границы
 * именно нарисованных пикселей, а не номинальную высоту строки. Результат
 * в тех же единицах, что fontSize, — прибавлять его можно прямо к position.
 */
function inkOffsetY(text: Text): number {
  const size = Number(text.style.fontSize) || 0;
  if (!size) return 0;
  const ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) return 0;
  ctx.font = `${size}px ${text.style.fontFamily}`;
  const m = ctx.measureText(text.text);
  const asc = m.actualBoundingBoxAscent;
  const desc = m.actualBoundingBoxDescent;
  if (!Number.isFinite(asc) || !Number.isFinite(desc)) return 0;
  // Центр видимых пикселей относительно базовой линии …
  const inkMid = (desc - asc) / 2;
  // … и центр строки по метрикам, куда Pixi ставит anchor 0.5.
  const boxMid = (Number(m.fontBoundingBoxDescent) - Number(m.fontBoundingBoxAscent)) / 2;
  const d = inkMid - boxMid;
  return Number.isFinite(d) ? d : 0;
}

/** Раскладка пипсов на грани — та же, что на настоящем кубике. */
const PIP_LAYOUT: Record<number, Array<[number, number]>> = {
  1: [[0.5, 0.5]],
  2: [[0.28, 0.28], [0.72, 0.72]],
  3: [[0.25, 0.25], [0.5, 0.5], [0.75, 0.75]],
  4: [[0.28, 0.28], [0.72, 0.28], [0.28, 0.72], [0.72, 0.72]],
  5: [[0.26, 0.26], [0.74, 0.26], [0.5, 0.5], [0.26, 0.74], [0.74, 0.74]],
  6: [[0.28, 0.22], [0.72, 0.22], [0.28, 0.5], [0.72, 0.5], [0.28, 0.78], [0.72, 0.78]],
};

/** Один кубик заданной грани в точке (x, y) размером size. */
export function drawDie(
  g: Graphics,
  x: number,
  y: number,
  size: number,
  face: number,
  // Цвет корпуса. По умолчанию — бежевый под сукно стола; статистика бросков
  // просит белый, там кубики на тёмной плашке.
  fill: number = DIE_FILL,
): void {
  g.roundRect(x, y, size, size, size * 0.18).fill(fill);
  const r = Math.max(1.4, size * 0.085);
  for (const [fx, fy] of PIP_LAYOUT[face] ?? []) {
    g.circle(x + fx * size, y + fy * size, r).fill(DIE_PIP);
  }
}

export interface ZoneArt {
  root: Container;
  /** Перерисовать зону в новом визуальном состоянии. */
  setVisual(v: ZoneVisual): void;
}

/**
 * Собрать одну зону. Возвращает контейнер, спозиционированный вызывающим:
 * сам арт рисуется от (0,0) размером зоны.
 */
export function makeZoneArt(zone: Zone): ZoneArt {
  const root = new Container();
  const bg = new Graphics();
  const dice = new Graphics();
  // Все подписи зоны живут в одном контейнере: ховер перекрашивает их разом,
  // не трогая рамку и заливку.
  const labels = new Container();
  root.addChild(bg, dice, labels);

  /** Контур зоны: скруглены только те углы, что просит геометрия. */
  const outline = (g: Graphics): void => {
    const r = zone.round ?? { tl: true, tr: true, br: true, bl: true };
    const { w, h } = zone;
    const R = RADIUS;
    g.moveTo(r.tl ? R : 0, 0);
    g.lineTo(w - (r.tr ? R : 0), 0);
    if (r.tr) g.arcTo(w, 0, w, R, R); else g.lineTo(w, 0);
    g.lineTo(w, h - (r.br ? R : 0));
    if (r.br) g.arcTo(w, h, w - R, h, R); else g.lineTo(w, h);
    g.lineTo(r.bl ? R : 0, h);
    if (r.bl) g.arcTo(0, h, 0, h - R, R); else g.lineTo(0, h);
    g.lineTo(0, r.tl ? R : 0);
    if (r.tl) g.arcTo(0, 0, R, 0, R); else g.lineTo(0, 0);
    g.closePath();
  };

  const paint = (v: ZoneVisual): void => {
    bg.clear();
    // Ховер НЕ подсвечивает ни заливку, ни рамку — на нём белеет только текст
    // (см. tint ниже). Подсветка плашки перебивала фишки, лежащие на зоне.
    const base: ZoneVisual = v === "hover" ? "idle" : v;
    outline(bg);
    bg.fill(FILL[base]);
    // Рамки у зон НЕТ — ни у одной, включая выигравшую: та отличается светлой
    // заливкой, и обводка поверх неё только дробила форму.
    // Подписи белеют на ховере: единственный отклик зоны на курсор. Служебные
    // строки (коэффициент, диапазон) в покое приглушены — на ховере
    // выравниваются с названием до белого.
    for (const t of labels.children) {
      // Названия чуть СВЕТЛЕЕ охры служебных строк: иначе крупные цифры сумм
      // теряют вес и ярус читается ровным полем.
      t.tint = v === "hover" ? 0xffffff
        : v === "winning" ? WIN_TEXT
        : (t.label === "info" ? INFO_COLOR : LABEL_COLOR);
    }
    // Кубики зоны белеют вместе с подписями: на ховере вся «печать» на плашке
    // подсвечивается разом. Перерисовываем, а не тинтуем: tint умножает и
    // осветлить кремовый до чистого белого им нельзя.
    drawZoneDice(v === "hover" ? 0xffffff : v === "winning" ? WIN_DIE : DIE_FILL);
  };

  // paint вызывается В КОНЦЕ сборки: он перекрашивает подписи, а их ещё нет.

  /**
   * Перерисовать ВСЕ кубики зоны заданным цветом корпуса: и сетку ANY TRIPLE,
   * и обычный ряд. Вызывается из paint, потому что на ховере кубики белеют, а
   * tint осветлить кремовый до белого не может — только перерисовка.
   */
  function drawZoneDice(fill: number): void {
    dice.clear();

    // ── ANY TRIPLE: сетка всех шести троек (1-1-1 … 6-6-6) ────────────────
    // Показываем, ЧТО именно выигрывает: без кубиков зона читалась как пустая
    // плашка с подписью.
    if (zone.tripleGrid) {
      // Узкая и высокая зона (портрет) — ОДНА колонка из шести троек; широкая
      // и низкая (ландшафт) — две по три. Жёсткие 2×3 в портретном столбце
      // сплющивали кубики до нечитаемого.
      const COLS = zone.h > zone.w * 1.6 ? 1 : 2;
      const ROWS = 6 / COLS;
      const padX = zone.w * 0.06;
      // Заголовок и коэффициент вынесены НАД плашкой (hideLabel/hidePayout) —
      // сетка занимает её целиком, только с полями по краям.
      const padTop = zone.h * (zone.hideLabel ? 0.07 : 0.2);
      const padBottom = zone.h * (zone.hidePayout ? 0.07 : 0.12);
      // Между столбцами нужен ПРОСВЕТ, иначе тройка 1-1-1 упирается в 4-4-4 и
      // шесть комбинаций читаются как одна каша из кубиков.
      const colGap = zone.w * 0.08;
      const cellW = (zone.w - padX * 2 - colGap) / COLS;
      const cellH = (zone.h - padTop - padBottom) / ROWS;
      // Три кубика в строке + два зазора между ними.
      const die = Math.min(cellW / 3.4, cellH * 0.72);
      const gap = die * 0.16;
      const rowW = die * 3 + gap * 2;

      FACES.forEach((face, i) => {
        const c = i < ROWS ? 0 : 1;              // левый столбец 1-3, правый 4-6
        const r = i % ROWS;
        const x0 = padX + c * (cellW + colGap) + (cellW - rowW) / 2;
        const y0 = padTop + r * cellH + (cellH - die) / 2;
        for (let k = 0; k < 3; k++) drawDie(dice, x0 + k * (die + gap), y0, die, face, fill);
      });
    }

    // ── Две колонки: кубики слева, коэффициент справа (тройки) ────────────
    // Отдельная ветка, потому что здесь кубики делят зону ПО ШИРИНЕ с цифрой,
    // а не занимают её целиком.
    if (zone.splitPayout && zone.pips.length > 0) {
      const n = zone.pips.length;
      const colW = zone.w * SPLIT_DICE_COL;
      // Поле одинаковое по горизонтали и вертикали — см. общую ветку ниже.
      const pad = Math.max(6, Math.min(colW, zone.h) * 0.14);
      const gapRatio = 0.12;
      const size = Math.min(
        (colW - pad * 2) / (n + gapRatio * (n - 1)),
        zone.h - pad * 2,
      );
      const gap = size * gapRatio;
      const totalLen = size * n + gap * (n - 1);
      const x0 = (colW - totalLen) / 2;
      const y0 = zone.h * 0.5 - size / 2;
      zone.pips.forEach((face, i) => {
        drawDie(dice, x0 + i * (size + gap), y0, size, face, fill);
      });
      return;
    }

    // ── Кубики зоны (даблы, тройки, комбинации, single) ───────────────────
    if (zone.pips.length > 0) {
      const n = zone.pips.length;
      // Кубики выстраиваем в ряд, если зона шире, чем выше; иначе столбиком.
      const horizontal = zone.w >= zone.h;
      // Снизу зону подпирает коэффициент — кубики центруем в поле НАД ним, а
      // не в зоне целиком, иначе они кажутся сдвинутыми вниз. Там, где
      // коэффициент вынесен под блок (даблы), вычитать нечего.
      const payoutH = zone.hidePayout ? 0 : Math.min(zone.h * 0.18, 20) + 10;
      const boxH = zone.h - payoutH;
      const span = horizontal ? zone.w : boxH;
      const cross = horizontal ? boxH : zone.w;
      // Поле ОДИНАКОВОЕ со всех сторон и в пикселях, а не долями: доли давали
      // 5% вдоль ряда против 24% поперёк, и кубики казались прижатыми к
      // торцам плашки.
      const pad = Math.max(8, Math.min(span, cross) * 0.14);
      const gapRatio = 0.12;
      // size × n + gap × (n−1) ≤ span − 2·pad, где gap = size × gapRatio.
      const size = Math.min(
        (span - pad * 2) / (n + gapRatio * (n - 1)),
        cross - pad * 2,
      );
      const gap = size * gapRatio;
      const totalLen = size * n + gap * (n - 1);
      const startMain = (span - totalLen) / 2;
      // Ровно по центру поперёк — без «поправки» вверх: место под коэффициент
      // уже вычтено из boxH.
      const crossPos = cross * 0.5 - size / 2;

      zone.pips.forEach((face, i) => {
        const main = startMain + i * (size + gap);
        const x = horizontal ? main : crossPos;
        const y = horizontal ? crossPos : main;
        drawDie(dice, x, y, size, face, fill);
      });
    }
  }

  // ── SMALL / BIG: две колонки ────────────────────────────────────────────
  // Слева крупное название рукописным Julee по центру своей половины, справа
  // две строки Oswald — диапазон с коэффициентом и оговорка. Раньше это было
  // три разнородных текста в одной колонке, и они наезжали друг на друга.
  if (zone.sublabel) {
    const [range, note] = zone.sublabel.split("|");
    const midX = zone.w * 0.5;   // колонки делят зону пополам

    // Название во всю высоту зоны — по макету оно «на два рядка», вровень с
    // двухстрочной правой колонкой. Кегль берём с запасом: у Julee маленький
    // x-height, и по номиналу шрифта буквы выходят заметно ниже строки.
    const name = new Text({
      text: zone.label,
      style: { ...labelStyle(Math.min(zone.h * 0.62, 52)), align: "center" },
    });
    // "info" — кремовый в покое, как кубики и коэффициенты: весь «печатный»
    // слой стола одного цвета, белым он становится только на ховере.
    name.label = "info";
    name.anchor.set(0.5);
    // По ВЕРТИКАЛИ центруем по фактическим пикселям букв, а не по метрикам
    // шрифта: у Julee большой внутренний отступ сверху (под выносные), и
    // anchor 0.5 сажает надпись заметно ниже середины зоны. Смещение считаем
    // в ЛОКАЛЬНЫХ координатах самого текста — глобальные тут дали бы улёт.
    name.position.set(midX / 2, zone.h * 0.5 + inkOffsetY(name));
    labels.addChild(name);

    // Обе строки правой колонки — один кегль и общая ось, чтобы читались как
    // абзац, а не как подпись с довеском.
    const infoSize = Math.min(zone.h * 0.26, 24);
    const infoX = midX + (zone.w - midX) / 2;
    for (const [i, text] of [`${range}  ${zone.payoutLabel}`, note ?? ""].entries()) {
      const t = new Text({
        text,
        style: payoutStyle(infoSize),
      });
      t.label = "info";
      t.anchor.set(0.5, 0.5);
      t.position.set(infoX, zone.h * (i === 0 ? 0.33 : 0.67));
      labels.addChild(t);
    }

    paint("idle");
    return { root, setVisual: paint };
  }

  // ── Подпись зоны ────────────────────────────────────────────────────────
  // У зон с кубиками подпись не нужна: кубики сами говорят, что это за ставка.
  // Текстовые зоны (суммы, SMALL/BIG, ANY TRIPLE) подписываются крупно.
  if (zone.pips.length === 0 && !zone.hideLabel) {
    const isTotal = zone.type.startsWith("total_");
    // Числа сумм (4…17) — главная цифра своей плашки, поэтому крупнее
    // остальных подписей; у Julee к тому же маленький x-height, и по номиналу
    // кегля буквы выходят ниже строки.
    const size = isTotal ? Math.min(zone.h * 0.62, 62) : Math.min(zone.h * 0.3, 34);
    const label = new Text({ text: zone.label, style: labelStyle(size) });
    label.anchor.set(0.5);
    if (isTotal) {
      // Крупная цифра центруется в поле НАД коэффициентом (иначе наезжает на
      // него) и правится по видимым пикселям — у Julee сверху большой запас
      // под выносные, и anchor 0.5 сажает цифру ниже середины.
      const payoutH = Math.min(zone.h * 0.18, 20) + 6;
      label.position.set(zone.w / 2, (zone.h - payoutH) / 2 + inkOffsetY(label));
    } else {
      // У зоны с сеткой троек заголовок прижат К ВЕРХУ: по центру он лёг бы
      // прямо на кубики.
      label.position.set(zone.w / 2, zone.h * (zone.tripleGrid ? 0.1 : 0.42));
    }
    labels.addChild(label);
  }

  // ── Коэффициент ─────────────────────────────────────────────────────────
  // Зоны с двумя колонками (SMALL/BIG) сюда не доходят: там коэффициент
  // склеен с диапазоном в правой колонке и функция уже вернулась.
  // hidePayout — у даблов: там коэффициент общий на блок и вынесен под него.
  if (!zone.hidePayout) {
    // splitPayout — коэффициент стоит СПРАВА от кубиков, в своей колонке, а не
    // под ними: зона низкая, и снизу для него нет места.
    const split = zone.splitPayout === true;
    const payout = new Text({
      text: zone.payoutLabel,
      // В своей колонке (тройки) коэффициент крупнее: места под него больше.
      style: payoutStyle(split ? Math.min(zone.h * 0.3, 22) : Math.min(zone.h * 0.18, 20)),
    });
    payout.label = "info";
    if (split) {
      payout.anchor.set(0.5, 0.5);
      payout.position.set(zone.w * SPLIT_DICE_COL + (zone.w * (1 - SPLIT_DICE_COL)) / 2, zone.h / 2);
    } else {
      payout.anchor.set(0.5, 1);
      payout.position.set(zone.w / 2, zone.h - 6);
    }
    labels.addChild(payout);
  }

  paint("idle");
  return { root, setVisual: paint };
}
