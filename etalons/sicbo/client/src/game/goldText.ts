import { FillGradient } from 'pixi.js';

/**
 * Фирменный золотой стиль надписей — ПЕРЕНЕСЁН ИЗ RSS (presenter.ts, goldStyle):
 * шрифт Socafe (yeast22.otf), вертикальный градиент 9 стопов, обводка #bd6500,
 * коричневая тень.
 *
 * Живёт отдельным модулем, потому что им пишут ДВЕ надписи над сеткой — баннер
 * и лестница множителей, — и они сменяют друг друга: до ставки висит промо-
 * строка, во время раунда на её месте идёт счёт (приём tumble-панели из слота).
 * Градиент — свой инстанс на каждый текст (общий даёт артефакты при разной
 * высоте строки).
 */
export const goldFill = (): FillGradient =>
  new FillGradient({
    start: { x: 0, y: 0 },
    end: { x: 0, y: 1 },
    textureSpace: 'local',
    colorStops: [
      { offset: 0.1, color: '#ffa50a' }, { offset: 0.2, color: '#ffdd00' },
      { offset: 0.3, color: '#fff5b3' }, { offset: 0.4, color: '#ffdd00' },
      { offset: 0.6, color: '#f0d000' }, { offset: 0.7, color: '#ffc800' },
      { offset: 0.8, color: '#faab00' }, { offset: 0.9, color: '#faab00' },
      { offset: 1, color: '#db8000' },
    ],
  });

/**
 * Шрифт — OSWALD, а не Socafe из RSS: тот дисплейный, широкий по метрике, и с
 * обводкой в 4px буквы разъезжались — «YOU WON» читалось как набор литер.
 * Oswald узкий, и вся игра набрана им; золото при этом остаётся.
 */
export const goldStyle = (fontSize: number) => ({
  fontFamily: 'Oswald, system-ui, sans-serif',
  fontWeight: '700' as const,
  fontSize,
  fill: goldFill(),
  stroke: { color: '#bd6500', width: 3, join: 'round' as const },
  dropShadow: { color: '#61240f', alpha: 0.7, blur: 5, distance: 5, angle: 0.6 },
});
