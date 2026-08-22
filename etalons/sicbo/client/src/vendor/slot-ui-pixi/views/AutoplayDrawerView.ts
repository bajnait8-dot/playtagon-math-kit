import { Container, Graphics, Text, Rectangle, type Ticker } from 'pixi.js';
import { type AutoplayControl, type OpenUI, type ScreenState } from '../../slot-ui-core/index';

// Dark palette matching the bet-drawer: dark translucent sheet, yellow theme accent
// on the selected chip / Start button, dimmed labels.
const WHITE = 0xffffff;
const BLACK = 0x0a0a0a;
const DARK = 0x1a1420;
const CHIP = 0x2a2118;
const CHIP_LINE = 0x6b6459;
const DIM = 0x9aa0a6;

interface Chip {
  node: Container;
  bg: Graphics;
  label: Text;
  value: number;
}

type GroupKind = 'count' | 'loss' | 'win';

interface Group {
  kind: GroupKind;
  heading?: Text;
  chips: Chip[];
  selected: number;
}

/**
 * Autoplay picker as a BOTTOM DRAWER, in black & white. On the autoplay control's
 * `'picking'` state it slides up, dims the HUD, and offers the count choices — plus,
 * when configured, the responsible-gambling limits: "stop on loss" and "stop on
 * single win" (multiples of bet; ∞ = no limit). Pick → `autoplay.pick(count,
 * {lossLimit, singleWinLimit})`; the host enforces them via `hud.reportRound`. Tap
 * the backdrop → `cancelPicker()`. A full-screen overlay (OpenUIPixi-managed).
 */
export class AutoplayDrawerView extends Container {
  private readonly backdrop = new Graphics();
  private readonly sheet = new Container();
  private readonly sheetBg = new Graphics();
  private readonly title: Text;
  private readonly closeBtn = new Container();
  private readonly closeG = new Graphics();
  private readonly startBtn = new Container();
  private readonly startBg = new Graphics();
  private readonly startLabel: Text;
  private readonly groups: Group[] = [];

  private screen: ScreenState | undefined;
  private prog = 0; // 0 hidden → 1 fully shown
  private running = false;
  private sheetH = 300;
  private kk = 1; // active layout scale (base scale shrunk to fit the viewport height)
  private readonly disposers: Array<() => void> = [];
  private readonly tick: (t: Ticker) => void;

  constructor(private readonly auto: AutoplayControl, private readonly ui: OpenUI, private readonly ticker: Ticker) {
    super();
    this.zIndex = 200;
    this.visible = false;
    this.eventMode = 'none';

    const fam = ui.theme.type.family;
    this.backdrop.eventMode = 'static';
    this.backdrop.cursor = 'pointer';
    this.backdrop.on('pointertap', () => this.auto.cancelPicker());

    this.title = new Text({ text: ui.t('Autoplay'), style: { fontFamily: fam, fontSize: 40, fill: WHITE, fontWeight: '800', letterSpacing: 1, fontStyle: 'italic' } });
    this.title.anchor.set(0.5, 0);

    // Start label rides on the yellow accent → dark ink for contrast.
    this.startLabel = new Text({ text: ui.t('Start'), style: { fontFamily: fam, fontSize: 26, fill: BLACK, fontWeight: '800', letterSpacing: 1 } });
    this.startLabel.anchor.set(0.5);
    this.startBtn.eventMode = 'static';
    this.startBtn.cursor = 'pointer';
    this.startBtn.on('pointertap', () => this.start());
    this.startBtn.addChild(this.startBg, this.startLabel);

    // ✕ close (top-right) — same as the bet-drawer.
    this.closeBtn.eventMode = 'static';
    this.closeBtn.cursor = 'pointer';
    this.closeBtn.on('pointertap', () => this.auto.cancelPicker());
    this.closeBtn.addChild(this.closeG);

    this.sheet.addChild(this.sheetBg, this.title, this.closeBtn);

    this.addGroup('count', this.auto.options);
    if (this.auto.lossLimitOptions.length) this.addGroup('loss', this.auto.lossLimitOptions, 'Stop on loss');
    if (this.auto.winLimitOptions.length) this.addGroup('win', this.auto.winLimitOptions, 'Stop on single win');

    this.sheet.addChild(this.startBtn);
    this.addChild(this.backdrop, this.sheet);

    this.tick = (t) => this.update(t.deltaMS);
    this.disposers.push(this.auto.state.subscribe(() => this.onState()));
    this.disposers.push(
      this.ui.locale.subscribe(() => {
        if (this.destroyed) return;
        this.title.text = this.ui.t('Autoplay');
        this.startLabel.text = this.ui.t('Start');
        for (const g of this.groups) if (g.heading) g.heading.text = this.ui.t(headingKey(g.kind));
      }),
    );
  }

  private addGroup(kind: GroupKind, values: number[], headingText?: string): void {
    const fam = this.ui.theme.type.family;
    const group: Group = { kind, chips: [], selected: 0 };
    if (headingText) {
      group.heading = new Text({ text: this.ui.t(headingText), style: { fontFamily: fam, fontSize: 16, fill: DIM, fontWeight: '700', letterSpacing: 0.5 } });
      group.heading.anchor.set(0.5, 0.5);
      this.sheet.addChild(group.heading);
    }
    values.forEach((value) => {
      const node = new Container();
      const bg = new Graphics();
      const label = new Text({ text: chipText(kind, value), style: { fontFamily: fam, fontSize: 24, fill: WHITE, fontWeight: '800' } });
      label.anchor.set(0.5);
      node.eventMode = 'static';
      node.cursor = 'pointer';
      const idx = group.chips.length;
      node.on('pointertap', () => this.select(group, idx));
      node.addChild(bg, label);
      this.sheet.addChild(node);
      group.chips.push({ node, bg, label, value });
    });
    group.selected = defaultSelected(kind, values);
    this.groups.push(group);
  }

  applyLayout(screen: ScreenState): void {
    this.screen = screen;
    this.position.set(0, 0);
    this.scale.set(1);
    this.relayout();
  }

  /** Base scale (before fit-to-height). Portrait scales от ширины покрупнее, чтобы
   *  чипы/тексты читались на узком экране; landscape — от короткой стороны как раньше. */
  private baseK(): number {
    const s = this.screen;
    if (!s) return 1;
    const portrait = s.height > s.width;
    if (portrait) return Math.max(1.05, Math.min(1.9, s.width / 400));
    return Math.max(0.78, Math.min(1.3, Math.min(s.width, s.height) / 1000));
  }

  private relayout(): void {
    const s = this.screen;
    if (!s) return;
    let k = this.baseK();
    let h = this.layoutAt(k);
    // Shrink the whole picker to fit the viewport height — with the loss + single-win
    // limit groups it can be taller than a short landscape screen. Height scales with k
    // (and chips wrap MORE as k drops), so a couple of passes converge. Floor 0.35.
    for (let pass = 0; pass < 4 && h > s.height; pass++) {
      k = Math.max(0.35, k * (s.height / h) * 0.97);
      h = this.layoutAt(k);
    }
    this.render2();
  }

  /** Lay the sheet out at scale `k`; returns the full slide height (sheetH + 40). */
  private layoutAt(k: number): number {
    const s = this.screen;
    if (!s) return 0;
    this.kk = k;
    const W = s.width;
    const H = s.height;

    this.backdrop.clear().rect(0, 0, W, H).fill({ color: 0x000000, alpha: 1 });
    this.backdrop.hitArea = new Rectangle(0, 0, W, H);

    // Full-screen drawer (bet-drawer look): dark sheet edge-to-edge, italic title
    // top-left, groups vertically centred, ✕ top-right.
    this.title.style.fontSize = 40 * k;
    this.title.anchor.set(0, 0.5);
    this.title.position.set(40 * k, 56 * k);
    const portrait = H > W;
    this.closeG.clear()
      .moveTo(-13 * k, -13 * k).lineTo(13 * k, 13 * k)
      .moveTo(13 * k, -13 * k).lineTo(-13 * k, 13 * k)
      .stroke({ width: 5 * k, color: WHITE, cap: 'round' });
    // Portrait: ✕ moves to the BOTTOM-right corner (aligned with Start below); landscape: top-right.
    this.closeBtn.position.set(W - 48 * k, portrait ? H - 48 * k : 56 * k);
    this.closeBtn.hitArea = new Rectangle(-26 * k, -26 * k, 52 * k, 52 * k);

    const cw = 86 * k;
    const ch = 64 * k;
    const gap = 14 * k;
    const maxRowW = W - 48 * k;
    const headingH = portrait ? 40 * k : 30 * k;
    // How many chips per row for a group: portrait balances into 2 even rows (so no
    // stray short row); landscape packs as many as fit the width.
    const perRowFor = (n: number): number =>
      portrait ? Math.ceil(n / Math.ceil(n / Math.min(4, Math.max(1, Math.floor((maxRowW + gap) / (cw + gap))))))
               : Math.max(1, Math.min(n, Math.floor((maxRowW + gap) / (cw + gap))));
    // Measure the content block height first, then start `y` so it's vertically centred.
    let blockH = 0;
    for (const g of this.groups) {
      if (g.heading) blockH += headingH;
      const n = g.chips.length;
      blockH += Math.ceil(n / perRowFor(n)) * (ch + gap) + 12 * k;
    }
    blockH += 58 * k + 24 * k; // start button + its top pad
    let y = Math.max(110 * k, (H - blockH) / 2);

    for (const g of this.groups) {
      if (g.heading) {
        g.heading.style.fontSize = (portrait ? 22 : 16) * k;
        g.heading.position.set(W / 2, y + headingH / 2);
        y += headingH;
      }
      const n = g.chips.length;
      const perRow = perRowFor(n);
      const rows = Math.ceil(n / perRow);
      g.chips.forEach((chip, i) => {
        const row = Math.floor(i / perRow);
        const inRow = i % perRow;
        const countThisRow = Math.min(perRow, n - row * perRow);
        const rowW = countThisRow * cw + (countThisRow - 1) * gap;
        const x = (W - rowW) / 2 + inRow * (cw + gap) + cw / 2;
        const cy = y + row * (ch + gap) + ch / 2;
        chip.node.position.set(x, cy);
        chip.label.style.fontSize = 24 * k;
        chip.node.hitArea = new Rectangle(-cw / 2, -ch / 2, cw, ch);
      });
      this.drawGroup(g);
      y += rows * (ch + gap) + 12 * k;
    }

    const startW = Math.min(W - 48 * k, 320 * k);
    const startH = 58 * k;
    // Portrait: pin Start to the bottom-centre of the screen; landscape: right after the groups.
    const startY = portrait
      ? H - startH / 2 - 40 * k
      : y + 4 * k + startH / 2;
    this.startBg.clear().roundRect(-startW / 2, -startH / 2, startW, startH, 14 * k).fill({ color: this.ui.theme.color.accent });
    this.startLabel.style.fontSize = 24 * k;
    this.startBtn.position.set(W / 2, startY);
    this.startBtn.hitArea = new Rectangle(-startW / 2, -startH / 2, startW, startH);
    // Portrait: align the ✕ vertically with the Start button (same row, right edge).
    if (portrait) this.closeBtn.position.set(W - 48 * k, startY);

    this.sheetH = startY + startH / 2 + 20 * k;
    // Full-screen sheet — dark, edge-to-edge over the whole viewport (bet-drawer look).
    this.sheetBg.clear().rect(0, 0, W, H).fill({ color: DARK, alpha: 0.72 });

    return this.sheetH + 40;
  }

  private drawGroup(g: Group): void {
    const k = this.kk;
    const cw = 86 * k;
    const ch = 64 * k;
    const accent = this.ui.theme.color.accent;
    g.chips.forEach((chip, idx) => {
      const on = idx === g.selected;
      // Rounded chip; selected = accent outline + accent label (bet-drawer look).
      chip.bg.clear()
        .roundRect(-cw / 2, -ch / 2, cw, ch, 12 * k)
        .fill({ color: CHIP, alpha: 0.55 })
        .stroke({ width: (on ? 4 : 2) * k, color: on ? accent : CHIP_LINE });
      chip.label.style.fill = on ? accent : WHITE;
    });
  }

  private select(group: Group, i: number): void {
    group.selected = i;
    this.drawGroup(group);
  }

  private valueOf(kind: GroupKind): number | undefined {
    const g = this.groups.find((x) => x.kind === kind);
    return g?.chips[g.selected]?.value;
  }

  private start(): void {
    const count = this.valueOf('count') ?? this.auto.options[0] ?? 1;
    this.auto.pick(count, {
      lossLimit: this.valueOf('loss') ?? Infinity,
      singleWinLimit: this.valueOf('win') ?? Infinity,
    });
  }

  private onState(): void {
    if (this.auto.current === 'picking') this.visible = true;
    if (!this.running) {
      this.running = true;
      this.ticker.add(this.tick);
    }
  }

  private update(dt: number): void {
    const target = this.auto.current === 'picking' ? 1 : 0;
    this.prog += (target - this.prog) * Math.min(1, dt / 140);
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
    // Full-screen drawer: fade in place (no bottom-slide) like the bet-drawer.
    this.sheet.position.set(0, 0);
    this.sheet.alpha = this.prog;
    this.backdrop.alpha = 0.82 * this.prog;
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

function chipText(kind: GroupKind, value: number): string {
  if (value === Infinity) return '∞';
  return kind === 'count' ? String(value) : `${value}×`;
}

function defaultSelected(kind: GroupKind, values: number[]): number {
  if (kind === 'count') {
    const i = values.findIndex((v) => v !== Infinity);
    return i >= 0 ? i : 0;
  }
  const inf = values.indexOf(Infinity);
  return inf >= 0 ? inf : 0;
}

function headingKey(kind: GroupKind): string {
  return kind === 'loss' ? 'Stop on loss' : kind === 'win' ? 'Stop on single win' : 'Autoplay';
}
