import { Application, Container, Graphics, Rectangle, Sprite, Text, Assets, type Texture } from "pixi.js";
import { resolvePlacement, type OpenUI } from "../vendor/slot-ui-core/index";
import { makeWindowAnim } from "./windowAnim";
import type { HudButtonAt, ActivateHudButton } from "./betPicker";

/**
 * GAME MENU — компактное стеклянное окно (Figma 360×250), открывается по ☰ (settingsPanel).
 * Строки: GAME INFO › (→ HTML info-menu с rules) · MUSIC (toggle) · SOUND EFFECTS (toggle)
 * · SPACEBAR TO SPIN (toggle, ui.spin.allowKeyboard; скрыт если юрисдикция запрещает пробел).
 * Тогглы — арт public/ui/toggle_{on,off}.webp (120×60).
 *
 * Развязка ☰: это окно слушает settingsPanel.state (открытие по ☰). HTML info-menu
 * (rules) БОЛЬШЕ НЕ висит на ☰ — открывается только из строки GAME INFO через
 * `openInfoMenu` (колбэк из main.ts, ставит .open на .ohm-root напрямую). См. main.ts.
 */

// BASE_URL с завершающим '/', пути без ведущего слэша: работает на sub-path платформы.
const B = import.meta.env.BASE_URL;
const TOGGLE_ON = `${B}ui/toggle_on.webp`;
const TOGGLE_OFF = `${B}ui/toggle_off.webp`;

/** Грузить арт тогглов ДО mountGameMenu (в общий boot Promise.all). */
export function loadGameMenuArt(): Promise<unknown> {
  return Promise.all([Assets.load<Texture>(TOGGLE_ON), Assets.load<Texture>(TOGGLE_OFF)]);
}

const RADIUS = 40;
// Размеры РАЗНЫЕ по ориентации (тот же принцип, что betPicker/autoplayPicker):
// landscape — компактная карточка; portrait — шире, крупные ряды/тумблеры под палец.
const DIM = {
  landscape: { cardW: 360, rowH: 60, padX: 30, toggleW: 60, toggleH: 30, font: 22, chevron: 28 },
  portrait: { cardW: 620, rowH: 110, padX: 48, toggleW: 110, toggleH: 55, font: 40, chevron: 48 },
} as const;
// Высота карточки = верх/низ поля (по 5) + N рядов по rowH.
const cardHeightFor = (rowCount: number, rowH: number): number => 10 + rowCount * rowH;

// music/sfx «включено» = штатная громкость (совпадает с initial в OpenUI: music 0.7, sfx 0.5)
const MUSIC_ON = 0.7;
const SFX_ON = 0.5;

export interface GameMenuOptions {
  /** Открыть HTML info-menu (rules) — строка GAME INFO. Из main.ts. */
  openInfoMenu: () => void;
  /** Открыть окно проверки честности — строка PROVABLY FAIR. */
  openFairness?: () => void;
  /** Проброс тапа сквозь catcher к HUD-кнопке (см. betPicker). */
  hudButtonAt?: HudButtonAt;
  activateHudButton?: ActivateHudButton;
}

export interface GameMenuHandle {
  view: Container;
  applyLayout: (screenW: number, screenH: number) => void;
  dispose: () => void;
}

/**
 * Смонтировать GAME MENU в pixi-root. Возвращает handle с applyLayout (звать на resize)
 * и dispose. Видимость управляется подпиской на ui.settingsPanel.state.
 */
export function mountGameMenu(app: Application, ui: OpenUI, opts: GameMenuOptions): GameMenuHandle {
  const disposers: Array<() => void> = [];
  const root = new Container();
  root.zIndex = 20_000; // над HUD (root.zIndex=10_000) и его оверлеями
  root.visible = false;
  root.eventMode = "static";

  // ПРОЗРАЧНЫЙ full-screen ловитель: клик в любом месте вне карточки закрывает окно
  // (без затемнения). Заодно гейтит ввод в HUD под окном пока оно открыто.
  const catcher = new Graphics();
  catcher.eventMode = "static";
  // тап по фону закрывает; тап по HUD-кнопке — закрыть + дёрнуть её (пробитие catcher).
  catcher.on("pointertap", (e) => {
    const hitId = opts.hudButtonAt?.(e.global.x, e.global.y) ?? null;
    ui.settingsPanel.closePanel();
    if (hitId && hitId !== ui.settingsButton.id) opts.activateHudButton?.(hitId);
  });
  root.addChild(catcher);

  // ── стеклянная карточка ──
  const card = new Container();
  // тап по карточке НЕ должен всплывать до catcher (иначе клик по MUSIC закрывал бы окно)
  card.eventMode = "static";
  root.addChild(card);

  const cardBg = new Graphics();
  card.addChild(cardBg);
  const rowsWrap = new Container();
  card.addChild(rowsWrap);
  const font = ui.theme.type.family;

  // SPACEBAR TO SPIN — только если юрисдикция разрешает пробел И это landscape (на
  // телефоне-портрете клавиатуры нет — ряд бессмысленный, убираем).
  const spacebarAllowed = !ui.isDisabled("spacebar");
  // Сеттеры тумблеров текущих рядов — обновляются при пересборке (подписки ниже дёргают их).
  const toggleSetters: { music?: (on: boolean) => void; sfx?: (on: boolean) => void; spacebar?: (on: boolean) => void } = {};

  let builtMode: "landscape" | "portrait" | null = null;
  let cardW = 0, cardH = 0;

  // Собрать карточку+ряды под ориентацию (пересобирается при смене portrait↔landscape).
  const buildCard = (mode: "landscape" | "portrait"): void => {
    if (builtMode === mode) return;
    builtMode = mode;
    const d = DIM[mode];
    const hasSpacebar = spacebarAllowed && mode === "landscape"; // portrait — без spacebar
    cardW = d.cardW;
    // Рядов: GAME INFO · PROVABLY FAIR · MUSIC · SOUND EFFECTS (+ SPACEBAR).
    cardH = cardHeightFor(hasSpacebar ? 5 : 4, d.rowH);

    cardBg.clear()
      .roundRect(0, 0, cardW, cardH, RADIUS).fill({ color: 0x000000, alpha: 0.85 })
      .roundRect(5, 5, cardW - 10, cardH - 10, RADIUS - 5).fill({ color: 0xffffff, alpha: 0.1 })
      .stroke({ width: 2, color: 0xffffff, alpha: 0.3 });

    rowsWrap.removeChildren().forEach((c) => c.destroy({ children: true }));

    const rowLabel = (text: string): Text =>
      new Text({ text, style: { fontFamily: font, fontSize: d.font, fontWeight: "700", fill: 0xffffff } });
    const divider = (y: number): Graphics =>
      new Graphics().moveTo(5, y).lineTo(cardW - 5, y).stroke({ width: 2, color: 0xffffff, alpha: 0.3 });

    const makeToggleRow = (label: string, initialOn: boolean, onChange: (on: boolean) => void): { container: Container; setOn: (on: boolean) => void } => {
      const c = new Container();
      const lbl = rowLabel(label);
      lbl.anchor.set(0, 0.5); lbl.position.set(d.padX, d.rowH / 2);
      c.addChild(lbl);
      const pill = new Sprite(Assets.get<Texture>(initialOn ? TOGGLE_ON : TOGGLE_OFF));
      pill.anchor.set(1, 0.5); pill.width = d.toggleW; pill.height = d.toggleH;
      pill.position.set(cardW - d.padX, d.rowH / 2);
      pill.eventMode = "static"; pill.cursor = "pointer";
      c.addChild(pill);
      let on = initialOn;
      const setOn = (next: boolean): void => { on = next; pill.texture = Assets.get<Texture>(on ? TOGGLE_ON : TOGGLE_OFF); };
      pill.on("pointertap", () => { setOn(!on); onChange(on); });
      return { container: c, setOn };
    };

    /** Строка-переход «ПОДПИСЬ ›»: закрывает меню и открывает своё окно. */
    const makeLinkRow = (label: string, onTap: () => void): Container => {
      const c = new Container();
      c.eventMode = "static"; c.cursor = "pointer";
      c.hitArea = new Rectangle(0, 0, cardW, d.rowH);
      const lbl = rowLabel(label);
      lbl.anchor.set(0, 0.5); lbl.position.set(d.padX, d.rowH / 2);
      c.addChild(lbl);
      const chevron = new Text({ text: "›", style: { fontFamily: font, fontSize: d.chevron, fontWeight: "700", fill: 0xffffff } });
      chevron.anchor.set(1, 0.5); chevron.position.set(cardW - d.padX, d.rowH / 2 - 2);
      c.addChild(chevron);
      c.on("pointertap", () => { ui.settingsPanel.closePanel(); onTap(); });
      return c;
    };

    const infoRow = makeLinkRow("GAME INFO", () => opts.openInfoMenu());
    // Проверка честности — тем же приёмом, что GAME INFO: своё окно из меню.
    const fairRow = makeLinkRow("PROVABLY FAIR", () => opts.openFairness?.());
    const musicRow = makeToggleRow("MUSIC", ui.musicSlider.value.get() > 0, (on) => ui.musicSlider.setNormalized(on ? MUSIC_ON : 0));
    const sfxRow = makeToggleRow("SOUND EFFECTS", ui.sfxSlider.value.get() > 0, (on) => ui.sfxSlider.setNormalized(on ? SFX_ON : 0));
    toggleSetters.music = musicRow.setOn;
    toggleSetters.sfx = sfxRow.setOn;
    const rows = [infoRow, fairRow, musicRow.container, sfxRow.container];
    toggleSetters.spacebar = undefined; // сброс: прошлый ряд уничтожен removeChildren
    if (hasSpacebar) {
      // «SPIN» — слотовое слово, в mines пробел делает СТАВКУ. В social-режиме
      // терминология азартных игр запрещена: там ставка называется PLAY (тот же
      // свап, что в rules.ts и на кнопке BET).
      const betWord = ui.social.get() ? "PLAY" : "BET";
      const spacebarRow = makeToggleRow(`SPACEBAR TO ${betWord}`, ui.spin.allowKeyboard.get(), (on) => ui.spin.allowKeyboard.set(on));
      toggleSetters.spacebar = spacebarRow.setOn;
      rows.push(spacebarRow.container);
    }
    rows.forEach((r, i) => {
      r.position.set(0, 5 + i * d.rowH);
      rowsWrap.addChild(r);
      if (i > 0) rowsWrap.addChild(divider(5 + i * d.rowH));
    });
  };

  // Двусторонняя связь громкости → пилюли (через актуальные сеттеры пересобранных рядов).
  disposers.push(ui.musicSlider.value.subscribe((v) => toggleSetters.music?.(v > 0)));
  disposers.push(ui.sfxSlider.value.subscribe((v) => toggleSetters.sfx?.(v > 0)));
  // spacebar-подписка: setter существует только когда ряд построен (landscape) — ?. no-op иначе
  if (spacebarAllowed) disposers.push(ui.spin.allowKeyboard.subscribe((v) => toggleSetters.spacebar?.(v)));
  // Смена social меняет ТЕКСТ ряда (BET ⇄ PLAY), а build кэширован по ориентации
  // (`builtMode`) — сбрасываем кэш, иначе подпись останется от прежнего режима.
  disposers.push(ui.social.subscribe(() => {
    builtMode = null;
    applyLayout(app.screen.width, app.screen.height);
  }));

  // Закрытие — повторным тапом по ☰ (settingsButton уже toggle-ит панель + свапает на ✕);
  // отдельная close-кнопка и притенение НЕ нужны.

  // ── раскладка: ловитель на весь экран (прозрачный), карточка НАД кнопкой ☰ ──
  // Позиция И МАСШТАБ ☰ берутся ТОЙ ЖЕ функцией, что и сам view (resolvePlacement по
  // settingsButton.layout + screen). Карточка масштабируется на btn.scale (screen.scale),
  // поэтому окно ресайзится пропорционально — как объект-кнопка. Габариты в экранных px =
  // CARD_* × scale. Карточка: низ-лево над кнопкой (левый край по кнопке, растёт вверх).
  // Единое правило для окон над кнопками: карточка строго НАД своей кнопкой, ЛЕВЫЙ край
  // карточки = ЛЕВЫЙ край кнопки по X, низ карточки на GAP выше верха кнопки. BTN_HALF —
  // полувысота/полуширина кнопки (target 80 → 40 дизайн-px). btn.x/btn.y = ЦЕНТР кнопки.
  const BTN_HALF = 40;
  const GAP = 24; // зазор (дизайн-px) от верха кнопки до низа карточки
  let baseScale = 1; // layout-скейл карточки (для POP-анимации)
  const applyLayout = (screenW: number, screenH: number): void => {
    // alpha 0.001 — фактически невидим, но остаётся hit-testable в pixi
    catcher.clear().rect(0, 0, screenW, screenH).fill({ color: 0x000000, alpha: 0.001 });
    const mode: "landscape" | "portrait" = screenH > screenW ? "portrait" : "landscape";
    buildCard(mode); // пересобрать карточку под ориентацию (крупные ряды в portrait)
    if (mode === "portrait") {
      // вписать в экран по ширине/высоте (минус поля 32), по центру X, опущена к низу
      const s = Math.min((screenW - 32) / cardW, (screenH - 32) / cardH);
      baseScale = s; card.scale.set(s);
      const w = cardW * s, h = cardH * s;
      const cy = Math.min(Math.round(screenH * 0.56), Math.round(screenH - h - 16));
      card.position.set(Math.round((screenW - w) / 2), cy);
      return;
    }
    const btn = resolvePlacement(ui.settingsButton.layout, ui.screen.get());
    const s = btn.scale;
    baseScale = s; card.scale.set(s); // ← пропорциональный ресайз содержимого окна
    const w = cardW * s, h = cardH * s;
    // левый край карточки = левый край кнопки (X); низ карточки = верх кнопки − GAP
    let cx = Math.round(btn.x - BTN_HALF * s);
    let cy = Math.round(btn.y - BTN_HALF * s - GAP * s - h);
    // не выпускать за края экрана (кламп с 16px полями)
    cx = Math.max(16, Math.min(cx, screenW - w - 16));
    cy = Math.max(16, Math.min(cy, screenH - h - 16));
    card.position.set(cx, cy);
  };
  applyLayout(app.screen.width, app.screen.height);

  // ── видимость по settingsPanel.state (☰ toggle) — POP-анимация (fade+scale) ──
  const anim = makeWindowAnim(root, card, () => baseScale);
  let shown = false;
  const sync = (): void => {
    const wantOpen = ui.settingsPanel.isOpen;
    if (wantOpen === shown) return;
    shown = wantOpen;
    if (wantOpen) anim.open(); else anim.close();
  };
  disposers.push(ui.settingsPanel.state.subscribe(sync));
  sync();

  const dispose = (): void => {
    anim.dispose();
    for (const d of disposers) d();
    if (!root.destroyed) root.destroy({ children: true });
  };

  return { view: root, applyLayout, dispose };
}
