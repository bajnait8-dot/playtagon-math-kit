import { Container, Sprite, Texture, TilingSprite } from 'pixi.js';

/**
 * Базовый цвет сцены — тёмное сукно #1a4a4a: сине-зелёный, ближе к тилу, чем к
 * траве. Плашки зон (ZONE_DARK) держатся чуть темнее — в один тон с фоном грид
 * растворялся бы.
 */
export const BG_COLOR = 0x1a4a4a;

/**
 * Тинт тайла сукна. Он ЧУТЬ СВЕТЛЕЕ BG_COLOR, потому что тинт умножает, а
 * средняя яркость тайла 246, а не 255: без компенсации фон вышел бы темнее
 * заданного. 0x1a4a4a / (246/255) ≈ 0x1b4d4d.
 */
const FELT_TINT = 0x1b4d4d;

/**
 * Фон сцены — сукно с радиальной виньеткой.
 *
 * Виньетка рисуется ОДНОЙ текстурой с честным радиальным градиентом (canvas
 * createRadialGradient), а не набором вложенных рамок: рамками получались
 * видимые прямоугольные ступеньки по краям и углам.
 *
 * АРТА ЗДЕСЬ НЕТ намеренно. В mines фон был двухслойный (картинка амбара +
 * Spine-декор с конём), но это арт Royal Mews — он убран из игры целиком вместе
 * с 17 МБ, которые занимал в архиве. Когда придёт свой арт, меняется только
 * отрисовка: сигнатура mountBackground остаётся.
 */

/**
 * Тайл СУКНА — БЕЛЫЙ, потому что цвет ему даёт tint: одну текстуру можно
 * перекрасить под любой стол, не перерисовывая её.
 *
 * Это ФЕТР, а не холст: у сукна казино нет регулярного плетения — только
 * ворс, мелкое неоднородное зерно. Первая попытка рисовала сетку нитей и
 * выглядела мешковиной.
 *
 * Размер 128 — тайл должен быть степенью двойки (иначе видны швы), и чем он
 * крупнее, тем незаметнее повтор.
 */
function makeFeltTexture(): Texture {
  // 256, а не 128: с крупным зерном мелкий тайл выдавал себя повтором.
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d')!;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, S, S);

  const img = ctx.getImageData(0, 0, S, S);
  const d = img.data;

  // Ворс — ровное мелкое зерно по всему тайлу.
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4;
      // Зерно ворса. Амплитуда крупная (±44), потому что тинт УМНОЖАЕТ: на
      // тёмном сукне разброс сжимается пропорционально яркости, и прежние ±16
      // давали фактуру, неотличимую от ровной заливки.
      const fine = (Math.random() - 0.5) * 44;
      // Редкие тёмные ворсинки — без них зерно выглядит цифровым шумом, а не
      // тканью: у настоящего фетра волокна лежат неравномерно.
      const fleck = Math.random() < 0.06 ? -26 : 0;
      // База чуть ниже чистого белого: тинт умножает, и на 255 зерно тонет —
      // светлее фона уже некуда.
      const v = 246 + fine + fleck;
      const clamped = v < 0 ? 0 : v > 255 ? 255 : v;
      d[i] = clamped;
      d[i + 1] = clamped;
      d[i + 2] = clamped;
    }
  }
  ctx.putImageData(img, 0, 0);

  return Texture.from(c);
}

/** Квадратная текстура виньетки: прозрачный центр → чёрные края. */
function makeVignetteTexture(): Texture {
  const SIZE = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext('2d')!;

  const c = SIZE / 2;
  // Виньетка КРУТАЯ: светлое пятно держится только под гридом, а к краям
  // экрана уходит почти в чёрный. На травяном сукне мягкий градиент читался
  // как ровная заливка, и стол выглядел плоским.
  const g = ctx.createRadialGradient(c, c, SIZE * 0.10, c, c, SIZE * 0.70);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(0.45, 'rgba(0,0,0,0.18)');
  g.addColorStop(0.70, 'rgba(0,0,0,0.48)');
  g.addColorStop(0.88, 'rgba(0,0,0,0.70)');
  g.addColorStop(1, 'rgba(0,0,0,0.85)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, SIZE, SIZE);

  return Texture.from(canvas);
}

export function mountBackground(stage: Container): { resize: (w: number, h: number) => void } {
  const root = new Container();
  root.zIndex = -1000; // под столом и HUD
  root.eventMode = 'none'; // фон не перехватывает клики
  stage.addChildAt(root, 0);

  // Сукно: БЕЛАЯ тайловая текстура холста, окрашенная тинтом в цвет стола.
  // Одна текстура на любую тему — цвет задаётся здесь, а не в пикселях.
  const felt = new TilingSprite({ texture: makeFeltTexture(), width: 1, height: 1 });
  felt.tint = FELT_TINT;
  root.addChild(felt);

  const vignette = new Sprite(makeVignetteTexture());
  root.addChild(vignette);

  const resize = (w: number, h: number): void => {
    felt.width = w;
    felt.height = h;
    // Виньетка ТЯНЕТСЯ на весь экран: квадратный градиент превращается в
    // эллиптический, что для широкого экрана и нужно.
    vignette.width = w;
    vignette.height = h;
  };

  return { resize };
}
