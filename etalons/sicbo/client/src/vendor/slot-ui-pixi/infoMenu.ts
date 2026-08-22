// The info menu (☰ → Settings · Paytable · Rules) as the library's ONE polished design:
// a white card with gold accents + section rules, driven ENTIRELY by the `UISpec.menu`
// (banner · settings · paytable · rules) and wired to the live `OpenUI` state. It renders
// the full modular BlockSpec palette, is fully localized (every string flows through
// `ui.t`, re-translates on locale change), and is a DOM overlay over the canvas (works in
// every browser + the Stake iframe). `mountHud` mounts it by default; pass `menu:false` to
// supply your own instead. The look matches the Open-UI Figma reference.

import type { Application } from 'pixi.js';
import {
  INFO_MENU_CSS,
  INFO_MENU_VARS,
  LOCALE_LABELS,
  auditRules,
  escapeHtml as esc,
  factsVars,
  renderBlocksHtml as renderBlocks,
  renderRulesAuditHtml,
  type BlockSpec,
  type MenuSpec,
  type OpenUI,
} from '../slot-ui-core/index';

// The block renderer + the stylesheet live in CORE (`spec/rulesHtml.ts`) so the
// SAME code that draws this menu in-game powers external tooling (the stakeplate
// rules editor's WYSIWYG preview) — one source of truth for how a block looks.
/* removed local renderBlocks — see @open-slot-ui/core renderBlocksHtml */
/** Render the game's extra settings blocks (label-left / control-right, with a hint). */
function renderSettingBlock(b: BlockSpec, tr: (s: string) => string): string {
  const hint = 'hint' in b && b.hint ? `<div class="ohm-hint">${esc(tr(b.hint))}</div>` : '';
  const label = 'label' in b && b.label ? esc(tr(b.label)) : '';
  switch (b.kind) {
    case 'toggle':
      return `<div class="ohm-setting"><label class="ohm-row ohm-check"><span>${label}</span><span class="ohm-ctl"><input data-set="${b.id}" type="checkbox"${b.on ? ' checked' : ''}></span></label>${hint}</div>`;
    case 'slider':
      return `<div class="ohm-setting"><label class="ohm-row"><span>${label}</span><input data-set="${b.id}" type="range" min="0" max="1" step="0.01" value="${b.initial ?? 1}"></label>${hint}</div>`;
    case 'select': {
      const opts = b.options.map((o, i) => `<option value="${esc(o.value)}"${i === (b.index ?? 0) ? ' selected' : ''}>${esc(tr(o.label))}</option>`).join('');
      return `<div class="ohm-setting"><label class="ohm-row"><span>${label}</span><select data-set="${b.id}">${opts}</select></label>${hint}</div>`;
    }
    default:
      return '';
  }
}

/** Handle returned by `mountInfoMenu`: teardown + (in manual mode) open/close controls. */
export interface InfoMenuHandle {
  /** Leak-free teardown. */
  dispose: () => void;
  /** Open the overlay (manual mode only — no-op when driven by settingsPanel). */
  open: () => void;
  /** Close the overlay (manual mode only). */
  close: () => void;
}

/** Options for {@link mountInfoMenu}. */
export interface InfoMenuOptions {
  /**
   * `false` (default): the overlay opens/closes off `ui.settingsPanel` (the canvas ☰).
   * `true`: DON'T bind to the panel — the host drives it via the returned open()/close()
   * (e.g. a custom Pixi menu owns ☰ and opens this only for the Rules sub-page).
   */
  manual?: boolean;
  /**
   * Дополнительная панель игры — своя вкладка в рельсе рядом с Paytable и
   * Settings. Библиотека не знает, что в ней: игра отдаёт заголовок, иконку и
   * функцию, рисующую содержимое в HTML (перерисовывается на каждом открытии).
   *
   * Нужна там, где данные принадлежат ИГРЕ, а не библиотеке. В mines это
   * история раундов: fairness-режим запрещает серверу хранить cross-round
   * context, поэтому историю ведёт клиент.
   */
  extraPane?: {
    id: string;
    title: string;
    /** SVG-иконка кнопки в рельсе (как infoIcon/gearIcon). */
    icon: string;
    /** Вернуть HTML содержимого. Зовётся при каждом открытии меню. */
    render: () => string;
  };
}

/**
 * Mount the info menu overlay for a booted `OpenUI`. Reads `ui.spec.menu`. By default
 * opens/closes with `ui.settingsPanel` (the canvas ☰ drives it); with `{ manual: true }`
 * the host drives it via the returned `open()`/`close()`. Returns a leak-free handle.
 */
export function mountInfoMenu(app: Application, ui: OpenUI, options: InfoMenuOptions = {}): InfoMenuHandle {
  const menu: MenuSpec = ui.spec?.menu ?? {};
  const extra = options.extraPane;
  const tr = (k: string): string => ui.t(k);
  const disposers: Array<() => void> = [];

  const host = document.createElement('div');
  host.className = 'ohm-root';
  // Info-menu (HTML) шрифт — Inter (Figma). Тема-шрифт (Oswald, для pixi-HUD) остаётся
  // фоллбеком, но НЕ перекрывает Inter: иначе меню рендерится Oswald'ом.
  const vars: Record<string, string> = { ...INFO_MENU_VARS, '--font': `'Inter', ${ui.theme.type.family}` };
  for (const [k, v] of Object.entries(vars)) host.style.setProperty(k, v);

  // Built-in settings: Sound · Language (2+ locales) · Quick spin (turbo). Plus any custom
  // `menu.settings` the game supplied — all label-left / control-right, each with a hint.
  const locales = ui.spec?.locale ? Array.from(new Set([ui.spec.locale.locale, ...Object.keys(ui.spec.locale.messages)])) : [];
  const langRow = locales.length > 1
    ? `<div class="ohm-setting"><label class="ohm-row"><span>${tr('Language')}</span><select id="ohm-lang">${locales.map((c) => `<option value="${c}"${c === ui.locale.get() ? ' selected' : ''}>${esc(LOCALE_LABELS[c] ?? c)}</option>`).join('')}</select></label></div>`
    : '';
  const turbo = ui.turbo;
  const cap = (m: string): string => m.charAt(0).toUpperCase() + m.slice(1);
  const turboCtl = turbo.modeCount <= 2
    ? `<span class="ohm-ctl"><input id="ohm-turbo" type="checkbox"></span>`
    : `<span class="ohm-ctl"><div class="ohm-segmented" id="ohm-turbo-seg">${turbo.modes.map((m, i) => `<button class="ohm-seg" data-i="${i}">${esc(tr(cap(m)))}</button>`).join('')}</div></span>`;
  const customSettings = (menu.settings ?? []).map((b) => renderSettingBlock(b, tr)).join('');

  // Sound config: a toggle only, + a master Volume slider, or + Music & Effects sliders.
  const soundMode = menu.sound ?? 'sliders';
  const volRow = (id: string, label: string, hint: string, val: number): string =>
    `<div class="ohm-setting"><label class="ohm-row"><span>${esc(tr(label))}</span><input class="ohm-slider" data-vol="${id}" type="range" min="0" max="1" step="0.01" value="${val}"></label><div class="ohm-hint">${esc(tr(hint))}</div></div>`;
  const soundSliders =
    soundMode === 'master'
      ? volRow('master', 'Volume', 'Adjust the overall game volume.', ui.sfxSlider.value.get())
      : soundMode === 'sliders'
        ? volRow('music', 'Music', 'Adjust the background music volume.', ui.musicSlider.value.get()) +
          volRow('sfx', 'Effects', 'Adjust the sound-effects volume.', ui.sfxSlider.value.get())
        : '';

  // ── rules-completeness audit ("forgotten declarations") ─────────────────────
  // The declared game facts (spec.facts + runtime declareFacts — the buy-feature
  // modal auto-declares its features) are audited against the rules blocks. Every
  // missing REQUIRED declaration (a mode's RTP / max win, an undescribed feature)
  // and each HIGHLY RECOMMENDED one (free-spins count + retrigger, legal, controls)
  // renders as an explicit warning card at the top of the Rules section — a
  // forgotten declaration is stated when the rules open, never silent.
  // Rules copy translates WITH the facts interpolation vars: `{{rtp.base}}`-style
  // tokens (see `factsVars`) resolve from the LIVE declared facts + the game info,
  // so a stated RTP / max win / price can never drift from the configuration. The
  // audit resolves through the exact same function — copy is audited AS RENDERED.
  const rulesTr = (): ((s: string) => string) => {
    const vars = factsVars(ui.facts.get(), { 'game.name': ui.gameInfo.name ?? '', 'game.version': ui.gameInfo.version ?? '' });
    return (s: string): string => ui.t(s, vars);
  };
  const auditCardHtml = (trr: (s: string) => string): string => {
    if (!menu.rules?.length) return '';
    // Audit the WHOLE info pane's rules content — the Rules section AND the User
    // interface guide (both are player-facing rules shown together), so a controls
    // guide in `menu.guide` satisfies the "describe controls" check.
    const allRules = [...menu.rules, ...(menu.guide ?? [])];
    return renderRulesAuditHtml(auditRules(ui.facts.get(), allRules, { resolve: trr }), tr);
  };
  const rulesInnerHtml = (): string => {
    if (!menu.rules) return '';
    const trr = rulesTr();
    return auditCardHtml(trr) + renderBlocks(menu.rules, trr, ui.facts.get());
  };

  const paytableHtml = menu.paytable ? renderBlocks(menu.paytable, tr, ui.facts.get()) : '';
  const rulesHtml = rulesInnerHtml();
  // "User interface guide" — its own scrolling section (control descriptions). Titled
  // only when the game supplied guide blocks.
  const uiGuideHtml = menu.guide?.length
    ? `<h2 class="ohm-panetitle">${tr('User interface guide')}</h2>${renderBlocks(menu.guide, tr, ui.facts.get())}`
    : '';
  // ИКОНКИ ВКЛАДОК УБРАНЫ вместе с самими вкладками (см. комментарий ниже).
  // Здесь жили `infoIcon` («i», ui/info.webp) и `gearIcon` (шестерёнка,
  // ui/settings_info.webp) — оба готовым артом паковки вместо векторных SVG.
  // Вернутся вместе с рельсом, если вкладки когда-нибудь понадобятся снова.

  // РУЧНАЯ ПРАВКА (см. баннер вверху файла): ВКЛАДКИ РЕЛЬСА УБРАНЫ, осталась
  // только кнопка закрытия.
  //
  // Окно открывается строкой GAME INFO и по смыслу показывает ПРАВИЛА — одним
  // сплошным скроллом, как в Mutiny. Вкладка настроек здесь дублировала
  // собственное меню игры (☰ → MUSIC / SOUND EFFECTS / SPACEBAR TO SPIN, см.
  // gameMenu.ts): игрок получал две панели с одними и теми же переключателями и
  // мог не найти нужную.
  //
  // Панель `data-pane="settings"` в разметке ОСТАВЛЕНА намеренно: её слушатели
  // (звук, слайдеры громкости, язык, quick spin) вешаются ниже безусловно и без
  // разметки промахнулись бы в null. Она просто недостижима без своей кнопки.
  host.innerHTML = `
    <div class="ohm-backdrop" data-close></div>
    <div class="ohm-main">
      <div class="ohm-content">
        <div class="ohm-pane is-active" data-pane="info">
          ${paytableHtml ? `<h2 class="ohm-panetitle">${tr('Paytable')}</h2>${paytableHtml}` : ''}
          ${rulesHtml ? `${paytableHtml ? '' : `<h2 class="ohm-panetitle">${tr('Game rules')}</h2>`}<div class="ohm-rules" id="ohm-rules">${rulesHtml}</div>` : ''}
          ${uiGuideHtml}
        </div>
        <div class="ohm-pane" data-pane="settings">
          <h2 class="ohm-panetitle">${tr('Settings')}</h2>
          <div class="ohm-setting"><label class="ohm-row ohm-check"><span>${tr('Sound')}</span><span class="ohm-ctl"><input id="ohm-sound" type="checkbox" checked></span></label><div class="ohm-hint">${tr('Turn all game sound and music on or off.')}</div></div>
          ${soundSliders}
          ${langRow}
          <div class="ohm-setting"><div class="ohm-row ohm-check"><span>${tr('Quick spin')}</span>${turboCtl}</div><div class="ohm-hint">${tr('Speed up rounds by shortening the animation. The result is identical.')}</div></div>
          ${customSettings}
        </div>
        ${extra ? `<div class="ohm-pane" data-pane="${extra.id}"><h2 class="ohm-panetitle">${tr(extra.title)}</h2><div data-extra-body></div></div>` : ''}
      </div>
      <div class="ohm-rail is-closeonly">
        <button class="ohm-railbtn ohm-railclose" data-close aria-label="Close"><img src="${import.meta.env.BASE_URL}ui/close_icon.webp" alt=""></button>
      </div>
    </div>`;
  const style = document.createElement('style');
  style.textContent = INFO_MENU_CSS;
  host.appendChild(style);
  document.body.appendChild(host);

  const $ = <T extends Element>(sel: string): T | null => host.querySelector(sel) as T | null;

  // Sound → mute state.
  const sound = $<HTMLInputElement>('#ohm-sound');
  if (sound) {
    sound.checked = !ui.muted.get();
    sound.addEventListener('change', () => ui.setMuted(!sound.checked));
    disposers.push(ui.muted.subscribe((m) => { sound.checked = !m; }));
  }
  // Volume sliders → the music / sfx slider controls (which emit valueChanged for the host).
  host.querySelectorAll<HTMLInputElement>('[data-vol]').forEach((el) => {
    const which = el.dataset.vol!;
    el.addEventListener('input', () => {
      const v = Number(el.value);
      if (which === 'music') ui.musicSlider.setNormalized(v);
      else if (which === 'sfx') ui.sfxSlider.setNormalized(v);
      else { ui.musicSlider.setNormalized(v); ui.sfxSlider.setNormalized(v); } // master
    });
    // reflect external changes (e.g. mute drops both to 0, unmute restores).
    const src = which === 'music' ? ui.musicSlider : ui.sfxSlider;
    disposers.push(src.value.subscribe((v) => { el.value = String(v); }));
  });
  // Language.
  const lang = $<HTMLSelectElement>('#ohm-lang');
  if (lang) lang.addEventListener('change', () => ui.setLocale(lang.value));
  // Quick spin → turbo.
  if (turbo.modeCount <= 2) {
    const tg = $<HTMLInputElement>('#ohm-turbo');
    if (tg) {
      tg.checked = turbo.isOn;
      tg.addEventListener('change', () => turbo.set(tg.checked));
      disposers.push(turbo.index.subscribe(() => { tg.checked = turbo.isOn; }));
    }
  } else {
    const segs = Array.from(host.querySelectorAll<HTMLButtonElement>('.ohm-seg'));
    segs.forEach((b) => b.addEventListener('click', () => turbo.setIndex(Number(b.dataset.i))));
    const sync = (): void => segs.forEach((b, i) => b.classList.toggle('active', i === turbo.index.get()));
    disposers.push(turbo.index.subscribe(sync));
    sync();
  }
  // Custom settings → emit events the host can handle.
  host.querySelectorAll<HTMLElement>('[data-set]').forEach((el) => {
    const id = el.dataset.set!;
    if (el instanceof HTMLInputElement && el.type === 'checkbox') el.addEventListener('change', () => ui.bus.emit('toggled', { id, on: el.checked }));
    else if (el instanceof HTMLInputElement && el.type === 'range') el.addEventListener('input', () => ui.bus.emit('valueChanged', { id, value: Number(el.value) }));
    else if (el instanceof HTMLSelectElement) el.addEventListener('change', () => ui.bus.emit('optionSelected', { id, value: el.value, index: el.selectedIndex }));
  });

  // ✕ и клик по backdrop. В manual-режиме панель отвязана от меню, поэтому закрываем
  // САМИ (setOpen(false) объявлен ниже — closeSelf проксирует к нему); иначе — через панель.
  const closeSelf = (): void => { if (options.manual) setOpen(false); else ui.settingsPanel.closePanel(); };
  host.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => closeSelf()));

  // Rail: switch the active pane (one section on screen at a time). Each pane carries
  // its own scrolling titles, so there's no fixed header to retitle.
  const panes = Array.from(host.querySelectorAll<HTMLElement>('.ohm-pane'));
  const railBtns = Array.from(host.querySelectorAll<HTMLButtonElement>('.ohm-railbtn[data-pane]'));
  const showPane = (name: string): void => {
    panes.forEach((p) => p.classList.toggle('is-active', p.dataset.pane === name));
    railBtns.forEach((b) => b.classList.toggle('is-active', b.dataset.pane === name));
    // Reset scroll to top when switching to a pane.
    const active = panes.find((p) => p.dataset.pane === name);
    if (active) active.scrollTop = 0;
  };
  railBtns.forEach((b) => b.addEventListener('click', () => showPane(b.dataset.pane!)));

  // Re-translate the whole menu on locale change (labels + the rules body), and
  // re-audit + re-render the rules whenever the declared game facts change (e.g.
  // the buy-feature modal declaring its features after this menu mounted).
  const refreshRules = (): void => {
    const rulesEl = host.querySelector('#ohm-rules');
    if (rulesEl && menu.rules) rulesEl.innerHTML = rulesInnerHtml();
  };
  disposers.push(
    ui.locale.subscribe(() => {
      // Guard был на `.ohm-body`, которого в текущей разметке НЕТ (панели = .ohm-content/
      // .ohm-pane) — handler не срабатывал, меню не переводилось. Перерисовываем rules-тело
      // (#ohm-rules) и синхронизируем выбранный язык в select.
      refreshRules();
      if (lang) lang.value = ui.locale.get();
    }),
    ui.facts.subscribe(refreshRules),
  );

  // Open/close. While open, LOCK the HUD (ref-counted) so pointer/keyboard input can't fall
  // through the menu overlay onto the controls underneath. In default mode this follows the
  // settings-panel state (☰); in manual mode the host drives it via the returned open/close.
  let menuLocked = false;
  const setOpen = (isOpen: boolean): void => {
    host.classList.toggle('open', isOpen);
    // Содержимое доп-панели перерисовываем на КАЖДОМ открытии: там живые данные
    // игры (в mines — история раундов), и кэшировать их нельзя.
    if (isOpen && extra) {
      const body = $<HTMLElement>('[data-extra-body]');
      if (body) body.innerHTML = extra.render();
    }
    if (isOpen) showPane('info');
    if (isOpen && !menuLocked) { ui.lock(); menuLocked = true; }
    else if (!isOpen && menuLocked) { ui.unlock(); menuLocked = false; }
  };
  if (!options.manual) {
    disposers.push(ui.settingsPanel.state.subscribe(() => setOpen(ui.settingsPanel.isOpen)));
  }

  return {
    dispose: () => {
      for (const d of disposers.splice(0)) d();
      if (menuLocked) { ui.unlock(); menuLocked = false; } // don't leak the lock on teardown
      host.remove();
    },
    open: () => setOpen(true),
    close: () => setOpen(false),
  };
}
