import { Assets, Container, Sprite, type Texture } from 'pixi.js';
import type { Theme } from '../vendor/slot-ui-core/index';
import type { SpinSkin } from '../vendor/slot-ui-pixi/index';

const B = import.meta.env.BASE_URL;

/**
 * Арт главной кнопки — круглые слотовые спрайты из пака RSS.
 *
 * В Sic Bo кнопка проще, чем в mines: cash-out нет, раунд одношаговый — она
 * всегда «бросить», меняется только доступность.
 */
const URLS = {
  idle: `${B}ui/spin_idle.webp`,
  auto: `${B}ui/spin_auto.webp`,
  stop: `${B}ui/spin_stop.webp`,
};

/** Диаметр кнопки в дизайн-px — один размер со всеми круглыми кнопками HUD. */
const SIZE = 80;

export function loadSpinArt(): Promise<unknown> {
  return Promise.all(
    Object.values(URLS).map((u) => Assets.load<Texture>(u).catch(() => null)),
  );
}

export function sicBoSpinSkin(_theme: Theme): SpinSkin {
  const view = new Container();

  const sprite = new Sprite();
  sprite.anchor.set(0.5);
  view.addChild(sprite);

  /** Поставить текстуру и вписать её в SIZE (арт квадратный). */
  const setArt = (url: string): void => {
    const tex = Assets.get<Texture>(url);
    if (!tex) return;
    sprite.texture = tex;
    sprite.scale.set(1);
    sprite.scale.set(SIZE / Math.max(1, sprite.height));
  };

  setArt(URLS.idle);

  return {
    view,

    update(state) {
      // Слэм-стопа и cash-out в Sic Bo нет: во время автобета показываем
      // «стоп», в остальном — обычную кнопку броска.
      if (state === 'auto' || state === 'stop') setArt(URLS.stop);
      else setArt(URLS.idle);

      view.alpha = state === 'disabled' ? 0.45 : state === 'spinning' ? 0.65 : 1;
    },

    destroy: () => view.destroy({ children: true }),
  };
}
