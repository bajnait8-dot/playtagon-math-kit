// Механика стола и дефолтные коэффициенты — модуль БЕЗ серверных зависимостей.
//
// Отсюда импортирует client/ (rules.ts, table/tableGeometry.ts, zoneArt.ts) и
// собирается для браузера, поэтому в графе импортов этого файла не должно быть
// ни `node:fs`, ни чего-либо ещё из Node: чтение schema.json живёт в
// model/schema-source.ts, валидация ручек — в model/knobs.ts. Клиент эту
// конверсия не редактирует, и состав экспортов сохранён доконверсионным.
//
// Что здесь есть: реэкспорт чистого ядра расчёта (model/math.ts), литерал
// дефолтных значений ручек и собранная из него таблица коэффициентов.

import type { SicBoBetType, SicBoRoll } from "./types.js";
import {
  buildPayouts,
  payoutFor as corePayoutFor,
  type SicBoPayoutKnobs,
} from "./math.js";
import type { SicBoKnobValues } from "./knobs.js";

// Реэкспорт ядра: клиент и тесты игры берут механику отсюда, как и до конверсии.
export {
  COMBO_PAIRS,
  FACES,
  TOTALS,
  WIN_CAP,
  buildPayouts,
  evaluateBet,
  rollCategory,
  rollDice,
  settleRound,
} from "./math.js";
export type { SicBoPayoutKnobs } from "./math.js";

// Типы серверной половины реэкспортируются как ТИПЫ: type-only импорт стирается
// компилятором и в браузерный граф ничего не тянет. Сами функции валидации
// (resolveConfig, buildConfig, defaultKnobValues, ConfigValidationError) здесь
// НЕ реэкспортируются намеренно — они тянут чтение схемы, и серверный код
// импортирует их прямо из model/knobs.js.
export type { SicBoConfig, SicBoKnobValues } from "./knobs.js";

/**
 * Дефолтные значения ручек ЛИТЕРАЛОМ.
 *
 * Зачем литерал, когда те же числа стоят в schema.json#knobs.*.default:
 * константа PAYOUTS ниже нужна клиенту на загрузке модуля (client/src/game/
 * rules.ts вычисляет таблицу правил на верхнем уровне), а чтение файлов на
 * загрузке модуля Регламент §4.3 запрещает. Схему прочитать лениво нельзя —
 * значение нужно немедленно.
 *
 * Второго источника правды это не создаёт: литерал обязан совпадать с
 * default-объявлениями схемы ПОЭЛЕМЕНТНО, и это заперто тестом
 * (factory.test.ts, «литерал DEFAULT_KNOB_VALUES совпадает с
 * default-объявлениями schema.json»). Расхождение — красный тест, а не тихо
 * разъехавшаяся математика.
 *
 * Для МАТЕМАТИКИ литерал не используется вовсе: расчёт раунда идёт по таблице
 * ДЕЙСТВУЮЩЕГО конфига, собранной фабрикой из values.
 */
export const DEFAULT_KNOB_VALUES: SicBoKnobValues = {
  total_payouts: {
    "4": 60, "5": 30, "6": 18, "7": 12, "8": 8, "9": 6, "10": 6,
    "11": 6, "12": 6, "13": 8, "14": 12, "15": 18, "16": 30, "17": 60,
  },
  triple_specific_payout: 180,
  triple_any_payout: 30,
  double_payout: 10,
  combo_payout: 6,
};

/** Дефолты в форме, которую ждёт сборщик таблицы. Чистая функция, без схемы. */
const defaultPayoutKnobs = (): SicBoPayoutKnobs => {
  const totalPayouts: Record<number, number> = {};
  for (const [k, v] of Object.entries(DEFAULT_KNOB_VALUES.total_payouts)) {
    totalPayouts[Number(k)] = v;
  }
  return {
    totalPayouts,
    tripleSpecific: DEFAULT_KNOB_VALUES.triple_specific_payout,
    tripleAny: DEFAULT_KNOB_VALUES.triple_any_payout,
    double: DEFAULT_KNOB_VALUES.double_payout,
    combo: DEFAULT_KNOB_VALUES.combo_payout,
  };
};

/**
 * Таблица коэффициентов при ДЕФОЛТНЫХ значениях.
 *
 * ВАЖНО, и это названо дефектом клиента в отчёте конверсии: client/ импортирует
 * эту константу и рисует по ней подписи стола и текст правил. Действующий
 * конфиг клиент не читает — для этого модель отдаёт initData.payouts, но
 * client/src/game/rules.ts и client/src/game/table/tableGeometry.ts читают
 * PAYOUTS компиляцией. Следствие: при конфиге, отличном от дефолтного, подписи
 * разойдутся с реальными выплатами. При дефолтном конфиге расхождения нет.
 * Починка — в client/, вне этой конверсии (client/ не редактируется).
 */
export const PAYOUTS: Record<SicBoBetType, number> = buildPayouts(defaultPayoutKnobs());

/** Все 50 типов ставок стола. Состав задан механикой, от ручек не зависит. */
export const ALL_BET_TYPES: SicBoBetType[] = Object.keys(PAYOUTS) as SicBoBetType[];

/**
 * Множитель возврата при ДЕФОЛТНЫХ коэффициентах — справочная функция для
 * витрины: подписи стола и текст правил на клиенте, где действующего конфига
 * нет (тот же дефект клиента, что и у PAYOUTS выше).
 *
 * Тонкая обёртка над ядром, а НЕ дефолтный аргумент внутри самого payoutFor:
 * дефолт в ядре означал бы, что раунд можно посчитать «по забытой таблице»
 * молча. Ядро (model/math.ts) требует таблицу явно, и расчёт раунда всегда
 * идёт по коэффициентам ДЕЙСТВУЮЩЕГО конфига — эта дверь к математике раунда
 * отношения не имеет.
 */
export function payoutFor(bet: SicBoBetType, roll: SicBoRoll): number {
  return corePayoutFor(bet, roll, PAYOUTS);
}
