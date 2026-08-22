import type { BetState } from "./betState";
import type { SicBoBet, SicBoPlayData } from "../../../server/model/types.js";

/**
 * Фазы раунда Sic Bo. Набор кнопок на экране меняется по фазе — это главное
 * отличие от mines, где кнопка одна и меняется только её скин.
 *
 *   betting → игрок расставляет фишки: CLEAR, UNDO, AUTOPLAY, PLAY
 *   rolling → кубики летят, всё заблокировано
 *   result  → выплата и подсветка: NEW BET, REBET
 */
export type RoundPhase = "betting" | "rolling" | "result";

export interface LoopDeps {
  bets: BetState;
  /** Отправка раунда. Форму транспорта петля не знает — распаковка снаружи. */
  play(bets: SicBoBet[]): Promise<SicBoPlayData>;
  /** Текущий баланс в минорных юнитах. */
  balance(): number;
  /** Минимальная ставка на зону — для подсказок хосту. */
  minBet: number;
  onError?(e: unknown): void;
  /** Раунд отыгран — для истории, звука, плашки выигрыша. */
  onRoundOver?(data: SicBoPlayData): void;
  onPhase?(p: RoundPhase): void;
  /**
   * Представление занято отыгрышем раунда. Кнопки результата (NEW BET, REBET)
   * показываются ТОЛЬКО когда это false: пока кубики летят и объявляется
   * выигрыш, раунд не закончен и нажимать нечего.
   */
  onBusy?(busy: boolean): void;
}

export interface GameLoop {
  phase(): RoundPhase;
  /** Принимает ли стол ставки прямо сейчас. */
  acceptsBets(): boolean;
  play(): Promise<void>;
  /** Повтор прошлого раунда одним тапом: расставить и сразу бросить. */
  rebet(): Promise<void>;
  newBet(): void;
  canRebet(): boolean;
  /**
   * Представление ещё отыгрывает раунд (кубики летят, идёт показ выигрыша).
   * Фазы для этого мало: `result` наступает СРАЗУ после ответа сервера, когда
   * анимация только начинается.
   */
  isBusy(): boolean;
  /** Хост сообщает, что закончил показывать раунд. */
  setBusy(busy: boolean): void;
}

/**
 * Петля раунда. Зависимости приходят через LoopDeps, звук и Pixi сюда не
 * тянутся — петля под юнит-тестом (та же раскладка, что в mines-pixi и слоте:
 * озвучивает presenter).
 */
export function createGameLoop(deps: LoopDeps): GameLoop {
  let phase: RoundPhase = "betting";
  /**
   * Представление отыгрывает раунд: кубики летят, показывается выигрыш.
   * Ставится при отправке и снимается хостом, когда показ закончен.
   */
  let busy = false;
  /** Расстановка прошлого раунда — живёт в ПАМЯТИ СЕССИИ, для REBET. */
  let lastBets: SicBoBet[] = [];

  const setPhase = (p: RoundPhase): void => {
    phase = p;
    deps.onPhase?.(p);
  };

  const canRebet = (): boolean => {
    if (lastBets.length === 0) return false;
    const need = lastBets.reduce((s, b) => s + b.amount, 0);
    return need <= deps.balance();
  };

  async function run(bets: SicBoBet[]): Promise<void> {
    if (bets.length === 0) return;
    // Занято до тех пор, пока ХОСТ не досмотрит анимацию и не снимет флаг:
    // фаза 'result' наступает сразу после ответа сервера, когда кубики ещё
    // летят, и по ней одной кнопки разблокировались бы слишком рано.
    busy = true;
    // Уведомляем хост СРАЗУ: иначе setPhase('result') ниже покажет кнопки
    // результата, а HUD ещё не знает, что раунд не досмотрен.
    deps.onBusy?.(true);
    setPhase("rolling");
    try {
      const data = await deps.play(bets);
      lastBets = bets.map((b) => ({ ...b }));
      setPhase("result");
      deps.onRoundOver?.(data);
    } catch (e) {
      // Сбой не должен вешать раунд: возвращаем игрока к ставкам, расстановку
      // НЕ трогаем — он сможет повторить, ничего не расставляя заново.
      // Флаг снимаем ЗДЕСЬ: показывать нечего, и хост его не снимет.
      busy = false;
      deps.onError?.(e);
      setPhase("betting");
    }
  }

  return {
    phase: () => phase,
    acceptsBets: () => phase === "betting",
    canRebet,

    async play() {
      if (phase !== "betting") return;
      await run(deps.bets.bets());
    },

    async rebet() {
      // busy — пока представление отыгрывает прошлый раунд. Без этой проверки
      // частые тапы шлют раунды внахлёст: фаза становится 'result' сразу после
      // ответа сервера, когда кубики ещё летят.
      if (busy || phase !== "result" || !canRebet()) return;
      deps.bets.restore(lastBets);
      await run(deps.bets.bets());
    },

    newBet() {
      // Пока раунд отыгрывается, чистить стол нельзя: подсветка выигравших
      // зон и плашка выигрыша ещё показываются.
      if (busy) return;
      deps.bets.clear();
      setPhase("betting");
    },

    isBusy: () => busy,

    setBusy(next) {
      busy = next;
      deps.onBusy?.(next);
    },
  };
}
