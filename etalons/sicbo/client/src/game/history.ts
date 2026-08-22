import type { SicBoRoll } from '../../../server/model/types.js';

/**
 * История раундов — на КЛИЕНТЕ, потому что fairness-режим запрещает серверу
 * хранить cross-round context (раунд обязан выводиться только из пары сидов и
 * нонса). Тот же путь, что в dice и mines-pixi.
 *
 * Живёт в памяти сессии: перезагрузка страницы историю сбрасывает — она
 * справочная, а не денежная (деньги считает RGS).
 *
 * Читают её ДВОЕ: лента раундов слева от стола (последние броски одним
 * взглядом) и вкладка HISTORY в info-меню (полный список с суммами).
 */

export interface HistoryEntry {
  /** Идентификатор раунда с RGS — по нему разбирают спорные ситуации. */
  roundId: string | null;
  /** Когда раунд завершился (мс эпохи) — время локальное, часы игрока. */
  at: number;
  /** Сам бросок — лента рисует три кубика. */
  roll: SicBoRoll;
  /** Сумма броска, 3…18. */
  total: number;
  /** Категория: тройка помечается отдельно, а не как small/big. */
  kind: 'small' | 'big' | 'triple';
  /** Сумма всех ставок раунда (минорные юниты). */
  bet: number;
  /** Выплата (минорные юниты); 0 — проигрыш. */
  win: number;
}

/** Сколько раундов помним. Больше в ленту всё равно не влезает. */
export const MAX_ENTRIES = 25;

const entries: HistoryEntry[] = [];
const listeners = new Set<() => void>();

export function pushHistory(entry: HistoryEntry): void {
  entries.unshift(entry); // новые сверху: игрок смотрит последние раунды
  if (entries.length > MAX_ENTRIES) entries.length = MAX_ENTRIES;
  for (const fn of listeners) fn();
}

/** Копия списка: внешняя правка не должна портить хранилище. */
export function historyEntries(): HistoryEntry[] {
  return [...entries];
}

/** Прежнее имя — им пользуется info-меню. */
export function getHistory(): readonly HistoryEntry[] {
  return entries;
}

export function clearHistory(): void {
  entries.length = 0;
  for (const fn of listeners) fn();
}

/** Подписка на изменения — лента и вкладка HISTORY перерисовываются по ней. */
export function subscribeHistory(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** Прежнее имя — им пользуется info-меню. */
export const onHistoryChange = subscribeHistory;

/** Иконка вкладки в рельсе info-меню (часы со стрелкой назад). */
export const HISTORY_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">' +
  '<path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1" stroke-linecap="round"/>' +
  '<path d="M3 4v4.5h4.5" stroke-linecap="round" stroke-linejoin="round"/>' +
  '<path d="M12 7.5V12l3 1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/** Человеческое имя категории для строки истории. */
export function categoryLabel(e: HistoryEntry): string {
  if (e.kind === 'triple') return `Triple ${e.roll[0]}`;
  return e.kind === 'small' ? 'Small' : 'Big';
}

/**
 * HTML вкладки HISTORY для info-меню. Числа форматируем здесь: панель получает
 * готовую разметку и ничего о доменной модели не знает.
 *
 * Пользовательского ввода в строках нет — только числа из ответов сервера,
 * поэтому экранирование не требуется.
 */
export function renderHistoryHtml(fmt: (major: number) => string): string {
  if (entries.length === 0) {
    return '<p class="ohm-hint">No rounds yet — your finished rounds will appear here.</p>';
  }
  const rows = entries.map((e) => {
    const won = e.win > 0;
    const result = won
      ? `<b style="color:#3ddc84">+${fmt(e.win / 100)}</b>`
      : '<b style="color:#ff6b6b">lost</b>';
    const time = new Date(e.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    // roundId — полностью, без сокращения: по нему разбирают спорные раунды,
    // и обрезанный он бесполезен. Мелким моноширинным, чтобы не давил строку.
    const id = e.roundId
      ? `<div class="ohm-hint" style="font-family:ui-monospace,monospace;font-size:11px;opacity:.6;word-break:break-all">${e.roundId}</div>`
      : '';
    return (
      '<div style="padding:8px 0;border-bottom:1px solid rgba(0,0,0,.08)">' +
      '<div class="ohm-row">' +
      `<span>${time} · ${e.roll.join('-')} · ${categoryLabel(e)} ${e.total}</span>` +
      `<span>${result}</span>` +
      '</div>' + id +
      '</div>'
    );
  });
  return `<div class="ohm-setting"><div class="ohm-hint">Last ${entries.length} rounds</div>${rows.join('')}</div>`;
}
