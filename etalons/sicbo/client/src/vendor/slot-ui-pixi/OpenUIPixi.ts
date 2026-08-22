import { Container, Graphics, Text, type Application, type Texture, type Ticker } from 'pixi.js';
import {
  type OpenUI,
  type BlockSpec,
  type ScreenState,
  type HostHooks,
  EventLog,
  buildBlocks,
  buttonBlocks,
  composeMenu,
} from '../slot-ui-core/index';
import { resolveExtraViews } from './extraViews';
import { type ControlView } from './views/ControlView';
import { SpinView } from './views/SpinView';
import { ValueDisplayView } from './views/ValueDisplayView';
import { ButtonView } from './views/ButtonView';
import { TurboView } from './views/TurboView';
import { AutoplayView } from './views/AutoplayView';
import { AutoplayDrawerView } from './views/AutoplayDrawerView';
import { BetDrawerView } from './views/BetDrawerView';
import { MenuView } from './views/MenuView';
import { ReadoutView } from './views/ReadoutView';
import { DialogView } from './views/DialogView';
import { type ControlViewFactory } from './views/blockColumn';
import { type SpinSkinFactory } from './skin/SpinSkin';
import { type GsapLike } from '../text-counter/index';

export interface OpenUIIcons {
  settingsIdle?: Texture;
  settingsActive?: Texture;
  /** Bet-picker button closed-state art. Open state reuses `close` (shared ✕). */
  betPicker?: Texture;
  close?: Texture;
  rules?: Texture;
  sliderMusic?: Texture;
  sliderSound?: Texture;
  turboOff?: Texture;
  turboOn?: Texture;
  /** One texture per turbo mode (index-aligned) — for 3-mode art. Wins over off/on. */
  turboModes?: Texture[];
  autoIdle?: Texture;
  autoActive?: Texture;
  /** Autoplay picking-state art (drawer open) — the ✕/close face. */
  autoPicking?: Texture;
  bonus?: Texture;
  betPlus?: Texture;
  betMinus?: Texture;
  /** Master mute button art: normal + muted (crossed) variants. Both or neither. */
  mute?: Texture;
  muteMuted?: Texture;
  /** Fullscreen button art: enter + exit variants. Both or neither. */
  fullscreen?: Texture;
  fullscreenExit?: Texture;
}

export interface OpenUIPixiOptions {
  /** Expose `window.__OPENUI__` for e2e/introspection. Default true. */
  expose?: boolean;
  /** Override the spin control's skin (default = the art-free Graphics placeholder). */
  spinSkin?: SpinSkinFactory;
  /** Real art for the menu/close/slider controls (else neutral placeholders). */
  icons?: OpenUIIcons;
  /** Balance/Bet readout look: 'default' (Figma pill + digit outline) or 'clean'
   *  (bare caption, stroke-free digits, shadows only). */
  valueLook?: 'default' | 'clean';
  /**
   * The composed MENU blocks (Settings → Paytable → Rules) the ☰ button opens in a
   * scrollable sheet. Usually built by `mountHud` via `composeMenu(spec.menu, …)`;
   * omitted → a default Settings-only menu (Music/Sound). Pass `false` to skip the
   * built-in Pixi menu entirely (e.g. when supplying your own HTML/DOM menu).
   */
  menu?: BlockSpec[] | false;
  /** Header title for the menu sheet (localizable). Default 'Menu'. */
  menuTitle?: string;
  /** Per-id view override — swap a control's renderer without forking (Charter P7). */
  controlSkins?: Partial<Record<string, ControlViewFactory>>;
  /**
   * Вид для контрола, которого библиотека НЕ знает — зарегистрированного хостом
   * через `ui.register()` (вторая половина Charter P7). `controlSkins` подменяет
   * вид известного контрола; здесь — рисуем чужой.
   *
   * Контрол без фабрики не ошибка: он не рисуется, но остаётся зарегистрированным
   * (виден в `snapshot()`, как контролы в `hidden`) — плюс `warn` в `onDataIssue`,
   * чтобы забытая фабрика не оборачивалась молча пустым экраном.
   */
  extraViews?: Partial<Record<string, ControlViewFactory>>;
  /** Хост-хуки; используется `onDataIssue` для диагностики `extraViews`. */
  hooks?: HostHooks;
  /**
   * Host `gsap` — enables the value counter's auto-downscale so wide currencies
   * (8-decimal BTC, big SATS counts, long codes) shrink to fit instead of spilling.
   * Kept out of the lib's deps (Charter B5); the host passes its own gsap.
   */
  gsap?: GsapLike;
  /**
   * Autoplay count-picker presentation. `'drawer'` (default) is a bottom sheet;
   * `'radial'` fans the count chips around the spin button.
   */
  /** `'drawer'` (default) bottom-sheet · `'radial'` arc chips · `'none'` host supplies its
   *  own picker UI (built-in drawer/radial both skipped; button still toggles picking). */
  autoplayPicker?: 'drawer' | 'radial' | 'none';
  /** Built-in bet-level drawer. Default true; set false when the host supplies its own
   *  bet picker UI (the button still toggles betStepper 'picking'). */
  betPicker?: boolean;
  /**
   * Text colour for the top-corner compliance readouts (RTP / net / session). Defaults
   * to the theme text colour; a light-background host can pass a dark colour so the
   * Figma-style `Label: value` block stays legible.
   */
  readoutColor?: string;
  /**
   * How the interactive HUD appears on mount: `'shown'` (default), `'hidden'` (off
   * screen + non-interactive; reveal later with `showControls()`), or `'slide-in'`
   * (start hidden, then slide in from the edges).
   */
  intro?: 'shown' | 'hidden' | 'slide-in';
}

/** Smooth S-curve for the show/hide slide (translation only — no scaling). */
function easeInOutCubic(p: number): number {
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
}

// ┌──────────────────────────────────────────────────────────────────────┐
// │ РУЧНАЯ ПРАВКА. `vendor-sync` ЗАТРЁТ.                                  │
// │ Полный список правок вендора — в шапке                                │
// │ `slot-ui-core/layout/screen.ts`.                                      │
// │                                                                      │
// │ Было: `v.visible = !hidden` — контрол исчезал и появлялся в ОДИН      │
// │ кадр. На каждом спине пол-HUD моргало (ставка, бонусы, меню, спин),   │
// │ и особенно резким было ВОЗВРАЩЕНИЕ после раунда.                      │
// │ Стало: плавный фейд по альфе.                                         │
// └──────────────────────────────────────────────────────────────────────┘

/** Длительность фейда контрола, мс. Появление медленнее исчезновения:
 *  уход с экрана не должен задерживать раунд, а возвращение — это то, что
 *  игрок разглядывает, и спешка там читается дёрганьем. */
const FADE_OUT_MS = 140;
const FADE_IN_MS = 260;

/** Активные фейды: id таймера кадра на контрол, чтобы не сложить два твина. */
const fadeTimers = new WeakMap<Container, () => void>();

/**
 * Плавно скрыть/показать контрол.
 *
 * `visible` держим true всю анимацию и снимаем только в конце — иначе
 * исчезновение было бы мгновенным, а фейд не был бы виден. При появлении,
 * наоборот, сразу ставим visible и тянем альфу от текущей.
 */
function fadeControl(view: Container, hidden: boolean): void {
  // Прерываем предыдущий фейд этого же контрола: без этого быстрые спины
  // накладывали бы твины и альфа застревала бы посередине.
  fadeTimers.get(view)?.();

  const from = view.alpha;
  const to = hidden ? 0 : 1;
  if (from === to) {
    view.visible = !hidden;
    view.alpha = to;
    return;
  }

  // Появление начинаем с видимого контейнера, иначе первый кадр не покажется.
  if (!hidden) view.visible = true;

  const durationMs = hidden ? FADE_OUT_MS : FADE_IN_MS;
  const startedAt = performance.now();
  let raf = 0;

  const step = (): void => {
    const p = Math.min(1, (performance.now() - startedAt) / durationMs);
    view.alpha = from + (to - from) * easeInOutCubic(p);
    if (p < 1) {
      raf = requestAnimationFrame(step);
      return;
    }
    // Скрытый контрол убираем из отрисовки и хит-теста совсем.
    view.visible = !hidden;
    fadeTimers.delete(view);
  };

  fadeTimers.set(view, () => {
    cancelAnimationFrame(raf);
    fadeTimers.delete(view);
  });
  raf = requestAnimationFrame(step);
}

/**
 * The controller: mounts ONE root Container onto the host's existing stage,
 * shares the host ticker/renderer, drives resize, and exposes introspection.
 * `unmount()` removes the layer and every listener it created (Charter P2/P12).
 */
export class OpenUIPixi {
  readonly root = new Container();
  private readonly views: ControlView[] = [];
  /** id → view, for host lookups (e.g. raiseControl). Filled in mount(). */
  private viewByIdRef = new Map<string, ControlView>();
  /** Full-screen overlays (e.g. the autoplay drawer) that own their own layout. */
  private readonly overlays: Array<{ applyLayout(s: ScreenState): void; dispose(): void }> = [];
  private readonly disposers: Array<() => void> = [];
  private _eventLog?: EventLog;
  /** Show/hide slide: each interactive view slides toward its anchored edge (bottom
   *  controls down, top up — behind the status-bar plaque). Views stay direct children
   *  of `root` (introspection bounds unchanged); only their y moves, and the
   *  ref-counted input lock makes them non-interactive while moving/hidden. */
  private slideProg = 0; // 0 = shown · 1 = fully hidden (set per `intro` on mount)
  private slideTarget = 1;
  private slideHeld = false;
  private lastScreenH = 1080;
  private appTicker?: Ticker;
  private slideTickFn?: (t: Ticker) => void;
  private readonly slideBaseY = new Map<ControlView, number>();
  private readonly slideSign = new Map<ControlView, number>();
  /** Buy-feature ⇄ total-win swap: only one shows at a time (see `setupBonusSwap`). */
  private bonusView?: ControlView;
  private totalWinView?: ControlView;
  private readonly fadeFns = new Map<Container, (t: Ticker) => void>();

  constructor(
    private readonly ui: OpenUI,
    private readonly opts: OpenUIPixiOptions = {},
  ) {}

  /** The bus event log backing `window.__OPENUI__.events` (available after mount). */
  get eventLog(): EventLog | undefined {
    return this._eventLog;
  }

  mount(app: Application): void {
    const { stage, renderer, ticker } = app;
    this.appTicker = ticker;
    stage.sortableChildren = true;
    this.root.zIndex = 10_000;
    this.root.sortableChildren = true;
    stage.addChild(this.root);

    const ic = this.opts.icons ?? {};

    // spin + balance/bet value displays. `controlSkins[balance|bet]` (Charter P7) swaps the
    // renderer for a host-supplied one (e.g. an inline "Label: sum" line); else the stock
    // odometer ValueDisplayView.
    const spinView = new SpinView(this.ui.spin, this.ui, ticker, this.opts.spinSkin);
    const skins = this.opts.controlSkins ?? {};
    const balanceView = skins[this.ui.balance.id]
      ? skins[this.ui.balance.id]!(this.ui.balance, this.ui, ticker)
      : new ValueDisplayView(this.ui.balance, this.ui, ticker, this.opts.gsap, this.opts.valueLook);
    const betView = skins[this.ui.bet.id]
      ? skins[this.ui.bet.id]!(this.ui.bet, this.ui, ticker)
      : new ValueDisplayView(this.ui.bet, this.ui, ticker, this.opts.gsap, this.opts.valueLook);

    // settings button (☰) → the unified scrollable MENU (settings/paytable/rules)
    const settingsView = new ButtonView(this.ui.settingsButton, this.ui, ticker, {
      shape: 'circle',
      radius: 40,
      glyph: 'menu',
      iconTexture: ic.settingsIdle,
      // при iconTexture круг НЕ рисуется (ButtonView: sprite вместо bg/glyph) — размер
      // держит только iconTarget. Единый размер всех круглых кнопок HUD = 80.
      iconTarget: 80,
      dark: true, // Figma ☰: solid black circle, white bars, no ring (fallback-плейсхолдер)
    });
    settingsView.zIndex = 5;

    // `menu: false` skips the built-in Pixi menu (e.g. a host-supplied HTML menu).
    const menuView = this.opts.menu === false ? undefined : this.buildMenu(ticker);

    // bottom bar: turbo / autoplay / bonus / bet ± stepper
    const turboView = new TurboView(this.ui.turbo, this.ui, ticker, {
      offTexture: ic.turboOff,
      onTexture: ic.turboOn,
      modeTextures: ic.turboModes,
      target: 80, // единый размер круглых кнопок HUD
    });
    const spinOff = this.ui.spin.layout.offset ?? [0, 0];
    const autoOff = this.ui.autoplay.layout.offset ?? [0, 0];
    const picker = this.opts.autoplayPicker ?? 'drawer';
    const autoplayView = new AutoplayView(this.ui.autoplay, this.ui, ticker, {
      idleTexture: ic.autoIdle,
      activeTexture: ic.autoActive,
      pickingTexture: ic.autoPicking,
      // с полным 3-стейт артом (idle/picking/active) число спинов рисуется НА этой кнопке
      showCount: !!(ic.autoIdle && ic.autoActive && ic.autoPicking),
      target: 80, // единый размер круглых кнопок HUD

      // view различает лишь 'radial' (веер) vs остальное; для 'none' — как пассивный drawer
      picker: picker === 'radial' ? 'radial' : 'drawer',
      arcCenter: { x: spinOff[0] - autoOff[0], y: spinOff[1] - autoOff[1] },
      arcStepDeg: 22,
    });
    autoplayView.zIndex = 20;
    // bonus-view можно заменить через controlSkins[bonus] (как balance/bet) — игра даёт свою
    // широкую плашку; тогда она полноценный HUD-view (slide-in, BigWin-hide, swap работают).
    const bonusView: ControlView = skins[this.ui.bonusButton.id]
      ? skins[this.ui.bonusButton.id]!(this.ui.bonusButton, this.ui, ticker)
      : new ButtonView(this.ui.bonusButton, this.ui, ticker, { shape: 'circle', radius: 60, iconTexture: ic.bonus, iconTarget: 130 });
    const betPlusView = new ButtonView(this.ui.betPlus, this.ui, ticker, { shape: 'circle', radius: 30, iconTexture: ic.betPlus, iconTarget: 64 });
    const betMinusView = new ButtonView(this.ui.betMinus, this.ui, ticker, { shape: 'circle', radius: 30, iconTexture: ic.betMinus, iconTarget: 64 });
    // Bonus total-win readout — the same value renderer as balance/bet (caption pill +
    // rolling counter, same currency/locale money logic). Parked in the buy-feature
    // slot; shown only in a bonus (free-spins) round, swapped for the buy button.
    // controlSkins[total-win] (Charter P7) can swap the renderer (e.g. inline "Label: sum").
    const totalWinView: ControlView = skins[this.ui.totalWin.id]
      ? skins[this.ui.totalWin.id]!(this.ui.totalWin, this.ui, ticker)
      : new ValueDisplayView(this.ui.totalWin, this.ui, ticker, this.opts.gsap);
    // Round-win readout (id `win`) — постоянный выигрыш раунда в нижней панели (hidden по
    // дефолту, кормится reportRound + host toggles setHidden). controlSkins[win] swaps renderer.
    const winView: ControlView = skins[this.ui.win.id]
      ? skins[this.ui.win.id]!(this.ui.win, this.ui, ticker)
      : new ValueDisplayView(this.ui.win, this.ui, ticker, this.opts.gsap, this.opts.valueLook);
    // TOTAL COST readout (full effective stake) — hidden by default; game reveals it.
    const totalCostView: ControlView = skins[this.ui.totalCost.id]
      ? skins[this.ui.totalCost.id]!(this.ui.totalCost, this.ui, ticker)
      : new ValueDisplayView(this.ui.totalCost, this.ui, ticker, this.opts.gsap, this.opts.valueLook);
    this.bonusView = bonusView;
    this.totalWinView = totalWinView;

    // edge controls (master mute + fullscreen) — b&w "mono" buttons like turbo.
    // Текстуры принимаются только ПАРОЙ (normal+variant): одиночная дала бы sprite-режим,
    // в котором свап на глиф молча не работает — вечно застрявшая иконка
    const muteTex = ic.mute && ic.muteMuted ? ic.mute : undefined;
    const fullscreenTex = ic.fullscreen && ic.fullscreenExit ? ic.fullscreen : undefined;
    const muteView = new ButtonView(this.ui.muteButton, this.ui, ticker,
      { shape: 'circle', radius: 30, glyph: 'speaker', iconTexture: muteTex, iconTarget: 80, mono: true });
    const fullscreenView = new ButtonView(this.ui.fullscreenButton, this.ui, ticker,
      { shape: 'circle', radius: 30, glyph: 'fullscreen', iconTexture: fullscreenTex, iconTarget: 80, mono: true });
    // Bet-picker button — art closed-state (ic.betPicker), swaps to close (✕) while the
    // drawer is open (see subscription below). Без арта — b&w mono coins glyph (fallback).
    // `controlSkins[bet-picker]` (Charter P7) swaps the renderer for a host-supplied one:
    // a table game has no fixed stake, so it draws the CURRENT chip on the button instead
    // of a static coins icon. A skinned button owns its own open/closed look — the ✕ swap
    // below stays with the stock view.
    const stockBetButtonView = skins[this.ui.betButton.id]
      ? undefined
      : new ButtonView(this.ui.betButton, this.ui, ticker,
        { shape: 'circle', radius: 30, glyph: 'coins', iconTexture: ic.betPicker, iconTarget: 80, mono: true });
    const betButtonView: ControlView = stockBetButtonView
      ?? skins[this.ui.betButton.id]!(this.ui.betButton, this.ui, ticker);
    muteView.zIndex = 65;
    fullscreenView.zIndex = 65;
    betButtonView.zIndex = 65;
    // Compliance readouts (RTP / net / session) — a plain `Label: value` block in the
    // top-left corner. Each readout still only shows when its jurisdiction flag is set.
    const roOpts = { prefix: true, fill: this.opts.readoutColor } as const;
    const rtpView = new ReadoutView(this.ui.rtp, this.ui, ticker, roOpts);
    const netView = new ReadoutView(this.ui.netPosition, this.ui, ticker, roOpts);
    const timerView = new ReadoutView(this.ui.sessionTimer, this.ui, ticker, roOpts);
    // Status line "Game · 21:15" (lower-left corner) — same plain white style, no caption.
    const clockView = new ReadoutView(this.ui.clock, this.ui, ticker, roOpts);

    // Every view is mounted; `ui.hidden` only toggles VISIBILITY (so a responsive
    // breakpoint can show/hide a control at runtime — Charter P10). Hidden views
    // stay laid out + introspectable in snapshot, they're just not drawn.
    const entries: Array<[string, ControlView]> = [
      [this.ui.spin.id, spinView],
      [this.ui.balance.id, balanceView],
      [this.ui.bet.id, betView],
      [this.ui.settingsButton.id, settingsView],
      [this.ui.turbo.id, turboView],
      [this.ui.autoplay.id, autoplayView],
      [this.ui.bonusButton.id, bonusView],
      [this.ui.totalWin.id, totalWinView],
      [this.ui.win.id, winView],
      [this.ui.totalCost.id, totalCostView],
      [this.ui.betPlus.id, betPlusView],
      [this.ui.betMinus.id, betMinusView],
      [this.ui.muteButton.id, muteView],
      [this.ui.fullscreenButton.id, fullscreenView],
      [this.ui.betButton.id, betButtonView],
    ];
    entries.push([this.ui.rtp.id, rtpView]);
    entries.push([this.ui.netPosition.id, netView]);
    entries.push([this.ui.sessionTimer.id, timerView]);
    entries.push([this.ui.clock.id, clockView]);
    // Контролы хоста (`ui.register`) — им библиотека views не строит, вид даёт
    // `extraViews`. После штатных, чтобы известные id считались занятыми.
    for (const e of resolveExtraViews(
      this.ui,
      new Set(entries.map(([id]) => id)),
      this.opts.extraViews,
      ticker,
      this.opts.hooks?.onDataIssue?.bind(this.opts.hooks),
    )) entries.push(e);
    const viewById = new Map<string, ControlView>();
    const idByView = new Map<ControlView, string>();
    for (const [id, view] of entries) {
      view.visible = !this.ui.hidden.has(id);
      this.root.addChild(view);
      this.views.push(view);
      viewById.set(id, view);
      idByView.set(view, id);
    }
    this.viewByIdRef = viewById;
    this.disposers.push(
      this.ui.on('visibilityChanged', ({ id, hidden }) => {
        const v = viewById.get(id);
        if (v) fadeControl(v, hidden);
      }),
    );

    // master mute icon reflects the mute state (speaker ↔ speaker-mute); with real
    // art (icons.mute/muteMuted) the textures swap instead of the placeholder glyphs
    const applyMute = (m: boolean): void => {
      if (ic.mute && ic.muteMuted) muteView.setIconTexture(m ? ic.muteMuted : ic.mute);
      else muteView.setGlyph(m ? 'speaker-mute' : 'speaker');
    };
    this.disposers.push(this.ui.muted.subscribe(applyMute));
    applyMute(this.ui.muted.get()); // стартовое состояние (startMuted) — subscribe ловит лишь изменения

    // ☰ settings icon reflects the menu open/closed state: closed = settingsIdle art,
    // open = shared close (✕). Кнопка уже toggle-ит панель (OpenUI: settingsPanel.toggle());
    // это лишь держит вид в синхроне. Нужны обе текстуры (idle + close), иначе idle стоит.
    if (ic.settingsIdle && ic.close) {
      this.disposers.push(this.ui.settingsPanel.state.subscribe(() => {
        settingsView.setIconTexture(this.ui.settingsPanel.isOpen ? ic.close! : ic.settingsIdle!);
      }));
    }

    // bet-picker icon mirrors settings: closed = betPicker art, open = shared close (✕).
    // The button toggles the drawer (see OpenUI bet-picker handler); this syncs the look.
    if (stockBetButtonView && ic.betPicker && ic.close) {
      this.disposers.push(this.ui.betStepper.state.subscribe(() => {
        const open = this.ui.betStepper.current === 'picking';
        stockBetButtonView.setIconTexture(open ? ic.close! : ic.betPicker!);
      }));
    }

    // fullscreen: the view stays DOM-agnostic, so the controller owns the toggle and
    // keeps the glyph in sync with the actual document fullscreen state.
    if (typeof document !== 'undefined') {
      this.disposers.push(
        this.ui.bus.on('buttonActivated', ({ id }) => {
          if (id !== 'fullscreen') return;
          const el = (app.canvas.parentElement ?? document.documentElement) as HTMLElement;
          if (document.fullscreenElement) void document.exitFullscreen?.();
          else void el.requestFullscreen?.();
        }),
      );
      const onFsChange = (): void => {
        const fs = !!document.fullscreenElement;
        if (ic.fullscreen && ic.fullscreenExit) fullscreenView.setIconTexture(fs ? ic.fullscreenExit : ic.fullscreen);
        else fullscreenView.setGlyph(fs ? 'fullscreen-exit' : 'fullscreen');
      };
      document.addEventListener('fullscreenchange', onFsChange);
      this.disposers.push(() => document.removeEventListener('fullscreenchange', onFsChange));
    }

    // Keyboard spin (Space / Enter), gated by jurisdiction (`disabledSpacebar`) + the
    // lock. RTS 14D: one spin per press — no auto-repeat by holding the key.
    if (typeof window !== 'undefined') {
      let keyHeld = false;
      const onKeyDown = (e: KeyboardEvent): void => {
        if (e.code !== 'Space' && e.key !== 'Enter') return;
        if (!this.ui.spin.allowKeyboard.get() || e.repeat || keyHeld) return;
        keyHeld = true;
        e.preventDefault();
        if (this.ui.spin.interactable) this.ui.spin.activate();
      };
      const onKeyUp = (e: KeyboardEvent): void => {
        if (e.code === 'Space' || e.key === 'Enter') keyHeld = false;
      };
      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('keyup', onKeyUp);
      this.disposers.push(() => {
        window.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('keyup', onKeyUp);
      });
    }

    // The menu is a full-screen overlay that manages its OWN open/closed visibility
    // (driven by the panel state) — so it's an overlay, not a force-visible view.
    if (menuView) {
      this.root.addChild(menuView);
      this.overlays.push(menuView);
    }

    // The autoplay bottom drawer (the options-mode picker) is a full-screen overlay.
    if (picker === 'drawer') {
      const drawer = new AutoplayDrawerView(this.ui.autoplay, this.ui, ticker);
      this.root.addChild(drawer);
      this.overlays.push(drawer);
    }

    // The bet-picker drawer (full-screen bet-level grid) — a full-screen overlay, driven by
    // the bet stepper's 'picking' state. Skipped when the host supplies its own (betPicker:false).
    if (this.opts.betPicker !== false) {
      const betDrawer = new BetDrawerView(this.ui.betStepper, this.ui, ticker);
      this.root.addChild(betDrawer);
      this.overlays.push(betDrawer);
    }

    // The menu-style notice / error modal (owns its open/closed visibility → overlay).
    const dialog = new DialogView(this.ui.noticePanel, this.ui.noticeBlocks, this.ui.noticeActions, this.ui, ticker, { controlSkins: this.opts.controlSkins });
    this.root.addChild(dialog);
    this.overlays.push(dialog);

    // REPLAY badge (Stake replay mode) — a pill shown while `ui.replay` is true.
    const replayBadge = new Container();
    const replayBg = new Graphics();
    const replayText = new Text({ text: this.ui.t('openui.replay').toUpperCase(), style: { fontFamily: this.ui.theme.type.family, fontSize: 16, fontWeight: '800', fill: 0xffffff, letterSpacing: 2 } });
    replayText.anchor.set(0.5);
    replayBadge.addChild(replayBg, replayText);
    replayBadge.zIndex = 310;
    replayBadge.visible = this.ui.replay.get();
    this.root.addChild(replayBadge);
    this.overlays.push({
      applyLayout: (s) => {
        const w = replayText.width + 36;
        const h = 32;
        replayBg.clear().roundRect(-w / 2, -h / 2, w, h, h / 2).fill({ color: 0x0c0d10 }).stroke({ width: 2, color: 0xffffff });
        replayBadge.position.set(s.width / 2, 40);
      },
      dispose: () => {
        if (!replayBadge.destroyed) replayBadge.destroy({ children: true });
      },
    });
    this.disposers.push(
      this.ui.replay.subscribe((v) => {
        replayBadge.visible = v;
      }),
      this.ui.locale.subscribe(() => {
        if (!replayBadge.destroyed) replayText.text = this.ui.t('openui.replay').toUpperCase();
      }),
    );

    // The ☰ menu button keeps the SAME look whether the menu is open or closed —
    // it only ever opens the menu, so it never morphs into a ✕.

    const applyLayout = (): void => {
      const screen = this.ui.screen.get();
      this.slideBaseY.clear();
      this.slideSign.clear();
      for (const v of this.views) {
        v.applyLayout(screen);
        const anchor = this.ui.control(idByView.get(v) ?? '')?.layout.anchor ?? 'bottom-center';
        // record the resting y + slide direction (top controls up, the rest down)
        this.slideBaseY.set(v, v.y);
        this.slideSign.set(v, anchor.startsWith('top') ? -1 : 1);
      }
      this.lastScreenH = screen.height;
      this.applySlide();
      for (const o of this.overlays) o.applyLayout(screen);
    };
    const onResize = (): void => {
      this.ui.setScreen(app.screen.width, app.screen.height);
    };

    renderer.on('resize', onResize);
    const unsubScreen = this.ui.screen.subscribe(applyLayout);
    onResize();
    applyLayout();

    // Initial HUD visibility (configurable via `intro`): shown / hidden / slide-in.
    const intro = this.opts.intro ?? 'shown';
    if (intro === 'shown') {
      this.slideProg = 0;
      this.applySlide();
    } else {
      this.slideProg = 1; // start off-screen
      this.applySlide();
      this.ui.lock(); // non-interactive while hidden
      this.slideHeld = true;
      if (intro === 'slide-in') this.setControlsVisible(true); // animate in (unlocks when shown)
    }

    this.disposers.push(() => renderer.off('resize', onResize), unsubScreen);

    // Buy-feature ⇄ total-win: the buy button and the total-win readout share the
    // same slot; the renderer shows exactly one, keyed off free-spins mode.
    this.setupBonusSwap();

    this._eventLog = new EventLog(this.ui.bus);

    if (this.opts.expose ?? true) this.expose();
  }

  /**
   * Wire the buy-feature ⇄ total-win swap. In base play the buy button shows (unless
   * hidden by config/jurisdiction); once the spin button enters free-spins mode
   * (`setFreeSpins(n > 0)` — you "can't buy" mid-bonus) the buy button fades out and
   * the localized total-win counter fades in over the same slot, then back on exit.
   */
  private setupBonusSwap(): void {
    const bonus = this.bonusView;
    const tw = this.totalWinView;
    if (!bonus || !tw) return;
    const apply = (inBonus: boolean, animate: boolean): void => {
      // Base-play visibility of the buy button still honours config / jurisdiction.
      const bonusShouldShow = !inBonus && !this.ui.hidden.has(this.ui.bonusButton.id);
      if (animate) {
        if (inBonus) {
          tw.visible = true;
          tw.alpha = 0;
          this.fadeTo(tw, 1, 220);
          this.fadeTo(bonus, 0, 160, () => (bonus.visible = false));
        } else {
          if (bonusShouldShow) {
            bonus.visible = true;
            bonus.alpha = 0;
            // settle on the button's own interactable alpha (1, or 0.4 when locked)
            this.fadeTo(bonus, this.ui.bonusButton.interactable ? 1 : 0.4, 220);
          }
          this.fadeTo(tw, 0, 160, () => (tw.visible = false));
        }
      } else {
        this.stopFade(bonus);
        this.stopFade(tw);
        bonus.visible = bonusShouldShow;
        bonus.alpha = this.ui.bonusButton.interactable ? 1 : 0.4;
        tw.visible = inBonus;
        tw.alpha = inBonus ? 1 : 0;
      }
    };
    apply(this.ui.spin.freeSpins.get() > 0, false);
    this.disposers.push(this.ui.spin.freeSpins.subscribe((n) => apply(n > 0, true)));
    // bonus.alpha зависит от bonusButton.interactable (= !locked), но раньше пересчитывался
    // только на freeSpins. При intro slide-in HUD стартует locked → alpha 0.4, а на разлоке
    // (HUD въехал) не обновлялся → плашка оставалась бледной. Пересчитываем и на locked.
    this.disposers.push(this.ui.locked.subscribe(() => apply(this.ui.spin.freeSpins.get() > 0, false)));
  }

  /** Fade a view's alpha to `to` over `ms` (wall-clock paced); cancels any prior fade
   *  on the same view. `onDone` runs once when it settles. */
  private fadeTo(view: Container, to: number, ms: number, onDone?: () => void): void {
    this.stopFade(view);
    const t = this.appTicker;
    const from = view.alpha;
    if (!t || from === to) {
      view.alpha = to;
      onDone?.();
      return;
    }
    const startMs = typeof performance !== 'undefined' ? performance.now() : 0;
    const fn = (): void => {
      const nowMs = typeof performance !== 'undefined' ? performance.now() : startMs + ms;
      const k = Math.min(1, (nowMs - startMs) / Math.max(ms, 1));
      view.alpha = from + (to - from) * k;
      if (k >= 1) {
        view.alpha = to;
        this.stopFade(view);
        onDone?.();
      }
    };
    this.fadeFns.set(view, fn);
    t.add(fn);
  }

  /** Cancel an in-flight fade on `view` (if any). */
  private stopFade(view: Container): void {
    const fn = this.fadeFns.get(view);
    if (fn) {
      this.appTicker?.remove(fn);
      this.fadeFns.delete(view);
    }
  }

  /**
   * Build the unified scrollable MENU bound to the ☰ panel. Composed `menu` blocks
   * are given by `mountHud`; absent → a default Settings-only menu. Built-in ids
   * ('music'/'sfx') are reused, not shadowed (P10); button blocks wire `closePanel`.
   */
  private buildMenu(ticker: Application['ticker']): ControlView {
    const menu = this.opts.menu && this.opts.menu.length ? this.opts.menu : composeMenu(undefined, {});
    const controls = buildBlocks(menu, this.ui.bus, undefined, (id) => this.ui.control(id));
    for (const c of controls) if (!this.ui.control(c.id)) this.ui.register(c);
    const buttons = buttonBlocks(menu);
    this.disposers.push(
      this.ui.bus.on('buttonActivated', ({ id }) => {
        const b = buttons.find((x) => x.id === id);
        if (b?.action === 'closePanel') this.ui.settingsPanel.closePanel();
      }),
    );
    return new MenuView(this.ui.settingsPanel, controls, menu, this.ui, ticker, {
      controlSkins: this.opts.controlSkins,
      title: this.opts.menuTitle,
    });
  }

  /**
   * Slide the whole interactive HUD in (`true`) or out (`false`): bottom-anchored
   * controls travel down, top-anchored travel up (behind the status-bar plaque).
   * Pure translation (no scaling); controls are non-interactive while moving/hidden.
   */
  setControlsVisible(visible: boolean): void {
    const target = visible ? 0 : 1;
    this.slideTarget = target;
    // non-interactive while moving/hidden — hold the ref-counted input lock
    if (!this.slideHeld) {
      this.ui.lock();
      this.slideHeld = true;
    }
    const settle = (): void => {
      // fully shown → release the lock; fully hidden → stay locked
      if (this.slideProg === 0 && this.slideHeld) {
        this.ui.unlock();
        this.slideHeld = false;
      }
    };
    if (!this.appTicker) {
      this.slideProg = target;
      this.applySlide();
      settle();
      return;
    }
    // Drive the slide from a wall-clock timestamp (not accumulated ticker deltas), so
    // it completes in a fixed real-time duration regardless of frame pacing.
    const from = this.slideProg;
    const startMs = typeof performance !== 'undefined' ? performance.now() : 0;
    if (this.slideTickFn) this.appTicker.remove(this.slideTickFn);
    const tick = (): void => {
      const nowMs = typeof performance !== 'undefined' ? performance.now() : startMs + 360;
      const k = Math.min(1, (nowMs - startMs) / 360);
      this.slideProg = from + (target - from) * k;
      if (k >= 1) {
        this.slideProg = target;
        this.appTicker?.remove(tick);
        this.slideTickFn = undefined;
        settle();
      }
      this.applySlide();
    };
    this.slideTickFn = tick;
    this.appTicker.add(tick);
  }

  /** Apply the current slide progress: translate each interactive view toward its
   *  anchored edge (pure translation — no scaling). */
  private applySlide(): void {
    const off = easeInOutCubic(this.slideProg) * this.lastScreenH;
    for (const [view, baseY] of this.slideBaseY) {
      view.y = baseY + (this.slideSign.get(view) ?? 1) * off;
    }
  }

  /** Raise a control's view zIndex so it renders above overlays (e.g. keep Balance visible
   *  over a custom full-screen catalog backdrop). No-op if the id isn't mounted. */
  raiseControl(id: string, zIndex: number): void {
    const v = this.viewByIdRef.get(id);
    if (v) v.zIndex = zIndex;
  }

  /** The mounted view container for a control id (or undefined). Lets a host overlay
   *  animate a control directly — e.g. slide/fade the Spin button out while a custom
   *  panel takes its place. Read-only handle; do not reparent it. */
  controlView(id: string): Container | undefined {
    return this.viewByIdRef.get(id);
  }

  /** Re-apply a control's layout placement (position/scale/rotation) from its spec against
   *  the current screen — the canonical way to RESTORE a control a host overlay moved by
   *  hand. No-op if the id isn't mounted. */
  relayoutControl(id: string): void {
    this.viewByIdRef.get(id)?.applyLayout(this.ui.screen.get());
  }

  /** Найти id ИНТЕРАКТИВНОЙ HUD-кнопки под глобальной точкой (px экрана). Для «проброса»
   *  тапа сквозь fullscreen-catcher открытого окна: catcher ловит тап, спрашивает эту
   *  функцию и, если попал в кнопку, дёргает её. Учитываем только заданные ids (кнопки,
   *  а не readout'ы), видимые и не hidden. Возвращает id или null. */
  hitControlAt(globalX: number, globalY: number, ids?: string[]): string | null {
    const candidates = ids ?? [...this.viewByIdRef.keys()];
    for (const id of candidates) {
      if (this.ui.hidden.has(id)) continue;
      const v = this.viewByIdRef.get(id);
      if (!v || !v.visible || v.alpha < 0.05) continue;
      const b = v.getBounds();
      if (globalX >= b.minX && globalX <= b.maxX && globalY >= b.minY && globalY <= b.maxY) return id;
    }
    return null;
  }

  unmount(): void {
    if (this.slideTickFn && this.appTicker) this.appTicker.remove(this.slideTickFn);
    this.slideTickFn = undefined;
    for (const fn of this.fadeFns.values()) this.appTicker?.remove(fn);
    this.fadeFns.clear();
    for (const v of this.views) v.dispose();
    this.views.length = 0;
    for (const o of this.overlays) o.dispose();
    this.overlays.length = 0;
    this._eventLog?.dispose();
    this._eventLog = undefined;
    for (const d of this.disposers) d();
    this.disposers.length = 0;
    if (!this.root.destroyed) this.root.destroy({ children: true });
    if (typeof window !== 'undefined') {
      delete (window as unknown as Record<string, unknown>).__OPENUI__;
    }
  }

  private expose(): void {
    if (typeof window === 'undefined') return;
    (window as unknown as Record<string, unknown>).__OPENUI__ = {
      snapshot: () => this.ui.snapshot(),
      getState: (id: string) => this.ui.control(id)?.current ?? null,
      isInteractable: (id: string) => this.ui.control(id)?.interactable ?? false,
      isAnimating: (id: string) => this.ui.control(id)?.inspect().animating ?? false,
      bounds: (id: string) => this.ui.snapshot().find((s) => s.id === id)?.bounds ?? null,
      events: (since: number) => this._eventLog?.since(since) ?? [],
      controlsReady: () => this.slideProg < 0.001,
      // [DBG] temp introspection + bet driver for the diagnosis matrix
      __dbg: () => {
        const u = this.ui as unknown as Record<string, any>;
        return {
          balanceMajor: u.balance?.get?.(),
          betMajor: u.bet?.get?.(),
          betStepperValue: u.betStepper?.value,
          betStepperIndex: u.betStepper?.index?.get?.(),
          totalCost: u.totalCost?.get?.(),
          noticeOpen: u.noticePanel?.isOpen,
        };
      },
      // [DBG] set bet to ladder value v (major); returns resolved value/index/levels
      __setBet: (v: number) => {
        const s = (this.ui as unknown as Record<string, any>).betStepper;
        const levels: number[] = [...s.options];
        let idx = levels.indexOf(v);
        if (idx < 0) idx = Math.max(0, levels.findIndex((x: number) => x >= v));
        s.setIndex(idx);
        return { value: s.value, index: s.index.get(), levels };
      },
    };
  }
}
