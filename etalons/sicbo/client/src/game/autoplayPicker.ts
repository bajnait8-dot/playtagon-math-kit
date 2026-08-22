import { Application, Container, Graphics, Rectangle, Text } from "pixi.js";
import { resolvePlacement, formatAmount, type OpenUI } from "../vendor/slot-ui-core/index";
import { makeWindowAnim } from "./windowAnim";
import type { HudButtonAt, ActivateHudButton } from "./betPicker";

/**
 * AUTOPLAY PICKER — «NUMBER OF ROUNDS» (макет RSS): стеклянная карточка-сетка 3×3 выбора
 * количества автоспинов. Тот же визуальный язык, что GAME MENU (gameMenu.ts): стекло,
 * скругление, привязка к кнопке + пропорциональный ресайз по screen.scale.
 *
 * Открывается по autoplay.state === 'picking' (кнопка автоплея: idle→picking через press()).
 * Тап по ячейке → autoplay.pick(count) (стартует автоплей). Кнопка автоплея в picking = ✕
 * (close-стейт, свап в AutoplayView) — повторный тап закрывает (cancelPicker). Заменяет
 * вендорный AutoplayDrawerView (bottom-sheet) — тот отключается через autoplayPicker: 'radial'
 * в hud.ts? Нет — drawer живёт при 'drawer'; мы его прячем, см. mountAutoplayPicker note.
 */

const RADIUS = 40;
const PAD = 30;
const GAP = 12; // зазор между ячейками
// Размеры сетки по ориентации (тот же принцип, что betPicker): landscape — компактная,
// portrait — крупные пилюли под тап пальца. autoplay всегда 3 колонки (9 опций = 3×3).
const GRID = {
  landscape: { cols: 3, cellW: 100, cellH: 42 },
  portrait: { cols: 3, cellW: 240, cellH: 96 },
} as const;
const TITLE_FONT = { landscape: 22, portrait: 44 } as const;
const TITLE_ZONE = { landscape: 56, portrait: 96 } as const;
const GAP_TO_BTN = 24; // зазор (дизайн-px) от верха кнопки автоплея до низа карточки (landscape)
// Доп. сдвиг карточки ВЛЕВО от правого края кнопки (landscape): autoplay-кнопка стоит
// вплотную к SPIN справа-сверху, широкую карточку уводим левее, чтобы не оверлапить spin.
const SHIFT_LEFT = 130;

/** Шаги лимитов — МНОЖИТЕЛИ СТАВКИ, не деньги. SDK так и считает:
 *  `netLoss >= lossLimit * bet` и `win >= singleWinLimit * bet`
 *  (AutoplayControl.reportResult). Infinity = «без лимита» и дефолт —
 *  игрок, не тронувший селекты, получает поведение как до фичи. */
const LIMIT_STEPS = [Infinity, 10, 25, 50, 100, 250] as const;
/** Респонсив лимитов — как у сетки: свои размеры на ориентацию. Портрет крупнее
 *  (пальцевый таргет), landscape компактнее (карточка висит над кнопкой).
 *  Высота ПИЛЮЛИ берётся из GRID[mode].cellH — лимиты выглядят как ячейки
 *  количества, а не как мелкие инпуты. LIMIT_GAP — зазоры подпись/пилюля/низ. */
const LIMIT_FONT = { landscape: 15, portrait: 30 } as const;
const LIMIT_VALUE_FONT = { landscape: 18, portrait: 34 } as const;
const LIMIT_GAP = { capToPill: 8, rowBottom: 10 } as const;
/** Полная высота строки лимита = подпись + зазор + пилюля(=ячейка) + зазор. */
const limitRowH = (mode: "landscape" | "portrait"): number =>
  LIMIT_FONT[mode] + LIMIT_GAP.capToPill + GRID[mode].cellH + LIMIT_GAP.rowBottom;

export interface AutoplayPickerHandle {
  view: Container;
  applyLayout: (screenW: number, screenH: number) => void;
  dispose: () => void;
}

const fmt = (n: number): string => (n === Infinity ? "∞" : String(n));

export function mountAutoplayPicker(
  app: Application, ui: OpenUI,
  opts: { hudButtonAt?: HudButtonAt; activateHudButton?: ActivateHudButton } = {},
): AutoplayPickerHandle {
  const disposers: Array<() => void> = [];
  const root = new Container();
  root.zIndex = 20_000;
  root.visible = false;
  root.eventMode = "static";

  // прозрачный full-screen ловитель: тап по фону закрывает; тап по HUD-кнопке — закрыть + дёрнуть
  const catcher = new Graphics();
  catcher.eventMode = "static";
  catcher.on("pointertap", (e) => {
    const hitId = opts.hudButtonAt?.(e.global.x, e.global.y) ?? null;
    ui.autoplay.cancelPicker();
    if (hitId && hitId !== ui.autoplay.id) opts.activateHudButton?.(hitId);
  });
  root.addChild(catcher);

  const card = new Container();
  card.eventMode = "static"; // тап по карточке не всплывает до catcher
  root.addChild(card);

  const font = ui.theme.type.family;

  // ── адаптивная карточка+сетка (тот же принцип, что betPicker): пересобирается при
  // смене ориентации. portrait — крупные пилюли по центру; landscape — над кнопкой.
  const cardBg = new Graphics();
  card.addChild(cardBg);
  const title = new Text({
    text: "NUMBER OF ROUNDS",
    style: { fontFamily: font, fontSize: 22, fontWeight: "700", fill: 0xffffff },
  });
  title.anchor.set(0.5, 0.5); // ЦЕНТР заголовка
  card.addChild(title);
  const cellsWrap = new Container();
  card.addChild(cellsWrap);
  // Зона лимитов — НАД сеткой: тап по числу стартует автоплей, поэтому лимиты
  // обязаны попасться игроку на глаза раньше, чем он дотянется до чисел.
  const limitsWrap = new Container();
  card.addChild(limitsWrap);
  let limitNodes: Array<{ repaint: () => void }> = [];

  const accent = 0x9bf3ef;
  let cellNodes: Array<{ count: number; bg: Graphics; label: Text }> = [];

  // ── Лимиты автоплея (RG): индексы в LIMIT_STEPS, 0 = Infinity = «no limit» ──
  let lossIdx = 0;
  let winIdx = 0;
  /** Подпись значения: «no limit» либо СУММА = множитель × текущая ставка.
   *  formatAmount, а НЕ Intl style:currency — соц-валюты GC/SC не ISO 4217 и
   *  роняют Intl RangeError'ом (тот же путь, что в betPicker). */
  const limitLabel = (k: number): string =>
    k === Infinity ? "no limit" : formatAmount(k * ui.bet.value.get(), ui.bet.currency.get());
  /** То, что уходит в pick(): МНОЖИТЕЛИ (их SDK домножит на ставку сам). */
  const currentLimits = (): { lossLimit: number; singleWinLimit: number } => ({
    lossLimit: LIMIT_STEPS[lossIdx],
    singleWinLimit: LIMIT_STEPS[winIdx],
  });
  let builtMode: "landscape" | "portrait" | null = null;
  let cardW = 0, cardH = 0, cellW = 0, cellH = 0;

  /** Перерисовать ТОЛЬКО подписи лимитов. Отдельно от buildGrid: у того ранний
   *  выход `if (builtMode === mode) return` — он не сработает при смене СТАВКИ,
   *  а подписи = множитель × ставка и обязаны пересчитаться. */
  const refreshLimitLabels = (): void => {
    for (const n of limitNodes) n.repaint();
  };

  const rebuildSelection = (): void => {
    const cur = ui.autoplay.count.get();
    for (const n of cellNodes) {
      const on = ui.autoplay.isActive && n.count === cur;
      n.bg.clear().roundRect(0, 0, cellW, cellH, cellH / 2).fill({ color: on ? accent : 0x000000, alpha: on ? 1 : 0.85 });
      n.label.style.fill = on ? 0x0a0a0a : 0xffffff;
    }
  };

  const buildGrid = (mode: "landscape" | "portrait"): void => {
    if (builtMode === mode) return;
    builtMode = mode;
    const g = GRID[mode];
    const cols = g.cols; cellW = g.cellW; cellH = g.cellH;
    title.style.fontSize = TITLE_FONT[mode];
    const titleZone = TITLE_ZONE[mode];
    const rows = Math.ceil(ui.autoplay.options.length / cols);
    cardW = PAD * 2 + cols * cellW + (cols - 1) * GAP;
    // +2 строки лимитов НАД заголовком сетки (размеры пер-ориентация — респонсив)
    const limitsH = limitRowH(mode) * 2;
    cardH = PAD * 2 + limitsH + titleZone + rows * cellH + (rows - 1) * GAP;

    cardBg.clear()
      .roundRect(0, 0, cardW, cardH, RADIUS).fill({ color: 0x000000, alpha: 0.85 })
      .roundRect(5, 5, cardW - 10, cardH - 10, RADIUS - 5).fill({ color: 0xffffff, alpha: 0.1 })
      .stroke({ width: 2, color: 0xffffff, alpha: 0.3 });
    // ── два лимита: подпись + пилюля «‹ значение ›» с тап-зонами по краям ──
    limitsWrap.position.set(PAD, PAD);
    limitsWrap.removeChildren().forEach((c) => c.destroy({ children: true }));
    limitNodes = [];
    const rowW = cardW - PAD * 2;
    const rowH = limitRowH(mode);
    const capFont = LIMIT_FONT[mode];
    const valFont = LIMIT_VALUE_FONT[mode];
    const mkLimit = (i: number, caption: string, getIdx: () => number, setIdx: (v: number) => void): void => {
      const row = new Container();
      row.position.set(0, i * rowH);
      row.eventMode = "static"; // тап по строке не всплывает до catcher (не закрывает пикер)
      const cap = new Text({
        text: caption,
        style: { fontFamily: font, fontSize: capFont, fontWeight: "700", fill: 0xffffff },
      });
      cap.alpha = 0.75;
      row.addChild(cap);
      const pillH = cellH;                       // ровно как ячейка количества
      const pillY = capFont + LIMIT_GAP.capToPill;
      const pill = new Graphics();
      row.addChild(pill);
      const mkArrow = (txt: string, x: number, dir: number): void => {
        const a = new Text({ text: txt, style: { fontFamily: font, fontSize: valFont, fontWeight: "700", fill: 0xffffff } });
        a.anchor.set(0.5);
        a.position.set(x, pillY + pillH / 2);
        a.eventMode = "static"; a.cursor = "pointer";
        a.hitArea = new Rectangle(-pillH / 2, -pillH / 2, pillH, pillH); // палец, а не глиф
        a.on("pointertap", () => {
          const n = LIMIT_STEPS.length;
          setIdx((getIdx() + dir + n) % n); // по кругу: с «no limit» и обратно
          refreshLimitLabels();
        });
        row.addChild(a);
      };
      mkArrow("‹", pillH * 0.7, -1);
      mkArrow("›", rowW - pillH * 0.7, +1);
      const value = new Text({
        text: "",
        style: { fontFamily: font, fontSize: valFont, fontWeight: "700", fill: 0xffffff },
      });
      value.anchor.set(0.5);
      value.position.set(rowW / 2, pillY + pillH / 2);
      row.addChild(value);
      /** Заданный лимит подсвечиваем акцентом — тем же, что выбранную ячейку
       *  количества (rebuildSelection). «no limit» остаётся тёмным: игрок сразу
       *  видит, включил он ограничение или нет. */
      const repaint = (): void => {
        const k = LIMIT_STEPS[getIdx()];
        const on = k !== Infinity;
        value.text = limitLabel(k);
        value.style.fill = on ? 0x0a0a0a : 0xffffff;
        pill.clear()
          .roundRect(0, pillY, rowW, pillH, pillH / 2)
          .fill({ color: on ? accent : 0x000000, alpha: on ? 1 : 0.85 });
      };
      repaint();
      limitNodes.push({ repaint });
      limitsWrap.addChild(row);
    };
    mkLimit(0, "STOP IF LOSS EXCEEDS", () => lossIdx, (v) => { lossIdx = v; });
    mkLimit(1, "STOP ON SINGLE WIN OVER", () => winIdx, (v) => { winIdx = v; });

    title.position.set(cardW / 2, PAD + limitsH + titleZone / 2);
    cellsWrap.position.set(PAD, PAD + limitsH + titleZone);
    cellsWrap.removeChildren().forEach((c) => c.destroy({ children: true }));
    cellNodes = [];
    ui.autoplay.options.forEach((count, i) => {
      const col = i % cols, rowI = Math.floor(i / cols);
      const cell = new Container();
      cell.position.set(col * (cellW + GAP), rowI * (cellH + GAP));
      cell.eventMode = "static"; cell.cursor = "pointer";
      cell.hitArea = new Rectangle(0, 0, cellW, cellH);
      const bg = new Graphics().roundRect(0, 0, cellW, cellH, cellH / 2).fill({ color: 0x000000, alpha: 0.85 });
      const label = new Text({ text: fmt(count), style: { fontFamily: font, fontSize: mode === "portrait" ? 36 : 18, fontWeight: "700", fill: 0xffffff } });
      label.anchor.set(0.5); label.position.set(cellW / 2, cellH / 2);
      cell.addChild(bg, label);
      // тап по числу = СТАРТ (как и было), но теперь с выбранными лимитами
      cell.on("pointertap", () => ui.autoplay.pick(count, currentLimits()));
      cellsWrap.addChild(cell);
      cellNodes.push({ count, bg, label });
    });
    rebuildSelection();
  };

  // ── раскладка. portrait: по центру экрана, вписана. landscape: над кнопкой автоплея. ──
  let baseScale = 1; // layout-скейл карточки (для POP-анимации)
  const applyLayout = (screenW: number, screenH: number): void => {
    catcher.clear().rect(0, 0, screenW, screenH).fill({ color: 0x000000, alpha: 0.001 });
    const mode: "landscape" | "portrait" = screenH > screenW ? "portrait" : "landscape";
    buildGrid(mode);
    if (mode === "portrait") {
      const s = Math.min((screenW - 32) / cardW, (screenH - 32) / cardH);
      baseScale = s; card.scale.set(s);
      // Якорь к НИЗУ экрана, а не доля высоты для верха: карточка растёт вверх
      // при добавлении строк (лимиты), и привязка верха уводила её за нижний край.
      // PORTRAIT_BOTTOM — отступ низа карточки от низа экрана (доля высоты).
      const y = Math.round(screenH * (1 - 0.10) - cardH * s);
      card.position.set(
        Math.round((screenW - cardW * s) / 2),
        Math.max(16, y), // не выше верхней кромки
      );
      return;
    }
    const btn = resolvePlacement(ui.autoplay.layout, ui.screen.get());
    const s = btn.scale;
    baseScale = s; card.scale.set(s);
    const w = cardW * s, h = cardH * s;
    const BTN_HALF = 40;
    let cx = Math.round(btn.x + BTN_HALF * s - SHIFT_LEFT * s - w);
    let cy = Math.round(btn.y - BTN_HALF * s - GAP_TO_BTN * s - h);
    cx = Math.max(16, Math.min(cx, screenW - w - 16));
    cy = Math.max(16, Math.min(cy, screenH - h - 16));
    card.position.set(cx, cy);
  };
  applyLayout(app.screen.width, app.screen.height);

  // ── видимость по autoplay.state ('picking') — POP-анимация (fade+scale) ──
  const anim = makeWindowAnim(root, card, () => baseScale);
  let shown = false;
  const sync = (): void => {
    const wantOpen = ui.autoplay.current === "picking";
    if (wantOpen === shown) return;
    shown = wantOpen;
    if (wantOpen) anim.open(); else anim.close();
  };
  disposers.push(ui.autoplay.state.subscribe(sync));
  disposers.push(ui.autoplay.count.subscribe(rebuildSelection));
  // подписи лимитов = множитель × ставка → пересчитать при смене ставки/валюты
  disposers.push(ui.bet.value.subscribe(refreshLimitLabels));
  disposers.push(ui.bet.currency.subscribe(refreshLimitLabels));
  sync();

  const dispose = (): void => {
    anim.dispose();
    for (const d of disposers) d();
    if (!root.destroyed) root.destroy({ children: true });
  };

  return { view: root, applyLayout, dispose };
}
