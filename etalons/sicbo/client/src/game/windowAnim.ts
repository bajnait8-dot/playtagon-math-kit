import type { Container } from "pixi.js";
import gsap from "gsap";
import { sfx } from "./sound";

/**
 * POP-анимация открытия/закрытия попап-окна (autoplay / bet amount / menu).
 * Открытие: fade-in + scale 0.9→1 с лёгким back-отскоком. Закрытие: реверс, затем root
 * прячется. Держит один tween на card (kill предыдущего) — безопасно при быстром toggle.
 *
 * ЗВУК живёт ЗДЕСЬ, а не в каждом окне: раньше ui_modal_open/close был подписан только
 * на каталог бонусов (main.ts, onOpenChange), и меню/ставка/автоплей открывались молча.
 * Общая точка = ни одно новое окно не забудет озвучиться. Каталог бонусов через
 * makeWindowAnim НЕ проходит (у него своя анимация) — дубля нет.
 *
 * ВАЖНО про масштаб: card.scale ставит layout окна (screen.scale). Мы НЕ читаем baseScale
 * из card.scale (его загрязняет наша же анимация → окно накопительно уменьшалось при
 * повторных открытиях). Вместо этого baseScale берём из `getBaseScale()` — функции, что
 * возвращает АКТУАЛЬНЫЙ layout-скейл окна. При старте open/close всегда ресинхронизируем
 * card.scale к нему.
 */

const POP_IN_MS = 0.26;
const POP_OUT_MS = 0.16;

export interface WindowAnim {
  open: () => void;
  close: (onHidden?: () => void) => void;
  dispose: () => void;
}

export function makeWindowAnim(
  root: Container,
  card: Container,
  getBaseScale: () => number,
): WindowAnim {
  let tween: gsap.core.Tween | null = null;
  let scaleTween: gsap.core.Tween | null = null;
  const killTweens = (): void => { tween?.kill(); scaleTween?.kill(); tween = null; scaleTween = null; };

  const open = (): void => {
    killTweens();
    sfx("ui_modal_open");
    const base = getBaseScale();       // ТОЧНЫЙ layout-скейл (не из загрязнённого card.scale)
    root.visible = true;
    root.alpha = 0;
    card.scale.set(base * 0.9);
    tween = gsap.to(root, { alpha: 1, duration: POP_IN_MS, ease: "power2.out" });
    scaleTween = gsap.to(card.scale, { x: base, y: base, duration: POP_IN_MS + 0.06, ease: "back.out(2)" });
  };

  const close = (onHidden?: () => void): void => {
    killTweens();
    sfx("ui_modal_close");
    const base = getBaseScale();
    tween = gsap.to(root, {
      alpha: 0, duration: POP_OUT_MS, ease: "power2.in",
      onComplete: () => {
        root.visible = false;
        root.alpha = 1;             // сброс для следующего открытия
        card.scale.set(base);       // вернуть точный layout-скейл
        onHidden?.();
      },
    });
    scaleTween = gsap.to(card.scale, { x: base * 0.92, y: base * 0.92, duration: POP_OUT_MS, ease: "power2.in" });
  };

  const dispose = (): void => killTweens();

  return { open, close, dispose };
}
