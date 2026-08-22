/**
 * Петля автобета.
 *
 * Вынесена из main.ts, чтобы её можно было проверить юнит-тестом: там она
 * сидела в замыкании вместе с Pixi, звуком и транспортом, и её поведение на
 * лимитах никто не проверял.
 *
 * ГЛАВНОЕ ПРАВИЛО: счётчик раундов ведёт ЯДРО (AutoplayControl), а не петля.
 * Ядро уменьшает его в reportResult() и там же само останавливает автоплей по
 * RG-лимитам (проигрыш за сессию, одиночный выигрыш, нехватка баланса).
 * Свой второй счётчик в петле означал бы, что на один раунд оба вычтут по
 * единице, и петля прокрутит лишнее сверх лимита.
 */

/** То, что петле нужно от AutoplayControl. Узкий контракт — тест подставляет свой. */
export interface AutoplayCore {
  /** Активен ли автоплей. Ядро гасит его само по лимитам. */
  readonly isActive: boolean;
  /** Погасить автоплей (тап по кнопке, ошибка, нечего повторять). */
  stop(): void;
}

export interface AutoBetDeps {
  autoplay: AutoplayCore;
  /** Есть ли ставки на столе — автобет повторяет расстановку, с пустого стола не стартует. */
  hasBets(): boolean;
  /** Хватает ли баланса на повтор прошлой расстановки. */
  canRebet(): boolean;
  /** Первый раунд — то, что игрок расставил руками. */
  play(): Promise<void>;
  /** Последующие — повтор той же расстановки. */
  rebet(): Promise<void>;
  /**
   * Пауза между раундами, мс. ФУНКЦИЯ, а не число: турбо переключают прямо во
   * время автоплея, и пауза обязана перечитываться на каждом раунде.
   */
  gapMs(): number;
  /** Пустой стол — хост показывает подсказку. */
  onEmpty?(): void;
  onError?(e: unknown): void;
}

export interface AutoBet {
  /** Запустить на `rounds` раундов (Infinity — бесконечно). */
  start(rounds: number): Promise<void>;
  /** Оборвать петлю (игрок нажал стоп). */
  stop(): void;
  readonly running: boolean;
}

const sleep = (ms: number): Promise<void> =>
  ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve();

export function createAutoBet(deps: AutoBetDeps): AutoBet {
  let running = false;

  return {
    get running() { return running; },

    stop() { running = false; },

    async start(rounds) {
      if (running) return;
      // Автобет повторяет РАССТАНОВКУ — с пустого стола повторять нечего.
      if (!deps.hasBets()) {
        deps.onEmpty?.();
        deps.autoplay.stop();
        return;
      }

      running = true;
      try {
        // Первый раунд — обычный play с тем, что игрок расставил руками.
        await deps.play();

        // Условие выхода — СОСТОЯНИЕ ЯДРА, а не свой счётчик: ядро уже
        // уменьшило счётчик в reportResult и там же проверило RG-лимиты.
        // `rounds` здесь только для случая, когда ядра нет (тесты/страховка).
        while (running && deps.autoplay.isActive) {
          await sleep(deps.gapMs());
          if (!running || !deps.autoplay.isActive) break;
          // Баланса на повтор не хватило — это не ошибка, выходим молча.
          if (!deps.canRebet()) break;
          await deps.rebet();
        }
      } catch (e) {
        deps.onError?.(e);
      } finally {
        running = false;
        // Гасим ядро в ЛЮБОМ случае: и когда счётчик кончился, и когда вышли
        // по балансу или ошибке. Без этого кнопка осталась бы «активной».
        deps.autoplay.stop();
      }
    },
  };
}
