/**
 * The ONE in-game rules/menu HTML renderer — the white-card-with-gold-accents
 * design the info menu shows in every game — as PURE string builders (zero deps,
 * no DOM required), so the SAME renderer that draws the menu in-game also powers
 * external tooling (the stakeplate rules editor's WYSIWYG preview, docs, CI
 * snapshots). `@open-slot-ui/pixi`'s `mountInfoMenu` consumes these — there is
 * exactly one source of truth for how a rules block looks.
 */
import type { BlockSpec } from './types';
import { modeStatsItems, type GameFacts, type RulesAuditIssue } from './facts';

/** Escape text for safe HTML interpolation. */
export const escapeHtml = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** Escape, then turn `**bold**` runs into `<b>` — the shared inline syntax. */
export const richHtml = (s: string): string => escapeHtml(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');

const esc = escapeHtml;
const rich = richHtml;

/** The stat-grid `<dl>` markup shared by `stat-grid` and the auto `mode-stats` block. */
function statGridHtml(items: ReadonlyArray<{ label: string; value: string }>, tr: (s: string) => string): string {
  const rows = items.map((it) => `<div><dt>${esc(tr(it.label))}</dt><dd>${esc(tr(it.value))}</dd></div>`).join('');
  return `<dl class="ohm-stats">${rows}</dl>`;
}

type PayRow = Extract<BlockSpec, { kind: 'paytable' }>['rows'][number];

/** The Figma symbols grid: an icon (image or emoji/text) + its payout lines. */
/**
 * Paytable как СЕТКА СИМВОЛОВ (Figma «PAYOUT»): каждый символ — своя ячейка,
 * иконка сверху + под ней вертикальный список тиров (тир │ значение). Без
 * карточек/зебры/подписей. Тиры/значения — из нашей кластерной модели (payouts
 * "13-15: 12x"): слева число совпадений, справа множитель, между ними тонкая черта.
 */
function renderPaytable(rows: readonly PayRow[], tr: (s: string) => string, id?: string): string {
  if (!rows.length) return '';
  // High-символы растеризованы С декоративной рамкой (полезная часть меньше),
  // Low — без; помечаем сетку, чтобы CSS увеличил High-иконки (компенсация).
  // Scatter — один символ, сужаем ячейку (иначе занимает всю ширину).
  const mod = id && id.includes('high') ? ' ohm-pt--high'
    : id && id.includes('scatter') ? ' ohm-pt--scatter' : '';
  // разложить payouts "13-15: 12x" → { tier: "13-15", value: "12x" } по строкам
  const parse = (p: string): Array<{ tier: string; value: string }> =>
    p.split('\n').map((line) => {
      const i = line.indexOf(':');
      return i >= 0
        ? { tier: line.slice(0, i).trim(), value: line.slice(i + 1).trim() }
        : { tier: '', value: line.trim() };
    });

  const cells = rows
    .map((r) => {
      const icon = r.icon
        ? `<img class="ohm-ptimg" src="${r.icon}" alt="" loading="lazy">`
        : `<span class="ohm-ptemoji">${esc(tr(r.symbol ?? ''))}</span>`;
      const tiers = parse(r.payouts)
        .map((c) => `<div class="ohm-ptrow"><span class="ohm-pttier">${esc(c.tier)}</span><span class="ohm-ptval">${esc(c.value)}</span></div>`)
        .join('');
      return `<div class="ohm-ptcell">${icon}<div class="ohm-pttiers">${tiers}</div></div>`;
    })
    .join('');

  return `<div class="ohm-pt${mod}">${cells}</div>`;
}

/**
 * Render a declarative rules `BlockSpec[]` to the in-game HTML — the full modular
 * palette. `tr` is the translate function (pass a translate-and-interpolate so
 * `{{rtp.base}}`-style tokens resolve — see `factsVars`); `facts` feeds the auto
 * `mode-stats` block.
 */
export function renderBlocksHtml(blocks: BlockSpec[], tr: (s: string) => string, facts?: GameFacts): string {
  const out: string[] = [];
  for (const b of blocks) {
    switch (b.kind) {
      case 'text':
        out.push(`<p>${rich(tr(b.text))}</p>`);
        break;
      case 'heading':
        out.push(`<div class="ohm-sec"><span>${esc(tr(b.text))}</span></div>`);
        break;
      case 'subheading':
        out.push(`<h4 class="ohm-subh">${esc(tr(b.text))}</h4>`);
        break;
      case 'legal':
        out.push(`<p class="ohm-legal">${rich(tr(b.text))}</p>`);
        break;
      case 'divider':
        out.push('<hr class="ohm-hr">');
        break;
      case 'image':
        out.push(`<img class="ohm-feature" alt="${esc(tr(b.alt ?? ''))}" src="${b.src}" loading="lazy">`);
        break;
      case 'media': {
        // A media block can size its own icon via `width` (e.g. small UI-guide icons);
        // absent → the CSS default. `compact` when the icon is small so the row tightens.
        const w = typeof b.width === 'number' ? b.width : undefined;
        const compact = w != null && w <= 72 ? ' ohm-media--compact' : '';
        // UI-guide rows (id "g-…") use the real round HUD-button art → mark them so CSS
        // shows the button as-is (no synthetic circle frame) and let CSS own the size.
        const btnart = b.id && b.id.startsWith('g-') ? ' ohm-media--btnart' : '';
        const style = w != null && !btnart ? ` style="width:${w}px"` : '';
        const img = `<img alt="${esc(tr(b.alt ?? ''))}" src="${b.src}"${style} loading="lazy">`;
        // Feature-блок (Figma REEL AREA): ЗАГОЛОВОК с линией-разделителем сверху (на всю
        // ширину), под ним ряд крупная картинка слева + текст справа. Абзацы делим по \n\n.
        // Compact (UI-guide строки) — прежняя раскладка (title в теле сбоку).
        if (!compact) {
          const paras = tr(b.text).split(/\n\n+/).map((p) => `<p>${rich(p)}</p>`).join('');
          const head = b.title ? `<div class="ohm-feathead"><span>${esc(tr(b.title))}</span><hr></div>` : '';
          const rowc = `<div class="ohm-media ohm-media--${b.side ?? 'left'}${btnart}">${img}<div class="ohm-media-body">${paras}</div></div>`;
          out.push(`<div class="ohm-featblock">${head}${rowc}</div>`);
        } else if (b.states && b.states.length) {
          // UI-guide строка с НЕСКОЛЬКИМИ состояниями кнопки: заголовок + описание,
          // под ними галерея состояний (иконка + подпись) — все состояния кнопки в ряд.
          const head = b.title ? `<h4>${esc(tr(b.title))}</h4>` : '';
          const states = b.states.map((s) =>
            `<figure class="ohm-state"><img src="${s.src}" alt="${esc(tr(s.label ?? ''))}" loading="lazy">${s.label ? `<figcaption>${esc(tr(s.label))}</figcaption>` : ''}</figure>`,
          ).join('');
          out.push(`<div class="ohm-guide-row${btnart}">${head}<p>${rich(tr(b.text))}</p><div class="ohm-states">${states}</div></div>`);
        } else {
          const body = `<div class="ohm-media-body">${b.title ? `<h4>${esc(tr(b.title))}</h4>` : ''}<p>${rich(tr(b.text))}</p></div>`;
          out.push(`<div class="ohm-media ohm-media--${b.side ?? 'left'}${compact}${btnart}">${img}${body}</div>`);
        }
        break;
      }
      case 'cards': {
        const cards = b.items
          .map((it) => `<div class="ohm-fcard">${it.icon ? `<img src="${it.icon}" alt="" loading="lazy">` : ''}<h5>${esc(tr(it.title))}</h5>${it.text ? `<p>${rich(tr(it.text))}</p>` : ''}</div>`)
          .join('');
        out.push(`<div class="ohm-cards">${cards}</div>`);
        break;
      }
      case 'paytable':
        out.push(renderPaytable(b.rows, tr, b.id));
        break;
      case 'table': {
        const head = b.columns?.length ? `<thead><tr>${b.columns.map((c) => `<th>${esc(tr(c))}</th>`).join('')}</tr></thead>` : '';
        const body = b.rows.map((r) => `<tr>${r.map((c) => `<td>${esc(tr(c))}</td>`).join('')}</tr>`).join('');
        out.push(`<table class="ohm-table">${head}<tbody>${body}</tbody></table>`);
        break;
      }
      case 'stat-grid':
        out.push(statGridHtml(b.items, tr));
        break;
      // The AUTO per-mode RTP / Max-win grid — rendered straight from the declared
      // game facts (+ any host extras), so the table can never drift from the config.
      // `modeStatsItems` localizes the label PARTS itself ("Max win" · the mode name),
      // so the grid renderer gets identity-tr — no double translation.
      case 'mode-stats': {
        const extras = (b.extras ?? []).map((e) => ({ label: tr(e.label), value: tr(e.value) }));
        out.push(statGridHtml([...modeStatsItems(facts, tr), ...extras], (s) => s));
        break;
      }
      case 'steps': {
        const items = b.items.map((s) => `<li>${rich(tr(s))}</li>`).join('');
        const chk = b.check ? ' ohm-steps--check' : '';
        out.push(b.ordered ? `<ol class="ohm-steps${chk}">${items}</ol>` : `<ul class="ohm-steps${chk}">${items}</ul>`);
        break;
      }
      case 'callout':
        out.push(`<div class="ohm-callout ohm-callout--${b.tone ?? 'info'}">${b.title ? `<b>${esc(tr(b.title))}</b>` : ''}<p>${rich(tr(b.text))}</p></div>`);
        break;
      case 'group':
        out.push(`<div class="ohm-group">${b.title ? `<h4 class="ohm-subh">${esc(tr(b.title))}</h4>` : ''}${renderBlocksHtml(b.children, tr, facts)}</div>`);
        break;
      default:
        break; // interactive kinds render in the Settings section, not the rules body
    }
  }
  return out.join('\n');
}

/**
 * The "⚠ Rules incomplete" warning card the info menu shows at the top of Rules
 * when the audit finds forgotten declarations. `tr` localizes the chrome strings
 * (`openui.rulesAudit.*`) + the finding messages. Empty issues → ''.
 */
export function renderRulesAuditHtml(issues: RulesAuditIssue[], tr: (s: string) => string): string {
  if (!issues.length) return '';
  const req = issues.filter((i) => i.level === 'required');
  const rec = issues.filter((i) => i.level === 'recommended');
  const list = (items: RulesAuditIssue[]): string => `<ul>${items.map((i) => `<li>${esc(tr(i.message))}</li>`).join('')}</ul>`;
  return `<div class="ohm-audit" role="alert">
      <div class="ohm-audit-title">⚠ ${esc(tr('openui.rulesAudit.title'))}</div>
      ${req.length ? `<div class="ohm-audit-sub">${esc(tr('openui.rulesAudit.required'))}</div>${list(req)}` : ''}
      ${rec.length ? `<div class="ohm-audit-sub ohm-audit-sub--rec">${esc(tr('openui.rulesAudit.recommended'))}</div><div class="ohm-audit-rec">${list(rec)}</div>` : ''}
    </div>`;
}

/**
 * The in-game info-menu stylesheet (the white card + gold accents design). One
 * copy, used by `mountInfoMenu` AND any external preview. Expects the CSS custom
 * properties `--accent --accent-text --surface --surface-alt --text --text-dim
 * --card-radius --font` on the `.ohm-root` (see {@link INFO_MENU_VARS}).
 */
export const INFO_MENU_VARS: Readonly<Record<string, string>> = Object.freeze({
  '--accent': '#9bf3ef',          // бирюза (Figma Accent) — выплаты/тоглы/чипы
  '--accent-text': '#05201f',     // тёмный текст на бирюзе
  '--accent-2': '#fcff36',        // жёлтый (Figma Yellow) — заголовки секций
  '--surface': 'rgba(0,0,0,0.7)', // Black-70 — фон карточек-пилюль
  '--surface-alt': 'rgba(0,0,0,0.55)',
  '--text': '#ffffff',
  '--text-dim': 'rgba(255,255,255,0.7)',
  '--card-radius': '40px',        // пилюли (Figma PayCard rounded-40)
  '--card-border': 'rgba(255,255,255,0.3)', // White-30 обводка
  '--font': "'Inter', system-ui, sans-serif",
});

export const INFO_MENU_CSS = `
@font-face {
  font-family: 'Inter'; font-style: normal; font-weight: 100 900; font-display: swap;
  src: url('${import.meta.env.BASE_URL}fonts/inter-var.woff2') format('woff2');
}
.ohm-root { position: fixed; inset: 0; z-index: 10000; overflow: hidden; font-family: var(--font); opacity: 0; pointer-events: none; transition: opacity .18s ease; }
.ohm-root.open { opacity: 1; pointer-events: auto; }
.ohm-backdrop { position: absolute; inset: 0; background: rgba(8,6,4,0); backdrop-filter: blur(0px) saturate(1); -webkit-backdrop-filter: blur(0px) saturate(1); transition: background .4s ease, backdrop-filter .4s ease, -webkit-backdrop-filter .4s ease; }
.ohm-root.open .ohm-backdrop { background: rgba(4,3,7,.82); backdrop-filter: blur(14px) saturate(1.15); -webkit-backdrop-filter: blur(14px) saturate(1.15); }
.ohm-main { position: absolute; inset: 0; display: flex; align-items: stretch; color: var(--text); transform: translateY(8px); transition: transform .18s ease; }
.ohm-root.open .ohm-main { transform: none; }
.ohm-content { flex: 1; min-width: 0; min-height: 0; height: 100%; display: flex; flex-direction: column; padding: 28px 40px 28px 48px; overflow: hidden; }
/* Figma Title: белый Inter Bold uppercase + тонкая линия White-30 СПРАВА в строку */
.ohm-panetitle { margin: 8px 0 4px; display: flex; align-items: center; gap: 20px;
  font-size: 20px; font-style: normal; font-weight: 700; letter-spacing: .5px; text-transform: uppercase; color: var(--text); white-space: nowrap; }
.ohm-panetitle:not(:first-child) { margin-top: 40px; }
.ohm-panetitle::after { content: ""; flex: 1; height: 1px; background: color-mix(in srgb, var(--text) 30%, transparent); }
.ohm-pane { display: none; flex: 1; min-height: 0; overflow-y: auto; padding-right: 14px; scrollbar-width: thin; scrollbar-color: color-mix(in srgb, var(--text) 32%, transparent) transparent; }
/* Контент info-пейна ограничен по ширине и центрируется (на широких экранах не
   растягивается на всю панель). Скролл-полоса остаётся у края .ohm-pane. */
.ohm-pane.is-active { width: 100%; max-width: 1200px; margin: 0 auto; }
.ohm-pane.is-active { display: block; }
.ohm-pane::-webkit-scrollbar { width: 8px; }
.ohm-pane::-webkit-scrollbar-track { background: transparent; }
.ohm-pane::-webkit-scrollbar-thumb { background-color: color-mix(in srgb, var(--text) 28%, transparent); border-radius: 999px; }
.ohm-pane::-webkit-scrollbar-thumb:hover { background-color: var(--accent); }
.ohm-rail { flex: none; width: 96px; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; gap: 22px; border-left: 1px solid color-mix(in srgb, var(--text) 22%, transparent); padding: 20px 0 34px; }
.ohm-railbtn { width: 56px; height: 56px; border: 0; background: transparent; color: #ffffff; opacity: .78; cursor: pointer; display: grid; place-items: center; transition: opacity .12s, color .12s, transform .12s; }
.ohm-railbtn:hover { opacity: 1; transform: scale(1.08); }
.ohm-railbtn.is-active { color: var(--accent); opacity: 1; }
/* РУЧНАЯ ПРАВКА: 44, а не прежние 34 — ВЫРАВНИВАНИЕ ПО CLOSE.
   Арт кнопки close заполняет её целиком (100% = 56px), и рядом с ним значок в
   34px выглядел вдвое мельче. У SVG нет собственных полей вокруг рисунка (в
   отличие от арта), поэтому ему дан не полный размер кнопки, а 44 — на глаз это
   тот же оптический вес, что у картинок. */
.ohm-railbtn svg { width: 44px; height: 44px; }
/* РУЧНАЯ ПРАВКА: то же для img — иконки рельсы теперь бывают ГОТОВЫМ АРТОМ
   (settings_info.webp), а не только SVG. Без правила картинка 160×160 встала бы
   в натуральную величину и разорвала бы рельсу: размер задавался ТОЛЬКО для svg.
   Значение 100% — как у close: у арта кнопки поля уже нарисованы в самом файле,
   и ужимать его до 34px значило бы получить кнопку внутри кнопки. */
.ohm-railbtn:not(.ohm-railclose) img { width: 100%; height: 100%; object-fit: contain; display: block; }
/* Активное состояние задаётся через color: var(--accent) — на SVG это работает
   (там currentColor), а на КАРТИНКЕ нет: её цвет зафиксирован в файле.
   Поэтому для арта: АКТИВНАЯ — как есть, без обработки; неактивная — приглушена
   до 70% яркости. Осветлять активную и вешать на неё свечение не нужно, арт уже
   нарисован в нужном виде. */
.ohm-railbtn:not(.ohm-railclose) img { filter: brightness(.7); }
.ohm-railbtn.is-active:not(.ohm-railclose) img { filter: none; }
/* Close — реальный арт круглой HUD-кнопки (public/ui/close.webp): показываем как есть,
   opacity:1 (это готовая кнопка, а не иконка-штрих), img заполняет кнопку. */
.ohm-railbtn.ohm-railclose { opacity: 1; }
.ohm-railbtn.ohm-railclose img { width: 100%; height: 100%; object-fit: contain; display: block;
  filter: drop-shadow(0 2px 6px rgba(0,0,0,.45)); }
.ohm-raildiv { width: 40px; border: 0; border-top: 1px solid color-mix(in srgb, var(--text) 22%, transparent); margin: 4px 0; }
.ohm-x { position: absolute; top: 18px; right: 22px; width: 46px; height: 46px; border-radius: 999px; border: 0; background: rgba(18,14,10,.82); color: #fff; font-size: 18px; cursor: pointer; display: grid; place-items: center; box-shadow: 0 6px 18px rgba(0,0,0,.45); z-index: 2; transition: transform .12s, background .12s; }
.ohm-x:hover { transform: scale(1.08); background: rgba(18,14,10,.95); }
.ohm-body { padding: 24px 26px 26px; overflow-y: scroll; }
.ohm-body::-webkit-scrollbar { width: 18px; }
.ohm-body::-webkit-scrollbar-track { background: transparent; margin: 12px 0; }
.ohm-body::-webkit-scrollbar-thumb { background-color: #111; border: 6px solid transparent; background-clip: padding-box; border-radius: 999px; min-height: 44px; }
.ohm-body::-webkit-scrollbar-thumb:hover { background-color: #000; }
.ohm-logo { display: block; margin: 6px auto 18px; max-width: 64%; height: auto; }
.ohm-logo-text { margin: 6px 0 18px; text-align: center; font-size: 30px; font-weight: 900; letter-spacing: 1px; color: var(--text); }
.ohm-sec { display: flex; align-items: center; gap: 20px; margin: 40px 0 16px; color: var(--text); font-weight: 700; letter-spacing: .5px; font-size: 20px; text-transform: uppercase; }
.ohm-sec > span { flex: none; white-space: nowrap; }
.ohm-sec::after { content: ''; flex: 1; border-top: 1px solid color-mix(in srgb, var(--text) 30%, transparent); }
.ohm-root *, .ohm-root *::before, .ohm-root *::after { box-sizing: border-box; }
.ohm-row { display: flex; align-items: center; gap: 16px; margin: 14px 0; font-weight: 700; }
.ohm-setting { margin: 14px 0; }
.ohm-setting .ohm-row { margin: 0; }
.ohm-hint { margin: 3px 0 0; font-size: 12.5px; font-weight: 500; color: var(--text-dim); }
.ohm-row > span:first-child { flex: none; min-width: 110px; }
.ohm-row input[type=range] { flex: 1; min-width: 0; max-width: min(440px, 60dvw); accent-color: var(--accent); height: 6px; }
.ohm-row select { flex: 1; min-width: 0; max-width: min(440px, 60dvw); padding: 11px 14px; border-radius: 4px; border: 2px solid var(--accent); background: var(--surface-alt); color: var(--text); font-weight: 700; font-size: 15px; cursor: pointer; }
.ohm-row select option { background: var(--surface); color: var(--text); font-weight: 600; }
.ohm-row select option:checked { background: var(--accent); color: var(--accent-text); }
.ohm-ctl { flex: 1; min-width: 0; max-width: min(440px, 60dvw); display: flex; align-items: center; justify-content: flex-end; }
.ohm-check input[type=checkbox] { appearance: none; -webkit-appearance: none; width: 50px; height: 28px; border-radius: 999px; background: color-mix(in srgb, var(--text-dim) 38%, transparent); position: relative; cursor: pointer; transition: background .15s; flex: none; }
.ohm-check input[type=checkbox]:checked { background: var(--accent); }
.ohm-check input[type=checkbox]::before { content: ""; position: absolute; top: 3px; left: 3px; width: 22px; height: 22px; border-radius: 999px; background: #fff; transition: left .15s; box-shadow: 0 1px 3px rgba(0,0,0,.3); }
.ohm-check input[type=checkbox]:checked::before { left: 25px; }
.ohm-segmented { display: inline-flex; gap: 4px; padding: 4px; background: var(--surface-alt); border-radius: 999px; border: 1px solid color-mix(in srgb, var(--text-dim) 30%, transparent); }
.ohm-seg { border: 0; background: transparent; color: var(--text-dim); font-weight: 700; font-size: 14px; padding: 8px 18px; border-radius: 999px; cursor: pointer; transition: background .12s, color .12s; }
.ohm-seg.active { background: var(--accent); color: var(--accent-text); }

/* ── Settings-пейн: элементы КРУПНЕЕ и по ЦЕНТРУ экрана (общий стиль Game Info,
   в Фигме своего дизайна нет). Узкая центральная колонка, вертикально по центру,
   каждая настройка — строка-карточка с разделителем. ───────────────────────── */
/* safe-center: центрируем по вертикали, но при переполнении не обрезаем верх
   (justify-content без safe клипует top на overflow). */
.ohm-pane[data-pane="settings"].is-active { max-width: 720px; display: flex; flex-direction: column;
  justify-content: safe center; min-height: 100%; }
/* Заголовок SETTINGS — по центру, без правой линии (линия у ::after скрыта). */
.ohm-pane[data-pane="settings"] .ohm-panetitle { justify-content: center; font-size: 26px; flex: none;
  margin: 0 0 28px; }
.ohm-pane[data-pane="settings"] .ohm-panetitle::after { display: none; }
/* Каждая настройка — строка-карточка на всю ширину колонки, с нижним разделителем. */
.ohm-pane[data-pane="settings"] .ohm-setting { margin: 0; padding: 20px 4px; }
.ohm-pane[data-pane="settings"] .ohm-setting + .ohm-setting { border-top: 1px solid color-mix(in srgb, var(--text) 14%, transparent); }
/* label крупнее, контрол — шире и справа. */
.ohm-pane[data-pane="settings"] .ohm-row { gap: 24px; }
.ohm-pane[data-pane="settings"] .ohm-row > span:first-child { min-width: 140px; font-size: 19px; }
.ohm-pane[data-pane="settings"] .ohm-hint { font-size: 14.5px; margin-top: 8px; }
.ohm-pane[data-pane="settings"] .ohm-ctl,
.ohm-pane[data-pane="settings"] .ohm-row input[type=range],
.ohm-pane[data-pane="settings"] .ohm-row select { max-width: 360px; }
/* слайдеры толще, селект выше */
.ohm-pane[data-pane="settings"] .ohm-row input[type=range] { height: 10px; }
.ohm-pane[data-pane="settings"] .ohm-row select { padding: 14px 18px; font-size: 17px; border-radius: 8px; }
/* тумблер крупнее */
.ohm-pane[data-pane="settings"] .ohm-check input[type=checkbox] { width: 64px; height: 36px; }
.ohm-pane[data-pane="settings"] .ohm-check input[type=checkbox]::before { top: 4px; left: 4px; width: 28px; height: 28px; }
.ohm-pane[data-pane="settings"] .ohm-check input[type=checkbox]:checked::before { left: 32px; }
/* сегменты Quick spin крупнее */
.ohm-pane[data-pane="settings"] .ohm-seg { font-size: 16px; padding: 11px 26px; }
/* Paytable — СЕТКА СИМВОЛОВ (Figma «PAYOUT»): каждый символ — ячейка (иконка +
   вертикальный список тиров под ней). Без карточек/зебры/обводки. */
/* Ряд НЕ переносится: ячейки сжимаются под ширину панели (7 символов по
   фиксированным 180px не влезали и уезжали на вторую строку). Ширина —
   гибкая: базис 180px, но ячейка вправе ужаться до 96px. */
.ohm-pt { display: flex; flex-wrap: nowrap; justify-content: center; align-items: flex-start;
  gap: 24px 16px; margin: 16px 0 8px; }
.ohm-ptcell { flex: 1 1 180px; min-width: 96px; max-width: 210px; display: flex;
  flex-direction: column; align-items: center; gap: 10px; }
.ohm-ptimg { width: 100%; max-width: 132px; height: auto; aspect-ratio: 1;
  object-fit: contain; display: block; filter: drop-shadow(0 2px 6px rgba(0,0,0,.5)); }
.ohm-ptemoji { font-size: 100px; line-height: 1; }
/* High-символы в рамке — персонаж внутри мельче; масштабируем крупнее, чтобы
   сравнять с безрамочными Low (рамка выходит за бокс). */
.ohm-pt--high .ohm-ptimg { max-width: 168px; transform: scale(1.12); }
/* вертикальный список тиров под символом: «тир │ значение» построчно.
   min-width НЕ фиксируем: он распирал ячейку и мешал ряду сжиматься. */
.ohm-pttiers { display: flex; flex-direction: column; gap: 4px; align-items: stretch;
  width: 100%; min-width: 0; }
.ohm-ptrow { display: flex; align-items: baseline; gap: 6px; min-width: 0; }
/* тир (число совпадений) — приглушённый, у левого края + тонкая черта-разделитель */
.ohm-pttier { flex: 0 0 auto; min-width: 34px; text-align: right; color: var(--text-dim);
  font-weight: 700; font-size: 15px; padding-right: 8px; white-space: nowrap;
  border-right: 1px solid color-mix(in srgb, var(--text) 28%, transparent); }
/* множитель — жёлтый (Figma), курсив-bold как в референсе */
.ohm-ptval { flex: 1 1 auto; min-width: 0; text-align: left; color: var(--accent-2);
  font-weight: 800; font-style: italic; font-size: 17px; white-space: nowrap; }
.ohm-body p { color: var(--text-dim); line-height: 1.6; }
.ohm-body p b { color: var(--text); }
.ohm-feature { display: block; width: 100%; height: auto; margin: 10px 0; }
.ohm-stats { margin: 12px 0; display: grid; grid-template-columns: 1fr 1fr; gap: 0 28px; }
.ohm-stats > div { display: flex; justify-content: space-between; padding: 9px 0; border-bottom: 1px solid color-mix(in srgb, var(--text-dim) 20%, transparent); }
.ohm-stats dt { color: var(--text-dim); margin: 0; } .ohm-stats dd { margin: 0; font-weight: 700; }
.ohm-audit { margin: 12px 0 18px; padding: 14px 16px; border-radius: 12px; border: 2px solid #d03131; background: color-mix(in srgb, #d03131 8%, transparent); }
.ohm-audit-title { font-weight: 900; letter-spacing: .5px; color: #b31d1d; }
.ohm-audit-sub { margin-top: 8px; font-size: 13px; font-weight: 800; color: #b31d1d; }
.ohm-audit-sub--rec { color: #b07d09; }
.ohm-audit ul { margin: 6px 0 0; padding-left: 20px; color: var(--text); font-size: 13.5px; line-height: 1.55; }
.ohm-audit li { margin: 3px 0; }
.ohm-audit-rec ul { color: var(--text-dim); }
.ohm-callout { margin: 16px 0 4px; padding: 14px 16px; border-radius: 12px; border-left: 4px solid var(--accent); background: color-mix(in srgb, var(--accent) 9%, transparent); }
.ohm-callout b { color: var(--accent); } .ohm-callout p { margin: 4px 0 0; color: var(--text); }
.ohm-callout--warning { border-left-color: #e0a106; background: color-mix(in srgb, #e0a106 10%, transparent); }
.ohm-callout--warning b { color: #b07d09; }
.ohm-subh { margin: 22px 0 10px; font-size: 20px; font-weight: 800; letter-spacing: 1px; color: var(--accent-2); text-align: center; text-transform: uppercase; }
.ohm-legal { font-size: 12px; line-height: 1.6; color: var(--text-dim); opacity: .85; }
.ohm-hr { border: 0; border-top: 1px solid color-mix(in srgb, var(--text-dim) 30%, transparent); margin: 18px 0; }
/* Feature-блок (Figma REEL AREA): заголовок-с-линией сверху, под ним крупная картинка
   слева + текст справа (по верху). */
.ohm-featblock { margin: 30px 0; }
.ohm-feathead { display: flex; align-items: center; gap: 20px; margin-bottom: 20px; }
.ohm-feathead > span { font-size: 20px; font-weight: 800; color: var(--text); text-transform: uppercase; white-space: nowrap; flex: none; }
.ohm-feathead > hr { flex: 1; border: 0; border-top: 1px solid color-mix(in srgb, var(--text) 30%, transparent); margin: 0; }
.ohm-media { display: flex; align-items: flex-start; gap: 30px; margin: 0; }
.ohm-media--right { flex-direction: row-reverse; }
.ohm-media > img { width: 260px; max-width: 40%; height: auto; flex: none; object-fit: contain; border-radius: 12px; }
.ohm-media-body { flex: 1; padding-top: 4px; }
.ohm-media-body h4 { margin: 0 0 8px; font-size: 19px; font-weight: 800; color: var(--text); }
.ohm-media-body p { margin: 0 0 16px; font-size: 18px; line-height: 1.4; color: var(--text); }
.ohm-media-body p:last-child { margin-bottom: 0; }
/* Compact media = UI-interface guide строки: круглая иконка + текст, разделители. */
.ohm-media--compact { gap: 24px; margin: 0; padding: 18px 0; align-items: center; max-width: none; }
.ohm-media--compact + .ohm-media--compact { border-top: 1px solid color-mix(in srgb, var(--text) 15%, transparent); }
.ohm-media--compact > img { width: 60px; max-width: 60px; height: 60px; padding: 12px; box-sizing: border-box;
  background: var(--surface); border: 1px solid var(--card-border); border-radius: 999px; object-fit: contain; }
/* UI-guide строки — реальный круглый арт HUD-кнопок: показываем как есть (без синтетической
   рамки/фона/паддинга), крупнее, чтобы деталь кнопки читалась. */
.ohm-media--btnart > img { width: 76px; max-width: 76px; height: 76px; padding: 0;
  background: none; border: none; border-radius: 0; object-fit: contain;
  filter: drop-shadow(0 2px 6px rgba(0,0,0,.45)); }
.ohm-media--compact .ohm-media-body h4 { margin: 0 0 4px; font-size: 19px; }
.ohm-media--compact .ohm-media-body p { font-size: 17px; }
/* UI-guide строка со ВСЕМИ состояниями кнопки: заголовок + описание слева,
   под ними галерея состояний (иконка + подпись) в ряд. Всё выровнено влево. */
.ohm-guide-row { padding: 22px 0; text-align: left; }
.ohm-guide-row + .ohm-guide-row { border-top: 1px solid color-mix(in srgb, var(--text) 15%, transparent); }
.ohm-guide-row h4 { margin: 0 0 6px; font-size: 20px; font-weight: 700; color: var(--text); }
.ohm-guide-row > p { margin: 0 0 16px; font-size: 17px; line-height: 1.5; color: var(--text-dim); }
.ohm-states { display: flex; flex-wrap: wrap; gap: 24px; align-items: flex-end; }
.ohm-state { margin: 0; display: flex; flex-direction: column; align-items: center; gap: 8px; }
.ohm-state > img { width: 72px; height: 72px; object-fit: contain;
  filter: drop-shadow(0 2px 6px rgba(0,0,0,.45)); }
.ohm-state > figcaption { font-size: 14px; color: var(--text-dim); text-transform: capitalize; white-space: nowrap; }
.ohm-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin: 12px 0; }
.ohm-fcard { padding: 8px 6px; text-align: center; }
.ohm-fcard img { display: block; width: 48px; height: 48px; margin: 0 auto 8px; }
.ohm-fcard h5 { margin: 0 0 4px; font-size: 14px; color: var(--text); }
.ohm-fcard p { margin: 0; font-size: 12px; line-height: 1.5; }
.ohm-table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 14px; }
.ohm-table th { text-align: left; padding: 8px 10px; font-weight: 800; color: var(--text); border-bottom: 2px solid color-mix(in srgb, var(--text-dim) 35%, transparent); }
.ohm-table td { padding: 8px 10px; border-bottom: 1px solid color-mix(in srgb, var(--text-dim) 18%, transparent); }
.ohm-table td:first-child { color: var(--text); font-weight: 700; }
.ohm-table td:not(:first-child) { color: var(--accent); font-weight: 700; }
.ohm-steps { margin: 12px 0; padding-left: 22px; color: var(--text-dim); line-height: 1.7; }
.ohm-steps li { margin: 5px 0; }
.ohm-steps b { color: var(--text); }
/* Figma «GAME RULES» checklist — квадратный чекбокс со скруглением + галочка слева. */
.ohm-steps--check { list-style: none; padding-left: 0; }
.ohm-steps--check li { position: relative; padding: 6px 0 6px 40px; margin: 0; }
.ohm-steps--check li::before {
  content: ''; position: absolute; left: 0; top: 8px; width: 20px; height: 20px;
  border: 1.5px solid color-mix(in srgb, var(--text) 55%, transparent);
  border-radius: 6px; box-sizing: border-box;
}
.ohm-steps--check li::after {
  content: ''; position: absolute; left: 6px; top: 11px; width: 7px; height: 12px;
  border: solid var(--text); border-width: 0 2px 2px 0; transform: rotate(45deg);
}
.ohm-group { margin: 8px 0; }
@media (orientation: portrait) {
  /* Mobile: the icon rail becomes a BOTTOM navigation bar (content above, rail below). */
  .ohm-main { flex-direction: column; }
  .ohm-content { padding: 20px 18px 12px 20px; }
  .ohm-rail {
    flex-direction: row; width: 100%; height: auto;
    justify-content: center; align-items: center; gap: 32px;
    border-left: 0; border-top: 1px solid color-mix(in srgb, var(--text) 22%, transparent);
    /* РУЧНАЯ ПРАВКА: боковые поля — чтобы прижатому вправо close было от чего
       отступать (см. margin-left: auto ниже). Раньше их не было вовсе. */
    padding: 14px 16px calc(14px + env(safe-area-inset-bottom, 0px));
  }
  /* РУЧНАЯ ПРАВКА: CLOSE — К ПРАВОМУ КРАЮ.
     В портрете рельса это горизонтальный ряд, и close стоял в нём последним по
     ЦЕНТРУ, вместе с остальными: закрытие читалось как ещё одна вкладка.
     margin-left: auto съедает весь свободный зазор слева и уводит кнопку к
     краю — вкладки остаются группой слева, закрытие отдельно справа.
     Разделитель между ними при этом не нужен — его правило ниже перекрываем
     точечно, а не дублируем всю строку. */
  .ohm-railbtn.ohm-railclose { margin-left: auto; }
  /* РУЧНАЯ ПРАВКА: разделитель СКРЫТ. Он отделял вкладки от close, когда весь
     ряд стоял по центру; теперь close прижат к правому краю (см. выше), и
     вертикальная чёрточка посреди пустого зазора выглядела бы мусором. */
  .ohm-raildiv { display: none; }
  .ohm-railbtn { width: 50px; height: 50px; }
  /* РУЧНАЯ ПРАВКА: те же пропорции, что в основной секции, — просто от кнопки
     50px вместо 56px. SVG чуть меньше кнопки (у него нет своих полей), арт —
     во всю кнопку, как close. */
  .ohm-railbtn svg { width: 40px; height: 40px; }
  .ohm-railbtn:not(.ohm-railclose) img { width: 100%; height: 100%; }
  .ohm-railbtn.ohm-railclose { font-size: 28px; }
  .ohm-panetitle { font-size: 22px; }
  /* Two-column media rows stack to one column (image on top, prose below). */
  .ohm-media { flex-direction: column; align-items: flex-start; gap: 12px; padding: 0 8px; max-width: none; }
  .ohm-media--right { flex-direction: column; }
  .ohm-media > img { width: 96px; max-width: 40%; }
  .ohm-media--compact { flex-direction: row; align-items: center; }
  .ohm-media--compact > img { width: 40px; }
  .ohm-media--btnart > img { width: 58px; max-width: 58px; height: 58px; }

  /* PAYTABLE: символы в 3-колоночную сетку (были огромные в 1-2 ряда). Ячейка/картинка
     компактнее, тиры/значения ужаты под ширину колонки (иначе соседние наезжают). */
  .ohm-pt { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px 4px; justify-content: stretch; }
  .ohm-ptcell { width: auto; min-width: 0; align-items: center; }
  .ohm-ptimg { width: 72px; height: 72px; }
  .ohm-pt--high .ohm-ptimg { width: 84px; height: 84px; transform: none; }
  .ohm-pt--high .ohm-ptcell { width: auto; }
  .ohm-ptemoji { font-size: 56px; }
  .ohm-pttiers { min-width: 0; width: 100%; gap: 2px; }
  .ohm-ptrow { gap: 6px; justify-content: center; }
  .ohm-pttier { min-width: 0; font-size: 12px; }
  .ohm-ptval { font-size: 14px; }

  /* Картинки фич — по центру, на всю ширину контента. */
  .ohm-feature { width: 100%; max-width: 100%; margin: 12px auto; }

  /* SETTINGS: строки с ШИРОКИМ контролом (сегменты Quick spin, Language select) на узком
     экране НАЕЗЖАЛИ на лейбл. Переносим в колонку: лейбл сверху, контрол снизу на всю
     ширину. Sound (компактный тумблер) и слайдеры остаются в ряд. */
  .ohm-pane[data-pane="settings"] .ohm-row:has(.ohm-segmented),
  .ohm-pane[data-pane="settings"] .ohm-row:has(select) {
    flex-direction: column; align-items: stretch; gap: 10px;
  }
  .ohm-pane[data-pane="settings"] .ohm-row:has(.ohm-segmented) > span:first-child,
  .ohm-pane[data-pane="settings"] .ohm-row:has(select) > span:first-child { min-width: 0; }
  .ohm-pane[data-pane="settings"] .ohm-ctl { max-width: none; justify-content: flex-start; }
  .ohm-segmented { width: 100%; justify-content: center; }
  .ohm-seg { flex: 1; }
  .ohm-pane[data-pane="settings"] .ohm-row select { max-width: none; }
}
`;
