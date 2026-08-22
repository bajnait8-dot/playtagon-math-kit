import type { SicBoBet, SicBoBetType } from "../../../server/model/types.js";

/**
 * Лимиты стола в МИНОРНЫХ юнитах — те же три границы, что проверяет сервер
 * (validateBets). Клиент обязан их знать, иначе игрок набирает ставку сверх
 * лимита, жмёт PLAY и получает отказ вместо блокировки на входе.
 */
export interface BetLimits {
  /** Минимум НА ЗОНУ. */
  min: number;
  /** Максимум на СУММУ раунда. */
  maxPerRound: number;
  /** Доступный баланс. Функцией: он меняется каждый раунд. */
  balance(): number;
}

export interface BetState {
  /**
   * Положить фишку номиналом chip (минорные юниты) на зону.
   *
   * @returns удалось ли. false — фишка НЕ легла, потому что пробила min,
   *   лимит раунда или баланс; вызывающий показывает ошибку и не пускает полёт.
   */
  place(type: SicBoBetType, chip: number): boolean;
  /** Сколько ещё можно поставить: min(лимит раунда, баланс) − уже на столе. */
  headroom(): number;
  /** Пройдёт ли ставка `chip` на зону по всем трём границам. */
  canPlace(chip: number): boolean;
  /** Снять ПОСЛЕДНЮЮ поставленную фишку (не всю зону). */
  undo(): void;
  clear(): void;
  total(): number;
  onZone(type: SicBoBetType): number;
  isEmpty(): boolean;
  /** Ставки для отправки на сервер: по одной записи на зону. */
  bets(): SicBoBet[];
  /** Копия расстановки — для REBET. */
  snapshot(): SicBoBet[];
  restore(bets: readonly SicBoBet[]): void;
  subscribe(fn: () => void): () => void;
}

/**
 * Состояние ставок ОТДЕЛЬНО от вьюхи — сознательное расхождение с taixiu, где
 * оно размазано по 12 useState внутри компонента вёрстки, из-за чего любая
 * правка внешнего вида трогает логику.
 *
 * История ведётся ПОФИШЕЧНО: UNDO снимает последнюю фишку, а не обнуляет зону.
 */
export function createBetState(limits?: BetLimits): BetState {
  /** Без лимитов ведём себя как раньше — для тестов и отладки. */
  const cap = (): number => limits
    ? Math.min(limits.maxPerRound, limits.balance())
    : Number.POSITIVE_INFINITY;
  /** Стек поставленных фишек — по нему работает undo. */
  const stack: Array<{ type: SicBoBetType; chip: number }> = [];
  const listeners = new Set<() => void>();
  const notify = (): void => { for (const f of listeners) f(); };

  /** Свернуть стек в суммы по зонам. Порядок — как зоны впервые заняли. */
  const byZone = (): Map<SicBoBetType, number> => {
    const m = new Map<SicBoBetType, number>();
    for (const s of stack) m.set(s.type, (m.get(s.type) ?? 0) + s.chip);
    return m;
  };

  const asBets = (): SicBoBet[] =>
    [...byZone()].map(([type, amount]) => ({ type, amount }));

  return {
    place(type, chip) {
      // ПРОВЕРКА ЗДЕСЬ, а не у вызывающего: путей постановки несколько (тап по
      // столу, REBET), и правило должно быть одно. Раньше клиент не проверял
      // ничего — игрок набирал сумму сверх лимита и узнавал об этом только по
      // отказу сервера после PLAY.
      if (chip <= 0) return false;
      if (limits && chip < limits.min) return false;
      const total = stack.reduce((s, x) => s + x.chip, 0);
      if (total + chip > cap()) return false;
      stack.push({ type, chip });
      notify();
      return true;
    },

    headroom() {
      const total = stack.reduce((s, x) => s + x.chip, 0);
      return Math.max(0, cap() - total);
    },

    canPlace(chip) {
      if (chip <= 0) return false;
      if (limits && chip < limits.min) return false;
      const total = stack.reduce((s, x) => s + x.chip, 0);
      return total + chip <= cap();
    },

    undo() {
      // Пустой стек — ничего не изменилось, подписчиков не тревожим.
      if (stack.length === 0) return;
      stack.pop();
      notify();
    },

    clear() {
      stack.length = 0;
      notify();
    },

    total() { return stack.reduce((s, x) => s + x.chip, 0); },

    onZone(type) {
      return stack.reduce((s, x) => (x.type === type ? s + x.chip : s), 0);
    },

    isEmpty() { return stack.length === 0; },

    bets() { return asBets(); },

    // Новые объекты на каждый вызов: снимок не должен меняться вслед за
    // состоянием, иначе REBET повторил бы не тот раунд.
    snapshot() { return asBets(); },

    restore(bets) {
      stack.length = 0;
      // Зона восстанавливается ОДНОЙ фишкой суммарного номинала: пофишечную
      // историю снимок не хранит, поэтому UNDO сразу после REBET снимет зону
      // целиком. Для повтора раунда этого достаточно.
      for (const b of bets) stack.push({ type: b.type, chip: b.amount });
      notify();
    },

    subscribe(fn) {
      listeners.add(fn);
      return () => { listeners.delete(fn); };
    },
  };
}
