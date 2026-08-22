import { Assets, Circle, Container, Graphics, Sprite, Text, type Texture } from 'pixi.js';
import { ControlView } from '../vendor/slot-ui-pixi/index';
import type { ButtonControl, Control, OpenUI } from '../vendor/slot-ui-core/index';

const B = import.meta.env.BASE_URL;

/**
 * Вид кнопок фаз раунда: CLEAR · UNDO · NEW BET · REBET.
 *
 * Своя вьюха нужна потому, что ButtonControl сам ничего не рисует — библиотека
 * даёт вид только своим штатным контролам (spin, autoplay, mute…).
 */

/**
 * Готовые кнопки из пака RSS — круг ВМЕСТЕ с иконкой. Пока их не было, мы
 * рисовали стрелку и крестик геометрией поверх пустой подложки; теперь свой
 * рисунок не нужен.
 */
const ART: Record<string, string> = {
  undo: `${B}ui/undo_btn.webp`,
  clear: `${B}ui/clear_btn.webp`,
  newBet: `${B}ui/new_bet_btn.webp`,
  rebet: `${B}ui/rebet_btn.webp`,
};
/** Пустой круг — фоллбек-подложка, если своего спрайта у кнопки нет. */
const PLATE_URL = `${B}ui/autoplay_counter.webp`;

/** Диаметр круглой кнопки в дизайн-px — общий для всего нижнего ряда. */
const SIZE = 80;
const R = SIZE / 2;

export type PhaseButtonKind = 'undo' | 'clear' | 'newBet' | 'rebet' | 'text';

export interface PhaseButtonOptions {
  kind?: PhaseButtonKind;
}

export function loadPhaseButtonArt(): Promise<unknown> {
  return Promise.all(
    [PLATE_URL, ...Object.values(ART)].map((u) => Assets.load<Texture>(u).catch(() => null)),
  );
}

export function phaseButtonView(font: string, opts: PhaseButtonOptions = {}) {
  // Фабрика принимает базовый Control (этого требует ControlViewFactory), а
  // внутрь отдаём уже сужённый тип — эти id всегда ButtonControl.
  return (c: Control, ui: OpenUI): ControlView =>
    new PhaseButtonView(c as ButtonControl, ui, font, opts.kind ?? 'text');
}

/** Стрелка возврата — иконка UNDO. */
function drawUndo(g: Graphics): void {
  const r = R * 0.4;
  g.arc(0, 2, r, Math.PI * 0.85, Math.PI * 2.1)
    .stroke({ width: 4, color: 0xf2efe0, cap: 'round' });
  g.moveTo(-r - 5, -3).lineTo(-r + 1, 3).lineTo(-r + 7, -5)
    .stroke({ width: 4, color: 0xf2efe0, cap: 'round', join: 'round' });
}

/** Крестик — иконка CLEAR. */
function drawClear(g: Graphics): void {
  const a = R * 0.32;
  g.moveTo(-a, -a).lineTo(a, a).moveTo(a, -a).lineTo(-a, a)
    .stroke({ width: 5, color: 0xf2efe0, cap: 'round' });
}

class PhaseButtonView extends ControlView {
  private readonly plate = new Sprite();
  private readonly fallback = new Graphics();
  private hovered = false;

  constructor(
    private readonly btn: ButtonControl,
    ui: OpenUI,
    font: string,
    private readonly kind: PhaseButtonKind,
  ) {
    super(btn, ui);

    const root = new Container();

    // У UNDO и CLEAR спрайт ЦЕЛЬНЫЙ — круг вместе с иконкой; у остальных
    // берём пустую подложку и подписываем сами.
    const artUrl = ART[kind] ?? PLATE_URL;
    const tex = Assets.get<Texture>(artUrl);
    if (tex) {
      this.plate.texture = tex;
      this.plate.anchor.set(0.5);
      this.plate.scale.set(SIZE / Math.max(1, this.plate.height));
      root.addChild(this.plate);
    } else {
      root.addChild(this.fallback);
    }

    if (kind === 'text' || !tex) {
      // Подписью обходятся кнопки без своего спрайта — и она же спасает, если
      // арт не загрузился: у 'undo'/'clear' есть рисованный фоллбек, у
      // 'newBet'/'rebet' — нет, и без текста остался бы пустой круг.
      if (kind === 'undo' || kind === 'clear') {
        const icon = new Graphics();
        if (kind === 'undo') drawUndo(icon);
        else drawClear(icon);
        root.addChild(icon);
      } else {
        // Перенос по пробелу: «NEW BET» в две строки — иначе не влезает в круг.
        const label = new Text({
          text: (btn.label ?? '').replace(' ', '\n'),
          style: {
            fontFamily: font, fontSize: 16, fontWeight: '700',
            fill: 0xf2efe0, align: 'center', lineHeight: 17,
          },
        });
        label.anchor.set(0.5);
        root.addChild(label);
      }
    }

    this.addChild(root);

    this.eventMode = 'static';
    this.cursor = 'pointer';
    this.hitArea = new Circle(0, 0, R);

    this.on('pointertap', (e) => {
      // Тап НЕ должен всплывать: иначе он доходит до spin-кнопки под ним
      // (те же грабли, что в BoardView у mines).
      e.stopPropagation();
      if (!this.btn.interactable) return;
      // Эмитим В ШИНУ НАПРЯМУЮ, а не через btn.activate(): ButtonControl шлёт
      // событие только если ему передали bus в конструкторе, а контролы игры
      // создаются ДО mountHud — шины на тот момент ещё нет.
      ui.bus.emit('buttonActivated', { id: this.btn.id });
    });
    this.on('pointerover', () => { this.hovered = true; this.paint(); });
    this.on('pointerout', () => { this.hovered = false; this.paint(); });

    this.disposers.push(this.btn.state.subscribe(() => this.paint()));
    this.paint();
  }

  private paint(): void {
    const on = this.btn.interactable;

    if (this.plate.texture) {
      // Наведение подсвечиваем тинтом — спрайт один на все состояния.
      this.plate.tint = this.hovered && on ? 0xffffff : 0xd8d8d8;
    } else {
      const fill = !on ? 0x11241f : this.hovered ? 0x1d4a41 : 0x14382f;
      this.fallback.clear();
      this.fallback.circle(0, 0, R).fill(fill);
      this.fallback.circle(0, 0, R).stroke({ width: 2, color: on ? 0xe8c46a : 0x5d716b });
    }

    this.alpha = on ? 1 : 0.45;
  }
}
