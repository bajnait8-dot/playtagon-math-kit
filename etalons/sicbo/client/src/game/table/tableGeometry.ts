import { COMBO_PAIRS, FACES, PAYOUTS, TOTALS } from "../../../../server/model/config.js";
import type { SicBoBetType } from "../../../../server/model/types.js";

export type Orientation = "landscape" | "portrait";

export interface Zone {
  type: SicBoBetType;
  x: number; y: number; w: number; h: number;
  /** Подпись зоны: «SMALL», «4», «TRIPLE 3». */
  label: string;
  /** Коэффициент как на столе: «1:1», «180:1». */
  payoutLabel: string;
  /** Какие кубики рисовать в зоне; пусто — зона текстовая (суммы, SMALL/BIG). */
  pips: number[];
  /**
   * Сетка троек внутри зоны (ANY TRIPLE): шесть строк по три кубика — 1-1-1
   * … 6-6-6. Отдельно от `pips`, потому что тот рисует ОДИН ряд, а здесь
   * нужна сетка 2×3 из троек.
   */
  tripleGrid?: boolean;
  /** Вторая строка мелким шрифтом: диапазон и оговорки («4-10 EXCEPT TRIPLES»). */
  sublabel?: string;
  /**
   * Какие углы скруглять. SMALL и BIG стоят вплотную и читаются как ОДНА
   * планка: у стыка углы прямые, скруглены только внешние. По умолчанию
   * (поле не задано) скругляются все четыре.
   */
  round?: { tl: boolean; tr: boolean; br: boolean; bl: boolean };
  /**
   * Не рисовать коэффициент внутри зоны. Ставится там, где он общий на целый
   * блок и вынесен под него отдельной подписью (даблы: «EACH DOUBLE 10:1»).
   * На выплату не влияет — это только про рисование.
   */
  hidePayout?: boolean;
  /**
   * Плашка делится на ДВЕ КОЛОНКИ: слева кубики, справа коэффициент. Так
   * свёрстаны тройки — зона низкая, и в два ряда (кубики над цифрой) кубики
   * выходили мелкими.
   */
  splitPayout?: boolean;
  /**
   * Не рисовать название внутри зоны — оно вынесено в подпись блока
   * (ANY TRIPLE: заголовок и коэффициент стоят полосой НАД сеткой троек).
   */
  hideLabel?: boolean;
}

/**
 * Подпись под блоком зон — общий коэффициент, вынесенный из плашек наружу.
 * Не зона: ставить сюда нельзя, рисует её вьюха стола (как заголовок SIC BO).
 */
export interface BlockCaption {
  text: string;
  /** Центр подписи по горизонтали и её базовая линия. */
  cx: number;
  y: number;
  /**
   * Куда растёт текст от `y`: вниз (подпись ПОД блоком, по умолчанию) или
   * вверх (подпись НАД блоком — ANY TRIPLE).
   */
  above?: boolean;
  /** Крупная подпись — заголовок блока, а не мелкая строка коэффициента. */
  big?: boolean;
}

/**
 * Скругление половин планки SMALL/BIG — со ВСЕХ четырёх сторон, как у любой
 * другой зоны. Прямых углов у стыка с заголовком нет: половины стоят как
 * самостоятельные плашки, а не как разрезанная надвое полоса.
 */
const ROUND_ALL = { tl: true, tr: true, br: true, bl: true };
const ROUND_LEFT = ROUND_ALL;
const ROUND_RIGHT = ROUND_ALL;

/**
 * Размер стола в ДИЗАЙН-пикселях; на экран его масштабирует ControlView.
 *
 * Раскладка снята с референса: ландшафт — широкий стол в пять ярусов,
 * портрет — тот же стол, но группы ПЕРЕСТРОЕНЫ (суммы 2×7, комбинации 3×5),
 * а не сжаты по ширине.
 */
export const TABLE_SIZE: Record<Orientation, { w: number; h: number }> = {
  landscape: { w: 1360, h: 760 },
  portrait: { w: 700, h: 1240 },
};

const GAP = 6;

/**
 * Место под заголовок «SIC BO» МЕЖДУ SMALL и BIG — он разделяет их как герб
 * посередине стола. Рисует его вьюха стола: это не зона, ставить туда нельзя.
 *
 * Числа держим согласованными с landscapeLayout вручную: раскладка считает
 * половины от той же ширины HEAD_W.
 */
const HEAD_W = 300;

export const TITLE_BOX: Record<Orientation, { x: number; y: number; w: number; h: number } | null> = {
  landscape: { x: 20 + (1360 - 40 - HEAD_W) / 2, y: 20, w: HEAD_W, h: 78 },
  // В портрете первый ярус занят SMALL и BIG во всю ширину — заголовок над ними.
  portrait: { x: 16, y: 8, w: 668, h: 58 },
};

const payoutLabel = (t: SicBoBetType): string => `${PAYOUTS[t]}:1`;

/** Ряд одинаковых зон слева направо. */
function row(
  types: SicBoBetType[],
  x0: number, y: number, w: number, h: number,
  make: (t: SicBoBetType) => Pick<Zone, "label" | "pips">,
): Zone[] {
  return types.map((type, i) => ({
    type,
    x: x0 + i * (w + GAP),
    y, w, h,
    payoutLabel: payoutLabel(type),
    ...make(type),
  }));
}

const totalType = (s: number) => `total_${s}` as SicBoBetType;
const comboType = (a: number, b: number) => `combo_${a}${b}` as SicBoBetType;
const tripleType = (n: number) => `triple_${n}` as SicBoBetType;
const doubleType = (n: number) => `double_${n}` as SicBoBetType;
const singleType = (n: number) => `single_${n}` as SicBoBetType;

/** Single bet платит по числу совпадений — на столе это три подписи под рядом. */
const SINGLE_PAYOUT_LABEL = "1:1 / 2:1 / 3:1";

function landscapeLayout(): Zone[] {
  const { w: W } = TABLE_SIZE.landscape;
  const PAD = 20;
  const inner = W - PAD * 2;
  const zones: Zone[] = [];

  // ── Ярус 1: SMALL — заголовок SIC BO — BIG. ──────────────────────────────
  // Заголовок стоит МЕЖДУ половинами и разделяет их. Плашки отступают от него
  // на GAP: они скруглены со всех сторон, и вплотную скругления упирались бы
  // в надпись.
  const topY = 20;
  const topH = 78;
  const halfW = (inner - HEAD_W - GAP * 2) / 2;
  zones.push({
    type: "small", x: PAD, y: topY, w: halfW, h: topH,
    label: "SMALL", payoutLabel: "1:1", pips: [], sublabel: "4 - 10|EXCEPT TRIPLES",
    round: ROUND_LEFT,
  });
  zones.push({
    type: "big", x: PAD + halfW + GAP * 2 + HEAD_W, y: topY, w: halfW, h: topH,
    label: "BIG", payoutLabel: "1:1", pips: [], sublabel: "11 - 17|EXCEPT TRIPLES",
    round: ROUND_RIGHT,
  });

  // ── Ярус 2: даблы по краям, тройки и ANY TRIPLE в центре. ────────────────
  // Слева направо: 3 дабла | 3 тройки | ANY TRIPLE | 3 тройки | 3 дабла
  // Планка SMALL/BIG примыкает к ярусу ниже ВСТЫК, но не внахлёст: вплотную
  // (midY = topY + topH) рамки наезжали друг на друга и ярусы выглядели
  // слипшимися. GAP держит их раздельными, как и остальные ярусы.
  const midY = topY + topH + GAP;
  const midH = 210;
  // Ярус читается как ПЯТЬ равных блоков:
  //   даблы 1-3 | тройки 1-3 | ANY TRIPLE | тройки 4-6 | даблы 4-6
  // Каждому блоку — равная пятая часть ширины; внутри блока даблов три
  // колонки делят её поровну. Раньше dblW/trpW были константами в пикселях,
  // остаток доставался ANY TRIPLE, и ярус расползался.
  const BLOCKS = 5;
  const blockW = (inner - GAP * (BLOCKS - 1)) / BLOCKS;
  const dblW = (blockW - GAP * 2) / 3;   // три дабла внутри своего блока
  const trpW = blockW;                    // столбец троек — блок целиком
  const anyW = blockW;

  // Блок даблов ДВУХРЯДНЫЙ: сверху три вертикальные колонки, снизу полоса под
  // общую подпись «EACH DOUBLE 10:1». Полоса внутри габаритов яруса, поэтому
  // подпись остаётся в его рамке, а не висит под столом.
  const dblCaptionH = 26;
  const dblH = midH - dblCaptionH;

  let x = PAD;
  // левые даблы 1,2,3
  for (const n of [1, 2, 3]) {
    zones.push({
      type: doubleType(n), x, y: midY, w: dblW, h: dblH,
      label: `DOUBLE ${n}`, payoutLabel: "10:1", pips: [n, n], hidePayout: true,
    });
    x += dblW + GAP;
  }
  // левые тройки 1,2,3 — столбиком, поэтому делим высоту яруса на три
  const trpH = (midH - GAP * 2) / 3;
  for (const [i, n] of [1, 2, 3].entries()) {
    zones.push({
      type: tripleType(n), x, y: midY + i * (trpH + GAP), w: trpW, h: trpH,
      label: `TRIPLE ${n}`, payoutLabel: "180:1", pips: [n, n, n], splitPayout: true,
    });
  }
  x += trpW + GAP;
  // ANY TRIPLE по центру. Блок ДВУХРЯДНЫЙ, как даблы, только полоса под
  // подпись «ANY TRIPLE 30:1» сверху, а не снизу: сама плашка — чистая сетка
  // из шести троек. Полоса внутри габаритов яруса.
  const anyCaptionH = 26;
  zones.push({
    type: "triple_any", x, y: midY + anyCaptionH, w: anyW, h: midH - anyCaptionH,
    label: "ANY TRIPLE", payoutLabel: "30:1", pips: [], tripleGrid: true,
    hidePayout: true, hideLabel: true,
  });
  x += anyW + GAP;
  // правые тройки 4,5,6
  for (const [i, n] of [4, 5, 6].entries()) {
    zones.push({
      type: tripleType(n), x, y: midY + i * (trpH + GAP), w: trpW, h: trpH,
      label: `TRIPLE ${n}`, payoutLabel: "180:1", pips: [n, n, n], splitPayout: true,
    });
  }
  x += trpW + GAP;
  // правые даблы 4,5,6
  for (const n of [4, 5, 6]) {
    zones.push({
      type: doubleType(n), x, y: midY, w: dblW, h: dblH,
      label: `DOUBLE ${n}`, payoutLabel: "10:1", pips: [n, n], hidePayout: true,
    });
    x += dblW + GAP;
  }

  // ── Ярус 3: суммы 4…17 одним рядом. ──────────────────────────────────────
  const totY = midY + midH + 18;
  const totH = 96;
  const totW = (inner - GAP * (TOTALS.length - 1)) / TOTALS.length;
  zones.push(...row(
    TOTALS.map(totalType), PAD, totY, totW, totH,
    (t) => ({ label: t.slice("total_".length), pips: [] }),
  ));

  // ── Ярус 4: комбинации двух костей одним рядом из 15. ────────────────────
  // Блок ДВУХРЯДНЫЙ, как даблы: коэффициент у всех пятнадцати один и тот же,
  // и пятнадцать повторов «6:1» внутри плашек только съедали место у кубиков.
  // Теперь он вынесен полосой под ряд.
  const cmbY = totY + totH + 14;
  const cmbCaptionH = 26;
  const cmbH = 130;
  const cmbZoneH = cmbH - cmbCaptionH;
  const cmbW = (inner - GAP * (COMBO_PAIRS.length - 1)) / COMBO_PAIRS.length;
  zones.push(...COMBO_PAIRS.map(([a, b], i) => ({
    type: comboType(a, b),
    x: PAD + i * (cmbW + GAP), y: cmbY, w: cmbW, h: cmbZoneH,
    label: `${a}+${b}`, payoutLabel: "6:1", pips: [a, b], hidePayout: true,
  })));

  // ── Ярус 5: single-ставки на грань. ──────────────────────────────────────
  // Коэффициент здесь СОСТАВНОЙ (платит по числу совпадений), и «1:1/2:1/3:1»
  // внутри каждой плашки ничего не объясняло. Вынесен под ряд тремя строками
  // «appears on N of 3 — N:1», одинаковыми для всех шести граней.
  const sglY = cmbY + cmbH + 14;
  const sglCaptionH = 26;
  const sglH = 110;
  const sglZoneH = sglH - sglCaptionH;
  const sglW = (inner - GAP * 5) / 6;
  zones.push(...row(
    FACES.map(singleType), PAD, sglY, sglW, sglZoneH,
    (t) => ({ label: `SINGLE ${t.slice("single_".length)}`, pips: [Number(t.slice("single_".length))] }),
  ));
  for (const z of zones) {
    if (!z.type.startsWith("single_")) continue;
    z.payoutLabel = SINGLE_PAYOUT_LABEL;
    z.hidePayout = true;
  }

  return zones;
}

function portraitLayout(): Zone[] {
  const { w: W } = TABLE_SIZE.portrait;
  const PAD = 16;
  const inner = W - PAD * 2;
  const zones: Zone[] = [];

  // ── Ярус 1: SMALL и BIG в строку. ────────────────────────────────────────
  const topY = 74;              // под заголовком SIC BO
  const topH = 84;
  // Вплотную, как в ландшафте: одна планка из двух половин.
  const halfW = inner / 2;
  zones.push({
    type: "small", x: PAD, y: topY, w: halfW, h: topH,
    label: "SMALL", payoutLabel: "1:1", pips: [], sublabel: "4 - 10|EXCEPT TRIPLES",
    round: ROUND_LEFT,
  });
  zones.push({
    type: "big", x: PAD + halfW, y: topY, w: halfW, h: topH,
    label: "BIG", payoutLabel: "1:1", pips: [], sublabel: "11 - 17|EXCEPT TRIPLES",
    round: ROUND_RIGHT,
  });

  // ── Ярус 2 (по портретному референсу) ────────────────────────────────────
  //   ┌ даблы 1-3 ┬ ANY ┬ даблы 4-6 ┐   сверху: два блока по три в РЯД
  //   ├ подпись   │  T  │ подпись   ┤   «EACH DOUBLE 10:1» под каждым
  //   └ тройки1-3 ┴  R  ┴ тройки4-6 ┘   снизу: тройки строками
  // ANY TRIPLE — узкий столбец по центру во всю высоту яруса, его заголовок
  // вынесен НАД ним. Раньше даблы и тройки стояли столбиками во всю высоту,
  // и ярус читался пятью вертикальными полосами вместо двух этажей.
  const midY = topY + topH + GAP;
  const anyCaptionH = 22;
  const anyW = 150;
  // Боковой блок: три колонки даблов сверху, три строки троек снизу.
  const sideW = (inner - anyW - GAP * 2) / 2;
  const dblW = (sideW - GAP * 2) / 3;
  const dblH = 116;
  const dblCaptionH = 22;
  const trpH = 46;
  const trpTop = midY + dblH + dblCaptionH;
  const midH = dblH + dblCaptionH + trpH * 3 + GAP * 2;

  const lx = PAD;                       // левый блок
  const rx = PAD + sideW + anyW + GAP * 2; // правый блок

  for (const [side, group] of [[lx, [1, 2, 3]], [rx, [4, 5, 6]]] as const) {
    // даблы РЯДОМ, а не столбиком
    group.forEach((n, i) => {
      zones.push({
        type: doubleType(n), x: side + i * (dblW + GAP), y: midY, w: dblW, h: dblH,
        label: `DOUBLE ${n}`, payoutLabel: "10:1", pips: [n, n], hidePayout: true,
      });
    });
    // тройки строками во всю ширину блока
    group.forEach((n, i) => {
      zones.push({
        type: tripleType(n), x: side, y: trpTop + i * (trpH + GAP), w: sideW, h: trpH,
        label: `TRIPLE ${n}`, payoutLabel: "180:1", pips: [n, n, n], splitPayout: true,
      });
    });
  }

  // ANY TRIPLE — узкий столбец по центру, заголовок над ним.
  const anyX = PAD + sideW + GAP;
  zones.push({
    type: "triple_any", x: anyX, y: midY + anyCaptionH, w: anyW, h: midH - anyCaptionH,
    label: "ANY TRIPLE", payoutLabel: "30:1", pips: [], tripleGrid: true,
    hidePayout: true, hideLabel: true,
  });

  // ── Ярус 3: суммы ДВУМЯ рядами по 7 (4–10 / 11–17). ─────────────────────
  const totY = midY + midH + GAP * 2;
  const totH = 92;
  const totW = (inner - GAP * 6) / 7;
  const firstRow = TOTALS.slice(0, 7);
  const secondRow = TOTALS.slice(7);
  zones.push(...row(firstRow.map(totalType), PAD, totY, totW, totH,
    (t) => ({ label: t.slice("total_".length), pips: [] })));
  zones.push(...row(secondRow.map(totalType), PAD, totY + totH + GAP, totW, totH,
    (t) => ({ label: t.slice("total_".length), pips: [] })));

  // ── Ярус 4: комбинации ТРЕМЯ рядами по 5. ───────────────────────────────
  // Коэффициент — В КАЖДОЙ плашке, не вынесен под блок: по портретному
  // референсу «6:1» стоит внутри, и в три ряда общая подпись читалась бы
  // относящейся только к последнему.
  const cmbY = totY + totH * 2 + GAP + 16;
  const cmbH = 86;
  const cmbW = (inner - GAP * 4) / 5;
  COMBO_PAIRS.forEach(([a, b], i) => {
    const r = Math.floor(i / 5);
    const c = i % 5;
    zones.push({
      type: comboType(a, b),
      x: PAD + c * (cmbW + GAP),
      y: cmbY + r * (cmbH + GAP),
      w: cmbW, h: cmbH,
      label: `${a}+${b}`, payoutLabel: "6:1", pips: [a, b],
    });
  });

  // ── Ярус 5: single-ставки 2×3. ──────────────────────────────────────────
  // Составной коэффициент расшифрован тремя подписями ПОД КОЛОНКАМИ — грани
  // стоят 2×3, и каждая подпись приходится на свою пару (верх+низ).
  const sglY = cmbY + cmbH * 3 + GAP * 2 + 16;
  const sglH = 100;
  const sglW = (inner - GAP * 2) / 3;
  FACES.forEach((n, i) => {
    const r = Math.floor(i / 3);
    const c = i % 3;
    zones.push({
      type: singleType(n),
      x: PAD + c * (sglW + GAP),
      y: sglY + r * (sglH + GAP),
      w: sglW, h: sglH,
      label: `SINGLE ${n}`, payoutLabel: SINGLE_PAYOUT_LABEL, pips: [n],
      hidePayout: true,
    });
  });

  return zones;
}

/** Раскладка стола в дизайн-координатах. Чистая функция — тестируется без Pixi. */
export function tableLayout(orientation: Orientation): Zone[] {
  return orientation === "landscape" ? landscapeLayout() : portraitLayout();
}

/**
 * Подписи под блоками — общие коэффициенты, вынесенные из плашек.
 *
 * Координаты ВЫВОДЯТСЯ из уже посчитанных зон, а не задаются числами заново:
 * иначе подпись разъедется с блоком при любой правке раскладки.
 */
export function blockCaptions(orientation: Orientation): BlockCaption[] {
  const zones = tableLayout(orientation);
  const captions: BlockCaption[] = [];
  const portrait = orientation === "portrait";

  // Даблы стоят двумя блоками (1-3 слева, 4-6 справа); подпись — под каждым.
  for (const group of [[1, 2, 3], [4, 5, 6]]) {
    const block = group
      .map((n) => zones.find((z) => z.type === doubleType(n)))
      .filter((z): z is Zone => z !== undefined);
    if (block.length === 0) continue;
    const left = Math.min(...block.map((z) => z.x));
    const right = Math.max(...block.map((z) => z.x + z.w));
    const bottom = Math.max(...block.map((z) => z.y + z.h));
    captions.push({ text: "EACH DOUBLE 10:1", cx: (left + right) / 2, y: bottom + 4 });
  }

  // Комбинации двух костей. В ЛАНДШАФТЕ они стоят одним рядом из 15, и общий
  // коэффициент выносится под него. В портрете рядов три — там «6:1» остаётся
  // внутри плашек (см. portraitLayout), и подпись не нужна.
  const combos = zones.filter((z) => z.type.startsWith("combo_"));
  if (!portrait && combos.length > 0) {
    const left = Math.min(...combos.map((z) => z.x));
    const right = Math.max(...combos.map((z) => z.x + z.w));
    const bottom = Math.max(...combos.map((z) => z.y + z.h));
    captions.push({ text: "EACH COMBINATION 6:1", cx: (left + right) / 2, y: bottom + 4 });
  }

  // Синглы: составной коэффициент расшифрован тремя подписями — каждая под
  // своей КОЛОНКОЙ плашек. Группируем по x, а не по порядку в массиве: в
  // портрете грани стоят 2×3, и колонка — это пара «верх + низ».
  const singles = zones.filter((z) => z.type.startsWith("single_"));
  const SINGLE_LEGEND = [
    "APPEARS ON 1 OF 3 — 1:1",
    "APPEARS ON 2 OF 3 — 2:1",
    "APPEARS ON 3 OF 3 — 3:1",
  ];
  // Колонки слева направо; в портрете их три (по две плашки), в ландшафте
  // шесть (по одной) — там подпись приходится на ПАРУ соседних колонок.
  const columns = [...new Set(singles.map((z) => Math.round(z.x)))].sort((a, b) => a - b);
  const perCaption = Math.max(1, Math.round(columns.length / SINGLE_LEGEND.length));
  SINGLE_LEGEND.forEach((text, i) => {
    const group = columns.slice(i * perCaption, (i + 1) * perCaption);
    if (group.length === 0) return;
    const cells = singles.filter((z) => group.includes(Math.round(z.x)));
    const left = Math.min(...cells.map((z) => z.x));
    const right = Math.max(...cells.map((z) => z.x + z.w));
    const bottom = Math.max(...cells.map((z) => z.y + z.h));
    captions.push({ text, cx: (left + right) / 2, y: bottom + 4 });
  });

  // ANY TRIPLE: заголовок с коэффициентом стоит НАД сеткой троек, в полосе,
  // которую освободила укороченная зона.
  const any = zones.find((z) => z.type === "triple_any");
  if (any) {
    captions.push({
      text: "ANY TRIPLE 30:1",
      cx: any.x + any.w / 2,
      y: any.y - 2,
      above: true,
      big: true,
    });
  }

  return captions;
}
