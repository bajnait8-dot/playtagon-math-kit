import { Application, Assets, type Texture } from 'pixi.js';
import { Transport } from '@playtagon/runtime/transport';
import type { SicBoGameTypes, SicBoBetType } from '../../server/model/types.js';
import { bootSicBoHud, CLEAR_ID, UNDO_ID, NEW_BET_ID, REBET_ID } from './game/hud';
import { mountBackground, BG_COLOR } from './game/background';
import { buildLoader } from './game/loader';
import { buildIntro, loadIntroArt } from './game/intro';
import { loadUiIcons } from './game/uiIcons';
import { createBetState } from './game/betState';
import { createGameLoop } from './game/gameLoop';
import { createPFService } from './game/pf';
import { pushHistory } from './game/history';
import { makeWinPlate } from './game/winPlate';
import { makeChipFlightLayer } from './game/chipFlight';
import { mountDiceOverlay } from './game/diceOverlay';
import { createAutoBet } from './game/autoBet';
import { timingFor, autoGapMs } from './game/turbo';
import { formatAmount } from './vendor/slot-ui-core/index';
import { sfx, playMusic, setMuted, setMusicVolume, setSfxVolume, preloadSounds, noteActivity } from './game/sound';

// BASE_URL всегда с завершающим '/', пути — без ведущего слэша: работает и
// локально, и на sub-path платформы. Абсолютный '/fonts/…' там 404-ит.
const B = import.meta.env.BASE_URL;

/** Oswald (variable 200-700) — шрифт HUD. Грузим ДО mountHud, иначе pixi
 *  замерит тексты системным фоллбеком и раскладка поедет. */
async function loadFonts(): Promise<void> {
  const faces = [
    new FontFace('Oswald', `url(${B}fonts/oswald-latin.woff2)`, { weight: '200 700' }),
    new FontFace('Oswald', `url(${B}fonts/oswald-cyrillic.woff2)`, {
      weight: '200 700',
      unicodeRange: 'U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116',
    }),
    new FontFace('Socafe', `url(${B}fonts/yeast22.otf)`),
    new FontFace('Baloo', `url(${B}fonts/baloo-cyrillic.ttf)`),
    // Логотип на столе — кисть (Zhi Mang Xing). Субсет только под «SIC BO» и
    // цифры: 2.9 КБ вместо 4 МБ исходника, где весь китайский набор.
    new FontFace('BrushLogo', `url(${B}fonts/brush-logo.woff2)`),
    // Подписи ЗОН стола — Julee (OFL, Google Fonts): рукописный, под вывеску
    // игрового зала. Субсет под латиницу, цифры и знаки коэффициентов —
    // 4 КБ вместо 66.
    new FontFace('Julee', `url(${B}fonts/julee.woff2)`),
  ];
  for (const f of await Promise.all(faces.map((f) => f.load()))) document.fonts.add(f);
}

/**
 * Вся загрузка — в async-функции, а НЕ на верхнем уровне модуля: платформа
 * собирает под chrome87/safari14, где top-level await не поддерживается
 * (esbuild роняет сборку). Тот же приём, что в rss (boot()).
 */
async function boot(): Promise<void> {
  const app = new Application();
  // resolution/autoDensity — иначе на Retina канвас рендерится в 1× и апскейлится
  // браузером: мыло на всём HUD, особенно на тонких контурах иконок.
  await app.init({
    background: BG_COLOR,
    resizeTo: window,
    antialias: true,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
  });
  document.getElementById('root')!.appendChild(app.canvas);
  app.stage.sortableChildren = true;

  const loader = buildLoader(app);

  /**
   * Стартуем ЗАГЛУШЁННЫМИ, как слот: браузер всё равно не даст звук до первого
   * жеста, а игра, заигравшая музыку сразу после тапа, застаёт игрока врасплох.
   * Снимается явным `?muted=0`.
   */
  let introMuted = new URLSearchParams(location.search).get('muted') !== '0';
  setMuted(introMuted); // применить сразу: иконка на интро должна совпадать со звуком

  const transport = new Transport<SicBoGameTypes>();
  let loaded = 0;
  // Фон и интро рисуются геометрией — грузить для них нечего, задач осталось три.
  const TASKS = 3;
  const track = <T,>(p: Promise<T>): Promise<T> =>
    p.then((v) => {
      loader.setProgress(++loaded / TASKS);
      return v;
    });

  let init: Awaited<ReturnType<typeof transport.init>>;
  try {
    [init] = await Promise.all([
      track(transport.init()),
      track(loadFonts()),
      track(loadUiIcons()),
      // Арт интро — ДО buildIntro: спрайт читает текстуру синхронно через
      // Assets.get, и без загрузки экран остался бы пустым.
      loadIntroArt(),
    ]);
  } catch (e) {
    loader.fail('LOADING FAILED — PLEASE RELOAD');
    throw e;
  }

  const bg = mountBackground(app.stage);
  bg.resize(app.screen.width, app.screen.height);
  app.renderer.on('resize', () => bg.resize(app.screen.width, app.screen.height));

  // ── Экран интро ───────────────────────────────────────────────────────────
  {
    const intro = buildIntro();
    loader.setIntro(intro.view, (w, h) => intro.layout(w, h));

    // Музыку греем ЗАРАНЕЕ: если игрок снимет mute прямо на интро, трек должен
    // быть готов — иначе playMusic уйдёт в загрузку и интро останется молчать.
    preloadSounds(['bgm_base']);

    const icons = Assets.get<Texture>(`${B}ui/mute.webp`);
    const iconsMuted = Assets.get<Texture>(`${B}ui/mute_muted.webp`);
    if (icons && iconsMuted) {
      loader.setIntroMute({
        muteTex: icons,
        mutedTex: iconsMuted,
        initialMuted: introMuted,
        onToggle: (m) => {
          introMuted = m;
          setMuted(m);
          if (!m) playMusic('bgm_base');
        },
      });
    }
  }

  // ── Ставки: состояние отдельно от вьюхи ───────────────────────────────────
  // Лимиты передаём В СОСТОЯНИЕ, а не проверяем у вызывающих: путей постановки
  // несколько (тап, REBET), и правило должно быть одно. Раньше клиент не
  // проверял НИЧЕГО — игрок набирал сумму сверх max bet и узнавал об этом
  // только по отказу сервера после PLAY.
  const bets = createBetState({
    min: init.bets.normal.min,
    maxPerRound: init.bets.normal.max,
    balance: () => Math.round(sicbo.ui.balance.value.get() * 100),
  });
  const currency = { code: init.currency, decimals: 2, symbol: '$', display: 'symbol' as const, position: 'prefix' as const };
  /** Формат минорных юнитов: фишки оперируют центами, formatAmount — мажорными. */
  const fmt = (minor: number): string => formatAmount(minor / 100, currency);

  // Слой летящих фишек. Создаём ДО HUD: onZoneTap ниже его уже использует.
  const flight = makeChipFlightLayer();

  const sicbo = await bootSicBoHud(app, {
    startMuted: introMuted,
    pf: createPFService(transport),
    bets: init.bets.normal,
    currency,
    // Плашка лимитов внутри HUD печатает суммы этим форматом.
    formatMinor: fmt,
    // Смахивание фишек со стола (UNDO / CLEAR / новый раунд) — ведёт слой
    // полёта: фишка уходит ЗА пределы стола, внутри него её обрезало бы.
    // Куда вернуть снятую фишку, зависит от того, ЧТО её сняло:
    //   • CLEAR / UNDO в фазе ставок — игрок передумал, фишка летит обратно
    //     в кнопку пикера;
    //   • NEW BET после раунда — ставка отыграла, деньги уже на балансе, и
    //     фишка уходит туда же.
    onSweep: (at, amount, delay) => {
      if (loop.phase() === 'betting') flight.sweep(at, amount, delay);
      else flight.toBank(at, amount, delay);
    },
    // Выплата ложится фишками на выигравшую зону — их кладёт слой полёта.
    onPayout: (at, denom, delay, r) => flight.payout(at, denom, delay, r),

    onZoneTap: (type) => {
      if (!loop.acceptsBets()) return;
      // Номинал фишки = уровень bet-пикера. Отдельного лотка НЕТ: две выбиралки
      // номинала расходились (лоток держал свой picked, пикер — betStepper), и
      // игрок ставил не то, что показано. Лестница в МАЖОРНЫХ, ставим минорные.
      const chip = Math.round(sicbo.ui.betStepper.value * 100);
      if (chip <= 0) return;
      noteActivity();

      // Проверяем ДО полёта: иначе фишка летит на стол, а потом не ложится —
      // выглядит как поломка. Сообщение объясняет, ЧТО именно не так.
      if (!bets.canPlace(chip)) {
        if (chip < init.bets.normal.min) {
          sicbo.ui.showError(`Minimum bet is ${fmt(init.bets.normal.min)} per zone.`);
        } else {
          sicbo.ui.showError(`Table limit reached — you can add up to ${fmt(bets.headroom())}.`);
        }
        sfx('ui_error');
        return;
      }

      sfx('chip_place', { jitter: 0.06 });
      // Ставку кладём СРАЗУ, полёт — только визуал поверх уже случившегося:
      // иначе быстрые тапы разъехались бы с моделью, а UNDO во время полёта
      // работал бы не с тем состоянием.
      //
      // ПОРЯДОК ВАЖЕН: сперва резервируем сумму в полёте, потом place. Вьюха
      // выкладывает `ставка − летящее`, и если place пройдёт первым, она на
      // один кадр покажет фишку, которая ещё в воздухе.
      flyChipTo(type, chip);
      bets.place(type, chip);
    },
  });
  sicbo.hud.setBalance(init.balance / 100);

  // Куда возвращаются фишки со стола. Читаем ЧЕРЕЗ функции, а не разово:
  // контролы переезжают при ресайзе и смене ориентации.
  //
  // Адреса РАЗНЫЕ по смыслу: снятая ставка (CLEAR/UNDO) возвращается в кнопку
  // пикера — игрок забрал фишку обратно в руку; закрытый раунд (NEW BET) и
  // выплата уходят в баланс — деньги зачислены.
  const pointOf = (id: string, fallback: { x: number; y: number }) => () => {
    const v = sicbo.hud.pixi.controlView(id);
    return v ? v.toGlobal({ x: 0, y: 0 }) : fallback;
  };
  flight.setTargets({
    picker: pointOf(sicbo.ui.betButton.id, { x: 90, y: app.screen.height - 120 }),
    bank: pointOf(sicbo.ui.balance.id, { x: app.screen.width - 120, y: app.screen.height - 30 }),
  });

  /**
   * Пустить фишку от кнопки-пикера к зоне. Обе точки берём в ГЛОБАЛЬНЫХ
   * координатах: у стола свой масштаб, у кнопки свой layout-scale, и складывать
   * их локальные позиции нельзя.
   */
  function flyChipTo(type: SicBoBetType, chipMinor: number): void {
    const view = sicbo.tableView;
    const to = view?.zoneCenter(type);
    const btn = sicbo.hud.pixi.controlView(sicbo.ui.betButton.id);
    if (!view || !to || !btn) return;
    // Фишка в зоне ЖДЁТ приземления ИМЕННО ЭТОЙ фишки: держим сумму в полёте,
    // а не флаг, — иначе при быстрых тапах стопка появлялась бы целиком в
    // момент приземления последней.
    const release = view.holdZone(type, chipMinor);
    // Начало координат bet-кнопки — её ЦЕНТР, там же лежит фишка номинала.
    // Номинал передаём в МАЖОРНЫХ: по нему выбирается скелет, то есть цвет.
    flight.fly(btn.toGlobal({ x: 0, y: 0 }), to, sicbo.ui.betStepper.value, release);
  }

  // Слайдеры Music/Sound и mute-кнопка HUD — на шины движка (как в слоте).
  // Значения применяем СРАЗУ: subscribe ловит только изменения, а стартовый
  // mute (startMuted с интро) пришёл бы в движок лишь после первого клика.
  sicbo.ui.musicSlider.value.subscribe((v) => setMusicVolume(v));
  sicbo.ui.sfxSlider.value.subscribe((v) => setSfxVolume(v));
  sicbo.ui.muted.subscribe((m) => setMuted(m));
  setMusicVolume(sicbo.ui.musicSlider.value.get());
  setSfxVolume(sicbo.ui.sfxSlider.value.get());
  setMuted(sicbo.ui.muted.get());

  // ── Кубики: свой WebGL-канвас ПОВЕРХ Pixi ─────────────────────────────────
  const dice = mountDiceOverlay(document.getElementById('root')!, {
    // Стук на КАЖДОЕ касание каждого из трёх кубиков. Громкость и питч ведём
    // от силы удара, иначе три одинаковых щелчка подряд звучат механически;
    // отсев слабых касаний и пауза между ударами — уже внутри DiceScene.
    // Силу удара ведём ПИТЧЕМ: sfx умеет rate/jitter, но не громкость —
    // сильный удар звучит чуть выше и звонче. jitter добавляет разброс, иначе
    // три щелчка подряд звучат механически (канон zvuk для частых звуков).
    onImpact: (strength) => sfx('dice_drop', {
      rate: 0.9 + strength * 0.25,
      jitter: 0.05,
    }),
    // Кубики после оседания УЛЕТАЮТ В ТАБЛО статистики — каждый в своё место.
    // Полёт ведёт сама 3D-сцена: перенести меши в Pixi нельзя, а плоская
    // подмена дублировала бы лежащие кубики.
    flyTo: () => sicbo.stripView?.headSlots() ?? null,
    // Каждый кубик бьёт в табло ОТДЕЛЬНО — «тык, тык, тык»: щелчок и отскок
    // на каждое попадание, а не один общий в конце.
    onDieLanded: () => {
      // Тише удара о стол: это лёгкое касание табло, а не падение кубика.
      sfx('dice_drop', { rate: 1.25, jitter: 0.05, gain: 0.5 });
      sicbo.stripView?.popHead();
    },
    // Результат появляется в табло, когда долетел ПОСЛЕДНИЙ кубик.
    onFlewAway: () => flushRoundToHistory?.(),
    // Тайминги по ТЕКУЩЕМУ режиму — функция, а не значение: турбо
    // переключают прямо во время броска.
    timing: () => timingFor(sicbo.ui.turbo.isOn),
  });

  /** Записать отыгранный раунд в историю — зовётся по прилёту кубиков. */
  let flushRoundToHistory: (() => void) | null = null;

  // ── Плашки и лента ────────────────────────────────────────────────────────
  // limits и strip ЖИВУТ В HUD как контролы (LIMITS_ID / STRIP_ID) — здесь их
  // больше не создаём: позицию им задаёт система раскладки, а не наши руки.
  const winPlate = makeWinPlate(fmt);
  // Слои задаём ЯВНО: у сцены включён sortableChildren, и без zIndex порядок
  // определяется тем, кто добавлен позже, — HUD со столом монтируется после
  // оверлеев и накрывал их. Плашка выигрыша обязана быть ПОВЕРХ стола: она
  // уходила под зону SMALL, и от «YOU WON $2.00» торчали разные половины.
  winPlate.root.zIndex = 20_000;   // выше зон внутри стола
  // Летящие фишки — НАД столом: они часть игрового поля, а не оверлей.
  flight.view.zIndex = 15_000;
  app.stage.addChild(flight.view);
  // Плашка выигрыша — ЧАСТЬ СТОЛА, а не оверлей поверх сцены: так она встаёт
  // под грид (на место баннера) в координатах самого стола и переезжает вместе
  // с ним при смене ориентации.
  sicbo.tableView?.attachWinPlate(winPlate.root);

  // Ставки на столе рисуются по состоянию betState — одна точка правды.
  //
  // Трогаем ТОЛЬКО изменившиеся зоны: каждый setAmount шлёт уведомление, а по
  // нему вьюха перерисовывает зону. Прежний вариант «погасить все занятые, потом
  // разложить заново» давал на один тап десяток уведомлений вместо одного — и
  // мешал бы анимации прилёта фишки.
  const syncTable = (): void => {
    const next = new Map(bets.bets().map((b) => [b.type, b.amount] as const));
    for (const type of sicbo.table.occupied()) {
      if (!next.has(type)) sicbo.table.setAmount(type, 0);
    }
    for (const [type, amount] of next) {
      if (sicbo.table.amountAt(type) !== amount) sicbo.table.setAmount(type, amount);
    }
    sicbo.ui.bet.set(bets.total() / 100);
    // CLEAR/UNDO снимать нечего, а PLAY нечего бросать, пока стол пуст.
    sicbo.setHasBets(!bets.isEmpty());
  };
  bets.subscribe(syncTable);
  syncTable(); // стартовое состояние: стол пуст, кнопки приглушены

  // ── Петля раунда ──────────────────────────────────────────────────────────
  /** Последний roundId с RGS — для истории (в playData его нет). */
  let lastRoundId: string | null = null;
  /**
   * Итоговый баланс раунда, ПРИДЕРЖАННЫЙ до конца показа.
   *
   * Сервер отдаёт его сразу вместе с результатом, но выставлять его в HUD в
   * тот же миг нельзя: выплата появилась бы раньше, чем осядут кубики. Держим
   * здесь и применяем, когда анимация отыграна (см. finally в onRoundOver).
   */
  let pendingBalance: number | null = null;

  const loop = createGameLoop({
    bets,
    balance: () => Math.round(sicbo.ui.balance.value.get() * 100),
    minBet: init.bets.normal.min,
    play: async (list) => {
      const res = await transport.play('normal', { bets: list });
      /**
       * БАЛАНС ДОГОНЯЕТ ПОКАЗ, А НЕ ОБГОНЯЕТ ЕГО.
       *
       * Сервер отвечает МГНОВЕННО и присылает УЖЕ ИТОГОВЫЙ баланс: ставка
       * снята и выигрыш начислен одним числом. Записав его сюда, мы показали бы
       * выплату, пока кубики ещё летят, — раунд заранее рассказывает исход.
       *
       * Здесь показываем только СПИСАНИЕ ставки (его игрок и так видит по
       * фишкам на столе), а начисление придерживаем до конца анимации.
       * Проигрышный раунд: totalWin=0, итог совпадает со списанием — второго
       * обновления не будет, лишнего мигания цифры нет.
       */
      pendingBalance = res.balance / 100;
      const won = (res.playData?.totalWin ?? 0) / 100;
      sicbo.hud.setBalance(pendingBalance - won);
      // roundId живёт в ОТВЕТЕ транспорта, а не в playData — запоминаем здесь,
      // иначе в историю писать будет нечего.
      lastRoundId = res.roundId ?? lastRoundId;
      return res.playData;
    },
    onError: (e) => sicbo.ui.showError(e instanceof Error ? e.message : String(e)),

    onBusy: (busy) => sicbo.setBusy(busy),

    onPhase: (phase) => {
      sicbo.setPhase(phase);
      sicbo.setBannerActive(phase === 'betting');
      if (phase === 'betting') {
        // Новый круг ставок — прошлый выигрыш больше не показываем.
        sicbo.ui.setHidden(sicbo.ui.win.id, true);
        winPlate.hide();
        dice.clear();
        sicbo.table.highlight([]);
      }
      if (phase === 'rolling') {
        // На броске выбиралка номинала не нужна и мешала бы смотреть на кубики.
        sicbo.ui.betStepper.cancelPicker();
      }
      // Фишки выплаты УЛЕТАЮТ В БАЛАНС на любом выходе из результата, а не
      // только в фазе ставок: REBET идёт result → rolling мимо неё, и выплата
      // прошлого раунда осталась бы лежать поверх новых ставок.
      //
      // Именно в баланс, а не вбок: выигрыш зачисляется, а не «убирается со
      // стола». Ставка при этом остаётся на зонах — её повторяет REBET.
      if (phase !== 'result') flight.collectPayout();
    },

    onRoundOver: (data) => {
      // Звук и анимация — ЗДЕСЬ, а не в петле: петля под юнит-тестом, и аудио в
      // неё не тянется (та же раскладка, что в слоте и mines).
      void (async () => {
       try {
        sfx('round_start');
        // Грид гаснет на время броска: 3D-кубики летят ПОВЕРХ стола, и на
        // пёстром гриде их грани терялись. Фишки не гаснут — игрок должен
        // видеть свои ставки, пока кубики катятся.
        sicbo.tableView?.setDimmed(true);
        // Бросок УЖЕ решён сервером — анимация его отыгрывает, а не решает.
        await dice.roll(data.roll);

        // Кубики осели — только теперь подсветка и выплата.
        sicbo.tableView?.setDimmed(false);
        sicbo.table.highlight(data.wins.map((w) => w.type));
        if (data.totalWin > 0) {
          sfx('cashout');
          // Строка WIN живёт только на выигрышном раунде: на проигрышном её
          // прячем (см. фазу ставок ниже).
          sicbo.ui.setHidden(sicbo.ui.win.id, false);
          // Кубики убираем ПЕРЕД плашкой: они лежат в своём DOM-слое поверх
          // Pixi-канваса, и никакой zIndex внутри Pixi плашку выше них не
          // поднимет — кубик перекрывал сумму выигрыша. К этому моменту
          // комбинация уже улетела в статистику, кубики своё отработали.
          dice.hideAfter(0);
          winPlate.show(data.totalWin, data.totalBet);
          // Выплата ЛОЖИТСЯ ФИШКАМИ на выигравшие зоны — как крупье
          // выкладывает выигрыш. Сумма разменивается по номиналам внутри.
          for (const w of data.wins) {
            sicbo.tableView?.payout(w.type, w.payout / 100);
          }
        }

        // reportRound, а НЕ win.set: он же ведёт сессионную статистику
        // (net position, totalStaked/totalWon) и стоп-лимиты автобета. Прямой
        // set обновлял бы только цифру, и автоплей никогда не остановился бы по
        // лимиту проигрыша. Зовём на КАЖДЫЙ раунд, включая проигрышный.
        sicbo.ui.reportRound(data.totalWin / 100, data.totalBet / 100);

        // История пишется по ПРИЛЁТУ кубиков в табло, а не сейчас: результат
        // должен появиться там вместе с ними. Если полёта нет (табло скрыто),
        // сработает страховка ниже.
        const writeHistory = (): void => {
          flushRoundToHistory = null;
          pushHistory({
            roundId: lastRoundId,
            at: Date.now(),
            roll: data.roll,
            total: data.category.total,
            kind: data.category.kind,
            bet: data.totalBet,
            win: data.totalWin,
          });
        };
        flushRoundToHistory = writeHistory;
        // Страховка: полёт мог не запуститься (нет цели, сцена не готова) —
        // без неё раунд просто не попал бы в историю.
        setTimeout(() => flushRoundToHistory?.(), 1600);

        // Кубики уходят сами, не дожидаясь NEW BET: иначе они лежат поверх
        // стола всю фазу результата и закрывают зоны — особенно заметно на
        // проигрыше, где игрок сразу хочет ставить заново.
        // 3000, а не 2200: кубики держат паузу ~1с после оседания (игрок видит
        // комбинацию), потом ~1.1с летят в табло. С прежним запасом слой гас
        // ровно в момент прилёта последнего.
        dice.hideAfter(3000);
       } finally {
        // ВЫИГРЫШ ЗАЧИСЛЯЕТСЯ ЗДЕСЬ — раунд досмотрен. В play() показали только
        // списание ставки; итоговый баланс ждал в pendingBalance.
        if (pendingBalance !== null) {
          sicbo.hud.setBalance(pendingBalance);
          pendingBalance = null;
        }
        // РАУНД ОТЫГРАН: кубики осели, выигрыш объявлен, история записана.
        // Только теперь показываем NEW BET / REBET — до этого раунд не
        // закончен, и нажимать нечего.
        //
        // finally обязателен: сбой анимации оставил бы busy навсегда, и игрок
        // остался бы без кнопок совсем.
        loop.setBusy(false);
       }
      })();
    },
  });

  // ── Кнопки ────────────────────────────────────────────────────────────────
  sicbo.ui.on('spinRequested', () => {
    if (bets.isEmpty()) {
      sicbo.ui.showError('Place your chips on the table first.');
      return;
    }
    noteActivity();
    void loop.play();
  });

  sicbo.ui.on('buttonActivated', ({ id }) => {
    // Кнопки со СВОИМ звуком исключаем из общего клика, иначе на них звучит
    // два звука подряд: spin озвучен в spinRequested, CLEAR и UNDO — ниже.
    const own = id === sicbo.ui.spin.id || id === CLEAR_ID || id === UNDO_ID;
    noteActivity();
    if (!own) sfx('ui_click');

    if (id === CLEAR_ID) { sfx('chips_clear'); bets.clear(); }
    else if (id === UNDO_ID) { sfx('chip_pick'); bets.undo(); }
    else if (id === NEW_BET_ID) loop.newBet();
    else if (id === REBET_ID) void loop.rebet();
  });

  // ── АВТОБЕТ ───────────────────────────────────────────────────────────────
  // Проще минного: там игрок заранее отмечал паттерн клеток, здесь автобет
  // крутит ОДНУ И ТУ ЖЕ расстановку — ту, что стоит на столе. rebet() сам
  // восстанавливает её и сразу бросает, поэтому цикл линейный.
  //
  // Сама петля — в ./game/autoBet, под юнит-тестом: её поведение на
  // RG-лимитах иначе никто не проверял. СЧЁТЧИК РАУНДОВ ВЕДЁТ ЯДРО
  // (AutoplayControl.reportResult, который зовётся из ui.reportRound) — петля
  // только смотрит, активен ли ещё автоплей. Свой второй счётчик приводил к
  // лишнему раунду сверх заказанного.
  const auto = createAutoBet({
    autoplay: sicbo.ui.autoplay,
    hasBets: () => !bets.isEmpty(),
    canRebet: () => loop.canRebet(),
    play: () => loop.play(),
    rebet: () => loop.rebet(),
    // Пауза короче в турбо — режим могут переключить по ходу автоплея.
    gapMs: () => autoGapMs(sicbo.ui.turbo.isOn),
    onEmpty: () => sicbo.ui.showError('Place your chips first — auto-bet repeats them.'),
    onError: (e) => sicbo.ui.showError(e instanceof Error ? e.message : String(e)),
  });

  sicbo.ui.autoplay.state.subscribe(() => {
    const active = sicbo.ui.autoplay.isActive;
    if (active && !auto.running) void auto.start(sicbo.ui.autoplay.count.get());
    else if (!active && auto.running) auto.stop(); // игрок нажал стоп / сработал лимит
  });

  // Турбо — переключается ПРЯМО ВО ВРЕМЯ броска: сцена перерисовывается с
  // новыми таймингами, иначе режим подхватился бы только со следующего раунда
  // (DiceScene реагирует на смену фазы, а тап по турбо фазу не меняет).
  sicbo.ui.turbo.index.subscribe(() => dice.refreshTiming());

  // Шаг ставки — свой звук; питч показывает направление, как в слоте.
  let lastBet = sicbo.ui.betStepper.value;
  sicbo.ui.on('valueChanged', (e) => {
    if (e.id !== 'bet-stepper') return;
    noteActivity();
    sfx('ui_bet_step', { rate: e.value > lastBet ? 1.15 : 0.9 });
    lastBet = e.value;
  });

  // Стартуем в фазе ставок: стол открыт, кнопки результата спрятаны.
  sicbo.setPhase('betting');

  // Тап разблокирует аудио-контекст браузера — только после него уходит сплеш.
  await loader.waitForStart();

  // Аудио стартует СТРОГО после тапа: до пользовательского жеста браузер не даёт
  // разблокировать AudioContext. Прогрев обязателен — sfx() на незагруженный
  // звук грузит его и ПРОПУСКАЕТ текущий кадр, то есть первый клик был бы
  // беззвучным.
  preloadSounds(['round_start', 'cashout', 'ui_click', 'ui_bet_step', 'bgm_base']);
  playMusic('bgm_base');
  noteActivity(); // заводим таймер idle-приглушения от старта игры

  await loader.dismiss();

  // Отладочный доступ для e2e и ручной проверки состояний. Только в dev —
  // в прод-сборке import.meta.env.DEV === false, и ветка вырезается бандлером.
  if (import.meta.env.DEV) {
    (window as unknown as Record<string, unknown>).__sicbo = { sicbo, loop, bets, dice };
  }
}

void boot();
