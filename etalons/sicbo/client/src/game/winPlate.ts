import { Container, Graphics, Text, type TextStyleOptions } from "pixi.js";
import gsap from "gsap";

/** Охровый кант плашки — тот же тон, что у печати на гриде. */
const PLATE_EDGE = 0xd8bd7e;
/** Заголовок «YOU WON» — охрой, сумма — белым: она главная. */
const PLATE_TITLE = 0xd8bd7e;
const PLATE_AMOUNT = 0xffffff;

/**
 * Стиль плашки. Золотой goldStyle не годится: он тянет градиент серии RSS,
 * чужеродный на этом столе.
 */
const plateStyle = (size: number, weight: "600" | "700", fill: number): TextStyleOptions => ({
  fontFamily: "Oswald, system-ui, sans-serif",
  fontSize: size,
  fontWeight: weight,
  fill,
  align: "center",
});

/**
 * Порог «крупного выигрыша». Ниже — обычная плашка, от порога добавляются
 * золотой стиль и анимация.
 *
 * ×20 выбран по составу стола: ниже лежат рядовые Small/Big (2× возврата) и
 * большинство сумм, выше начинается редкое — ANY TRIPLE (31×) и тройки (181×).
 * Small/Big выигрывает почти в половине раундов, и без порога анимация мелькала
 * бы на каждом втором броске автобета.
 *
 * Дабл (11×) сознательно НИЖЕ порога: он выпадает часто.
 */
export const BIG_WIN_MULTIPLIER = 20;

export function isBigWin(totalWin: number, totalBet: number): boolean {
  if (totalBet <= 0 || totalWin <= 0) return false;
  return totalWin / totalBet >= BIG_WIN_MULTIPLIER;
}

export interface WinPlate {
  root: Container;
  /**
   * Показать выигрыш и УБРАТЬ его самой: плашка — презентер, а не элемент
   * интерфейса. Промис резолвится, когда показ закончен.
   */
  show(totalWin: number, totalBet: number): Promise<void>;
  hide(): void;
}

/** Сколько плашка висит после отсчёта, прежде чем уйти. */
const HOLD_MS = { normal: 1600, big: 2600 };

/**
 * Плашка «YOU WON $40» в фазе результата. Показывается на КАЖДЫЙ выигрышный
 * раунд; крупный отличается золотом и анимацией.
 */
export function makeWinPlate(format: (minor: number) => string): WinPlate {
  const root = new Container();
  root.visible = false;

  /** Подложка плашки — рисуется в drawBg под текущий размер текстов. */
  const bg = new Graphics();
  root.addChild(bg);

  const title = new Text({ text: "YOU WON", style: plateStyle(24, "600", PLATE_TITLE) });
  title.anchor.set(0.5);
  root.addChild(title);

  const amount = new Text({ text: "", style: plateStyle(44, "700", PLATE_AMOUNT) });
  amount.anchor.set(0.5);
  amount.position.set(0, 38);
  root.addChild(amount);

  /**
   * Подложка: чёрная лента, ПРОЗРАЧНАЯ по краям и плотная к центру, с тонким
   * охровым кантом сверху и снизу.
   *
   * Градиент набирается вертикальными полосами: Graphics в Pixi заливает
   * сплошным цветом, линейного градиента у него нет. Полос немного (STEPS) —
   * на глаз переход слитный, а рисование остаётся дешёвым, ведь drawBg зовётся
   * на каждом кадре счётчика.
   */
  const drawBg = (): void => {
    // Поле по бокам широкое: края ленты растворяются в прозрачность, и без
    // запаса градиент съедал бы сам текст.
    const w = Math.max(title.width, amount.width) + 460;
    const h = title.height + amount.height + 44;
    const x = -w / 2;
    const y = -title.height / 2 - 18;

    bg.clear();

    // Полос МНОГО и они перекрываются: при 24 шагах на широкой плашке каждая
    // выходила по 40px, и градиент читался вертикальными полосками. Здесь шаг
    // ~4px, а каждая полоса рисуется с нахлёстом в 1px.
    const STEPS = Math.max(64, Math.ceil(w / 4));
    const step = w / STEPS;
    for (let i = 0; i < STEPS; i++) {
      // Расстояние от центра: 0 в середине, 1 у края.
      const t = Math.abs((i + 0.5) / STEPS - 0.5) * 2;
      // Плато в середине и быстрый спад к краям: плотная сердцевина под
      // текстом, растворённые кромки. cos даёт мягкий переход без изломов.
      const alpha = 0.9 * Math.cos((t * Math.PI) / 2) ** 2.2;
      if (alpha <= 0.003) continue;
      bg.rect(x + i * step, y, step + 1, h).fill({ color: 0x000000, alpha });
    }

    // Кант — только горизонтальные линейки: по бокам лента растворяется, и
    // рамка там обрывалась бы в пустоте.
    for (const ly of [y, y + h]) {
      for (let i = 0; i < STEPS; i++) {
        const t = Math.abs((i + 0.5) / STEPS - 0.5) * 2;
        const alpha = Math.cos((t * Math.PI) / 2) ** 1.4;
        if (alpha <= 0.003) continue;
        bg.rect(x + i * step, ly - 1, step + 1, 2).fill({ color: PLATE_EDGE, alpha });
      }
    }
  };

  /** Объект-носитель для твина: gsap анимирует поле, мы печатаем его в текст. */
  const counter = { value: 0 };

  return {
    root,

    show(totalWin, totalBet) {
      if (totalWin <= 0) { root.visible = false; return Promise.resolve(); }

      const big = isBigWin(totalWin, totalBet);
      amount.style = plateStyle(big ? 62 : 44, "700", PLATE_AMOUNT);
      title.text = big ? "BIG WIN" : "YOU WON";

      root.visible = true;
      gsap.killTweensOf([root, root.scale, counter]);
      root.alpha = 0;
      root.scale.set(big ? 0.7 : 0.92);
      gsap.to(root, { alpha: 1, duration: 0.2 });
      gsap.to(root.scale, {
        x: 1, y: 1,
        duration: big ? 0.5 : 0.25,
        ease: big ? "back.out(2)" : "power2.out",
      });

      // Счётчик: сумма НАБЕГАЕТ от нуля. У крупного выигрыша отсчёт дольше —
      // это и есть его «праздник», а не только размер шрифта.
      const rollMs = big ? 1400 : 500;
      counter.value = 0;
      amount.text = format(0);
      drawBg();

      return new Promise<void>((resolve) => {
        gsap.to(counter, {
          value: totalWin,
          duration: rollMs / 1000,
          ease: "power1.out",
          onUpdate: () => {
            amount.text = format(Math.round(counter.value));
            // Подложка догоняет РАСТУЩЕЕ число: «$0.20» уже «$1,240.00», и без
            // перерисовки хвост суммы вылезал бы за край плашки.
            drawBg();
          },
          onComplete: () => {
            amount.text = format(totalWin);
            drawBg();
            // Отсчитал — повисел — ушёл. Плашка ПРЕЗЕНТЕР: ждать NEW BET она
            // не должна, иначе перекрывает стол всю фазу результата.
            gsap.delayedCall((big ? HOLD_MS.big : HOLD_MS.normal) / 1000, () => {
              gsap.to(root, {
                alpha: 0, duration: 0.25,
                onComplete: () => { root.visible = false; resolve(); },
              });
            });
          },
        });
      });
    },

    hide() {
      gsap.killTweensOf([root, root.scale]);
      gsap.to(root, { alpha: 0, duration: 0.18, onComplete: () => { root.visible = false; } });
    },
  };
}
