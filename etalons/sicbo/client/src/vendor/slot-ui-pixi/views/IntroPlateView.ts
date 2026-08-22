/**
 * ПЛАШКА ФИЧИ НА ЗАСТАВКЕ — спрайт с артом ИЛИ ВРЕМЕННЫЙ ПЛЕЙСХОЛДЕР.
 *
 * ===================== ЗАЧЕМ ПЛЕЙСХОЛДЕР =====================
 * Композиция заставки трёхчастная: логотип сверху, РЯД ПЛАШЕК по центру,
 * надпись внизу. Пока арта плашек нет, центр остался бы пустым — и выверить
 * ритм было бы не на чем: просветы «лого ↔ ряд» и «ряд ↔ надпись» видны только
 * тогда, когда ряд занимает своё место.
 *
 * Поэтому плашки размечаются СЕЙЧАС, заглушками. Заглушка нарисована так, чтобы
 * её нельзя было спутать с финальным дизайном: пунктирная рамка, диагональная
 * штриховка, подпись «PLACEHOLDER». Когда приедет арт, `IntroPlateView`
 * получает текстуру и рисует её вместо заглушки — РАСКЛАДКА НЕ МЕНЯЕТСЯ, потому
 * что геометрию считает `layoutIntroPlates` в core, а не эта вьюха.
 * =============================================================
 *
 * ГЕОМЕТРИЯ СЮДА ПРИХОДИТ ГОТОВОЙ (`IntroPlateBox`): вьюха только рисует. Так
 * ряд и колонка, зазоры и пропорции остаются одной арифметикой в core на все
 * игры, а не расползаются по рендерам.
 */
import { Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import type { IntroPlateBox } from '../../slot-ui-core/index';

/** Палитра заглушки — нейтральная, но с местом под тему игры. */
export interface IntroPlatePlaceholderTheme {
  /** Заливка плашки (по умолчанию — полупрозрачный тёмный). */
  readonly fill?: number;
  readonly fillAlpha?: number;
  /** Цвет пунктирной рамки и подписи. */
  readonly stroke?: number;
  /** Шрифт подписи — игра передаёт свой, чтобы заглушка не выбивалась. */
  readonly fontFamily?: string;
}

export interface IntroPlateOptions {
  /**
   * Арт плашки. `undefined` → рисуется заглушка. Ровно эта развилка и делает
   * подключение настоящего арта правкой ОДНОЙ строки в игре.
   */
  readonly texture?: Texture;
  /** Подпись на заглушке — что за фича тут будет (на арте она не рисуется). */
  readonly label?: string;
  readonly theme?: IntroPlatePlaceholderTheme;
}

export interface IntroPlateView {
  readonly view: Container;
  /** Поставить плашку в готовый прямоугольник (px экрана). */
  apply(box: IntroPlateBox): void;
  destroy(): void;
}

const DEFAULT_THEME: Required<IntroPlatePlaceholderTheme> = {
  fill: 0x1b1030,
  fillAlpha: 0.55,
  stroke: 0xffc84a,
  fontFamily: 'system-ui, sans-serif',
};

export function createIntroPlateView(opts: IntroPlateOptions = {}): IntroPlateView {
  const view = new Container();
  const theme = { ...DEFAULT_THEME, ...(opts.theme ?? {}) };

  // ── Вариант 1: настоящий арт ──
  if (opts.texture && opts.texture !== Texture.EMPTY && opts.texture.width > 1) {
    const sprite = new Sprite(opts.texture);
    sprite.anchor.set(0.5);
    view.addChild(sprite);
    return {
      view,
      apply(box) {
        // Ширина и высота приходят из core уже согласованными с пропорцией,
        // поэтому арт вписывается ровно и без собственной арифметики.
        sprite.width = box.width;
        sprite.height = box.height;
        sprite.position.set(box.x, box.y);
      },
      destroy: () => view.destroy({ children: true }),
    };
  }

  // ── Вариант 2: заглушка ──
  // ПЕРЕРИСОВЫВАЕТСЯ НА КАЖДЫЙ РЕСАЙЗ, а не растягивается скейлом: пунктир и
  // штриховка при растягивании поплыли бы (шаг пунктира — величина в px экрана,
  // а не доля плашки), и заглушка читалась бы по-разному на разных окнах.
  const g = new Graphics();
  // Подпись приходит двумя строками: «ЗАГОЛОВОК\nдетали» (детали — реальные
  // числа игры). Рисуем их РАЗНЫМ кеглем, иначе на плашке нет иерархии и текст
  // читается сплошной кашей.
  const [labelTitle, ...labelRest] = (opts.label ?? 'PLACEHOLDER').split('\n');
  const label = new Text({
    text: labelTitle,
    style: { fill: theme.stroke, fontSize: 24, fontWeight: '700', fontFamily: theme.fontFamily, align: 'center' },
  });
  label.anchor.set(0.5);
  const detail = new Text({
    text: labelRest.join('\n'),
    style: { fill: theme.stroke, fontSize: 16, fontWeight: '600', fontFamily: theme.fontFamily, align: 'center' },
  });
  detail.anchor.set(0.5);
  detail.alpha = 0.95;
  const note = new Text({
    text: 'PLACEHOLDER',
    style: { fill: theme.stroke, fontSize: 14, fontWeight: '600', fontFamily: theme.fontFamily, letterSpacing: 2 },
  });
  note.anchor.set(0.5);
  note.alpha = 0.75;
  view.addChild(g, label, detail, note);

  return {
    view,
    apply(box) {
      const { x, y, width: w, height: h } = box;
      const left = x - w / 2;
      const top = y - h / 2;
      const radius = Math.min(w, h) * 0.06;
      g.clear();
      // Подложка — чтобы плашка читалась поверх любого фона игры.
      g.roundRect(left, top, w, h, radius).fill({ color: theme.fill, alpha: theme.fillAlpha });
      // Диагональная штриховка: однозначный сигнал «здесь будет картинка».
      const step = Math.max(12, Math.min(w, h) * 0.12);
      for (let i = -h; i < w; i += step) {
        g.moveTo(left + i, top + h).lineTo(left + i + h, top);
      }
      g.stroke({ color: theme.stroke, width: 1, alpha: 0.16 });
      // Пунктирная рамка — рисуется отрезками вручную: у Graphics нет dash.
      const dash = Math.max(8, Math.min(w, h) * 0.05);
      const edge = (x0: number, y0: number, dx: number, dy: number, len: number): void => {
        for (let d = 0; d < len; d += dash * 2) {
          const seg = Math.min(dash, len - d);
          g.moveTo(x0 + dx * d, y0 + dy * d).lineTo(x0 + dx * (d + seg), y0 + dy * (d + seg));
        }
      };
      edge(left, top, 1, 0, w);
      edge(left, top + h, 1, 0, w);
      edge(left, top, 0, 1, h);
      edge(left + w, top, 0, 1, h);
      g.stroke({ color: theme.stroke, width: 2, alpha: 0.9 });

      // ПОДПИСИ. Кегли — доля ВЫСОТЫ плашки, поэтому текст едет вместе с
      // раскладкой, а не держится пикселей экрана.
      //
      // Порядок сверху вниз: имя фичи крупно · её реальные числа помельче ·
      // слово PLACEHOLDER у нижней кромки. Позиции считаются от ИЗМЕРЕННЫХ
      // высот строк, а не долями «на глаз»: заголовок бывает в две строки
      // (перенос по `wordWrapWidth`), и фиксированные отступы наезжали бы.
      label.style.fontSize = Math.max(10, h * 0.085);
      label.style.wordWrap = true;
      label.style.wordWrapWidth = w * 0.82;
      detail.style.fontSize = Math.max(8, h * 0.055);
      detail.style.wordWrap = true;
      detail.style.wordWrapWidth = w * 0.82;
      const gapText = h * 0.03;
      const blockH = label.height + (detail.text ? gapText + detail.height : 0);
      const blockTop = y - blockH / 2;
      label.position.set(x, blockTop + label.height / 2);
      detail.position.set(x, blockTop + label.height + gapText + detail.height / 2);
      note.style.fontSize = Math.max(8, h * 0.045);
      note.position.set(x, y + h * 0.36);
    },
    destroy: () => view.destroy({ children: true }),
  };
}
