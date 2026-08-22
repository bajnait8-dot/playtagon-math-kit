import { Assets, Container, Sprite, type Texture } from 'pixi.js';

/**
 * Экран интро — арт игры на весь экран.
 *
 * Заголовок ОТДЕЛЬНЫМ ТЕКСТОМ не рисуем: «SIC BO» уже набрано на самой
 * картинке, и второй такой же поверх читался бы как дубль.
 *
 * Spine здесь нет: в mines интро строилось на скелетах GameLogo и Horse, но это
 * арт Royal Mews — он убран из игры целиком вместе с 15 МБ в архиве.
 */

const B = import.meta.env.BASE_URL;
/**
 * Интро в ДВУХ вариантах: широкий арт в ландшафте и высокий в портрете.
 *
 * Одной картинкой не обойтись: интро кладётся COVER'ом, и портретный экран
 * съедал у ландшафтного арта половину ширины — «SIC BO» уезжало за кромку.
 * Портретный арт нарисован под ту же композицию, но вертикально.
 */
const INTRO_URL = `${B}ui/intro_bg.webp`;
const INTRO_PORTRAIT_URL = `${B}ui/intro_bg_portrait.webp`;

export function loadIntroArt(): Promise<unknown> {
  // Грузим ОБА: ориентация может смениться прямо на интро (поворот телефона),
  // и догружать арт в этот момент — значит показать пустой экран.
  return Promise.all([
    Assets.load<Texture>(INTRO_URL).catch(() => null),
    Assets.load<Texture>(INTRO_PORTRAIT_URL).catch(() => null),
  ]);
}

export interface IntroScene {
  view: Container;
  layout: (w: number, h: number) => void;
}

export function buildIntro(): IntroScene {
  const view = new Container();

  const art = new Sprite(Assets.get<Texture>(INTRO_URL));
  art.anchor.set(0.5);
  view.addChild(art);

  const layout = (w: number, h: number): void => {
    // Арт под ориентацию. Портретного может не быть (Assets.load гасит ошибку
    // в null) — тогда честно откатываемся на ландшафтный, а не показываем
    // пустой экран.
    const wanted = w >= h ? INTRO_URL : INTRO_PORTRAIT_URL;
    const tex = Assets.get<Texture>(wanted) ?? Assets.get<Texture>(INTRO_URL);
    if (tex && art.texture !== tex) art.texture = tex;

    if (!art.texture || art.texture.width <= 1) return;
    // COVER, а не contain: интро занимает весь экран, поля по краям выглядели
    // бы как незагруженный арт. Лишнее уходит за кромку.
    const k = Math.max(w / art.texture.width, h / art.texture.height);
    art.scale.set(k);
    art.position.set(w / 2, h / 2);
  };

  return { view, layout };
}
