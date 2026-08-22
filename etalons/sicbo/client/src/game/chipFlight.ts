import { Container, type PointData } from "pixi.js";
import gsap from "gsap";
import { makeChipSpine, chipLabel, DESELECT_SCALE, type ChipSpineHandle } from "./table/chipSpine";

/**
 * Полёт фишки от кнопки-пикера к зоне стола.
 *
 * Летящая фишка — ОТДЕЛЬНЫЙ объект, живущий ~0.3 секунды: она не та, что потом
 * лежит в зоне. Поэтому слой держим поверх стола, а координаты берём
 * ГЛОБАЛЬНЫЕ: и кнопка, и зона живут в своих системах координат (у стола свой
 * масштаб, у кнопки свой layout-scale), и складывать их локальные позиции
 * нельзя.
 *
 * Ставка при этом попадает в модель СРАЗУ по тапу, а не по прилёту: иначе
 * быстрые тапы разъехались бы с состоянием, а UNDO во время полёта ломался.
 * Анимация — визуал поверх уже случившегося факта.
 */

/** Длительность полёта, высота дуги (доля пути по X) и радиус фишки. */
const FLY_S = 0.62;
const ARC = 0.3;
/**
 * Радиус летящей фишки — ТОТ ЖЕ диаметр (50), что у фишки в кнопке и в зоне.
 * С компенсацией: пак ужимает невыбранную до DESELECT_SCALE, и без неё летящая
 * выходила заметно мельче обеих.
 */
const FLY_R = (50 / 2) / DESELECT_SCALE;
/**
 * Доля ПУТИ (не времени!), на которой фишка считается коснувшейся зоны.
 * Остаток уходит на короткое гашение поверх приземлившейся — см. onUpdate.
 */
const LAND_AT = 0.9;

/** Смахивание со стола: длительность и смещение вниз-влево. */
const SWEEP_S = 0.4;
const SWEEP_X = 260;
const SWEEP_Y = 200;
/** Задержка между фишками стопки при смахивании — волна, а не разом. */
export const SWEEP_STAGGER = 0.05;

/** Выплата: с какой высоты падает фишка и за сколько. */
const PAYOUT_DROP = 46;
const PAYOUT_S = 0.3;
/** Сколько летит фишка выплаты в баланс. */
const COLLECT_S = 0.5;

export interface ChipFlightLayer {
  view: Container;
  /**
   * Запустить фишку из точки в точку (обе — ГЛОБАЛЬНЫЕ координаты сцены).
   * @param amountMajor номинал в МАЖОРНЫХ единицах — от него зависит скелет
   *   фишки, то есть её цвет (см. skeletonFor).
   * @param onLand вызывается в момент КАСАНИЯ зоны, а не по концу твина: в
   *   конце фишка уже погашена, и постоянная появилась бы с задержкой.
   */
  fly(from: PointData, to: PointData, amountMajor: number, onLand?: () => void): void;
  /**
   * Снять фишку со стола — она летит В КНОПКУ ПИКЕРА, откуда её брали.
   * Это CLEAR и UNDO: ставка не сыграла, фишка вернулась игроку в руку.
   * @param at ГЛОБАЛЬНЫЕ координаты, откуда фишка стартует
   * @param delay задержка старта: стопку отправляем волной, а не разом
   */
  sweep(at: PointData, amountMajor: number, delay?: number): void;
  /**
   * Отправить фишку В БАЛАНС: раунд закрыт, деньги зачислены. Это NEW BET
   * (ставка отыграла) и выплаты.
   */
  toBank(at: PointData, amountMajor: number, delay?: number): void;
  /**
   * Куда лететь фишкам: `picker` — кнопка выбора номинала (снятая ставка),
   * `bank` — строка BALANCE (закрытый раунд). Хост знает раскладку, поэтому
   * точки читаются через функции — контролы переезжают при ресайзе.
   */
  setTargets(t: { picker: () => PointData; bank: () => PointData }): void;
  /**
   * Выложить фишку ВЫПЛАТЫ: она падает сверху на точку и ОСТАЁТСЯ лежать,
   * пока её не уберут через clearPayout().
   */
  payout(at: PointData, denomMajor: number, delay: number, radius: number): void;
  /**
   * Отправить выплаты В БАЛАНС: фишки летят к строке BALANCE и там гаснут.
   * Так видно, куда ушёл выигрыш, — в отличие от смахивания, которое читается
   * как «забрали со стола».
   */
  collectPayout(): void;
  dispose(): void;
}

export function makeChipFlightLayer(): ChipFlightLayer {
  const root = new Container();
  // Слой только рисует — тапы должен получать стол под ним.
  root.eventMode = "none";

  /** Выложенные выплаты — держим, чтобы убрать их к следующему раунду. */
  const payouts: { handle: ChipSpineHandle; at: PointData; denom: number }[] = [];
  /** Куда летят возвращаемые фишки. Задаёт хост — он знает раскладку. */
  let targets: { picker: () => PointData; bank: () => PointData } | null = null;

  const fly = (
    from: PointData,
    to: PointData,
    amountMajor: number,
    onLand?: () => void,
  ): void => {
    if (amountMajor <= 0) { onLand?.(); return; }

    // Спайн-фишка ТОГО ЖЕ пака, что в пикере: летящая обязана выглядеть как та,
    // что лежит в кнопке. Рисованный makeChipStack красит по своей палитре, и
    // с кнопки взлетала зелёная, а прилетала фиолетовая.
    const handle = makeChipSpine(amountMajor, {
      radius: FLY_R, label: chipLabel(amountMajor), state: 'deselect',
    });
    const chip = handle.view;
    // Слой лежит в корне сцены, поэтому глобальные координаты — его локальные.
    chip.position.set(from.x, from.y);
    root.addChild(chip);

    const tl = gsap.timeline({ onComplete: () => handle.destroy() });

    // Путь — КВАДРАТИЧНАЯ БЕЗЬЕ: старт, цель и одна контрольная точка.
    //
    // Раздельные твины по X и Y давали не кривую, а склейку двух отрезков с
    // изломом на стыке. Здесь ведём один параметр t, а координаты считаем по
    // нему — тогда траектория гладкая на всём пути.
    //
    // Контрольная точка поднята НАД стартом и смещена к нему (0.35 пути): так
    // фишка круто отрывается вверх и заходит на цель полого — как её и кидают
    // через стол.
    const cx = from.x + (to.x - from.x) * 0.35;
    const cy = Math.min(from.y, to.y) - Math.max(Math.abs(to.y - from.y) * ARC, 70);

    /**
     * ПРИЗЕМЛЕНИЕ ВЕДЁМ ПО ПУТИ, А НЕ ПО ВРЕМЕНИ.
     *
     * Это принципиально: ease у полёта — power2.in (медленный отрыв, разгон), и
     * доля времени НЕ равна доле пути. При onLand на 75% времени фишка успевала
     * пройти лишь 56% пути (t = 0.75² ), а гаснуть начинала на 77% — то есть
     * растворялась в воздухе, не долетев, а фишка в зоне появлялась сама собой.
     * Ровно это и читалось как «не приземляется».
     *
     * Поэтому и сигнал зоне, и гашение вешаем на ПРОГРЕСС t внутри onUpdate.
     */
    let landed = false;
    const p = { t: 0 };
    tl.to(p, {
      t: 1,
      duration: FLY_S,
      // Плавный разгон и мягкий подход к зоне. power2.in давал резкий скачок
      // скорости у обоих концов — на вылете фишка «выстреливала», на подлёте
      // втыкалась. inOut убирает рывки, сохраняя медленный отрыв.
      ease: "power1.inOut",
      onUpdate: () => {
        const t = p.t, u = 1 - t;
        chip.x = u * u * from.x + 2 * u * t * cx + t * t * to.x;
        chip.y = u * u * from.y + 2 * u * t * cy + t * t * to.y;

        // Касание: фишка ДОШЛА до зоны (LAND_AT пути), и только теперь под ней
        // проявляется постоянная.
        if (!landed && t >= LAND_AT) {
          landed = true;
          onLand?.();
          // Размер НЕ трогаем — фишка летит и приземляется одного размера.
          // Схлопывание под лежащую в зоне читалось как «сдувается».
          // Гасим только прозрачностью, коротко, уже поверх приземлившейся.
          gsap.to(chip, { alpha: 0, duration: FLY_S * (1 - LAND_AT) * 0.9, ease: "power2.in" });
        }
      },
    }, 0);
  };

  /** Полёт фишки к точке — общий ход для всех возвратов со стола. */
  const flyHome = (chip: Container, to: PointData, delay: number, onDone: () => void): void => {
    const from = { x: chip.x, y: chip.y };
    const cx = from.x + (to.x - from.x) * 0.35;
    const cy = Math.min(from.y, to.y) - 70;
    const t = { v: 0 };
    gsap.timeline({ delay, onComplete: onDone })
      .to(t, {
        v: 1, duration: COLLECT_S, ease: "power2.in",
        onUpdate: () => {
          const e = t.v, u = 1 - e;
          chip.x = u * u * from.x + 2 * u * e * cx + e * e * to.x;
          chip.y = u * u * from.y + 2 * u * e * cy + e * e * to.y;
        },
      }, 0)
      .to(chip.scale, { x: 0.4, y: 0.4, duration: COLLECT_S, ease: "power2.in" }, 0)
      .to(chip, { alpha: 0, duration: COLLECT_S * 0.3 }, COLLECT_S * 0.7);
  };

  /**
   * Снятая со стола фишка УЛЕТАЕТ В БАЛАНС, а не сметается вбок: при NEW BET,
   * UNDO и CLEAR ставка возвращается игроку, и полёт к строке BALANCE это
   * показывает. Смахивание читалось как «деньги забрали».
   */
  /** Общая часть: поднять фишку и отправить её к точке. */
  const returnChip = (at: PointData, amountMajor: number, delay: number, to: PointData): void => {
    if (amountMajor <= 0) return;
    const handle = makeChipSpine(amountMajor, {
      radius: FLY_R, label: chipLabel(amountMajor), state: "deselect",
    });
    handle.view.position.set(at.x, at.y);
    root.addChild(handle.view);
    flyHome(handle.view, to, delay, () => handle.destroy());
  };

  /** CLEAR / UNDO: ставка снята — фишка возвращается в кнопку пикера. */
  const sweep = (at: PointData, amountMajor: number, delay = 0): void =>
    returnChip(at, amountMajor, delay, targets?.picker() ?? { x: at.x, y: at.y + 400 });

  /** NEW BET: раунд закрыт — ставка уходит в баланс. */
  const toBank = (at: PointData, amountMajor: number, delay = 0): void =>
    returnChip(at, amountMajor, delay, targets?.bank() ?? { x: at.x, y: at.y + 400 });

  /**
   * Фишка выплаты падает СВЕРХУ на зону и остаётся: её кладёт крупье, а не
   * бросает игрок, поэтому короткое движение вниз, а не дуга через стол.
   */
  const payout = (at: PointData, denomMajor: number, delay: number, radius: number): void => {
    if (denomMajor <= 0) return;
    const handle = makeChipSpine(denomMajor, {
      radius: radius, label: chipLabel(denomMajor), state: "deselect",
    });
    const chip = handle.view;
    chip.position.set(at.x, at.y - PAYOUT_DROP);
    chip.alpha = 0;
    root.addChild(chip);
    payouts.push({ handle, at, denom: denomMajor });

    const tl = gsap.timeline({ delay });
    tl.to(chip, { y: at.y, duration: PAYOUT_S, ease: "back.out(1.6)" }, 0);
    tl.to(chip, { alpha: 1, duration: PAYOUT_S * 0.4 }, 0);
  };

  /**
   * Выплаты УЛЕТАЮТ В БАЛАНС: каждая фишка идёт к строке BALANCE, уменьшаясь и
   * гаснув у цели. Смахивание вбок здесь не годится — оно означает «убрали со
   * стола», а выигрыш именно зачисляется.
   */
  const collectPayout = (): void => {
    const to = targets?.bank() ?? { x: 0, y: 0 };
    payouts.forEach((p, i) =>
      flyHome(p.handle.view, to, i * SWEEP_STAGGER, () => p.handle.destroy()));
    payouts.length = 0;
  };

  return {
    view: root,
    fly,
    sweep,
    payout,
    collectPayout,
    toBank,
    setTargets: (t) => { targets = t; },
    dispose: () => {
      gsap.killTweensOf(root.children);
      if (!root.destroyed) root.destroy({ children: true });
    },
  };
}
