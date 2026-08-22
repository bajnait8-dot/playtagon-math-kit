import { Container, Graphics, Text, Rectangle, type Ticker } from 'pixi.js';
import { type StepperControl, type OpenUI, type ScreenState } from '../../slot-ui-core/index';

// Dark translucent sheet; the selected chip is outlined in the theme accent (yellow).
const WHITE = 0xffffff;
const CHIP = 0x2a2118;
const CHIP_LINE = 0x6b6459;

interface Chip {
  node: Container;
  bg: Graphics;
  label: Text;
  index: number;
}

/**
 * Bet-level picker as a FULL-SCREEN drawer (mirrors AutoplayDrawerView). On the bet
 * stepper's `'picking'` state it fades in over a dimmed HUD and lays every bet level
 * out as a tappable chip grid; the current level is outlined in the theme accent.
 * Tap a chip → `betStepper.pick(index)` (sets the level and closes). Tap the backdrop
 * or the ✕ → `cancelPicker()`. An OpenUIPixi-managed overlay that owns its own layout.
 */
export class BetDrawerView extends Container {
  private readonly backdrop = new Graphics();
  private readonly sheet = new Container();
  private readonly title: Text;
  private readonly closeBtn = new Container();
  private readonly closeG = new Graphics();
  private chips: Chip[] = [];

  private screen: ScreenState | undefined;
  private prog = 0; // 0 hidden → 1 fully shown
  private running = false;
  private kk = 1; // active layout scale
  private readonly disposers: Array<() => void> = [];
  private readonly tick: (t: Ticker) => void;

  constructor(private readonly bet: StepperControl, private readonly ui: OpenUI, private readonly ticker: Ticker) {
    super();
    this.zIndex = 200;
    this.visible = false;
    this.eventMode = 'none';

    const fam = ui.theme.type.family;
    this.backdrop.eventMode = 'static';
    this.backdrop.cursor = 'pointer';
    this.backdrop.on('pointertap', () => this.bet.cancelPicker());

    // Bright, high-contrast heading — heavy weight + black stroke so it reads over
    // any reel colour behind the dimmed backdrop.
    this.title = new Text({
      text: ui.t('Bet').toUpperCase(),
      style: { fontFamily: fam, fontSize: 46, fill: WHITE, fontWeight: '900', letterSpacing: 2, fontStyle: 'italic', stroke: { color: 0x000000, width: 5, join: 'round' } },
    });
    this.title.anchor.set(0, 0.5);

    this.closeBtn.eventMode = 'static';
    this.closeBtn.cursor = 'pointer';
    this.closeBtn.on('pointertap', () => this.bet.cancelPicker());
    this.closeBtn.addChild(this.closeG);

    this.sheet.addChild(this.backdrop, this.title, this.closeBtn);
    this.addChild(this.sheet);

    this.buildChips();

    this.tick = (t) => this.update(t.deltaMS);
    this.disposers.push(this.bet.state.subscribe(() => this.onState()));
    this.disposers.push(this.bet.index.subscribe(() => this.drawChips()));
    this.disposers.push(
      this.ui.locale.subscribe(() => {
        if (this.destroyed) return;
        this.title.text = this.ui.t('Bet').toUpperCase();
      }),
    );
  }

  /** (Re)build the chip nodes from the stepper's current level list. */
  private buildChips(): void {
    for (const c of this.chips) c.node.destroy({ children: true });
    this.chips = [];
    const fam = this.ui.theme.type.family;
    this.bet.options.forEach((value, index) => {
      const node = new Container();
      const bg = new Graphics();
      const label = new Text({ text: this.betLabel(value), style: { fontFamily: fam, fontSize: 30, fill: WHITE, fontWeight: '700' } });
      label.anchor.set(0.5);
      node.eventMode = 'static';
      node.cursor = 'pointer';
      node.on('pointertap', () => this.bet.pick(index));
      node.addChild(bg, label);
      this.sheet.addChild(node);
      this.chips.push({ node, bg, label, index });
    });
  }

  /** Format a bet level in the display currency (falls back to a fixed decimal). */
  private betLabel(value: number): string {
    const dec = this.ui.bet.currency.get().decimals ?? 2;
    // Big whole levels read cleaner without trailing zeros ("100", not "100.00").
    return Number.isInteger(value) && value >= 10 ? String(value) : value.toFixed(dec);
  }

  applyLayout(screen: ScreenState): void {
    this.screen = screen;
    this.position.set(0, 0);
    this.scale.set(1);
    // The level list can change (currency/limits) — rebuild if the count drifted.
    if (this.chips.length !== this.bet.options.length) this.buildChips();
    this.relayout();
  }

  private baseK(): number {
    const s = this.screen;
    if (!s) return 1;
    return Math.max(0.7, Math.min(1.3, Math.min(s.width, s.height) / 1000));
  }

  private relayout(): void {
    const s = this.screen;
    if (!s) return;
    let k = this.baseK();
    let h = this.layoutAt(k);
    // Shrink to fit the viewport height if the grid is taller than the screen.
    for (let pass = 0; pass < 4 && h > s.height; pass++) {
      k = Math.max(0.35, k * (s.height / h) * 0.97);
      h = this.layoutAt(k);
    }
    this.render2();
  }

  /** Lay chips out in a centred grid at scale `k`; returns the used content height. */
  private layoutAt(k: number): number {
    const s = this.screen;
    if (!s) return 0;
    this.kk = k;
    const W = s.width;
    const H = s.height;

    this.backdrop.clear().rect(0, 0, W, H).fill({ color: 0x000000, alpha: 1 });
    this.backdrop.hitArea = new Rectangle(0, 0, W, H);

    // Header: "BET" left, ✕ right.
    this.title.style.fontSize = 46 * k;
    this.title.position.set(48 * k, 62 * k);
    const cx = W - 48 * k;
    this.closeG.clear()
      .moveTo(-13 * k, -13 * k).lineTo(13 * k, 13 * k)
      .moveTo(13 * k, -13 * k).lineTo(-13 * k, 13 * k)
      .stroke({ width: 5 * k, color: WHITE, cap: 'round' });
    // Portrait: ✕ pinned to the BOTTOM-right corner; landscape: top-right by the title.
    const portrait = H > W;
    this.closeBtn.position.set(cx, portrait ? H - 48 * k : 60 * k);
    this.closeBtn.hitArea = new Rectangle(-26 * k, -26 * k, 52 * k, 52 * k);

    // Chip grid — up to 7 per row, centred, wrapping to as many rows as needed.
    const cw = 150 * k;
    const ch = 78 * k;
    const gap = 20 * k;
    const maxRowW = W - 80 * k;
    const n = this.chips.length;
    const perRow = Math.max(1, Math.min(7, n, Math.floor((maxRowW + gap) / (cw + gap))));
    const rows = Math.ceil(n / perRow);
    const gridH = rows * ch + (rows - 1) * gap;
    // Vertically centre the grid in the space BELOW the header, so a short ladder
    // (one row) sits mid-screen instead of pinned to the top over the reels.
    const headerBottom = 120 * k;
    const gridTop = Math.max(headerBottom, (H - gridH) / 2);
    this.chips.forEach((chip, i) => {
      const row = Math.floor(i / perRow);
      const inRow = i % perRow;
      const countThisRow = Math.min(perRow, n - row * perRow);
      const rowW = countThisRow * cw + (countThisRow - 1) * gap;
      const x = (W - rowW) / 2 + inRow * (cw + gap) + cw / 2;
      const cy = gridTop + row * (ch + gap) + ch / 2;
      chip.node.position.set(x, cy);
      chip.label.style.fontSize = 30 * k;
      chip.node.hitArea = new Rectangle(-cw / 2, -ch / 2, cw, ch);
    });
    this.drawChips();

    return gridTop + gridH + 40 * k;
  }

  private drawChips(): void {
    const k = this.kk;
    const cw = 150 * k;
    const ch = 78 * k;
    const accent = this.ui.theme.color.accent;
    const current = this.bet.index.get();
    for (const chip of this.chips) {
      const on = chip.index === current;
      chip.bg.clear()
        .roundRect(-cw / 2, -ch / 2, cw, ch, 14 * k)
        .fill({ color: CHIP, alpha: 0.55 })
        .stroke({ width: (on ? 4 : 2) * k, color: on ? accent : CHIP_LINE });
      chip.label.style.fill = on ? accent : WHITE;
    }
  }

  private onState(): void {
    if (this.bet.current === 'picking') this.visible = true;
    if (!this.running) {
      this.running = true;
      this.ticker.add(this.tick);
    }
  }

  private update(dt: number): void {
    const target = this.bet.current === 'picking' ? 1 : 0;
    this.prog += (target - this.prog) * Math.min(1, dt / 120);
    if (Math.abs(this.prog - target) < 0.004) {
      this.prog = target;
      this.running = false;
      this.ticker.remove(this.tick);
    }
    this.render2();
  }

  private render2(): void {
    const s = this.screen;
    if (!s) return;
    this.sheet.alpha = this.prog;
    this.backdrop.alpha = 0.94 * this.prog;
    const shown = this.prog > 0.01;
    this.visible = shown;
    this.eventMode = shown ? 'auto' : 'none';
    this.backdrop.eventMode = shown ? 'static' : 'none';
  }

  dispose(): void {
    if (this.running) {
      this.ticker.remove(this.tick);
      this.running = false;
    }
    for (const d of this.disposers) d();
    this.disposers.length = 0;
    if (!this.destroyed) this.destroy({ children: true });
  }
}
