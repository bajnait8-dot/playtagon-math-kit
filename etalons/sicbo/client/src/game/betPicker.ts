import { Application, Container, Graphics, Rectangle, Text } from "pixi.js";
import { resolvePlacement, formatAmount, type OpenUI } from "../vendor/slot-ui-core/index";
import gsap from "gsap";
import { sfx } from "./sound";
import { makeChipSpine, chipLabel, type ChipSpineHandle } from "./table/chipSpine";

/**
 * BET PICKER — «BET AMOUNT» (макет RSS): стеклянная карточка-сетка выбора ставки. Тот же
 * визуальный язык, что GAME MENU / AUTOPLAY PICKER (стекло, скругление, привязка к кнопке +
 * пропорциональный ресайз по screen.scale). Сетка 6 колонок из bet.options.
 *
 * Открывается по betStepper.state === 'picking' (bet-кнопка toggle: idle↔picking). Тап по
 * ячейке → bet.pick(index) (ставит уровень + закрывает). Bet-кнопка в picking = ✕ (свап в
 * OpenUIPixi). Заменяет вендорный BetDrawerView (bottom-sheet) — тот отключаем в hud.ts.
 */

const RADIUS = 40;
const PAD = 30;
const GAP = 12;
// Размеры сетки РАЗНЫЕ для ориентаций: landscape — компактная 6-колоночная (широкий экран),
// portrait — 3 колонки с крупными пилюлями под тап пальца (узкий экран).
// Ячейка КВАДРАТНАЯ: внутри фишка, а не текстовая пилюля.
const GRID = {
  landscape: { cols: 6, cellW: 76, cellH: 76 },
  portrait: { cols: 3, cellW: 130, cellH: 130 }, // крупные под тап пальца
} as const;

export interface BetPickerHandle {
  view: Container;
  applyLayout: (screenW: number, screenH: number) => void;
  dispose: () => void;
}

/** Проброс тапа сквозь catcher: (globalX,globalY) → id HUD-кнопки под точкой (или null).
 *  Хост передаёт из pixi.hitControlAt. Если попал — окно закроется + кнопка сработает. */
export type HudButtonAt = (globalX: number, globalY: number) => string | null;
export type ActivateHudButton = (id: string) => void;

export function mountBetPicker(
  app: Application, ui: OpenUI,
  opts: { hudButtonAt?: HudButtonAt; activateHudButton?: ActivateHudButton } = {},
): BetPickerHandle {
  const disposers: Array<() => void> = [];
  const stepper = ui.betStepper; // список ставок + pick/cancel/picking-состояние
  const options = stepper.options;

  const root = new Container();
  root.zIndex = 20_000;
  root.visible = false;
  root.eventMode = "static";

  const catcher = new Graphics();
  catcher.eventMode = "static";
  // тап по фону закрывает окно. НО если под точкой HUD-кнопка — закрыть + дёрнуть её
  // (пробитие catcher: кнопка «срабатывает», окно закрывается — единый жест).
  catcher.on("pointertap", (e) => {
    const hitId = opts.hudButtonAt?.(e.global.x, e.global.y) ?? null;
    stepper.cancelPicker();
    // не дёргать СВОЮ кнопку (bet-picker) — cancelPicker уже закрыл, повтор откроет заново
    if (hitId && hitId !== ui.betButton.id) opts.activateHudButton?.(hitId);
  });
  root.addChild(catcher);

  // Панель РАСКРЫВАЕТСЯ вправо от кнопки (collapse/expand), а не выезжает
  // целиком: карточка стоит на месте, а маска над ней растёт по ширине от
  // левого края — фишки проявляются одна за другой, как из-под кнопки.
  const clip = new Container();
  const clipMask = new Graphics();
  clip.addChild(clipMask);
  clip.mask = clipMask;
  root.addChild(clip);

  const card = new Container();
  card.eventMode = "static";
  clip.addChild(card);

  /** Доля раскрытия 0..1 — её и анимируем. */
  let reveal = 1;
  const drawMask = (): void => {
    // Маска в координатах ROOT (clip не масштабируется), поэтому берём уже
    // посчитанные экранные размеры карточки.
    const w = cardW * baseScale, h = cardH * baseScale;
    clipMask.clear()
      .roundRect(card.x, card.y, Math.max(1, w * reveal), h, RADIUS * baseScale)
      .fill(0xffffff);
  };
  const setReveal = (v: number): void => { reveal = v; drawMask(); };

  const font = ui.theme.type.family;

  // формат ставки через formatAmount из slot-ui-core (НЕ Intl style:currency): соц-коды
  // GC/SC не ISO 4217 → Intl бросал RangeError → падение social-сессии. cur = CurrencySpec.
  const cur = ui.bet.currency.get();
  const betLabel = (v: number): string => formatAmount(v, cur);
  const accent = 0x9bf3ef;

  // ── адаптивная карточка+сетка: пересобирается при смене ориентации (portrait ≠ landscape).
  // Держим текущий режим + размеры, чтобы applyLayout не строил заново на КАЖДЫЙ resize.
  const cardBg = new Graphics();
  card.addChild(cardBg);
  // Заголовка НЕТ: окно выезжает сбоку от кнопки узкой лентой фишек, и подпись
  // «BET AMOUNT» только занимала место — что это за окно, ясно по самим фишкам.
  const cellsWrap = new Container();
  card.addChild(cellsWrap);

  let cellNodes: Array<{ index: number; bg: Graphics; chip: ChipSpineHandle }> = [];
  let builtMode: "landscape" | "portrait" | null = null;
  let cardW = 0, cardH = 0, cellW = 0, cellH = 0;

  const rebuildSelection = (): void => {
    const sel = stepper.index.get();
    for (const n of cellNodes) {
      const on = n.index === sel;
      // Выбор ведёт САМ скелет (Select/Deselect из пака), поэтому ни заливки
      // ячейки, ни собственного масштаба тут нет.
      //
      // Подложка осталась только акцентным кольцом по краю ячейки — оно
      // помогает найти выбранную фишку, когда номиналы близких цветов.
      const r = Math.min(cellW, cellH) / 2;
      n.bg.clear();
      if (on) {
        n.bg.circle(cellW / 2, cellH / 2, r).fill({ color: accent, alpha: 0.18 });
        n.bg.circle(cellW / 2, cellH / 2, r - 1.5).stroke({ width: 3, color: accent });
      }
      n.chip.setState(on ? "select" : "deselect");
    }
  };

  const buildGrid = (mode: "landscape" | "portrait"): void => {
    if (builtMode === mode) return;
    builtMode = mode;
    const g = GRID[mode];
    const cols = g.cols; cellW = g.cellW; cellH = g.cellH;
    const rows = Math.ceil(options.length / cols);
    cardW = PAD * 2 + cols * cellW + (cols - 1) * GAP;
    cardH = PAD * 2 + rows * cellH + (rows - 1) * GAP;

    cardBg.clear()
      .roundRect(0, 0, cardW, cardH, RADIUS).fill({ color: 0x000000, alpha: 0.85 })
      .roundRect(5, 5, cardW - 10, cardH - 10, RADIUS - 5).fill({ color: 0xffffff, alpha: 0.1 })
      .stroke({ width: 2, color: 0xffffff, alpha: 0.3 });
    cellsWrap.position.set(PAD, PAD);
    cellsWrap.removeChildren().forEach((c) => c.destroy({ children: true }));
    cellNodes = [];
    options.forEach((value, index) => {
      const col = index % cols, rowI = Math.floor(index / cols);
      const cell = new Container();
      cell.position.set(col * (cellW + GAP), rowI * (cellH + GAP));
      cell.eventMode = "static"; cell.cursor = "pointer";
      cell.hitArea = new Rectangle(0, 0, cellW, cellH);
      // Кольцо выбора рисуется ПОД фишкой, поэтому отдельным Graphics.
      const bg = new Graphics();
      // Фишки — спайн из пака GSR (со своими Select/Deselect). Скелеты грузятся
      // в bootSicBoHud до сборки видов, поэтому здесь они уже есть.
      const chip = makeChipSpine(value, {
        // radius задаёт ВЫБРАННУЮ фишку — в паке она крупнее покоящейся почти
        // вдвое (Deselect ужимает кость до 0.56). Берём почти всю ячейку:
        // невыбранные и так уйдут в 0.56, и при меньшем радиусе номинал на них
        // переставал читаться.
        radius: Math.min(cellW, cellH) * 0.46,
        label: chipLabel(value),
      });
      chip.view.position.set(cellW / 2, cellH / 2);
      cell.addChild(bg, chip.view);
      cell.on("pointertap", () => stepper.pick(index));
      cellsWrap.addChild(cell);
      cellNodes.push({ index, bg, chip });
    });
    rebuildSelection();
  };

  // ── раскладка. portrait: карточка ПО ЦЕНТРУ экрана, вписана по ширине И высоте
  // (окно тянется по контенту, но не вылезает). landscape: лентой СПРАВА от
  // bet-кнопки, по её вертикальной оси.
  const BTN_HALF = 40, GAP_TO_BTN = 24;
  let baseScale = 1; // layout-скейл карточки (для POP-анимации — не из загрязнённого card.scale)
  const applyLayout = (screenW: number, screenH: number): void => {
    catcher.clear().rect(0, 0, screenW, screenH).fill({ color: 0x000000, alpha: 0.001 });
    const mode: "landscape" | "portrait" = screenH > screenW ? "portrait" : "landscape";
    buildGrid(mode);
    if (mode === "portrait") {
      // вписать всю карточку в экран (минус поля 32) по обеим осям — не вылезает
      const s = Math.min((screenW - 32) / cardW, (screenH - 32) / cardH);
      baseScale = s; card.scale.set(s);
      // чуть ВЫШЕ центра (0.42 вместо 0.5) — приподнято, кламп по верхнему полю
      const cy = Math.max(16, Math.round(screenH * 0.48 - (cardH * s) / 2));
      card.position.set(Math.round((screenW - cardW * s) / 2), cy);
    } else {
      const btn = resolvePlacement(ui.betButton.layout, ui.screen.get());
      // Карточку масштабируем по ЭКРАНУ, а не по кнопке: btn.scale включает
      // её собственный layout-scale (у bet-picker он 1.5), и окно раздувалось
      // в полтора раза вместе с ней — ячейки расползались, карточка не
      // помещалась и уезжала за край.
      const s = ui.screen.get().scale;
      baseScale = s; card.scale.set(s);
      const w = cardW * s, h = cardH * s;
      // Карточка выезжает ВПРАВО ИЗ кнопки и центрируется по её оси: кнопка
      // стоит в левом нижнем углу, и окно над ней перекрывало стол.
      const btnHalf = BTN_HALF * btn.scale;
      let cx = Math.round(btn.x + btnHalf + GAP_TO_BTN * s);
      let cy = Math.round(btn.y - h / 2);
      cx = Math.max(16, Math.min(cx, screenW - w - 16));
      cy = Math.max(16, Math.min(cy, screenH - h - 16));
      card.position.set(cx, cy);
    }
    // Маска идёт за карточкой: рисуем ПОСЛЕ того, как позиция посчитана.
    drawMask();
  };
  applyLayout(app.screen.width, app.screen.height);

  // ── видимость по betStepper.state ('picking') — POP-анимация (fade+scale) ──
  // Своя анимация, а не makeWindowAnim: это не всплывающее окно, а выдвижная
  // панель. Она РАСКРЫВАЕТСЯ вправо из кнопки (collapse/expand) — общий pop
  // с масштабированием от центра тут не подходит, а тянуть в него частный
  // случай значило бы усложнить анимацию всех остальных окон.
  const OPEN_S = 0.28, CLOSE_S = 0.16;
  let revealTween: gsap.core.Tween | null = null;
  let shown = false;
  const sync = (): void => {
    const wantOpen = stepper.current === "picking";
    if (wantOpen === shown) return;
    shown = wantOpen;
    revealTween?.kill();
    sfx(wantOpen ? "ui_modal_open" : "ui_modal_close");

    if (wantOpen) {
      root.visible = true;
      root.alpha = 1;
      const from = { v: builtMode === "portrait" ? 1 : 0 };
      setReveal(from.v);
      revealTween = gsap.to(from, {
        v: 1, duration: OPEN_S, ease: "power3.out",
        onUpdate: () => setReveal(from.v),
      });
    } else {
      const from = { v: reveal };
      revealTween = gsap.to(from, {
        v: 0, duration: CLOSE_S, ease: "power2.in",
        onUpdate: () => setReveal(from.v),
        onComplete: () => {
          root.visible = false;
          setReveal(1); // сброс: следующее открытие начнётся со своего нуля
        },
      });
    }
  };
  disposers.push(stepper.state.subscribe(sync));
  disposers.push(stepper.index.subscribe(rebuildSelection));
  sync();

  const dispose = (): void => {
    revealTween?.kill();
    for (const d of disposers) d();
    if (!root.destroyed) root.destroy({ children: true });
  };

  return { view: root, applyLayout, dispose };
}
