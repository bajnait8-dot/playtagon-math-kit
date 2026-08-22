import { Container, Graphics, Rectangle, Text } from "pixi.js";
import { ControlView } from "../vendor/slot-ui-pixi/index";
import type { Control, OpenUI, ScreenState } from "../vendor/slot-ui-core/index";
import gsap from "gsap";
import { drawDie } from "./table/zoneArt";
import { categoryLabel, historyEntries, subscribeHistory, type HistoryEntry } from "./history";
import { PLATE_W } from "./limitsPlate";

/** Цвет категории — им подсвечена сумма в записи (как на референсе). */
const KIND_COLOR: Record<HistoryEntry["kind"], number> = {
  small: 0x6a7bff,
  big: 0xff6a5c,
  triple: 0xffd76a,
};

/** Сколько прошлых раундов показывает раскрытая колонка. */
const VISIBLE = 4;

/** Кубики статистики — БЕЛЫЕ: они лежат на тёмной плашке, а не на сукне. */
const DIE_WHITE = 0xffffff;

/**
 * Раскладка панели. Отличаются ТОЛЬКО геометрией и поведением шеврона —
 * содержимое (последний бросок + список прошлых) одно и то же.
 *
 *   landscape — широкая колонка слева от стола: кубики в РЯД, под ними подпись,
 *               по шеврону раскрывается список прошлых раундов внутри панели.
 *   portrait  — узкий столбик в левой полосе: кубики СТОЛБИКОМ, места на ряды
 *               там нет, поэтому шеврон открывает HTML-историю (onOpenHistory).
 */
export type StripOrientation = "landscape" | "portrait";

export interface RoundStrip {
  root: Container;
  /**
   * Отыграть «поп» шапки — зовётся в момент, когда 3D-кубики коснулись табло.
   * Без него запись просто возникает, и прилёт не читается как попадание.
   */
  popHead(): void;
  /**
   * Места ТРЁХ кубиков в шапке — ГЛОБАЛЬНЫЕ координаты, по одной на кубик.
   * Туда летят кубики после броска: в табло три ячейки, а не одна.
   */
  headSlots(): { x: number; y: number }[];
  /** Перестроить под ориентацию экрана. */
  layout(orientation: StripOrientation): void;
  dispose(): void;
}

export interface RoundStripOptions {
  /**
   * Открыть полную историю (HTML-попапом). В ПОРТРЕТЕ шеврон зовёт это вместо
   * раскрытия списка внутри панели: узкому столбику некуда его разворачивать.
   */
  onOpenHistory?(): void;
}

/**
 * Статистика бросков слева от стола.
 *
 * Верхняя часть — ПОСЛЕДНИЙ бросок крупно: три кубика и «9 Small». Под ней по
 * шеврону раскрывается колонка прошлых раундов: кубики слева, сумма справа
 * кружком с цветом категории.
 *
 * Ширина совпадает с плашкой лимитов над ней (PLATE_W) — они стоят в одной
 * колонке, и разнобой по ширине читался как ошибка вёрстки.
 */
export function makeRoundStrip(opts: RoundStripOptions = {}): RoundStrip {
  const root = new Container();
  /** Последний бросок — виден всегда. */
  const head = new Container();
  /** Прошлые раунды — раскрываются шевроном. */
  const body = new Container();
  const bg = new Graphics();
  // Стрелка — ОТДЕЛЬНЫЙ Graphics в контейнере, а не ребёнок bg: в Pixi 8
  // Graphics не контейнер, и addChild на него сыплет предупреждениями.
  const arrow = new Graphics();
  /** Значок шеврона крутится вокруг СВОЕГО центра — поэтому он в контейнере. */
  const chevron = new Container();
  const chevronIcon = new Graphics();
  chevron.addChild(chevronIcon);
  /** Ряды прошлых раундов обрезаны — иначе они торчат из схлопнутой панели. */
  const bodyClip = new Graphics();
  body.mask = bodyClip;
  root.addChild(bg, head, body, bodyClip, arrow, chevron);

  /** Доля раскрытия 0..1: её и анимируем, всё остальное считается от неё. */
  let open = 0;

  /** Свёрнуто по умолчанию: колонка прошлых раундов занимает много места. */
  let collapsed = true;
  /** Геометрия, посчитанная в rebuild — paint читает её на каждый кадр. */
  let headHeight = 0;
  let fullBodyH = 0;
  let hasPast = false;
  let tween: gsap.core.Tween | null = null;

  /**
   * Ориентация. От неё зависит ВСЯ геометрия ниже — поэтому размеры не
   * константы, а читаются через `dims()` на каждой перестройке.
   *
   * ЛОВУШКА (уже наступали): нельзя менять общие константы «под портрет» —
   * ландшафт ломается вместе с ними. Раскладки держим РАЗДЕЛЬНО.
   */
  let orientation: StripOrientation = "landscape";

  const PAD = 12;
  const GAP = 8;
  const ROW_H = 40;
  const ARROW_H = 30;

  /**
   * Размеры под текущую ориентацию.
   *
   * Портрет — узкий столбик: ширина рассчитана на ОДИН кубик с отступами, а не
   * на три в ряд, поэтому она заметно меньше PLATE_W. Кубик мельче: столбик из
   * трёх крупных занял бы половину высоты экрана.
   */
  const dims = (): { w: number; headDie: number } =>
    orientation === "landscape"
      ? { w: PLATE_W, headDie: 42 }
      : { w: 34 + PAD * 2, headDie: 34 };

  /** Кубик в списке прошлых раундов — мельче, чем в шапке. */
  const ROW_DIE = 26;

  /**
   * Последний бросок: три кубика и подпись «9 Small».
   *
   * В ландшафте кубики идут В РЯД, подпись под ними одной строкой. В портрете
   * столбик узкий — кубики встают СТОЛБИКОМ, а подпись разносится на две
   * строки (сумма над категорией): «9 Small» в одну строку туда не влезает.
   */
  const buildHead = (e: HistoryEntry | undefined): number => {
    head.removeChildren().forEach((c) => c.destroy({ children: true }));
    if (!e) return PAD;

    const { w: W, headDie: HEAD_DIE } = dims();
    const vertical = orientation === "portrait";

    const plate = new Graphics();
    const dice = new Graphics();
    if (vertical) {
      const x = (W - HEAD_DIE) / 2;
      e.roll.forEach((face, i) => drawDie(dice, x, PAD + i * (HEAD_DIE + GAP), HEAD_DIE, face, DIE_WHITE));
    } else {
      const total = HEAD_DIE * 3 + GAP * 2;
      const x0 = (W - total) / 2;
      e.roll.forEach((face, i) => drawDie(dice, x0 + i * (HEAD_DIE + GAP), PAD, HEAD_DIE, face, DIE_WHITE));
    }

    // Подпись под кубиками: сумма кремовым, категория — цветом.
    // В узком столбике шрифт мельче — иначе «Triple 6» вылезает за плашку.
    const size = vertical ? 18 : 26;
    const sum = new Text({
      text: String(e.total),
      style: { fontFamily: "Oswald, system-ui, sans-serif", fontSize: size, fontWeight: "700", fill: 0xf2efe0 },
    });
    const kind = new Text({
      text: categoryLabel(e),
      style: { fontFamily: "Oswald, system-ui, sans-serif", fontSize: size, fontWeight: "700", fill: KIND_COLOR[e.kind] },
    });

    // Высота блока кубиков: столбик из трёх против одного ряда.
    const diceH = vertical ? HEAD_DIE * 3 + GAP * 2 : HEAD_DIE;
    const capY = PAD + diceH + 10;

    let h: number;
    if (vertical) {
      // Две строки по центру. Категорию ужимаем под ширину плашки: длинные
      // подписи («Triple 6») иначе торчат по бокам.
      const maxW = W - PAD;
      if (kind.width > maxW) kind.scale.set(maxW / kind.width);
      sum.position.set((W - sum.width) / 2, capY);
      kind.position.set((W - kind.width) / 2, capY + sum.height + 2);
      h = capY + sum.height + 2 + kind.height + PAD;
    } else {
      const capW = sum.width + 8 + kind.width;
      sum.position.set((W - capW) / 2, capY);
      kind.position.set((W - capW) / 2 + sum.width + 8, capY);
      h = capY + sum.height + PAD;
    }

    // Подложка шапки — чуть светлее фона: отделяет последний бросок от списка.
    plate.roundRect(PAD * 0.5, PAD * 0.5, W - PAD, h - PAD, 8)
      .fill({ color: 0x000000, alpha: 0.3 });

    head.addChild(plate, dice, sum, kind);
    return h;
  };

  /**
   * Одна строка списка: кубики слева, сумма справа кружком.
   * Только ландшафт — в портрете список заменён HTML-историей по шеврону.
   */
  const makeRow = (e: HistoryEntry, y: number): Container => {
    const { w: W } = dims();
    const row = new Container();
    row.position.set(0, y);

    const dice = new Graphics();
    e.roll.forEach((face, i) => drawDie(dice, PAD + i * (ROW_DIE + 4), 0, ROW_DIE, face, DIE_WHITE));
    row.addChild(dice);

    // Кружок с суммой у правого края — цвет несёт категорию, как в референсе.
    const badge = new Graphics()
      .circle(W - PAD - ROW_DIE / 2, ROW_DIE / 2, ROW_DIE * 0.62)
      .fill(KIND_COLOR[e.kind]);
    const num = new Text({
      text: String(e.total),
      style: { fontFamily: "Oswald, system-ui, sans-serif", fontSize: 17, fontWeight: "700", fill: 0xffffff },
    });
    num.anchor.set(0.5);
    num.position.set(W - PAD - ROW_DIE / 2, ROW_DIE / 2);
    row.addChild(badge, num);

    return row;
  };

  const rebuild = (): void => {
    const list = historyEntries();
    // До первого броска показывать нечего — прячем окно целиком, а не рисуем
    // пустую плашку.
    root.visible = list.length > 0;
    if (list.length === 0) return;

    const headH = buildHead(list[0]);

    body.removeChildren().forEach((c) => c.destroy({ children: true }));
    // В ПОРТРЕТЕ списка нет — историю показывает HTML-попап по шеврону.
    // Ряды не строим вовсе: они не поместились бы в узкий столбик.
    const past = orientation === "landscape" ? list.slice(1, 1 + VISIBLE) : [];
    past.forEach((e, i) => body.addChild(makeRow(e, i * ROW_H)));
    body.position.set(0, headH);
    body.visible = true;

    fullBodyH = past.length * ROW_H;
    headHeight = headH;
    // Шеврон в портрете нужен, как только есть ХОТЬ ОДИН прошлый раунд: он
    // открывает полную историю, а не разворачивает список внутри панели.
    hasPast = orientation === "landscape" ? past.length > 0 : list.length > 1;
    paint();
  };

  /**
   * Отрисовка по текущей доле раскрытия. Вынесено из rebuild: анимация зовёт
   * это на каждый кадр, а пересобирать ряды при этом незачем.
   */
  const paint = (): void => {
    const { w: W } = dims();
    const bodyH = fullBodyH * open;
    const h = headHeight + bodyH;

    bg.clear();
    bg.roundRect(0, 0, W, h, 10).fill({ color: 0x0d211d, alpha: 0.72 });

    // Маска рядов растёт вместе с панелью: без неё ряды видны целиком с
    // первого кадра и «выпадают» из ещё не раскрывшейся плашки.
    bodyClip.clear();
    bodyClip.rect(0, headHeight, W, Math.max(0, bodyH)).fill(0xffffff);

    // Шеврон — полоса под лентой. Пока сыгран ОДИН раунд, раскрывать нечего:
    // он весь в шапке, а список прошлых пуст. Появляется со вторым броском.
    arrow.visible = hasPast;
    chevron.visible = hasPast;
    if (!hasPast) return;

    arrow.clear();
    arrow.roundRect(0, h + 6, W, ARROW_H, 8).fill({ color: 0x2b7a72, alpha: 0.95 });
    arrow.hitArea = new Rectangle(0, h + 6, W, ARROW_H);

    // Значок рисуем ВОКРУГ НУЛЯ и крутим контейнер: так он вращается вокруг
    // своего центра, а не вокруг угла панели.
    chevronIcon.clear();
    chevronIcon.moveTo(-11, -4).lineTo(0, 5).lineTo(11, -4)
      .stroke({ width: 3.5, color: 0xf2efe0, cap: "round", join: "round" });
    chevron.position.set(W / 2, h + 6 + ARROW_H / 2);
    // Разворот НА 180° по мере раскрытия — не щелчком «вниз/вверх».
    chevron.rotation = Math.PI * open;
  };

  arrow.eventMode = "static";
  arrow.cursor = "pointer";
  arrow.on("pointertap", (e) => {
    e.stopPropagation();
    // В ПОРТРЕТЕ шеврон — кнопка «показать историю»: разворачивать внутри
    // панели нечего (рядов нет), поэтому открываем HTML-попап и выходим.
    if (orientation === "portrait") {
      opts.onOpenHistory?.();
      return;
    }
    collapsed = !collapsed;
    tween?.kill();
    // Тянем ОДНУ величину — долю раскрытия: от неё разом идут высота плашки,
    // маска рядов и поворот шеврона, поэтому они не расходятся.
    // На раскрытии лёгкий доводчик (back), на сворачивании ровно — иначе
    // панель «клюёт» вниз перед закрытием.
    tween = gsap.to({ v: open }, {
      v: collapsed ? 0 : 1,
      duration: collapsed ? 0.24 : 0.34,
      ease: collapsed ? "power2.in" : "back.out(1.3)",
      onUpdate() { open = (this.targets()[0] as { v: number }).v; paint(); },
    });
  });

  rebuild();
  const off = subscribeHistory(rebuild);

  return {
    root,
    // Считаем от ROOT, а не от head: до первого броска шапка ещё не построена
    // (rebuild выходит раньше), и её собственная позиция не задана. У root она
    // известна всегда — им управляет система раскладки.
    layout(next) {
      if (next === orientation) return;
      orientation = next;
      // Смена ориентации меняет ВСЮ геометрию — пересобираем панель целиком.
      // Раскрытие сбрасываем: в портрете списка нет, и «открытое» состояние
      // ландшафта осталось бы висеть пустой полосой под шапкой.
      tween?.kill();
      collapsed = true;
      open = 0;
      rebuild();
    },

    popHead: () => {
      const { w: W } = dims();
      gsap.killTweensOf(head.scale);
      // Отскок ОТ ЦЕНТРА шапки: pivot ставим в её середину, иначе она
      // раздувается из левого верхнего угла и уезжает вбок.
      head.pivot.set(W / 2, headHeight / 2);
      head.position.set(W / 2, headHeight / 2);
      head.scale.set(1.18);
      gsap.to(head.scale, { x: 1, y: 1, duration: 0.34, ease: "back.out(2.2)" });
    },
    headSlots: () => {
      const { w: W, headDie: HEAD_DIE } = dims();
      // Места прилёта повторяют раскладку кубиков в шапке: в портрете они
      // столбиком, и кубики должны лететь именно туда.
      if (orientation === "portrait") {
        const x = (W - HEAD_DIE) / 2;
        return [0, 1, 2].map((i) =>
          root.toGlobal({ x: x + HEAD_DIE / 2, y: PAD + i * (HEAD_DIE + GAP) + HEAD_DIE / 2 }));
      }
      const total = HEAD_DIE * 3 + GAP * 2;
      const x0 = (W - total) / 2;
      return [0, 1, 2].map((i) =>
        root.toGlobal({ x: x0 + i * (HEAD_DIE + GAP) + HEAD_DIE / 2, y: PAD + HEAD_DIE / 2 }));
    },
    dispose() {
      off();
      tween?.kill();
      root.destroy({ children: true });
    },
  };
}

/**
 * Лента раундов КАК КОНТРОЛ системы раскладки.
 *
 * Раньше висела прямо на сцене и позиционировалась руками — не масштабировалась
 * со screen.scale и не переезжала по ориентации. Теперь позицию задаёт
 * LayoutSpec.
 */
export function roundStripView(opts: RoundStripOptions = {}) {
  return (c: Control, ui: OpenUI): ControlView => new RoundStripView(c, ui, opts);
}

export class RoundStripView extends ControlView {
  private readonly strip: RoundStrip;

  constructor(control: Control, ui: OpenUI, opts: RoundStripOptions = {}) {
    super(control, ui);
    this.strip = makeRoundStrip(opts);
    this.addChild(this.strip.root);
    this.disposers.push(() => this.strip.dispose());
  }

  /**
   * Ориентацию решает ЭКРАН, а не вызывающий — тот же приём, что в
   * LimitsPlateView: позицию задаёт LayoutSpec, а вьюха перестраивает своё
   * внутреннее устройство.
   */
  override applyLayout(screen: ScreenState): void {
    super.applyLayout(screen);
    this.strip.layout(screen.width >= screen.height ? "landscape" : "portrait");
  }

  /**
   * Куда летят кубики после броска — ГЛОБАЛЬНЫЕ координаты трёх мест в шапке.
   * Отдаём наружу, потому что полёт ведёт 3D-сцена: она не знает ни нашей
   * раскладки, ни масштаба.
   */
  headSlots(): { x: number; y: number }[] {
    return this.strip.headSlots();
  }

  /** Отскок шапки в момент, когда кубики коснулись табло. */
  popHead(): void {
    this.strip.popHead();
  }
}
