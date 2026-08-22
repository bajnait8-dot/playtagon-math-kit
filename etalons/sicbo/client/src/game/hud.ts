import type { Application } from 'pixi.js';
import gsap from 'gsap';
import { mountHud, type BootedHud } from '../vendor/slot-ui-pixi/index';
import { ButtonControl, defaultLayoutConfig, formatAmount, type OpenUI } from '../vendor/slot-ui-core/index';
import { valueLineView } from './valueLineView';
import { loadUiIcons } from './uiIcons';
import { sicBoSpinSkin, loadSpinArt } from './spinSkin';
import { buildMenu, GAME_NAME, GAME_VERSION } from './rules';
import { mountAutoplayPicker } from './autoplayPicker';
import { mountGameMenu, loadGameMenuArt } from './gameMenu';
import { bannerView } from './bannerView';
import { phaseButtonView, loadPhaseButtonArt } from './phaseButton';
import { betPickerButtonView, loadBetPickerArt } from './betPickerButton';
import { loadChipSpine } from './table/chipSpine';
import { limitsPlateView } from './limitsPlate';
import { roundStripView, type RoundStripView } from './roundStrip';
import { mountFairnessWindow } from './fairnessWindow';
import { renderHistoryHtml, HISTORY_ICON } from './history';
import { mountHistoryPopover, type HistoryPopover } from './historyPopover';
import { ReadoutControl } from '../vendor/slot-ui-core/index';
import { SicBoTableControl } from './table/SicBoTableControl';
import { SicBoTableView } from './table/SicBoTableView';
import type { SicBoBetType } from '../../../server/model/types.js';
import type { PFService } from './pf';

/** Кнопки фазы результата. SpinControl моделирует петлю ОДНОЙ кнопки, поэтому
 *  на него садится только PLAY, а эти две — обычные ButtonControl. */
export const NEW_BET_ID = 'new-bet';
export const REBET_ID = 'rebet';
/** Кнопки фазы ставок. */
export const CLEAR_ID = 'clear-bets';
export const UNDO_ID = 'undo-bet';
/** Плашки слева от стола — тоже контролы, а не свободные спрайты на сцене. */
export const LIMITS_ID = 'limits';
export const STRIP_ID = 'round-strip';

export interface SicBoHud {
  hud: BootedHud;
  ui: OpenUI;
  /** Состояние стола: суммы на зонах и подсветка выигравших. */
  table: SicBoTableControl;
  /** Отрисовка стола. */
  tableView: SicBoTableView;
  /** Вьюха статистики — из неё берут места прилёта кубиков. */
  stripView: RoundStripView | null;
  /** Сменить набор кнопок под фазу раунда. */
  setPhase(phase: 'betting' | 'rolling' | 'result'): void;
  /** Есть ли ставки на столе — от этого зависит доступность CLEAR/UNDO и PLAY. */
  setHasBets(has: boolean): void;
  /**
   * Представление отыгрывает раунд (кубики летят, объявляется выигрыш).
   * Пока true, кнопки результата НЕ показываются: раунд не закончен.
   */
  setBusy(busy: boolean): void;
  /** Промо-тикер над столом: живёт в фазе ставок, уступает плашке выигрыша. */
  setBannerActive(on: boolean): void;
}

export interface SicBoHudOptions {
  currency?: { code: string; decimals: number; symbol?: string; display?: 'code' | 'symbol'; position?: 'prefix' | 'suffix' };
  locale?: string;
  /** Ставки с платформы (`init.bets.normal`) в МИНОРНЫХ юнитах. */
  bets?: { min: number; max: number; default: number; list: number[] };
  /** Стартовое состояние звука — выбор игрока с интро-экрана. */
  startMuted?: boolean;
  /** Provably-fair сервис — окно проверки честности. */
  pf?: PFService;
  /** Тап по зоне стола. */
  onZoneTap?(type: SicBoBetType): void;
  /** Смахнуть фишку со стола — анимацию ведёт слой полёта в main. */
  onSweep?(at: { x: number; y: number }, amountMajor: number, delay: number): void;
  /** Выложить фишку выплаты на зону — тоже слой полёта. */
  onPayout?(at: { x: number; y: number }, denomMajor: number, delay: number, radius: number): void;
  /** Формат МИНОРНЫХ юнитов — плашка лимитов и фишки оперируют центами. */
  formatMinor?(minor: number): string;
}

const FONT = 'Oswald, system-ui, sans-serif';

/**
 * Единый вид строки «LABEL: сумма» для всех ридаутов нижней панели (Charter P7).
 * Без него библиотека рисует ридауты СВОИМ дефолтом (одометр с покруткой), и
 * BALANCE/BET выпадают из стиля серии.
 */
const valueLine = valueLineView({
  family: FONT,
  fill: 0xffffff,
  fontSize: 28,
  labelWeight: '200',
  amountWeight: '800',
  labelAlpha: 0.7,
  gap: 8,
  // Строка ужимается, если не влезает по ширине: узкий portrait + длинная
  // сумма иначе вылезали за край.
  maxWidthFrac: 0.46,
});

/** WIN — та же строка, но золотая: выигрыш должен читаться отдельно от баланса. */
const winLine = valueLineView({
  family: FONT,
  fill: 0xe8c46a,
  fontSize: 28,
  labelWeight: '200',
  amountWeight: '800',
  labelAlpha: 0.7,
  gap: 8,
  maxWidthFrac: 0.46,
});

export async function bootSicBoHud(app: Application, opts: SicBoHudOptions = {}): Promise<SicBoHud> {
  // Арт меню (тумблеры) грузим вместе с иконками: gameMenu читает текстуры
  // синхронно через Assets.get при построении — не готовы, и окно пустое.
  // Спайн фишек грузим ЗДЕСЬ, до сборки видов: и окно пикера, и кнопка строят
  // фишки синхронно, а Spine.from на незагруженный скелет бросает.
  const [icons] = await Promise.all([
    loadUiIcons(), loadGameMenuArt(), loadSpinArt(), loadPhaseButtonArt(), loadBetPickerArt(),
    loadChipSpine(),
  ]);

  const currency = opts.currency ?? { code: 'USD', decimals: 2, symbol: '$', display: 'symbol' as const, position: 'prefix' as const };

  // Стол — контрол ХОСТА: библиотека о нём не знает. `controls` регистрирует
  // его до сборки views, `extraViews` даёт ему вид (та же пара, что была у
  // сетки mines).
  const table = new SicBoTableControl({ id: 'table', layout: { anchor: 'center', offset: [60, -95] } });
  let tableView!: SicBoTableView;
  /**
   * Полная история ставок HTML-попапом — её открывает шеврон панели статистики
   * в ПОРТРЕТЕ (в ландшафте он раскрывает список внутри самой панели).
   * Монтируется ниже, после mountHud: нужен контейнер канваса.
   */
  let historyPopover: HistoryPopover | null = null;
  /** Вьюха статистики — из неё берут места прилёта кубиков. */
  let stripView: RoundStripView | null = null;
  // Баннер ПОД СТОЛОМ, строго по центру: над столом он занимал место, которое
  // нужнее зонам. К нижней кромке грида его прижимает сама вьюха (она знает
  // высоту стола после масштабирования), поэтому здесь только якорь центра.
  const banner = new ReadoutControl({ id: 'banner', kind: 'plain', layout: { anchor: 'center', offset: [0, -40] } });

  // Кнопки фаз. CLEAR/UNDO живут в фазе ставок, NEW BET/REBET — в результате;
  // переключает их setPhase().
  // Нижний ряд СПРАВА НАЛЕВО: spin · autoplay · undo · clear. Шаг 96 — диаметр
  // кнопки (80) плюс зазор. Всё через LayoutSpec, чтобы масштабировалось со
  // screen.scale и переезжало по ориентации, а не считалось руками.
  const clearBtn = new ButtonControl({ id: CLEAR_ID, label: 'CLEAR', layout: { anchor: 'bottom-right', offset: [-398, -120] } });
  const undoBtn = new ButtonControl({ id: UNDO_ID, label: 'UNDO', layout: { anchor: 'bottom-right', offset: [-302, -120] } });
  // NEW BET / REBET занимают РОВНО МЕСТО CLEAR и UNDO: те же offset, только
  // кнопки широкие (с подписью вместо иконки). Разводить их на свои координаты
  // нельзя — уезжают на места autoplay и spin.
  const newBetBtn = new ButtonControl({ id: NEW_BET_ID, label: 'NEW BET', layout: { anchor: 'bottom-right', offset: [-398, -120] } });
  const rebetBtn = new ButtonControl({ id: REBET_ID, label: 'REBET', layout: { anchor: 'bottom-right', offset: [-302, -120] } });

  // Плашки СЛЕВА ОТ СТОЛА — тоже контролы: раньше они висели прямо на сцене и
  // двигались руками, то есть не масштабировались со screen.scale и не
  // переезжали по ориентации.
  // Отступ сверху 46, а не 24: выше идёт строка «SIC BO · время» от библиотеки,
  // и плашка лимитов её перекрывала.
  const limitsCtl = new ReadoutControl({ id: LIMITS_ID, kind: 'plain', layout: { anchor: 'top-left', offset: [24, 46] } });
  const stripCtl = new ReadoutControl({ id: STRIP_ID, kind: 'plain', layout: { anchor: 'top-left', offset: [24, 152] } });

  const hud = mountHud(
    app,
    {
      meta: { id: 'sicbo', version: 1 },
      // ПЛАНШЕТНЫЙ КАДР ЗДЕСЬ ВЫКЛЮЧЕН — осознанно, а не по недосмотру.
      //
      // Вендорный `defaultLayoutConfig` даёт кадр 1080×1440 всем, у кого есть
      // раскладка под бакет `tablet`. У sicbo её НЕТ: поле ставок размечено в
      // телефонном кадре 1080×2337. Включи кадр — те же оффсеты применились бы
      // в шкале, которая на планшете выше на 51% (0.511 → 0.772), и композиция
      // поехала бы молча. Сначала планшетная таблица, только потом кадр.
      layout: { ...defaultLayoutConfig, refTablet: undefined },
      game: { name: GAME_NAME, version: GAME_VERSION },
      currency,
      // Лестница ставок — с платформы (init.bets.normal), в МАЖОРНЫХ юнитах:
      // спека принимает major, транспорт оперирует minor.
      ...(opts.bets
        ? {
            betLadder: {
              levels: opts.bets.list.map((m) => m / 100),
              index: Math.max(0, opts.bets.list.indexOf(opts.bets.default)),
            },
          }
        : {}),
      controls: {
        // ── Раскладка ландшафта. Всё через LayoutSpec (anchor + offset в
        // реф-px): контролы масштабируются со screen.scale и переезжают по
        // ориентации сами — руками позиции не считаем.
        //
        //   нижний ряд справа налево: SPIN · autoplay · undo · clear
        //   правый столбик сверху:    mute → menu (settings) → turbo
        // Шаг 96 = диаметр кнопки (80) + зазор.
        // Спин крупнее остальных: он главный, и на него целятся не глядя.
        // scale 1.5 → диаметр 120, поэтому от края отступ больше (-90), а
        // сосед слева отодвинут, чтобы не наехать.
        spin: { layout: { anchor: 'bottom-right', offset: [-90, -132], scale: 1.5 } },
        autoplay: { layout: { anchor: 'bottom-right', offset: [-206, -120] } },
        mute: { layout: { anchor: 'top-right', offset: [-60, 60] } },
        settings: { layout: { anchor: 'top-right', offset: [-60, 156] } },
        turbo: { layout: { anchor: 'top-right', offset: [-60, 252] }, hidden: false },
        // Единственная выбиралка номинала (отдельного лотка фишек нет).
        // offset — позиция ЦЕНТРА от левой кромки, а не отступ края: при
        // scale 1.5 (диаметр 120) X=0 срезал бы половину кнопки экраном.
        // 90 — зеркало spin-кнопки (-90 от правой кромки), ряды симметричны.
        'bet-picker': { layout: { anchor: 'bottom-left', offset: [90, -132], scale: 1.5 } },

        // WIN — выигрыш раунда в нижней панели.
        // WIN появляется ТОЛЬКО когда есть выигрыш — как в слотах. Постоянный
        // «WIN: $0.00» в ряду читается как ложное обещание.
        win: { hidden: true },
        // Бонус-магазина в Sic Bo нет: фичи не продаются.
        bonus: { hidden: true },
        fullscreen: { hidden: true },
        // Ставку меняет окно BET AMOUNT — отдельные ± кнопки не нужны.
        'bet-plus': { hidden: true },
        'bet-minus': { hidden: true },
        // Кнопки фазы результата прячем на старте: игра открывается ставками.
        [NEW_BET_ID]: { hidden: true },
        [REBET_ID]: { hidden: true },
      },
      autoplay: {
        options: [Infinity, 10, 25, 50, 100, 250, 500],
        lossLimits: [Infinity, 10, 25, 50, 100, 250],
        winLimits: [Infinity, 10, 25, 50, 100, 250],
      },
      theme: {
        type: { family: FONT },
        // Золото по зелёному сукну — палитра стола.
        color: { accent: '#e8c46a', accentText: '#12241f' },
      },
      responsive: {
        portrait: {
          controls: {
            // Портретный стол выше и уже: поднимаем его, чтобы низ не налезал
            // на панель ставок.
            table: { layout: { anchor: 'center', offset: [0, -180] } },
            banner: { layout: { anchor: 'center', offset: [0, -180] } },

            // Нижний ряд: КРАЙНИЕ прижаты к краям (пикер слева, спин справа),
            // три средние распределены МЕЖДУ ними.
            //
            // Крайние держатся своих якорей bottom-left/right, средние — якоря
            // центра с симметричным шагом. Так ряд сам растягивается по ширине
            // экрана и остаётся респонсивным: смещения в РЕФЕРЕНСНЫХ единицах,
            // их домножает screen.scale.
            spin: { layout: { anchor: 'bottom-right', offset: [-70, -220], scale: 2.2 } },
            autoplay: { layout: { anchor: 'bottom-center', offset: [150, -220], scale: 1.6 } },
            [UNDO_ID]: { layout: { anchor: 'bottom-center', offset: [0, -220], scale: 1.6 } },
            // CLEAR и UNDO парные (снять одну ставку / снять все) — стоят рядом.
            [CLEAR_ID]: { layout: { anchor: 'bottom-center', offset: [-150, -220], scale: 1.6 } },
            // NEW BET / REBET подменяют CLEAR и UNDO в фазе результата —
            // встают на их места.
            [NEW_BET_ID]: { layout: { anchor: 'bottom-center', offset: [0, -220], scale: 1.6 } },
            [REBET_ID]: { layout: { anchor: 'bottom-center', offset: [-150, -220], scale: 1.6 } },

            // Правый столбик остаётся столбиком и в портрете.
            mute: { layout: { anchor: 'top-right', offset: [-60, 60], scale: 1.4 } },
            settings: { layout: { anchor: 'top-right', offset: [-60, 172], scale: 1.4 } },
            turbo: { layout: { anchor: 'top-right', offset: [-60, 284], scale: 1.4 } },
            // Пикер — ЛЕВЫЙ край ряда, симметрично спину у правого (тот на -70).
            'bet-picker': { layout: { anchor: 'bottom-left', offset: [70, -220], scale: 2.0 } },
            // ЛЕВАЯ КОЛОНКА трёхколоночной раскладки. Лимиты остаются у верхней
            // кромки, а статистика — по ЦЕНТРУ полосы слева от грида: она
            // вертикальная (кубики столбиком) и растёт вниз по мере раскрытия.
            [LIMITS_ID]: { layout: { anchor: 'top-left', offset: [16, 44] } },
            [STRIP_ID]: { layout: { anchor: 'center-left', offset: [16, -40] } },
          },
        },
      },
      locale: { locale: opts.locale ?? 'en', messages: {} },
      audio: { startMuted: opts.startMuted ?? false },
      menu: buildMenu(),
    },
    {
      icons,
      // Главная кнопка PLAY. Отдельного контрола не заводили — SpinControl уже
      // даёт нужную петлю (idle → spinning → …), меняется только арт.
      spinSkin: (theme) => sicBoSpinSkin(theme),
      intro: 'slide-in',
      // Инлайн-ридауты «LABEL: сумма» вместо покрутки одометра — стиль серии.
      controlSkins: {
        balance: valueLine,
        bet: valueLine,
        win: winLine,
        // BET PICKER — пустой круг с фишкой ТЕКУЩЕГО номинала внутри: лотка
        // фишек нет, и это единственный индикатор того, чем игрок ставит.
        // Именно controlSkins, а не extraViews: контрол ШТАТНЫЙ, и extraViews
        // такие пропускает (resolveExtraViews: `if (known.has(id)) continue`).
        'bet-picker': betPickerButtonView(),
      },
      autoplayPicker: 'none',
      betPicker: false,
      infoMenu: 'manual',
      infoMenuExtraPane: {
        id: 'history',
        title: 'History',
        icon: HISTORY_ICON,
        render: () => renderHistoryHtml((major) => formatAmount(major, hud.ui.bet.currency.get())),
      },
      controls: [table, banner, clearBtn, undoBtn, newBetBtn, rebetBtn, limitsCtl, stripCtl],
      extraViews: {
        table: (c, u2) => {
          tableView = new SicBoTableView(c as SicBoTableControl, u2, {
            onZoneTap: (type) => opts.onZoneTap?.(type),
            onSweep: (at, amount, delay) => opts.onSweep?.(at, amount, delay),
            onPayout: (at, denom, delay, r) => opts.onPayout?.(at, denom, delay, r),
            formatAmount: (minor) => formatAmount(minor / 100, currency),
            // Номинал одной фишки — текущий уровень пикера (мажорные → минорные).
            // По нему стол раскладывает СТОПКУ вместо одной фишки с суммой.
            chipValue: () => Math.round(u.betStepper.value * 100),
            widthFrac: { landscape: 0.9, portrait: 0.98 },
          });
          return tableView;
        },
        banner: bannerView(FONT),
        // ButtonControl сам ничего не рисует — библиотека даёт вид только своим
        // штатным контролам. Без этих вьюх кнопки фаз существуют логически, но
        // на экране их нет.
        // Весь нижний ряд — круглые кнопки одного размера (80) со своим цельным
        // спрайтом из пака RSS: круг вместе с иконкой.
        [CLEAR_ID]: phaseButtonView(FONT, { kind: 'clear' }),
        [UNDO_ID]: phaseButtonView(FONT, { kind: 'undo' }),
        [NEW_BET_ID]: phaseButtonView(FONT, { kind: 'newBet' }),
        [REBET_ID]: phaseButtonView(FONT, { kind: 'rebet' }),
        // Плашки слева от стола: свой вид, но позиция — от системы раскладки.
        [LIMITS_ID]: limitsPlateView({
          bets: opts.bets?.list ?? [],
          format: opts.formatMinor ?? ((m) => String(m)),
        }),
        [STRIP_ID]: (c, u2) => {
          stripView = roundStripView({
            // Зовётся только в портрете — там список прошлых раундов в узкий
            // столбик не помещается, и шеврон открывает полную историю.
            onOpenHistory: () => historyPopover?.open(),
          })(c, u2) as RoundStripView;
          return stripView;
        },
      },
    },
  );

  const u = hud.ui;

  // ── Pixi-окна: BET AMOUNT · NUMBER OF ROUNDS · GAME MENU ─────────────────
  // UX-приём из слота: тап по HUD-кнопке при открытом окне ПРОБИВАЕТ фон —
  // окно закрывается И кнопка срабатывает, одним жестом.
  const HUD_BTN_IDS = [u.spin.id, u.autoplay.id, u.muteButton.id, u.settingsButton.id, u.betButton.id];
  const hudButtonAt = (x: number, y: number): string | null => hud.pixi.hitControlAt(x, y, HUD_BTN_IDS);
  const activateHudButton = (id: string): void => {
    if (id === u.spin.id) u.spin.activate();
    else if (id === u.autoplay.id) u.autoplay.press();
    else if (id === u.settingsButton.id) u.settingsPanel.toggle();
    else u.bus.emit('buttonActivated', { id }); // mute / bet-picker
  };

  // Тап ВНЕ раскрытой ленты номиналов сворачивает её — как у попапа.
  //
  // Слушаем на КАНВАСЕ, а не на сцене: зоны стола гасят всплытие через
  // stopPropagation (иначе тап доходил бы до spin-кнопки), и до сцены такой
  // тап не добирается. На DOM-уровне это не важно — событие приходит всегда.
  //
  // ЛОВУШКА: pixi-события внутри сцены приходят на том же pointerup, что и наш
  // слушатель, но РАНЬШЕ. Поэтому тап по шеврону сначала открыл бы ленту, а
  // потом этот обработчик тут же её закрыл. Отсекаем по времени открытия:
  // закрываем, только если лента открыта дольше одного кадра.
  let openedAt = 0;
  u.betStepper.state.subscribe(() => {
    if (u.betStepper.current === 'picking') openedAt = performance.now();
  });
  app.canvas.addEventListener('pointerup', () => {
    if (u.betStepper.current !== 'picking') return;
    if (performance.now() - openedAt < 120) return;   // только что открыли
    u.betStepper.cancelPicker();
  });

  // История ставок — HTML поверх канваса, в том же контейнере, что и слой
  // 3D-кубиков. Формат сумм тот же, что во вкладке HISTORY info-меню.
  historyPopover = mountHistoryPopover(
    app.canvas.parentElement ?? document.body,
    { format: (major) => formatAmount(major, u.bet.currency.get()) },
  );

  const fairness = opts.pf ? mountFairnessWindow(app, u, opts.pf) : null;

  const windows = [
    mountGameMenu(app, u, {
      openInfoMenu: () => hud.infoMenu?.open(),
      openFairness: fairness ? () => fairness.open() : undefined,
      hudButtonAt,
      activateHudButton,
    }),
    ...(fairness ? [fairness] : []),
    mountAutoplayPicker(app, u, { hudButtonAt, activateHudButton }),
    // Окна выбора ставки НЕТ: bet-picker — один компонент, сама кнопка
    // растягивается в ленту номиналов (betPickerButton).
  ];
  for (const w of windows) {
    hud.pixi.root.addChild(w.view);
    app.renderer.on('resize', () => w.applyLayout(app.screen.width, app.screen.height));
    w.applyLayout(app.screen.width, app.screen.height);
  }

  /**
   * Показ/скрытие с фейдом. Вендорский setHidden щёлкает `visible` мгновенно, и
   * ряд кнопок «моргает» — приём из mines/rss: гасим alpha сами, а setHidden
   * зовём в конце (на скрытии) или в начале (на показе), чтобы состояние в
   * ядре сходилось с картинкой и кнопка не ловила тапы, пока её не видно.
   *
   * Анимируем ТОЛЬКО alpha: scale и y принадлежат раскладке, и твин по ним при
   * ресайзе оставил бы кнопку смещённой.
   */
  /**
   * ГЛУШИТ контрол, а не прячет: во время броска ряд кнопок должен оставаться
   * на месте приглушённым — исчезающие кнопки дёргают раскладку и сбивают
   * прицел, игрок каждый раунд заново ищет, куда жать.
   *
   * Прячем только то, что физически делит место с другой кнопкой
   * (CLEAR/UNDO ↔ NEW BET/REBET) — для этого отдельный swap().
   */
  const dim = (ctl: { setState(s: string): void; current: string }, id: string, off: boolean): void => {
    const view = hud.pixi.controlView(id);
    if (view) {
      gsap.killTweensOf(view);
      // Анимируем ТОЛЬКО alpha: scale и y принадлежат раскладке, и твин по ним
      // при ресайзе оставил бы кнопку смещённой.
      gsap.to(view, { alpha: off ? 0.35 : 1, duration: 0.16 });
    }
    // Состояние в ЯДРЕ, а не только картинка: иначе приглушённая кнопка
    // продолжала бы ловить тапы.
    if (off) ctl.setState('disabled');
    else if (ctl.current === 'disabled') ctl.setState('idle');
  };

  /**
   * Фаза и наличие ставок — оба условия влияют на одни и те же кнопки, поэтому
   * держим их рядом и пересчитываем доступность одним местом.
   */
  let currentPhase: 'betting' | 'rolling' | 'result' = 'betting';
  let hasBets = false;
  /** Представление ещё отыгрывает раунд — кнопки результата не показываем. */
  let busy = false;

  /** Показ/скрытие с фейдом — для кнопок, которые делят одно место. */
  const swap = (id: string, hide: boolean): void => {
    const view = hud.pixi.controlView(id);
    if (!view) { u.setHidden(id, hide); return; }
    gsap.killTweensOf(view);
    if (hide) {
      gsap.to(view, { alpha: 0, duration: 0.16, ease: 'power2.in', onComplete: () => u.setHidden(id, true) });
    } else if (u.hidden.has(id)) {
      u.setHidden(id, false);
      view.alpha = 0;
      gsap.to(view, { alpha: 1, duration: 0.2, ease: 'power2.out' });
    } else {
      view.alpha = 1; // на случай прерванного фейда
    }
  };

  /**
   * Кнопки, которым нужны ставки на столе: CLEAR и UNDO снимать нечего, PLAY
   * нечего бросать, а автобет — нечего повторять. Глушим их, пока стол пуст,
   * иначе игрок жмёт и ничего не происходит, и это читается как поломка.
   */
  const syncBetDependent = (): void => {
    const betting = currentPhase === 'betting';
    const off = !betting || !hasBets;
    // CLEAR/UNDO вне фазы ставок ПРЯЧЕТ swap(), а не глушит dim(). Трогать их
    // здесь нельзя: dim() начинается с killTweensOf, и он обрывал твин
    // скрытия ДО его onComplete — setHidden не вызывался, и кнопки навсегда
    // оставались висеть полупрозрачными под NEW BET / REBET.
    if (betting) {
      dim(clearBtn, CLEAR_ID, off);
      dim(undoBtn, UNDO_ID, off);
    }
    dim(u.spin, u.spin.id, off);
    // АВТОПЛЕЙ, ПОКА ОН КРУТИТСЯ, НЕ ГЛУШИМ.
    //
    // dim() зовёт setState('disabled'), а из этого состояния ядро уже не
    // считает раунды: AutoplayControl.reportResult выходит по проверке
    // `current !== 'active'`. Раунд неизбежно проходит через фазы
    // rolling/result со снятыми ставками — то есть глушение срабатывало
    // КАЖДЫЙ раунд, счётчик замирал, и автоплей останавливался после первого.
    //
    // Пока сессия идёт, кнопка обязана оставаться активной: это ещё и «стоп»,
    // и глушить её значит отнимать у игрока единственный способ прерваться.
    if (!u.autoplay.isActive) dim(u.autoplay, u.autoplay.id, off);
  };

  /** Применить набор кнопок под фазу. Вынесено из метода, чтобы setBusy
   *  мог пересобрать их, не вызывая метод объекта до его создания. */
  const applyPhase = (phase: 'betting' | 'rolling' | 'result'): void => {
    currentPhase = phase;
    const betting = phase === 'betting';
    const result = phase === 'result';

    table.setState(betting ? 'idle' : 'disabled');

    // CLEAR/UNDO и NEW BET/REBET делят ОДНО место — эти прячем и показываем.
    swap(CLEAR_ID, !betting);
    swap(UNDO_ID, !betting);
    // Кнопки результата — ТОЛЬКО когда раунд ОТЫГРАН до конца. Фазы мало:
    // 'result' наступает по ответу сервера, когда кубики ещё летят, и
    // кнопки выскакивали мгновенно после броска.
    swap(NEW_BET_ID, !result || busy);
    swap(REBET_ID, !result || busy);

    // Остальное ОСТАЁТСЯ НА ЭКРАНЕ и просто глохнет: исчезающие кнопки
    // дёргают раскладку, и игрок каждый раунд заново ищет, куда жать.
    // (spin, autoplay, clear и undo — в syncBetDependent: им нужны ещё и
    // ставки на столе, одной фазы мало.)
    // Ставку по ходу раунда не меняют: она уже сделана.
    dim(u.betButton, 'bet-picker', !betting);

    syncBetDependent();
  };

  return {
    hud,
    ui: u,
    table,
    get tableView() { return tableView; },
    get stripView() { return stripView; },

    /**
     * Набор кнопок меняется по фазе — главное отличие от mines, где кнопка одна
     * и менялся только её скин.
     *
     *   betting → CLEAR, UNDO, AUTOPLAY, PLAY; стол принимает ставки
     *   rolling → всё заблокировано
     *   result  → NEW BET, REBET
     */
    setPhase(phase) {
      applyPhase(phase);
    },

    setHasBets(has) {
      hasBets = has;
      syncBetDependent();
    },

    setBusy(next) {
      if (busy === next) return;
      busy = next;
      // Пересобираем набор кнопок текущей фазы: показ NEW BET / REBET зависит
      // и от фазы, и от того, досмотрел ли игрок раунд.
      applyPhase(currentPhase);
    },

    setBannerActive(on) {
      const view = hud.pixi.controlView('banner') as { setActive?(v: boolean): void } | undefined;
      view?.setActive?.(on);
    },
  };
}
