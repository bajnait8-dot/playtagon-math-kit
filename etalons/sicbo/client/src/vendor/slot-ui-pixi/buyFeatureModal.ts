// The BUY-FEATURE modal — the open-slot-ui host component opened by the bonus button.
// The bonus (☰ coin) button opens a card LIST of the game's buyable/activatable features;
// each card has its own Buy/Activate action, and buying (or activating a boost) above the
// jurisdiction threshold is gated by a built-in confirm sub-dialog. One biased white design
// (independent of the game theme), matching the info menu; fully localized + social-aware.
//
// Each feature is a card: `buy` = one-tap purchase (start that mode once), `boost` = an
// activatable per-spin bet surcharge that toggles on/off. Actions emit `cardActivated` on the
// bus AND call the `onBuy`/`onActivate` host hooks. Returns a leak-free teardown.

import type { Application } from 'pixi.js';
import type { BootedHud } from './mountHud';
import { formatAmountPrecise } from '../slot-ui-core/index';
import type { CurrencySpec } from '../slot-ui-core/index';

/** A buy-feature card. */
export interface FeatureSpec {
  id: string;
  name: string;
  variant: 'buy' | 'boost';
  /** Price as a multiple of the current bet (× bet). */
  cost: number;
  /** Card image URL (or data URI). Optional — a neutral gradient is used when absent. */
  image?: string;
  /** Short bonus description shown when the card expands to its confirm state (Figma). */
  description?: string;
}

// Format via the library's Stake currency formatter so the modal matches the HUD exactly:
// correct symbol + side (CNY → CN¥1,000.00, PLN → 1,000.00 zł), thousands separators, right
// decimals (JPY 0, BTC 8) and social coins (XGC → GC). Precise: a sub-unit price (a
// USD 0.01 bet × a 6.5× boost = $0.065) shows in full instead of rounding.
function money(amount: number, cur: CurrencySpec): string {
  return formatAmountPrecise(amount, cur);
}

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Configurable behavior of the activatable bet-boost cards. */
export interface BuyFeatureOptions {
  /** `'single'` → only one boost active at a time · `'multi'` → combine them. Default `'multi'`. */
  activation?: 'single' | 'multi';
  /** When any boost is active, disable the Buy buttons. Default `false`. */
  activationBlocksBuy?: boolean;
  /** Host hook for a confirmed Buy (the modal has just closed): deduct + start the feature. */
  onBuy?: (id: string, cost: number) => void;
  /** Host hook whenever the active-boost set changes (the modal stays open). */
  onActivate?: (activeIds: string[], id: string, active: boolean) => void;
  /** BASE bet source for pricing. Default reads ui.bet — pass this when ui.bet
   *  displays a modified EFFECTIVE stake (boost active) instead of the base bet. */
  getBet?: () => number;
  /** Hard cap on a buy's total cost (in the display currency's major units). A buy
   *  option whose price (cost × bet) EXCEEDS this is disabled — the bet itself is not
   *  affected, only the purchase. Omit for no cap. */
  maxBuyCost?: number;
}

/** Mount the buy-feature modal. Returns a leak-free teardown. */
/** Handle returned by {@link mountBuyFeatureModal}: teardown + open/close controls + a
 *  subscription to the open state (for a custom Pixi bonus button that swaps its art). */
export interface BuyFeatureHandle {
  dispose: () => void;
  open: () => void;
  close: () => void;
  readonly isOpen: boolean;
  onOpenChange: (fn: (open: boolean) => void) => () => void;
}

export function mountBuyFeatureModal(
  _app: Application,
  hud: BootedHud,
  features: FeatureSpec[],
  opts: BuyFeatureOptions = {},
): BuyFeatureHandle {
  const ui = hud.ui;
  const tr = (k: string): string => ui.t(k);
  const list = features.slice(0, 4); // up to 4
  // Declare the configured features as GAME FACTS: what's buyable/activatable here is
  // what the rules must describe — the rules-completeness audit calls out any feature
  // configured in this modal but missing from the rules (see `auditRules`).
  ui.declareFacts({ modes: list.map((f) => ({ id: f.id, name: f.name, kind: f.variant, cost: f.cost })) });
  const boosts = new Set<string>(); // active bet-boost ids
  const activation = opts.activation ?? 'multi';
  const blocksBuy = opts.activationBlocksBuy ?? false;
  const disposers: Array<() => void> = [];
  // Слушатели open/close каталога — для внешнего pixi bonus-компонента (свап стейтов).
  const openListeners = new Set<(open: boolean) => void>();

  const host = document.createElement('div');
  host.className = 'bfm-root';
  // Bonus Catalog palette — ТОЧНЫЕ токены Figma (BonusCard 34:2883): Yellow #FCFF36 /
  // текст на жёлтом Dark-Olive #434400 / Black-70 карточка / White-30 рамка / White-10 внутр.
  const vars: Record<string, string> = {
    '--accent': '#fcff36', '--accent-text': '#434400',
    '--surface': 'rgba(0,0,0,.7)', '--surface-alt': 'rgba(255,255,255,.1)',
    '--border': 'rgba(255,255,255,.3)',
    '--text': '#ffffff', '--text-dim': 'rgba(255,255,255,.6)',
    '--font': ui.theme.type.family,
  };
  for (const [k, v] of Object.entries(vars)) host.style.setProperty(k, v);

  host.innerHTML = `
    <div class="bfm-backdrop" data-close></div>
    <div class="bfm-panel" role="dialog" aria-modal="true">
      <div class="bfm-fit" id="bfm-fit">
        <h2 class="bfm-title" data-t="Bonus Catalog">${esc(tr('Bonus Catalog'))}</h2>
        <div class="bfm-body">
          <div class="bfm-cards" id="bfm-cards"></div>
          <div class="bfm-side">
            <div class="bfm-bet">
              <div class="bfm-betbox"><span class="bfm-betlabel" data-t="Bet">${esc(tr('Bet'))}</span><b id="bfm-betval">—</b></div>
              <div class="bfm-betsteps">
                <button class="bfm-step" id="bfm-minus" aria-label="Decrease">−</button>
                <button class="bfm-step" id="bfm-plus" aria-label="Increase">+</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>`;

  const style = document.createElement('style');
  style.textContent = BFM_CSS;
  host.appendChild(style);
  document.body.appendChild(host);

  const $ = <T extends Element>(sel: string): T => host.querySelector(sel) as T;
  const panel = $<HTMLElement>('.bfm-panel');
  const fitEl = $<HTMLElement>('#bfm-fit');
  const cardsEl = $<HTMLElement>('#bfm-cards');
  const betValEl = $<HTMLElement>('#bfm-betval');

  // Confirmation is IN-CARD (Figma): tapping ACTIVATE expands the card to show the bonus
  // description + ✕/CONFIRM, so a play never commits on a single click. The old universal
  // confirm dialog (`showConfirm`) is no longer used here.

  // Fit the modal to the viewport by UNIFORM scale (proportional — never squished).
  const layout = (): void => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    // Bonus Catalog: до 3 карточек в ряд (макет). Узкий экран — 2.
    const cols = Math.min(vw >= 760 ? 3 : 2, list.length);
    cardsEl.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    // ширина = сетка карточек + правая колонка (side 210 + gap 28); капим по экрану.
    // Карточка Figma = 290px (крупная); сетка масштабируется вниз при нехватке места.
    const SIDE = 238;
    const CARD = 290;
    const cardsW = cols * CARD + (cols - 1) * 18;
    const fitW = Math.min(vw * 0.96, cardsW + SIDE);
    fitEl.style.width = `${fitW}px`;
    fitEl.style.transform = 'none';
    const natH = fitEl.offsetHeight; // natural height at this width (forces layout)
    const s = Math.min(1, (vh * 0.95) / natH);
    fitEl.style.transform = `translateX(-50%) scale(${s})`;
    panel.style.width = `${Math.ceil(fitW * s)}px`;
    panel.style.height = `${Math.ceil(natH * s)}px`;
  };

  // Which card is expanded to its confirm state (Figma «Activated» card). null = all default.
  // Tap ACTIVATE → expand (shows description + ✕ Cancel + CONFIRM inside the card); the
  // universal confirm dialog is no longer used — confirmation happens IN the card.
  let expandedId: string | null = null;

  // ── render the cards (re-run on bet/locale/boost/expand change) ─────────────
  const renderCards = (): void => {
    const bet = opts.getBet ? opts.getBet() : ui.bet.get();
    const cur = ui.bet.currency.get();
    cardsEl.innerHTML = list
      .map((f) => {
        const active = boosts.has(f.id);
        const expanded = expandedId === f.id;
        // A buy is blocked when a boost forbids it OR its total price exceeds the
        // configured cap (the bet stays usable for normal spins — only buy is off).
        const overCap = opts.maxBuyCost != null && f.cost * bet > opts.maxBuyCost;
        const buyBlocked = f.variant === 'buy' && ((blocksBuy && boosts.size > 0) || overCap);
        const price = f.variant === 'buy' ? money(f.cost * bet, cur) : `+${money(f.cost * bet, cur)}`;
        const img = f.image ? ` style="background-image:url('${f.image}')"` : '';
        const desc = f.description ? `<p class="bfm-desc">${esc(tr(f.description))}</p>` : '';
        // expanded (Figma Activated): описание + [✕ cancel][CONFIRM]; default: [ACTIVATE]
        const buttons = expanded
          ? `<div class="bfm-but-row">
               <button class="bfm-cancel" data-cancel="${f.id}" aria-label="Cancel">✕</button>
               <button class="bfm-action bfm-confirm" data-confirm="${f.id}" data-variant="${f.variant}">${esc(tr('Confirm'))}</button>
             </div>`
          : `<div class="bfm-but-w">
               <button class="bfm-action bfm-action--${f.variant}${active ? ' is-active' : ''}${buyBlocked ? ' is-blocked' : ''}" data-activate="${f.id}"${buyBlocked ? ' disabled' : ''}>${esc(f.variant === 'buy' ? tr('Buy') : active ? tr('Activated') : tr('Activate'))}</button>
             </div>`;
        return `
        <div class="bfm-cell">
          <div class="bfm-card${expanded ? ' is-expanded' : ''}">
            <div class="bfm-cardinner">
              <div class="bfm-cardimg"${img}></div>
              <div class="bfm-cardbody">
                <span class="bfm-name">${esc(tr(f.name))}</span>
                ${expanded ? desc : ''}
                <b class="bfm-price">${esc(price)}</b>
              </div>
              ${buttons}
            </div>
          </div>
        </div>`;
      })
      .join('');
    betValEl.textContent = money(bet, cur);
    // ACTIVATE → раскрыть карточку
    cardsEl.querySelectorAll<HTMLButtonElement>('[data-activate]').forEach((b) => {
      b.addEventListener('click', () => { expandedId = b.dataset.activate!; renderCards(); });
    });
    // ✕ → свернуть
    cardsEl.querySelectorAll<HTMLButtonElement>('[data-cancel]').forEach((b) => {
      b.addEventListener('click', () => { expandedId = null; renderCards(); });
    });
    // CONFIRM → коммит покупки/активации
    cardsEl.querySelectorAll<HTMLButtonElement>('[data-confirm]').forEach((b) => {
      b.addEventListener('click', () => onConfirm(b.dataset.confirm!, b.dataset.variant as FeatureSpec['variant']));
    });
    layout();
  };

  const onConfirm = (id: string, variant: FeatureSpec['variant']): void => {
    const f = list.find((x) => x.id === id);
    const bet = opts.getBet ? opts.getBet() : ui.bet.get();
    if (variant === 'boost') {
      // 'single' keeps at most one boost on. Activation NEVER closes the modal.
      const wasActive = boosts.has(id);
      if (activation === 'single') boosts.clear();
      if (wasActive) boosts.delete(id);
      else boosts.add(id);
      ui.bus.emit('cardActivated', { id });
      expandedId = null;
      renderCards();
      opts.onActivate?.([...boosts], id, boosts.has(id));
    } else {
      if (blocksBuy && boosts.size > 0) return; // blocked while a boost is active
      const cost = (f?.cost ?? 0) * bet;
      if (opts.maxBuyCost != null && cost > opts.maxBuyCost) return; // over the buy-cost cap
      ui.bus.emit('cardActivated', { id });
      expandedId = null;
      close();
      opts.onBuy?.(id, cost);
    }
  };

  // ── bet steppers ────────────────────────────────────────────────────────────
  $<HTMLButtonElement>('#bfm-minus').addEventListener('click', () => ui.betStepper.dec());
  $<HTMLButtonElement>('#bfm-plus').addEventListener('click', () => ui.betStepper.inc());
  disposers.push(ui.bet.value.subscribe(() => renderCards())); // prices follow the bet

  // ── open / close ────────────────────────────────────────────────────────────
  // While the modal is open, LOCK the HUD (ref-counted) so pointer/keyboard input can't fall
  // through the overlay onto the spin/bet controls underneath; unlock on close.
  const open = (): void => {
    if (host.classList.contains('open')) return;
    renderCards();
    host.classList.add('open');
    ui.lock();
    openListeners.forEach((fn) => fn(true));
    // The tap that OPENED the modal (bonus button) can fall straight through onto a
    // card that lands under the pointer — most visible in portrait, where the bonus
    // button and the modal's cards overlap — instantly firing a card's confirm. Guard
    // by disabling card hit-testing until the opening gesture is well over.
    host.classList.add('bfm-opening');
    setTimeout(() => host.classList.remove('bfm-opening'), 350);
  };
  const close = (): void => {
    if (!host.classList.contains('open')) return;
    host.classList.remove('open');
    ui.unlock();
    openListeners.forEach((fn) => fn(false));
  };
  host.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
  // bonus-кнопка — TOGGLE: повторный тап закрывает каталог (как settings/bet).
  disposers.push(ui.on('buttonActivated', ({ id }) => {
    if (id !== 'bonus') return;
    if (host.classList.contains('open')) close(); else open();
  }));
  const onResize = (): void => { if (host.classList.contains('open')) layout(); };
  window.addEventListener('resize', onResize);

  // ── locale ──────────────────────────────────────────────────────────────────
  disposers.push(
    ui.locale.subscribe(() => {
      host.querySelectorAll<HTMLElement>('[data-t]').forEach((n) => (n.textContent = tr(n.dataset.t!)));
      renderCards();
    }),
  );

  renderCards();

  const dispose = (): void => {
    window.removeEventListener('resize', onResize);
    if (host.classList.contains('open')) ui.unlock(); // don't leak the lock on teardown-while-open
    for (const d of disposers.splice(0)) d();
    openListeners.clear();
    host.remove();
  };

  return {
    dispose,
    open,
    close,
    get isOpen() { return host.classList.contains('open'); },
    /** Subscribe to open/close changes (для внешней bonus-кнопки). Returns unsubscribe. */
    onOpenChange(fn: (open: boolean) => void): () => void {
      openListeners.add(fn);
      return () => openListeners.delete(fn);
    },
  };
}

const BFM_CSS = `
.bfm-root { position: fixed; inset: 0; z-index: 11000; display: grid; place-items: center; font-family: var(--font); opacity: 0; pointer-events: none; transition: opacity .18s ease; }
.bfm-root.open { opacity: 1; pointer-events: auto; }
/* During the opening gesture: the backdrop catches input but cards don't, so the
   tap that opened the modal can't fall through onto a card (portrait overlap fix). */
.bfm-root.bfm-opening .bfm-cards, .bfm-root.bfm-opening .bfm-bet { pointer-events: none; }
.bfm-backdrop { position: absolute; inset: 0; background: rgba(8,6,4,0); transition: background .4s ease; }
.bfm-root.open .bfm-backdrop { background: rgba(0,0,0,.7); }
.bfm-x { position: absolute; top: 18px; right: 22px; width: 46px; height: 46px; border-radius: 999px; border: 0; background: rgba(18,14,10,.82); color: #fff; font-size: 18px; cursor: pointer; display: grid; place-items: center; box-shadow: 0 6px 18px rgba(0,0,0,.45); z-index: 2; transition: transform .12s, background .12s; }
.bfm-x:hover { transform: scale(1.08); background: rgba(18,14,10,.95); }
.bfm-root *, .bfm-root *::before, .bfm-root *::after { box-sizing: border-box; }
.bfm-panel { position: relative; transform: translateY(8px) scale(.985); transition: transform .18s ease; }
.bfm-root.open .bfm-panel { transform: none; }
.bfm-fit { position: absolute; top: 0; left: 50%; transform: translateX(-50%); transform-origin: top center; }
.bfm-title { display: none; }
/* Bonus Catalog layout: title сверху, ниже — cards слева + side-колонка (CLOSE, BET) справа. */
.bfm-body { display: flex; align-items: flex-start; gap: 28px; }
.bfm-cards { flex: 1 1 auto; }
.bfm-side { flex: none; width: 210px; display: flex; flex-direction: column; align-items: center; gap: 28px; padding-top: 4px; }
.bfm-close { display: inline-flex; align-items: center; gap: 10px; padding: 12px 26px; border-radius: 999px; border: 2px solid rgba(255,255,255,.35); background: rgba(0,0,0,.5); color: #fff; font-size: 16px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; cursor: pointer; transition: transform .12s, background .12s; }
.bfm-close:hover { transform: scale(1.05); background: rgba(0,0,0,.7); }
.bfm-close-x { font-size: 18px; }
.bfm-betsteps { display: flex; gap: 14px; margin-top: 8px; }
.bfm-bet { display: flex; flex-direction: column; align-items: center; gap: 4px; margin: 0; }
.bfm-betbox { min-width: 160px; padding: 10px 22px; border-radius: 14px; background: transparent; border: 0; display: flex; flex-direction: column; align-items: center; line-height: 1.1; }
.bfm-betlabel { font-size: 12px; font-weight: 700; color: var(--text-dim); text-transform: uppercase; letter-spacing: 1px; }
.bfm-betbox b { font-size: 24px; color: var(--text); }
.bfm-step { flex: none; width: 54px; height: 54px; border-radius: 999px; border: 0; background: #fff; color: #161616; font-size: 28px; font-weight: 800; cursor: pointer; display: grid; place-items: center; line-height: 1; transition: transform .1s, filter .12s; box-shadow: 0 4px 12px rgba(0,0,0,.3); }
.bfm-step:hover { filter: brightness(.92); }
.bfm-step:active { transform: scale(.92); }
/* Карточки фикс-высоты (cardinner height), поэтому раскрытие ACTIVATE не меняет габарит —
   растёт только внутренняя панель (cover ужимается). Сетка ровная. */
.bfm-cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; align-items: start; flex: 1 1 auto; }
.bfm-cell { display: flex; flex-direction: column; min-width: 0; }
/* Карточка — точь Figma BonusCard: внешний black/70 + white/30 border, rounded-40, pad-5;
   внутренний слой white/10 + white/30 border-2, rounded-35. */
/* Карточка ФИКСИРОВАННОЙ высоты — ACTIVATE не меняет габарит. Внутри cover гибкий
   (flex): при раскрытии он ужимается, освобождая место под описание, а внешний размер
   карточки остаётся прежним (Figma: inner h-фикс, cover flex-1). */
.bfm-card { background: var(--surface); border: 1px solid var(--border); border-radius: 40px; padding: 5px; overflow: hidden; }
.bfm-cardinner { height: 430px; box-sizing: border-box; background: var(--surface-alt); border: 2px solid var(--border); border-radius: 35px; overflow: hidden; box-shadow: 0 0 3.7px rgba(0,0,0,.89); display: flex; flex-direction: column; }
.bfm-cardimg { width: 100%; flex: 1 1 auto; min-height: 0; background-size: cover; background-position: center; background-color: var(--surface-alt); background-image: linear-gradient(135deg, #e7ebf2, #cfd6e2); }
.bfm-strip { display: none; }
.bfm-cardbody { flex: none; padding: 10px; text-align: center; display: flex; flex-direction: column; gap: 10px; align-items: center; }
.bfm-name { display: block; font-size: 18px; font-weight: 700; color: var(--text); text-transform: uppercase; line-height: 20px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.bfm-price { display: block; font-size: 30px; font-weight: 700; line-height: 34px; color: var(--text); }
/* Раскрытая карточка (Figma Activated): описание Inter Regular 12px + ряд [✕][CONFIRM]. */
.bfm-desc { margin: 0; font-size: 12px; font-weight: 400; line-height: normal; color: var(--text); text-transform: none; }
.bfm-but-row { flex: none; display: flex; gap: 10px; align-items: center; padding: 0 15px 15px; }
.bfm-cancel { flex: none; width: 40px; height: 40px; box-sizing: border-box; border-radius: 28px; border: 0; background: var(--accent); color: var(--accent-text); font-size: 18px; font-weight: 700; cursor: pointer; display: grid; place-items: center; transition: transform .1s, filter .12s; }
.bfm-cancel:hover { filter: brightness(1.06); }
.bfm-cancel:active { transform: scale(.94); }
/* CONFIRM — та же высота 40px что ✕, чтобы стоять с ним в линию (Figma). */
.bfm-confirm { flex: 1 1 auto; height: 40px; box-sizing: border-box; padding: 0 5px; }
/* ACTIVATE — Figma: Yellow #FCFF36, текст Dark-Olive #434400, rounded-20, 18px uppercase. */
.bfm-but-w { flex: none; padding: 0 15px 15px; }
.bfm-action { display: block; width: 100%; padding: 10px 5px; border-radius: 20px; border: 1px solid var(--border); background: var(--accent); color: var(--accent-text); font-size: 18px; font-weight: 700; text-transform: uppercase; cursor: pointer; transition: transform .1s, filter .12s; white-space: nowrap; }
.bfm-action:hover { filter: brightness(1.06); }
.bfm-action:active { transform: scale(.96); }
.bfm-action.is-active { filter: brightness(.85); }
.bfm-action.is-blocked, .bfm-action[disabled] { opacity: .4; cursor: not-allowed; }
.bfm-action.is-blocked, .bfm-action:disabled { opacity: .38; cursor: not-allowed; box-shadow: none; }
.bfm-action.is-blocked:hover, .bfm-action:disabled:hover { background: var(--surface); }
`;
