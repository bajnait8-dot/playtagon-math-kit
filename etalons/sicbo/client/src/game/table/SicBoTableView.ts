import { Container, Graphics, Rectangle, Text } from "pixi.js";
import gsap from "gsap";
import { ControlView } from "../../vendor/slot-ui-pixi/index";
import type { OpenUI, ScreenState } from "../../vendor/slot-ui-core/index";
import type { SicBoTableControl } from "./SicBoTableControl";
import { TABLE_SIZE, TITLE_BOX, blockCaptions, tableLayout, type Orientation, type Zone } from "./tableGeometry";
import { makeZoneArt, ZONE_DARK, type ZoneArt, type ZoneVisual } from "./zoneArt";
import { makeChipSpine, chipLabel, breakIntoChips, DESELECT_SCALE, type ChipSpineHandle } from "./chipSpine";
import { makeZoneTooltip } from "./zoneTooltip";
import { SWEEP_STAGGER } from "../chipFlight";
import { tableBannerGeometry } from "../bannerView";
import type { SicBoBetType } from "../../../../server/model/types.js";

export interface TableViewOptions {
  /** Тап по зоне. Вьюха не знает, что с этим делать — решает хост. */
  onZoneTap?(type: SicBoBetType): void;
  /** Формат суммы на фишке — обычно formatAmount игры. */
  formatAmount?(minor: number): string;
  /**
   * Номинал ОДНОЙ фишки в минорных единицах — текущий выбор в пикере.
   * По нему вьюха раскладывает стопку: ставка растёт этими шагами.
   */
  chipValue?(): number;
  /**
   * Смахнуть фишку со стола (UNDO / CLEAR / новый раунд). Точка — ГЛОБАЛЬНАЯ.
   * Вьюха только сообщает, откуда и что смести; саму анимацию ведёт слой
   * полёта, потому что фишка уходит ЗА пределы стола.
   */
  onSweep?(at: { x: number; y: number }, amountMajor: number, delay: number): void;
  /**
   * Выложить фишку ВЫПЛАТЫ на зону: она прилетает к точке (ГЛОБАЛЬНОЙ) и
   * остаётся лежать. Вьюха только говорит, куда и какого номинала; полёт ведёт
   * слой поверх стола — он не обрезан рамками зоны.
   */
  onPayout?(at: { x: number; y: number }, denomMajor: number, delay: number, radius: number): void;
  /** Доля ширины экрана под стол; портрет шире, ландшафт компактнее. */
  widthFrac?: { landscape: number; portrait: number };
  /** Доля ВЫСОТЫ экрана под стол — потолок, чтобы он не налез на ряд кнопок. */
  heightFrac?: { landscape: number; portrait: number };
}

/** Диаметр фишки на зоне — тот же, что у фишки в кнопке-пикере. */
const ZONE_CHIP_D = 50;
/** Сдвиг каждой следующей фишки в стопке вверх, дизайн-px. */
const STACK_OFFSET = 7;
/** Шаг волны при выкладывании выплаты — фишки ложатся одна за другой. */
const PAYOUT_STAGGER = 0.09;

function chipRadiusFor(zone: Zone): number {
  // Пак ужимает НЕвыбранную фишку до DESELECT_SCALE, поэтому запрашиваем
  // радиус С КОМПЕНСАЦИЕЙ — иначе на экране выходит 0.56 от заданного, и
  // фишка на зоне оказывалась заметно мельче той, что в кнопке.
  const want = (ZONE_CHIP_D / 2) / DESELECT_SCALE;
  // Потолок по зоне: она не должна вылезать за края узких секторов
  // (сумма 4-17 — всего 78 в ширину).
  return Math.min(want, (zone.h / 2) / DESELECT_SCALE, (zone.w / 2) / DESELECT_SCALE);
}

/** Отступ плашки выигрыша от нижней кромки грида — как у баннера. */
const WIN_PLATE_GAP = 24;

interface ZoneSlot {
  zone: Zone;
  art: ZoneArt;
  root: Container;
  chips: Container;
  hovered: boolean;
  /** Стопка фишек на зоне снизу вверх. Уничтожать явно — это не Container. */
  stack: ChipSpineHandle[];
  /** Сколько минорных единиц ставки уже ВЫЛОЖЕНО на стол этой стопкой. */
  shown: number;
}

/**
 * Стол Sic Bo — контрол в системе раскладки, ровно как BoardView в mines:
 * ControlView + свой Control, поэтому HUD, окна и кнопки его не различают.
 *
 * Раскладка ПЕРЕСТРАИВАЕТСЯ при смене ориентации: зоны пересоздаются по
 * tableLayout(orientation), а не масштабируются — портретный стол это другая
 * сетка, а не сжатый ландшафтный.
 */
export class SicBoTableView extends ControlView {
  private slots: ZoneSlot[] = [];
  /**
   * Зона → сумма, которая к ней ещё ЛЕТИТ (минорные единицы).
   *
   * Именно СУММА, а не число фишек: вьюха выкладывает `ставка − летящее`,
   * поэтому каждая приземлившаяся добавляет свою фишку сразу, не дожидаясь
   * остальных. Со счётчиком-блокировкой три фишки в полёте давали стопку
   * целиком в момент приземления последней.
   */
  private readonly pending = new Map<SicBoBetType, number>();
  /** Подсказка по наведению — одна на весь стол, поверх всех зон. */
  private readonly tooltip = makeZoneTooltip();
  /** Заголовок «SIC BO» — не зона, живёт отдельно от слотов. */
  private titleText?: Text;
  /** Светлая подложка под гридом. */
  private boardBg?: Graphics;
  /** Плашка выигрыша — живёт В СОСТАВЕ стола, см. attachWinPlate. */
  private winPlateRoot?: Container;
  /** Подписи блоков («EACH DOUBLE 10:1» и прочие) — чистим при пересборке. */
  private captionTexts: Text[] = [];
  private orientation: Orientation = "landscape";
  private readonly opts: TableViewOptions;
  private readonly widthFrac: { landscape: number; portrait: number };
  private readonly heightFrac: { landscape: number; portrait: number };

  constructor(
    private readonly table: SicBoTableControl,
    ui: OpenUI,
    opts: TableViewOptions = {},
  ) {
    super(table, ui);
    this.opts = opts;
    // Портрет — ТРИ КОЛОНКИ: слева узкая под статистику бросков (раскрывается
    // в оверлей), по центру грид, справа узкая под кнопки меню. При 0.96 стол
    // занимал всю ширину, и обе боковые колонки ложились поверх него.
    this.widthFrac = opts.widthFrac ?? { landscape: 0.86, portrait: 0.70 };
    // Потолок по высоте: под столом должны поместиться плашка выигрыша, баннер
    // и ряд кнопок HUD, а сверху — кнопки меню и плашка лимитов.
    //
    // 0.98 было фикцией: при такой доле ограничение не срабатывало НИКОГДА, и
    // на Full HD стол упирался в верхнюю кромку — SMALL/BIG обрезались, лого
    // налезало на меню. Реально свободно около трёх четвертей высоты.
    // В портрете стол ВЫСОКИЙ (700×1240) и упирается именно в высоту, а не в
    // ширину: widthFrac там почти не работает, и сужать грид под боковые
    // колонки приходится через этот потолок.
    this.heightFrac = opts.heightFrac ?? { landscape: 0.74, portrait: 0.66 };

    // Контейнер ПРОПУСКАЕТ события детям, но сам их не ловит: 'passive' у
    // ControlView не пускает хит-тест внутрь, а 'static' без hitArea
    // перехватывает тапы у зон. 'auto' — ровно посередине (как в BoardView).
    this.eventMode = "auto";

    this.build("landscape");
    this.disposers.push(this.table.onChange((changed) => this.refresh(changed)));
    // Фаза раунда блокирует стол через setState — своего уведомления он не
    // шлёт, поэтому слушаем состояние контрола: по нему гасим подсказку и
    // возвращаем курсор.
    this.disposers.push(this.table.state.subscribe(() => {
      if (!this.table.interactable) this.tooltip.hide();
      for (const s of this.slots) this.paint(s);
    }));
  }

  /**
   * Принять плашку выигрыша В СОСТАВ СТОЛА.
   *
   * Плашка — часть грида, а не свободный оверлей: так она получает его
   * координаты и масштаб даром и переезжает вместе с ним при смене ориентации.
   * Раньше она позиционировалась долей высоты экрана и на портретном столе
   * (он почти вдвое выше) ложилась поверх зон.
   */
  attachWinPlate(plate: Container): void {
    this.winPlateRoot = plate;
    this.addChild(plate);
    this.placeWinPlate();
  }

  /** Поставить плашку под нижнюю кромку грида — на место баннера. */
  private placeWinPlate(): void {
    if (!this.winPlateRoot) return;
    const { h } = TABLE_SIZE[this.orientation];
    this.winPlateRoot.position.set(0, h / 2 + WIN_PLATE_GAP);
  }

  /**
   * Приглушить грид на время броска: 3D-кубики летят ПОВЕРХ стола, и на пёстром
   * гриде их грани терялись.
   *
   * Гаснут подложка, арт зон и подписи — но НЕ фишки: игрок должен видеть свои
   * ставки, пока кубики катятся. Фишки живут в отдельном контейнере поверх арта,
   * поэтому их достаточно просто не трогать.
   */
  setDimmed(on: boolean, seconds = 0.35): void {
    const targets: Container[] = [];
    if (this.boardBg) targets.push(this.boardBg);
    targets.push(...this.captionTexts);
    if (this.titleText) targets.push(this.titleText);
    for (const s of this.slots) targets.push(s.art.root);

    const alpha = on ? 0.42 : 1;
    for (const t of targets) {
      gsap.killTweensOf(t);
      gsap.to(t, { alpha, duration: seconds, ease: "power2.out" });
    }
  }

  /** Пересобрать стол под ориентацию. */
  private build(orientation: Orientation): void {
    for (const s of this.slots) { for (const c of s.stack) c.destroy(); s.root.destroy({ children: true }); }
    this.slots = [];
    this.titleText?.destroy();
    this.titleText = undefined;
    this.boardBg?.destroy();
    this.boardBg = undefined;
    for (const t of this.captionTexts) t.destroy();
    this.captionTexts = [];
    this.orientation = orientation;

    const zones = tableLayout(orientation);
    const { w, h } = TABLE_SIZE[orientation];
    // Стол рисуем от центра — так его кладёт раскладка (anchor: center).
    const ox = -w / 2;
    const oy = -h / 2;

    // ── Подложка под весь грид ──────────────────────────────────────────────
    // Светлое поле, на котором лежат зоны: без него плашки висели прямо на
    // сукне и стол не читался как единая вещь. Габариты берём по ФАКТИЧЕСКИМ
    // зонам, а не по TABLE_SIZE — в нём заложен запас, и подложка вылезала бы
    // за крайние плашки.
    const bx0 = Math.min(...zones.map((z) => z.x));
    const by0 = Math.min(...zones.map((z) => z.y));
    const bx1 = Math.max(...zones.map((z) => z.x + z.w));
    const by1 = Math.max(...zones.map((z) => z.y + z.h));
    const bpad = 7;
    // Снизу поле шире: под последним ярусом стоит подпись-легенда, и по краю
    // зон подложка обрезала бы её.
    const bpadBottom = bpad + 22;
    const board = new Graphics();
    board
      .roundRect(
        ox + bx0 - bpad,
        oy + by0 - bpad,
        bx1 - bx0 + bpad * 2,
        by1 - by0 + bpad + bpadBottom,
        22,
      )
      // Светлый холодный тил. Альфы нет: цвет задан точно, и полупрозрачность
      // замешивала бы в него зелень сукна.
      .fill(0x9aaeb0);
    this.addChild(board);
    this.boardBg = board;

    // Заголовок «SIC BO» слева от SMALL. Это НЕ зона: ставить туда нельзя,
    // поэтому рисуем отдельным текстом, а не через makeZoneArt.
    const box = TITLE_BOX[orientation];
    if (box) {
      const title = new Text({
        text: "SIC BO",
        style: {
          // Тот же Julee, что и на всём гриде: вывеска и подписи зон — один
          // почерк, стол читается как единая вещь.
          fontFamily: "Julee, Georgia, serif",
          fontSize: Math.min(box.h * 0.92, 74),
          // Заголовок лежит на СВЕТЛОЙ подложке, а не на плашке: кремовый на
          // ней терялся, поэтому цвет инвертирован в тёмный тон зон.
          fill: ZONE_DARK,
          align: "center",
        },
      });
      title.anchor.set(0.5);
      title.position.set(ox + box.x + box.w / 2, oy + box.y + box.h / 2);
      this.addChild(title);
      this.titleText = title;
    }

    // Подписи под блоками — общий коэффициент, вынесенный из плашек наружу
    // («EACH DOUBLE 10:1»). Тоже не зоны: ставить туда нельзя.
    for (const cap of blockCaptions(orientation)) {
      const text = new Text({
        text: cap.text,
        style: {
          fontFamily: "Oswald, system-ui, sans-serif",
          fontSize: cap.big ? 21 : 17,
          fontWeight: "300",
          letterSpacing: 0.5,
          // Подписи лежат на СВЕТЛОЙ подложке, а не на сукне — кремовый на ней
          // не читался. Тёмный тон в цвет плашек.
          fill: ZONE_DARK,
          align: "center",
        },
      });
      // above: подпись стоит НАД блоком, поэтому растёт вверх от своей `y`.
      text.anchor.set(0.5, cap.above ? 1 : 0);
      text.position.set(ox + cap.cx, oy + cap.y);
      this.addChild(text);
      this.captionTexts.push(text);
    }

    for (const zone of zones) {
      const root = new Container();
      root.position.set(ox + zone.x, oy + zone.y);

      const art = makeZoneArt(zone);
      root.addChild(art.root);

      const chips = new Container();
      // Фишка — В ЦЕНТРЕ зоны: туда же целится летящая, и приземление
      // выглядит как попадание в сектор, а не рядом с ним.
      chips.position.set(zone.w / 2, zone.h / 2);
      root.addChild(chips);

      root.eventMode = "static";
      root.cursor = "pointer";
      root.hitArea = new Rectangle(0, 0, zone.w, zone.h);

      const slot: ZoneSlot = { zone, art, root, chips, hovered: false, stack: [], shown: 0 };

      root.on("pointertap", (e) => {
        // Тап по зоне НЕ должен всплывать: иначе он доходит до spin-кнопки, и
        // та в состоянии 'stop' принимает его за слэм-стоп (грабли из mines).
        e.stopPropagation();
        if (!this.table.interactable) return;
        this.opts.onZoneTap?.(zone.type);
      });

      root.on("pointerover", () => {
        slot.hovered = true;
        this.paint(slot);
        this.showTooltip(slot);
      });
      root.on("pointerout", () => {
        slot.hovered = false;
        this.paint(slot);
        this.tooltip.hide();
      });

      this.addChild(root);
      this.slots.push(slot);
    }

    // ПОСЛЕ всех зон: подсказка должна быть поверх соседей справа и снизу —
    // они добавлены позже её зоны и иначе перекрыли бы её.
    this.tooltip.hide();
    this.addChild(this.tooltip.view);

    // Плашка выигрыша пережила пересборку (build её не уничтожает), но высота
    // стола сменилась вместе с ориентацией — ставим заново.
    if (this.winPlateRoot) {
      this.addChild(this.winPlateRoot);
      this.placeWinPlate();
    }

    this.refresh();
  }

  /**
   * Центр зоны в ГЛОБАЛЬНЫХ координатах — куда летит фишка.
   *
   * Именно ЦЕНТР, а не угол, где она потом ляжет: летящая фишка целится в
   * середину сектора (так это читается как бросок в зону), а на место её
   * ставит уже refreshSlot после приземления.
   *
   * Локальные координаты отдавать бесполезно — у стола свой масштаб и
   * положение, и сложить их с координатами кнопки-пикера нельзя.
   */
  zoneCenter(type: SicBoBetType): { x: number; y: number } | null {
    const slot = this.slots.find((s) => s.zone.type === type);
    if (!slot) return null;
    return slot.root.toGlobal({ x: slot.zone.w / 2, y: slot.zone.h / 2 });
  }

  /**
   * Показать подсказку над зоной.
   *
   * Слой подсказки лежит ПОВЕРХ всех зон и добавляется последним: вложенная в
   * свою зону, она уходила бы под соседние справа и снизу — те рисуются позже.
   */
  private showTooltip(slot: ZoneSlot): void {
    // На заблокированном столе не показываем: подсказка про ставку там ни к
    // чему — поставить всё равно нельзя.
    if (!this.table.interactable) return;
    const amount = this.table.amountAt(slot.zone.type);
    const fmt = this.opts.formatAmount ?? ((m: number) => String(m));
    // Координаты в осях СТОЛА, а не глобальные: слой подсказки — наш ребёнок и
    // масштабируется вместе со столом.
    //
    // Границы отдаём тоже в осях стола — по ним подсказка сама выберет сторону
    // и подвинется вдоль края, чтобы не вылезти за кромку.
    const { w, h } = TABLE_SIZE[this.orientation];
    this.tooltip.show(
      slot.zone,
      { x: slot.root.x + slot.zone.w / 2, y: slot.root.y },
      fmt(amount),
      { minX: -w / 2, maxX: w / 2, minY: -h / 2 },
    );
  }

  /** Визуальное состояние одной зоны — производное, нигде не хранится. */
  private paint(slot: ZoneSlot): void {
    // Рука — только когда на зону МОЖНО поставить: во время броска и показа
    // результата стол не принимает ставки, и палец там обманывал бы.
    slot.root.cursor = this.table.interactable ? "pointer" : "default";
    let v: ZoneVisual;
    if (this.table.isWinning(slot.zone.type)) v = "winning";
    else if (!this.table.interactable) v = "dimmed";
    else if (slot.hovered) v = "hover";
    else v = "idle";
    slot.art.setVisual(v);
  }

  /**
   * Перерисовать стол. Если контрол сказал, КАКАЯ зона изменилась, обновляем
   * только её: один тап по столу шлёт десяток уведомлений подряд, и полная
   * перерисовка всех пятидесяти зон на каждое сжигала кадры.
   */
  private refresh(changed?: SicBoBetType): void {
    if (changed !== undefined) {
      const slot = this.slots.find((s) => s.zone.type === changed);
      if (slot) this.refreshSlot(slot);
      return;
    }
    for (const slot of this.slots) this.refreshSlot(slot);
  }

  /**
   * Выложить ВЫПЛАТУ на выигравшую зону: столбик фишек рядом со ставкой.
   *
   * Сумма разменивается по номиналам пака (breakIntoChips) — при 180:1 со
   * ставки $1 это $180, и одним номиналом выросла бы башня из сотни фишек.
   *
   * Фишки ПРИЛЕТАЮТ: вьюха только сообщает, куда и что, а полёт ведёт слой
   * поверх стола — он не обрезан рамками зоны.
   */
  payout(type: SicBoBetType, amountMajor: number): void {
    const slot = this.slots.find((s) => s.zone.type === type);
    const land = this.opts.onPayout;
    if (!slot || !land || amountMajor <= 0) return;

    const r = chipRadiusFor(slot.zone);
    breakIntoChips(amountMajor).forEach((denom, i) => {
      // Выплата ложится ПОВЕРХ ставки, каждая следующая чуть выше — стопка
      // растёт вверх от уже лежащих фишек.
      const at = slot.chips.toGlobal({ x: 0, y: -(slot.stack.length + i) * STACK_OFFSET });
      land(at, denom, i * PAYOUT_STAGGER, r);
    });
  }

  /**
   * Придержать показ фишки на зоне до приземления летящей копии.
   *
   * Ставка попадает в модель СРАЗУ по тапу (иначе быстрые тапы разъедутся с
   * состоянием, а UNDO сломается), но показывать её сразу нельзя — иначе фишка
   * появляется в зоне ещё до того, как туда что-то прилетело.
   *
   * Копим именно СУММУ в полёте, а не число фишек: вьюха выкладывает
   * `ставка − летящее`, поэтому каждая приземлившаяся добавляет свою фишку
   * сразу. Со счётчиком-блокировкой три фишки в полёте давали стопку целиком
   * в момент приземления последней.
   */
  holdZone(type: SicBoBetType, amountMinor: number): () => void {
    this.pending.set(type, (this.pending.get(type) ?? 0) + amountMinor);
    const slot = this.slots.find((s) => s.zone.type === type);
    if (slot) this.refreshSlot(slot);
    return () => {
      const left = (this.pending.get(type) ?? amountMinor) - amountMinor;
      if (left > 0) this.pending.set(type, left);
      else this.pending.delete(type);
      const s = this.slots.find((z) => z.zone.type === type);
      if (s) this.refreshSlot(s);
    };
  }

  /**
   * Состояние зоны и её СТОПКА фишек.
   *
   * Стопка НАКАПЛИВАЕТСЯ: уже лежащие фишки не пересоздаются, новая ложится
   * сверху со сдвигом. Раньше вьюха сносила всё и рисовала одну фишку на
   * суммарную ставку — из-за этого при каждой новой ставке зона мигала.
   *
   * Снимаем фишки только когда ставка УМЕНЬШИЛАСЬ (UNDO / CLEAR / новый раунд).
   */
  private refreshSlot(slot: ZoneSlot): void {
    this.paint(slot);
    // Ставка на зоне могла измениться прямо под курсором (игрок докладывает
    // фишки, жмёт UNDO) — подсказка обязана это показать, а не застыть на
    // сумме, что была в момент наведения.
    if (slot.hovered) this.showTooltip(slot);

    // Выкладываем ставку МИНУС то, что ещё летит: приземлившаяся фишка
    // появляется сразу, а не ждёт остальных из своей очереди.
    const inFlight = this.pending.get(slot.zone.type) ?? 0;
    const bet = this.table.amountAt(slot.zone.type);
    // Резерв под полёт делается ДО place, поэтому здесь `bet` на миг отстаёт
    // от `inFlight`. Пока это так, стопку трогать НЕЛЬЗЯ: она уже лежит на
    // столе, а разница временно врёт.
    //
    // Сравнение именно `>=`, а не `>`: при повторном тапе по занятой зоне
    // числа совпадают (bet=100, inFlight=100), target выходит 0 — и стопка
    // улетала, хотя игрок наоборот доложил фишку.
    if (inFlight > 0 && inFlight >= bet) return;

    const target = bet - inFlight;
    if (target <= 0) {
      // Сюда попадаем только когда ставки НЕТ вовсе (bet=0, ничего не летит):
      // UNDO или CLEAR. Смахиваем.
      this.clearStack(slot);
      return;
    }

    // Стопку пересобираем с нуля, если выложено БОЛЬШЕ нужного: какие именно
    // фишки сняли, вьюха не знает — модель хранит стек в betState.
    //
    // БЕЗ СМАХИВАНИЯ: это перерисовка, а не возврат ставки игроку. Со
    // смахиванием фишки улетали одновременно с теми, что прилетают, — стопка
    // росла, но из неё постоянно что-то уходило.
    if (target < slot.shown) this.clearStack(slot, /* withSweep */ false);

    // Докладываем ровно ту разницу, которой не хватает.
    const r = chipRadiusFor(slot.zone);
    while (slot.shown < target) {
      // Шаг — текущий номинал пикера; на всякий случай не даём уйти в ноль,
      // иначе цикл был бы бесконечным.
      const nominal = Math.max(1, Math.round(this.opts.chipValue?.() ?? 0));
      const step = Math.min(nominal, target - slot.shown);
      const chip = makeChipSpine(step / 100, {
        radius: r, label: chipLabel(step / 100), state: "deselect",
      });
      // Сдвиг вверх на каждую следующую — так стопка читается как стопка, а не
      // как одна фишка. Небольшой, чтобы не вылезала за зону.
      const y = -slot.stack.length * STACK_OFFSET;
      // Тень — ОДНА на стопку, от нижней фишки: она лежит на сукне, остальные
      // стоят на ней. Отделяем тонкой тёмной каймой по краю, а не пятном под
      // фишкой — пятно расползалось и накрывало подпись коэффициента.
      if (slot.stack.length === 0) {
        slot.chips.addChild(new Graphics()
          .circle(0, y + 2, r * DESELECT_SCALE + 1.5)
          .stroke({ width: 3, color: 0x06231d, alpha: 0.55 }));
      }
      slot.chips.addChild(chip.view);
      chip.view.position.set(0, y);
      slot.stack.push(chip);
      slot.shown += step;
    }
  }

  /**
   * Снять всю стопку зоны — со СМАХИВАНИЕМ: каждая фишка улетает вниз-влево,
   * как их сметает крупье. Без этого они просто исчезали, и UNDO/CLEAR не
   * читались как действие.
   */
  private clearStack(slot: ZoneSlot, withSweep = true): void {
    const sweep = withSweep ? this.opts.onSweep : undefined;
    if (sweep && slot.stack.length > 0) {
      const nominal = Math.max(1, Math.round(this.opts.chipValue?.() ?? 0));
      slot.stack.forEach((_, i) => {
        // Верхние сметаются первыми — стопка разбирается сверху, как в жизни.
        const order = slot.stack.length - 1 - i;
        const at = slot.chips.toGlobal({ x: 0, y: -i * STACK_OFFSET });
        sweep(at, nominal / 100, order * SWEEP_STAGGER);
      });
    }
    for (const c of slot.stack) c.destroy();
    slot.stack = [];
    slot.shown = 0;
    slot.chips.removeChildren().forEach((c) => c.destroy({ children: true }));
  }

  /**
   * Раскладка: при смене ориентации стол ПЕРЕСОБИРАЕТСЯ, потом масштабируется
   * под ширину экрана.
   */
  override applyLayout(screen: ScreenState): void {
    const orientation: Orientation = screen.width >= screen.height ? "landscape" : "portrait";
    if (orientation !== this.orientation) this.build(orientation);

    super.applyLayout(screen);

    const { w, h } = TABLE_SIZE[this.orientation];

    // Вписываем по ОБЕИМ осям: по ширине — как задано, по высоте — в свободное
    // место между верхом экрана и рядом кнопок. Без вертикального предела стол
    // на широком и низком экране налезал бы на HUD.
    //
    // Масштаб ЗАДАЁТСЯ, а не домножается на то, что положил super. Тот ставит
    // screen.scale — общий масштаб HUD, посчитанный системой от размера экрана;
    // умножение на наш fit давало двойное применение, и чем крупнее экран, тем
    // сильнее стол вылезал за кромки (на 2560 — за все четыре).
    const byWidth = (screen.width * this.widthFrac[this.orientation]) / w;
    const byHeight = (screen.height * this.heightFrac[this.orientation]) / h;
    const fit = Math.min(byWidth, byHeight);
    this.scale.set(fit, fit);

    // Сообщаем баннеру, где НИЖНЯЯ кромка стола: у него нет своей геометрии, а
    // фиксированный отступ печатал бы его поверх зон (портретный стол выше).
    //
    // Вместе с полувысотой отдаём и смещение центра стола: в портрете он поднят
    // layout-offset'ом, и баннер, считавший от центра СЦЕНЫ, попадал внутрь
    // стола.
    tableBannerGeometry.halfHeight = (h / 2) * fit;
    tableBannerGeometry.tableCenterY = this.y - screen.height / 2;
  }
}

/** Фабрика в стиле остальных вьюх игры (ср. boardView в mines). */
export function sicBoTableView(opts: TableViewOptions = {}) {
  return (c: SicBoTableControl, ui: OpenUI): ControlView => new SicBoTableView(c, ui, opts);
}
