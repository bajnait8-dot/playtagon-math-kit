import type { BlockSpec, MenuSpec } from '../vendor/slot-ui-core/index';
import { PAYOUTS, TOTALS } from '../../../server/model/config.js';
import type { SicBoBetType } from '../../../server/model/types.js';

/** Название и версия — одна точка правды для HUD-спеки и правил. */
export const GAME_NAME = 'Sic Bo';
export const GAME_VERSION = '0.0.1';

/**
 * Содержимое вендорского меню (☰ → Settings · Rules · Guide). Окна берём
 * библиотечные, игра отвечает только за НАПОЛНЕНИЕ — декларативными блоками.
 *
 * Коэффициенты — из модели (server/model/config.ts), не переписаны руками:
 * иначе правила разъедутся с математикой при первой же правке конфига.
 */

const pay = (t: SicBoBetType): string => `${PAYOUTS[t]}:1`;

/** Суммы 4…17 одной строкой: «4 и 17 — 60:1, 5 и 16 — 30:1, …». */
const totalsRows: string[][] = (() => {
  const rows: string[][] = [];
  // Таблица симметрична (4↔17, 5↔16, …) — показываем парами, как на столе.
  for (const s of TOTALS.filter((n) => n <= 10)) {
    const mirror = 21 - s;
    rows.push([`${s} or ${mirror}`, pay(`total_${s}` as SicBoBetType)]);
  }
  return rows;
})();

const rules: BlockSpec[] = [
  {
    kind: 'text',
    id: 'intro',
    text: 'Place chips on any zones of the table, then roll three dice. Every zone is settled independently — one roll can win several bets at once.',
  },
  { kind: 'heading', id: 'how-to', text: 'How to play' },
  {
    kind: 'steps',
    id: 'steps',
    ordered: true,
    items: [
      'Pick a chip value from the tray.',
      'Tap zones on the table to place chips. UNDO removes the last chip, CLEAR removes them all.',
      'Press PLAY to roll the dice.',
      'Winning zones are highlighted and paid. Press NEW BET to start over, or REBET to repeat the same bet.',
    ],
  },

  { kind: 'heading', id: 'main-head', text: 'Small and Big' },
  {
    kind: 'text',
    id: 'small-big',
    text: 'SMALL wins on a total of 4 to 10, BIG wins on 11 to 17 — both pay 1:1. Both LOSE on any triple, even when the total is in range.',
  },

  { kind: 'heading', id: 'triples-head', text: 'Triples and doubles' },
  {
    kind: 'table',
    id: 'triples',
    columns: ['Bet', 'Pays'],
    rows: [
      ['Any Triple — all three dice equal', pay('triple_any')],
      ['Specific Triple — three of a chosen face', pay('triple_1')],
      ['Double — at least two of a chosen face', pay('double_1')],
    ],
  },

  { kind: 'heading', id: 'totals-head', text: 'Total of three dice' },
  {
    kind: 'table',
    id: 'totals',
    columns: ['Total', 'Pays'],
    rows: totalsRows,
  },

  { kind: 'heading', id: 'combo-head', text: 'Combinations and single faces' },
  {
    kind: 'table',
    id: 'combos',
    columns: ['Bet', 'Pays'],
    rows: [
      ['Combination — two chosen faces both appear', pay('combo_12')],
      ['Single face — appears on one die', '1:1'],
      ['Single face — appears on two dice', '2:1'],
      ['Single face — appears on all three dice', '3:1'],
    ],
  },

  { kind: 'heading', id: 'rtp-head', text: 'Return to player' },
  {
    kind: 'text',
    id: 'rtp-note',
    text: 'Sic Bo uses the classic paytable, so RTP is NOT a single number — it depends on which bets you place.',
  },
  {
    kind: 'table',
    id: 'rtp-table',
    columns: ['Bet', 'RTP'],
    rows: [
      ['Small · Big', '97.22%'],
      ['Combination', '97.22%'],
      ['Single face', '92.13%'],
      ['Total 7 · 14', '90.28%'],
      ['Total 6 · 15', '87.96%'],
      ['Total 8 · 13', '87.50%'],
      ['Total 10 · 11', '87.50%'],
      ['Total 5 · 16', '86.11%'],
      ['Any Triple', '86.11%'],
      ['Total 4 · 17', '84.72%'],
      ['Specific Triple', '83.80%'],
      ['Double', '81.48%'],
      ['Total 9 · 12', '81.02%'],
    ],
  },
  {
    kind: 'legal',
    id: 'rtp-legal',
    text: 'Theoretical return to player ranges from 81.02% to 97.22% depending on the bet. Malfunction voids all pays and plays.',
  },
  // Название + версия: библиотека дописывает их только в PIXI-меню, а у нас
  // ☰ открывает своё окно и правила живут в HTML info-menu. Версия должна быть
  // доступна игроку (требование сертификации), поэтому добавляем явно.
  { kind: 'legal', id: 'game-version', text: `${GAME_NAME}  ·  v${GAME_VERSION}` },
];

const guide: BlockSpec[] = [
  { kind: 'heading', id: 'controls-head', text: 'Controls' },
  {
    kind: 'table',
    id: 'controls',
    columns: ['Control', 'What it does'],
    rows: [
      ['PLAY', 'Rolls the dice with the chips on the table'],
      ['CLEAR', 'Removes every chip from the table'],
      ['UNDO', 'Removes the last chip you placed'],
      ['NEW BET', 'Clears the table and starts a fresh bet'],
      ['REBET', 'Repeats the previous bet and rolls at once'],
      ['Chip tray', 'Picks the value of the next chip'],
      ['Autoplay', 'Repeats the same bet for a set number of rounds'],
      ['Turbo', 'Speeds up the roll'],
    ],
  },
  { kind: 'heading', id: 'hotkeys-head', text: 'Hotkeys' },
  {
    kind: 'table',
    id: 'hotkeys',
    columns: ['Key', 'Action'],
    rows: [
      ['Space', 'Roll'],
      ['M', 'Mute'],
      ['I', 'Game info'],
    ],
  },
];

export function buildMenu(): MenuSpec {
  return { rules, guide };
}
