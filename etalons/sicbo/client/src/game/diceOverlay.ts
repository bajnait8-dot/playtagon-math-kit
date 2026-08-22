import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { DiceScene } from "./DiceScene";
import { NORMAL_TIMING, type DiceTiming } from "./turbo";
import type { SicBoRoll } from "../../../server/model/types.js";

export interface DiceOverlay {
  /** Отыграть бросок. Промис резолвится, когда кубики осели. */
  roll(values: SicBoRoll): Promise<void>;
  /**
   * Режим сменился (нажали турбо) — перерисовать сцену с новыми таймингами.
   * Без этого новый режим подхватился бы только со следующего броска: сцена
   * перерисовывается по смене фазы, а тап по турбо фазу не меняет.
   */
  refreshTiming(): void;
  /** Убрать кубики со сцены (новая ставка). */
  clear(): void;
  /** Спрятать кубики с задержкой — дать игроку рассмотреть выпавшее. */
  hideAfter(ms: number): void;
  dispose(): void;
}

/**
 * Кубики живут в СВОЁМ WebGL-канвасе поверх Pixi: DiceScene создаёт
 * WebGLRenderer с alpha:true, поэтому под кубиками виден стол.
 *
 * Результат приходит С СЕРВЕРА и передаётся как ЦЕЛЕВЫЕ значения — DiceScene
 * подбирает бросок физикой под них (findThrow в воркере), а не бросает
 * случайно. Анимация отыгрывает уже решённый исход.
 *
 * Два WebGL-контекста на страницу браузер держит нормально (лимит Chrome ~16),
 * но на слабых Android это надо МЕРИТЬ — см. Task 12 плана. Запасной ход, если
 * замер плох: монтировать сцену на бросок и размонтировать после (DiceScene
 * корректно чистит за собой — dispose() + removeChild).
 */
export interface DiceOverlayOptions {
  /** Кубик стукнулся о стол или другой кубик; strength 0..1 — сила удара. */
  onImpact?(strength: number): void;
  /**
   * Куда улетают кубики после оседания — ЭКРАННЫЕ координаты трёх мест в табло
   * статистики. Полёт ведёт САМА сцена своими 3D-мешами: перенести их в Pixi
   * нельзя, а плоская подмена выглядела бы дублем.
   */
  flyTo?(): readonly { x: number; y: number }[] | null;
  /** Кубик коснулся табло — по одному на каждый: «тык, тык, тык». */
  onDieLanded?(): void;
  /** Кубики долетели до табло — можно записывать результат в историю. */
  onFlewAway?(): void;
  /**
   * Тайминги отыгрыша под текущий режим (обычный / турбо). ФУНКЦИЯ, а не
   * значение: турбо переключают прямо во время броска, и режим должен
   * примениться сразу, а не со следующего раунда.
   */
  timing?(): DiceTiming;
}

export function mountDiceOverlay(host: HTMLElement, opts: DiceOverlayOptions = {}): DiceOverlay {
  const layer = document.createElement("div");
  // pointer-events: none — кубики не должны перехватывать тапы у стола под ними.
  // z-index обязателен: Pixi-канвас лежит в том же контейнере, и без явного
  // порядка кубики оказываются ПОД столом.
  layer.style.cssText = "position:absolute;inset:0;pointer-events:none;z-index:10;";
  // Контейнер игры должен быть точкой отсчёта для absolute-слоя, иначе он
  // спозиционируется относительно body.
  if (getComputedStyle(host).position === "static") host.style.position = "relative";
  host.appendChild(layer);

  const reactRoot: Root = createRoot(layer);
  let settle: (() => void) | null = null;
  let hideTimer: ReturnType<typeof setTimeout> | undefined;

  /**
   * Слой скрыт, пока броска нет. DiceScene не умеет прятать кубики в фазе idle —
   * рисует их всегда, — и в покое они висели ПОВЕРХ стола, закрывая зоны.
   */
  let visible = false;
  const setVisible = (on: boolean): void => {
    visible = on;
    layer.style.display = on ? "" : "none";
  };
  setVisible(false);

  /** Последний отрисованный кадр — нужен, чтобы перерисовать по смене режима. */
  let lastFrame: { values: SicBoRoll; phase: "idle" | "rolling" | "result" } = {
    values: [1, 1, 1], phase: "idle",
  };

  const render = (values: SicBoRoll, phase: "idle" | "rolling" | "result"): void => {
    lastFrame = { values, phase };
    reactRoot.render(createElement(DiceScene, {
      values,
      phase,
      timing: opts.timing?.() ?? NORMAL_TIMING,
      isTriple: values[0] === values[1] && values[1] === values[2],
      // Звук ТОЛЬКО когда слой виден: DiceScene спавнит idle-кубики при
      // монтировании, и они падают в скрытом слое — на старте игры это давало
      // восемь стуков из ниоткуда.
      onImpact: (v) => { if (visible) opts.onImpact?.(v); },
      onSettled: () => {
        const done = settle;
        settle = null;
        done?.();
      },
      flyTo: opts.flyTo,
      onDieLanded: opts.onDieLanded,
      onFlewAway: opts.onFlewAway,
    }));
  };

  render([1, 1, 1], "idle");

  return {
    roll(values) {
      return new Promise<void>((resolve) => {
        // Если предыдущий бросок почему-то не досчитался, не подвешиваем его
        // промис навсегда — отпускаем перед новым.
        settle?.();
        settle = resolve;
        // Отменяем отложенное скрытие прошлого броска: иначе его таймер
        // погасил бы кубики уже нового.
        if (hideTimer !== undefined) { clearTimeout(hideTimer); hideTimer = undefined; }
        setVisible(true);

        // ВАЖНО про фазы DiceScene: "rolling" там только УБИРАЕТ кубики со
        // сцены, а сам бросок запускает "result" — именно в нём идёт подбор
        // (requestThrow) и создание кубиков (spawnDice), и только там работает
        // проверка оседания. Передавать "rolling" и ждать onSettled бесполезно:
        // кубики не появятся вовсе.
        //
        // Переход обязан быть ЗАМЕЧЕН: DiceScene реагирует только на СМЕНУ фазы
        // (`if (p !== prevPhase)`). После прошлого раунда она уже "result", и
        // повторный "result" — не смена: на REBET кубики просто показывались
        // старые, не падая заново. Поэтому сбрасываем в "rolling" и переводим в
        // "result" СЛЕДУЮЩИМ КАДРОМ, а не микротаском: React схлопнул бы оба
        // рендера в один и смены фазы снова бы не случилось.
        render(values, "rolling");
        requestAnimationFrame(() => {
          requestAnimationFrame(() => render(values, "result"));
        });
      });
    },

    refreshTiming() {
      // Тем же кадром: меняются только тайминги, фаза прежняя — DiceScene
      // подхватит их через stateRef, не пересобирая сцену.
      render(lastFrame.values, lastFrame.phase);
    },

    clear() {
      settle = null;
      if (hideTimer !== undefined) { clearTimeout(hideTimer); hideTimer = undefined; }
      setVisible(false);
      render([1, 1, 1], "idle");
    },

    hideAfter(ms) {
      if (hideTimer !== undefined) clearTimeout(hideTimer);
      hideTimer = setTimeout(() => {
        hideTimer = undefined;
        setVisible(false);
      }, ms);
    },

    dispose() {
      settle = null;
      if (hideTimer !== undefined) clearTimeout(hideTimer);
      reactRoot.unmount();
      layer.remove();
    },
  };
}
