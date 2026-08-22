import { Assets, Circle, Container, Graphics, Rectangle, type Texture } from 'pixi.js';
import gsap from 'gsap';
import { ControlView } from '../vendor/slot-ui-pixi/index';
import type { ButtonControl, Control, OpenUI, ScreenState } from '../vendor/slot-ui-core/index';
import { makeChipSpine, chipLabel, DESELECT_SCALE, type ChipSpineHandle } from './table/chipSpine';
import { sfx } from './sound';

/**
 * BET PICKER — ОДИН контрол: круглая кнопка, которая РАСТЯГИВАЕТСЯ в ленту
 * номиналов и обратно.
 *
 * Модель:
 *   • ВЫБРАННАЯ фишка стоит в кнопке (0,0) и при открытии НЕ двигается;
 *   • лента — все ОСТАЛЬНЫЕ номиналы, растёт в одну сторону (вправо в
 *     ландшафте, вверх в портрете);
 *   • открывают её шеврон-ручка и тап по свёрнутой фишке.
 *
 * Фишки ОБРЕЗАНЫ подложкой (маска по её же форме) — это ключ ко всей анимации:
 * что бы ни отставало от схлопывающегося торца, за ним ничего не видно. Пока
 * маски не было, фишки приходилось гонять таймингами, и всё равно на быстром
 * закрытии они мелькали хвостом на голом столе.
 *
 * Про пак GSR: setup-поза скелета = ВЫБРАННАЯ фишка (scale 1), а Deselect
 * ужимает кость до 0.56. Отсюда CHIP_R задаёт размер ВЫБРАННОЙ (иначе она
 * вылезает за подложку), а подсветку включаем только при открытой ленте — на
 * свёрнутой кнопке она раздувала единственную фишку.
 */

/** Пустой круг из пака RSS — грузим ради единого вида нижнего ряда. */
const PLATE_URL = `${import.meta.env.BASE_URL}ui/autoplay_counter.webp`;

/** Диаметр кнопки в дизайн-px — общий для нижнего ряда. */
const SIZE = 80;
const R = SIZE / 2;

/** Шаг между фишками в ленте. */
const STEP = 72;
/**
 * Диаметры фишек: ВЫБРАННАЯ крупнее той, что лежит в ленте.
 *
 * Разницу задаёт пак (setup-поза = Select, Deselect ужимает кость до 0.56), но
 * его перепад слишком велик — 60 дало бы в ленте 34. Поэтому ужатие
 * КОМПЕНСИРУЕМ масштабом контейнера: см. chipScaleFor.
 */
const CHIP_D_SELECTED = 60;
const CHIP_D_IDLE = 50;
const CHIP_R = CHIP_D_SELECTED / 2;

/** Подъём фишки под курсором, дизайн-px. */
const LIFT = 9;

/** Отступ шеврона от дальнего торца и размер его зоны тапа. */
const CHEVRON_INSET = 22;
const CHEVRON_HIT = 44;

/** Тайминги: раскрытие чуть длиннее закрытия, шаг волны по фишкам. */
const OPEN_S = 0.34, CLOSE_S = 0.24, STAGGER = 0.04;

/**
 * Множитель контейнера фишки, чтобы на экране получились ровно заданные
 * диаметры.
 *
 * Скелет рисует ВЫБРАННУЮ в свой полный размер (radius = CHIP_R), а
 * невыбранную ужимает сам, до DESELECT_SCALE. Без компенсации перепад пака
 * слишком крут: при выбранной 60 в ленте вышло бы 34 вместо нужных 50.
 */
function chipScaleFor(selected: boolean): number {
  if (selected) return 1;
  return (CHIP_D_IDLE / CHIP_D_SELECTED) / DESELECT_SCALE;
}

export function loadBetPickerArt(): Promise<unknown> {
  return Assets.load<Texture>(PLATE_URL).catch(() => null);
}

export function betPickerButtonView() {
  return (c: Control, ui: OpenUI): ControlView =>
    new BetPickerButtonView(c as ButtonControl, ui);
}

interface ChipNode {
  index: number;
  chip: ChipSpineHandle;
  /** Обёртка с зоной тапа — её и двигаем. */
  hit: Container;
  glow: Graphics;
  hovered: boolean;
  /** Место в ленте: 0 — в кнопке (выбранная), 1..n — по порядку. */
  slot: number;
}

class BetPickerButtonView extends ControlView {
  private readonly plate = new Graphics();
  private readonly clip = new Graphics();
  private readonly chipsWrap = new Container();
  private readonly chevron = new Graphics();
  private readonly chevronHit = new Container();
  private nodes: ChipNode[] = [];

  /** Доля раскрытия 0..1 — ведёт подложку, маску и шеврон. */
  private reveal = 0;
  private tl: gsap.core.Timeline | null = null;
  /** В портрете лента растёт вверх, в ландшафте — вправо. */
  private vertical = false;

  constructor(private readonly btn: ButtonControl, ui: OpenUI) {
    super(btn, ui);

    // Фишки живут ПОД маской по форме подложки — см. шапку файла.
    this.chipsWrap.mask = this.clip;
    // Порядок внутри ленты задаём zIndex: в свёрнутом виде фишки лежат стопкой
    // в одной точке, и выбранная обязана быть сверху (см. assignSlots).
    this.chipsWrap.sortableChildren = true;
    this.addChild(this.plate, this.clip, this.chipsWrap, this.chevronHit);

    // Шеврон ПОВЕРХ фишек: в свёрнутом виде зона тапа выбранной накрывала его.
    this.sortableChildren = true;
    this.chevronHit.zIndex = 10;
    this.chevronHit.addChild(this.chevron);
    this.chevronHit.eventMode = 'static';
    this.chevronHit.cursor = 'pointer';
    this.chevronHit.hitArea = new Rectangle(
      -CHEVRON_HIT / 2, -CHEVRON_HIT / 2, CHEVRON_HIT, CHEVRON_HIT,
    );
    this.chevronHit.on('pointertap', (e) => {
      e.stopPropagation();
      if (this.btn.interactable) this.toggle();
    });

    // 'auto' — контейнер ПРОПУСКАЕТ события детям, но сам их не ловит:
    // 'passive' не пускает хит-тест внутрь, а 'static' без hitArea перехватывал
    // бы тапы у фишек и шеврона (канон из BoardView в mines). hitArea на самом
    // контроле не ставим по той же причине — она обрезает хит-тест детей.
    this.eventMode = 'auto';

    this.buildChips();
    this.disposers.push(ui.betStepper.index.subscribe(() => this.onPick()));
    this.disposers.push(ui.betStepper.state.subscribe(() => this.syncOpen()));
    this.disposers.push(this.btn.state.subscribe(() => this.paint()));
    this.paint();
  }

  // ── сборка ────────────────────────────────────────────────────────────────

  /** Лента фишек: по одной на номинал из лестницы RGS. */
  private buildChips(): void {
    for (const n of this.nodes) n.chip.destroy();
    this.chipsWrap.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.nodes = [];

    const stepper = this.ui.betStepper;
    stepper.options.forEach((value, index) => {
      const cell = new Container();
      cell.eventMode = 'static';
      cell.cursor = 'pointer';
      // Зона тапа — по самой фишке: квадрат в целый шаг залезал на соседей.
      cell.hitArea = new Circle(0, 0, CHIP_R);

      // Мягкое пятно под выбранной: на тёмной подложке одного свечения из пака
      // мало, чтобы выхватить её взглядом.
      const glow = new Graphics();
      const chip = makeChipSpine(value, { radius: CHIP_R, label: chipLabel(value) });
      cell.addChild(glow, chip.view);

      const node: ChipNode = { index, chip, hit: cell, glow, hovered: false, slot: 0 };
      cell.on('pointertap', (e) => {
        e.stopPropagation();
        // Свёрнутая лента: фишка И ЕСТЬ кнопка — тап по ней раскрывает. Иначе
        // это был бы pick уже выбранного, то есть ничего.
        if (this.reveal < 0.5) this.toggle();
        else stepper.pick(index);
      });
      cell.on('pointerover', () => { node.hovered = true; this.lift(node); });
      cell.on('pointerout', () => { node.hovered = false; this.lift(node); });

      this.chipsWrap.addChild(cell);
      this.nodes.push(node);
    });

    this.assignSlots();
    this.applyStatic();
  }

  /** Раздать места в ленте: выбранная в кнопке, остальные по порядку. */
  private assignSlots(): void {
    const sel = this.ui.betStepper.index.get();
    let slot = 0;
    for (const n of this.nodes) {
      n.slot = n.index === sel ? 0 : ++slot;
      // Выбранная — поверх остальных: во время сворачивания все фишки сходятся
      // в одну точку, и без этого в кнопке оказывалась последняя добавленная.
      n.hit.zIndex = n.slot === 0 ? 1 : 0;
    }
    this.chipsWrap.sortChildren();
  }

  // ── геометрия ─────────────────────────────────────────────────────────────

  /** Координата центра фишки этого слота вдоль ленты. */
  private alongOf(slot: number): number {
    return slot === 0 ? 0 : R + (slot - 0.5) * STEP;
  }

  /** Координату вдоль ленты — в оси контрола. */
  private posOf(along: number): { x: number; y: number } {
    return this.vertical ? { x: 0, y: -along } : { x: along, y: 0 };
  }

  /** Длина от центра кнопки до дальнего торца: свёрнутая и полная. */
  private get minEnd(): number { return R + CHEVRON_INSET + 8; }
  private get fullEnd(): number {
    return R + Math.max(0, this.nodes.length - 1) * STEP + CHEVRON_INSET;
  }

  // ── отрисовка ─────────────────────────────────────────────────────────────

  /** Подложка, маска и шеврон по текущей доле раскрытия. */
  private draw(): void {
    const end = this.minEnd + (this.fullEnd - this.minEnd) * this.reveal;

    // ВАЖНО: начало координат ControlView — ЦЕНТР контрола, поэтому таблетку
    // рисуем вокруг (0,0). От левого верхнего угла нельзя — фон уезжает
    // вниз-вправо от самой кнопки.
    const x = -R;
    const y = this.vertical ? -end : -R;
    const w = this.vertical ? SIZE : R + end;
    const h = this.vertical ? end + R : SIZE;

    this.plate.clear()
      .roundRect(x, y, w, h, R).fill({ color: 0x14161a, alpha: 0.94 })
      .roundRect(x + 3, y + 3, w - 6, h - 6, R - 3)
      .stroke({ width: 2, color: 0xffffff, alpha: 0.22 });
    // Маска повторяет подложку — фишки не могут вылезти за её торец.
    this.clip.clear().roundRect(x, y, w, h, R).fill(0xffffff);

    // Шеврон — у дальнего торца, ВНУТРИ таблетки; разворачивается по мере
    // раскрытия: «>» закрыто → «<» открыто.
    const p = this.posOf(end - CHEVRON_INSET);
    this.chevronHit.position.set(p.x, p.y);
    this.chevronHit.rotation = this.vertical ? -Math.PI / 2 : 0;
    const dir = 1 - this.reveal * 2;
    this.chevron.clear()
      .moveTo(-4 * dir, -8).lineTo(4 * dir, 0).lineTo(-4 * dir, 8)
      .stroke({ width: 3, color: 0xf2efe0, alpha: 0.85, cap: 'round', join: 'round' });
  }

  /** Разложить всё БЕЗ анимации — сборка, смена ориентации, выбор номинала. */
  private applyStatic(): void {
    const open = this.reveal > 0.5;
    for (const n of this.nodes) {
      gsap.killTweensOf(n.hit);
      n.hovered = false;
      // В свёрнутом виде фишки ленты ПРЯЧЕМ, а не полагаемся на маску: она
      // обрезает по подложке, но фишка на слоте 1 стоит почти вплотную к её
      // торцу и краем вылезала наружу — из-под кнопки торчал бок соседней.
      n.hit.visible = open || n.slot === 0;
      const p = this.posOf(open ? this.alongOf(n.slot) : 0);
      n.hit.position.set(p.x, p.y);
    }
    this.draw();
    this.syncSelection();
  }

  // ── анимация ──────────────────────────────────────────────────────────────

  private toggle(): void {
    this.ui.bus.emit('buttonActivated', { id: this.btn.id });
  }

  private syncOpen(): void {
    const open = this.ui.betStepper.current === 'picking';
    const want = open ? 1 : 0;
    if (Math.abs(this.reveal - want) > 0.001) this.animateTo(want, open);
  }

  /**
   * Одна таймлиния: подложка тянется, фишки едут к своим местам волной. Прятать
   * их не нужно — за торцом их обрезает маска, поэтому ни visible-переключений,
   * ни подчистки «отставших» здесь нет.
   */
  private animateTo(want: number, open: boolean): void {
    this.tl?.kill();
    sfx(open ? 'ui_modal_open' : 'ui_modal_close');

    // Подсветка завязана на открытость — переключаем СРАЗУ: syncSelection
    // читает reveal, а он до первого onUpdate ещё хранит старое значение.
    this.reveal = want;
    this.syncSelection();

    const dur = open ? OPEN_S : CLOSE_S;
    const tl = gsap.timeline({ onComplete: () => { this.tl = null; } });
    this.tl = tl;

    const holder = { v: open ? 0 : 1 };
    tl.to(holder, {
      v: want, duration: dur, ease: open ? 'power3.out' : 'power2.inOut',
      onUpdate: () => { this.reveal = holder.v; this.draw(); },
    }, 0);

    for (const n of this.nodes) {
      if (n.slot === 0) continue;           // выбранная стоит в кнопке всегда
      gsap.killTweensOf(n.hit);
      n.hovered = false;
      // Волна от кнопки наружу на открытии; на закрытии все уходят разом —
      // разнобой читался как «фишки толкаются».
      const at = open ? (n.slot - 1) * STAGGER : 0;
      const target = this.posOf(open ? this.alongOf(n.slot) : 0);
      // На открытии показываем сразу, на закрытии прячем ПО ПРИЕЗДЕ в кнопку:
      // маска обрезает по подложке, но фишка слота 1 стоит вплотную к её торцу
      // и краем вылезает наружу.
      if (open) n.hit.visible = true;
      tl.to(n.hit, {
        x: target.x, y: target.y,
        duration: dur, ease: open ? 'back.out(1.4)' : 'power2.inOut',
        onComplete: () => { if (!open) n.hit.visible = false; },
      }, at);
    }
  }

  /** Подъём фишки под курсором — «волна» вдоль ленты. */
  private lift(n: ChipNode): void {
    if (this.reveal < 0.5) return;          // в свёрнутом виде поднимать нечего
    const off = n.hovered ? LIFT : 0;
    const base = this.posOf(this.alongOf(n.slot));
    gsap.killTweensOf(n.hit);
    // «Вверх» = наружу из ленты, то есть по НОРМАЛИ к ней.
    gsap.to(n.hit, {
      x: base.x - (this.vertical ? off : 0),
      y: base.y - (this.vertical ? 0 : off),
      duration: 0.18,
      ease: n.hovered ? 'back.out(2.5)' : 'power2.out',
    });
  }

  // ── состояние ─────────────────────────────────────────────────────────────

  /**
   * Игрок выбрал номинал. Слоты пересчитываем, но раскладку трогаем ТОЛЬКО
   * если лента остаётся открытой: на pick срабатывают две подписки (index и
   * state) в непредсказуемом порядке, и applyStatic, попав после старта
   * закрытия, убивал его твины.
   */
  private onPick(): void {
    this.assignSlots();
    if (this.ui.betStepper.current === 'picking') this.applyStatic();
  }

  /** Подсветить выбранный номинал — ТОЛЬКО при открытой ленте (см. про пак). */
  private syncSelection(): void {
    const sel = this.ui.betStepper.index.get();
    const open = this.reveal > 0.5;
    for (const n of this.nodes) {
      const on = open && n.index === sel;
      n.chip.setState(on ? 'select' : 'deselect');
      n.chip.view.scale.set(chipScaleFor(on));
      n.glow.clear();
      if (on) n.glow.circle(0, 0, CHIP_R * 1.05).fill({ color: 0x9bf3ef, alpha: 0.16 });
    }
  }

  override applyLayout(screen: ScreenState): void {
    super.applyLayout(screen);
    // Ориентацию держим сами: лента вправо на широком экране, вверх на узком.
    const vertical = screen.height > screen.width;
    if (vertical === this.vertical) { this.draw(); return; }
    this.vertical = vertical;
    this.applyStatic();
  }

  private paint(): void {
    // Ховер ведут сами фишки (всплывают) — своего hover-состояния у контрола
    // нет, он 'auto'.
    this.alpha = this.btn.interactable ? 1 : 0.45;
  }

  override destroy(): void {
    this.tl?.kill();
    for (const n of this.nodes) n.chip.destroy();
    super.destroy();
  }
}
