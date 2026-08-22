import { Application, Assets, Container, FillGradient, Graphics, Sprite, Text, Texture } from "pixi.js";
import gsap from "gsap";

export interface Loader {
  /** Прогресс загрузки 0..1 (бар студийного сплеша). */
  setProgress(p: number): void;
  /** «PRESS ANYWHERE»: резолв по тапу в любом месте (разблокирует аудио-контекст). */
  waitForStart(): Promise<void>;
  /** Фейд-аут и полное удаление экрана. */
  dismiss(): Promise<void>;
  /** Фатальная ошибка загрузки: белый текст на сплеше, экран остаётся. */
  fail(message: string): void;
  /** Интро-сцена в арт-слот (над фоном, под надписью). onLayout зовётся при resize.
   *  Вызов гасит студийный сплеш (после минимума 2с) и показывает PRESS ANYWHERE. */
  setIntro(content: Container, onLayout?: (w: number, h: number) => void): void;
  /** Mute-кнопка на интро-экране (до HUD): круглый арт mute/muteMuted в правом-верхнем
   *  углу. Тап по ней ТОЛЬКО тоглит звук — НЕ стартует игру (гасит всплытие до
   *  full-screen «press anywhere»). Возвращает setter вида, если состояние меняют извне. */
  setIntroMute(opts: {
    muteTex: Texture;      // арт «звук ВКЛ» (mute.webp)
    mutedTex: Texture;     // арт «звук ВЫКЛ» (mute_muted.webp)
    initialMuted: boolean;
    onToggle: (muted: boolean) => void;
  }): { setMuted: (m: boolean) => void };
}

/** Тайминги лоадера (сек — для gsap; мс — для setTimeout/поллинга). */
const T = {
  minSplashMs: 2000,    // сплеш висит НЕ МЕНЬШЕ — иначе моргает на быстрой загрузке
  splashFade: 0.4,      // fade-out сплеша
  hardCutoffMs: 800,    // запас для нативного фолбэка поверх gsap (см. hideSplashThen)
  introFade: 0.45,      // проявление интро-контента
  pressFade: 0.4,       // проявление «PRESS ANYWHERE»
  pressDelay: 0.2,      // задержка перед проявлением надписи
  pulse: 0.75,          // полупериод пульса надписи
  dismissFade: 0.35,    // общий fade-out всего лоадера
  progress: 0.3,        // догон прогресс-бара
  fontPollMs: 50,       // период опроса document.fonts
  fontTimeoutMs: 5000,  // фолбэк: показать текст даже без шрифта
} as const;

/** Лейаут: доли экрана и клампы. Меняешь вид сплеша — тебе сюда. */
const L = {
  logoWFrac: 0.72, logoWMax: 560, logoY: 0.5,  // лого Spinocchio — герой сплеша
  wordmarkGap: 50, wordmarkWFrac: 0.62,        // SUPERGAMING под лого
  barY: 0.85,
  pressWFrac: 0.90, pressY: 0.88,
  failY: 0.56,
  muteMin: 44, muteMax: 72, muteWFrac: 0.12,   // 44 = минимальный пальцевый таргет
} as const;

/**
 * Позвать onReady, когда шрифт РЕАЛЬНО загружен (ровно один раз).
 *
 * document.fonts.check(family) ВРЁТ — возвращает true даже при пустом списке
 * шрифтов, поэтому проверки через check() бесполезны и первый кадр всегда
 * уходил в системный фолбэк (видимый флеш: широкий SF Pro → Oswald). Честный
 * признак — запись в document.fonts со status "loaded" (её добавляет main.ts
 * после f.load()). Поллинг + таймаут-фолбэк: лучше показать текст фолбэком,
 * чем не показать вовсе.
 */
const waitForFont = (family: string, onReady: () => void): void => {
  let done = false;
  const fire = (): void => {
    if (done) return;
    done = true;
    onReady();
  };
  const loaded = (): boolean =>
    [...document.fonts].some((f) => f.family === family && f.status === "loaded");
  if (loaded()) { fire(); return; }
  const poll = setInterval(() => {
    if (loaded()) { clearInterval(poll); fire(); }
  }, T.fontPollMs);
  setTimeout(() => { clearInterval(poll); fire(); }, T.fontTimeoutMs);
};

/**
 * Двухфазный host-side лоадер:
 *   1) СТУДИЙНЫЙ СПЛЕШ (≥2с): красный фон, крупный логотип Spinocchio.co по центру,
 *      под ним вордмарк SUPERGAMING помельче, прогресс-бар — пока грузятся ассеты;
 *   2) ИНТРО: setIntro() растворяет сплеш → арт-сцена игры + пульсирующий
 *      «PRESS ANYWHERE TO START» (тап в любом месте = старт + разблокировка аудио).
 */
export function buildLoader(app: Application): Loader {
  const view = new Container();
  // Лоадер всегда поверх: сцена/фон/HUD монтируются позже него, но обязаны
  // оказаться ПОД. HUD сидит на 10_000 — берём заведомо выше.
  view.zIndex = 50_000;
  app.stage.sortableChildren = true;
  app.stage.addChild(view);

  const bg = new Graphics();

  // ── Фаза 1: студийный сплеш ──
  const splash = new Container();
  const wordmark = new Text({
    text: "SUPERGAMING",
    style: { fill: 0xffffff, fontSize: 44, fontWeight: "600", letterSpacing: 2, fontFamily: "Oswald, system-ui, sans-serif" },
  });
  wordmark.anchor.set(0.5);
  wordmark.visible = false;
  // Вордмарк ждёт ДВА независимых события: шрифт Oswald И текстуру лого. Шрифт —
  // чтобы первый кадр не рисовался системным фолбэком (см. waitForFont). Лого —
  // потому что позиция вордмарка считается от ВЫСОТЫ лого (layoutSplash), а до
  // его загрузки стоит грубый фолбэк h*0.25: если шрифт успевал раньше картинки,
  // SUPERGAMING на пару кадров вспыхивал вверху экрана и прыгал вниз. Видно
  // только на ПЕРВОЙ загрузке — потом лого в кеше и гонки нет.
  let fontReady = false;
  let logoReady = false;
  const revealWordmark = (): void => {
    if (!fontReady || !logoReady || wordmark.destroyed) return;
    wordmark.style.fontFamily = "Oswald, system-ui"; // ≠ стартовой строки → форс-перемер
    wordmark.visible = true;
  };
  waitForFont("Oswald", () => {
    if (wordmark.destroyed) return; // таймаут-колбэк мог пережить dismiss()
    fontReady = true;
    revealWordmark();
  });
  const BAR_W = 320, BAR_H = 6;
  const barTrack = new Graphics()
    .roundRect(-BAR_W / 2, -BAR_H / 2, BAR_W, BAR_H, BAR_H / 2)
    .fill({ color: 0xffffff, alpha: 0.25 });
  const barFill = new Graphics()
    .roundRect(-BAR_W / 2, -BAR_H / 2, BAR_W, BAR_H, BAR_H / 2)
    .fill(0xffffff);
  barFill.scale.x = 0;
  barFill.pivot.x = -BAR_W / 2;
  barFill.x = -BAR_W / 2;
  // Логотип Spinocchio.co — ГЕРОЙ сплеша: крупно по центру, вордмарк студии под ним.
  // Широкий леттеринг — масштабируем по ЦЕЛЕВОЙ ШИРИНЕ (см. layout), позиция в layout().
  const studioLogo = new Sprite();
  studioLogo.anchor.set(0.5);
  Assets.load<Texture>(`${import.meta.env.BASE_URL}ui/spinocchio_logo.webp`).then((tex) => {
    if (studioLogo.destroyed) return;
    studioLogo.texture = tex;
    layout(); // пересчитать позицию/скейл теперь, когда известны размеры текстуры
    logoReady = true;
    revealWordmark(); // строго ПОСЛЕ layout(): показываем уже на верной позиции
  }).catch(() => {
    // Лого не загрузилось — вордмарк всё равно показываем (по фолбэк-позиции):
    // иначе на сплеше не осталось бы вообще ничего, кроме прогресс-бара.
    logoReady = true;
    revealWordmark();
  });
  splash.addChild(wordmark, barTrack, barFill, studioLogo);

  // ── Фаза 2: «PRESS ANYWHERE TO START» — фирменный золотой стиль главной
  // сцены (градиент 9 стопов + обводка + коричневая тень) ──
  const goldFill = (): FillGradient =>
    new FillGradient({
      start: { x: 0, y: 0 }, end: { x: 0, y: 1 }, textureSpace: "local",
      colorStops: [
        { offset: 0.1, color: "#ffa50a" }, { offset: 0.2, color: "#ffdd00" },
        { offset: 0.3, color: "#fff5b3" }, { offset: 0.4, color: "#ffdd00" },
        { offset: 0.6, color: "#f0d000" }, { offset: 0.7, color: "#ffc800" },
        { offset: 0.8, color: "#faab00" }, { offset: 0.9, color: "#faab00" },
        { offset: 1, color: "#db8000" },
      ],
    });
  const pressText = new Text({
    text: "PRESS ANYWHERE TO START",
    style: {
      fontFamily: "Oswald, system-ui, sans-serif",
      fontSize: 34,
      letterSpacing: 3,
      fill: goldFill(),
      // БЕЗ обводки и тени: они раздували текстуру несимметрично, а anchor 0.5
      // центрирует именно по ней — надпись уезжала вправо от центра экрана.
      // На тёмном интро золото читается и без них.
    },
  });
  pressText.anchor.set(0.5);
  pressText.visible = false;

  const failText = new Text({
    text: "",
    style: { fill: 0xffffff, fontSize: 26, fontWeight: "700", letterSpacing: 3 },
  });
  failText.anchor.set(0.5);
  failText.visible = false;

  // Виньетка вокруг бекграунда: затемнение краёв радиальным градиентом (canvas-
  // текстура — надёжнее FillGradient). Лежит над фоном/интро-артом (интро
  // вставляется в index 1), под сплешем и текстами.
  const vignette = new Sprite(((): Texture => {
    const c = document.createElement("canvas");
    c.width = c.height = 512;
    const ctx = c.getContext("2d")!;
    const g = ctx.createRadialGradient(256, 256, 150, 256, 256, 360);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(0,0,0,0.55)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 512, 512);
    return Texture.from(c);
  })());
  // Mute-кнопка интро (пустая до setIntroMute): круглый арт, правый-верхний угол.
  // Поверх всего в view → её тап перехватывается раньше full-screen «press anywhere».
  const muteBtn = new Container();
  muteBtn.visible = false;
  muteBtn.eventMode = "static";
  muteBtn.cursor = "pointer";
  const muteSprite = new Sprite();
  muteSprite.anchor.set(0.5);
  muteBtn.addChild(muteSprite);

  view.addChild(bg, vignette, splash, pressText, failText, muteBtn);

  let MUTE_SIZE = 72; // диаметр кнопки (дизайн-px); в portrait скейлится по ширине (см. layout)
  let introLayout: ((w: number, h: number) => void) | null = null;
  let applyMute: (() => void) | null = null; // пересчёт размера mute при ресайзе (portrait-скейл)
  // Вписать текст по ширине: если его natural-ширина шире maxW — ужать scale (равномерно,
  // без перерендера шрифта). anchor 0.5 → scale от центра. Дёргается на каждый resize.
  const fitTextWidth = (t: Text, maxW: number): void => {
    t.scale.set(1); // сброс перед замером natural-ширины
    const nat = t.width;
    // guard: пустой текст / шрифт ещё не загружен → width может быть 0 или NaN.
    // Тогда fit не применяем (scale остаётся 1), иначе scale уходит в Infinity/0 и
    // элемент исчезает (баг: пропадал прогресс-бар и вордмарк).
    if (Number.isFinite(nat) && nat > 0 && nat > maxW) t.scale.set(maxW / nat);
  };
  /** Фаза 1: красный фон, виньетка, лого-герой, вордмарк, прогресс-бар. */
  const layoutSplash = (w: number, h: number): void => {
    // красный студийный фон (виден в фазе 1; интро-арт ложится поверх)
    bg.clear().rect(0, 0, w, h).fill(0x0600c5); // синий сцены (background.ts)
    vignette.width = w;
    vignette.height = h;
    // Лого Spinocchio.co крупно по центру; вордмарк студии под ним, помельче.
    // Вордмарк привязан к ИЗМЕРЕННОЙ высоте лого — пара читается единым блоком.
    const logoY = h * L.logoY;
    let wordmarkY = h * 0.25; // фолбэк, пока текстура лого не загрузилась
    if (studioLogo.texture && studioLogo.texture.width > 1) {
      const targetW = Math.min(w * L.logoWFrac, L.logoWMax); // ГЕРОЙ: крупно по центру
      studioLogo.scale.set(targetW / studioLogo.texture.width);
      studioLogo.position.set(w / 2, logoY);
      wordmarkY = logoY + studioLogo.height / 2 + L.wordmarkGap; // «на расстоянии» под лого
    }
    // SUPERGAMING (fontSize + letterSpacing) на узком экране шире вьюпорта — вписываем.
    fitTextWidth(wordmark, w * L.wordmarkWFrac);
    wordmark.position.set(w / 2, wordmarkY);
    barTrack.position.set(w / 2, h * L.barY);
    barFill.position.set(w / 2 - BAR_W / 2, h * L.barY);
  };

  /** Фаза 2: «PRESS ANYWHERE» + текст фатальной ошибки. */
  const layoutIntro = (w: number, h: number): void => {
    // fontSize фиксирован → на узком экране надпись шире вьюпорта; вписываем
    // (равномерный scale, без обрезки по краям).
    fitTextWidth(pressText, w * L.pressWFrac);
    pressText.position.set(w / 2, h * L.pressY); // низ (ниже лого/персонажей)
    failText.position.set(w / 2, h * L.failY);
  };

  /** Mute-кнопка: правый-верхний угол; в portrait размер скейлится по ширине
   *  (фикс. 72px на узком экране выглядел огромным), кламп — не мельче пальцевого таргета. */
  const layoutMute = (w: number, h: number): void => {
    const portrait = h > w;
    MUTE_SIZE = portrait ? Math.max(L.muteMin, Math.min(L.muteMax, w * L.muteWFrac)) : L.muteMax;
    const inset = MUTE_SIZE * 0.7 + 12;
    muteBtn.position.set(w - inset, inset);
    applyMute?.(); // пере-скейлить арт под новый MUTE_SIZE
  };

  const layout = (): void => {
    const { width: w, height: h } = app.screen;
    layoutSplash(w, h);
    layoutIntro(w, h);
    layoutMute(w, h);
    introLayout?.(w, h);
  };
  layout();
  app.renderer.on("resize", layout);

  let progressTween: gsap.core.Tween | null = null;
  let pulseTween: gsap.core.Tween | null = null;

  // Сплеш показывается НЕ МЕНЕЕ 2с — локально ассеты грузятся быстрее,
  // студийный экран не должен мелькать. ВСЕ колбэки (интро, надпись, пульс)
  // исполняются строго ПОСЛЕ фактического ухода сплеша — очередь, а не флаг
  // (иначе второй вызов срабатывал мгновенно и надпись мелькала на красном).
  const splashShownAt = performance.now();
  // Фаза экрана. "splash" ТЕРМИНАЛЬНА: стори «Сплеш (SUPERGAMING)» никогда не
  // зовёт setIntro и висит на красном бесконечно — это валидный режим, а не
  // зависание. Не добавлять watchdog «долго грузимся → failed».
  let phase: "splash" | "intro" | "failed" | "dismissed" = "splash";
  // Отдельный от phase факт: уход сплеша ЗАПЛАНИРОВАН, но ещё не состоялся —
  // между ними живут minSplashMs + fade. Свернуть в phase нельзя: сломается
  // идемпотентность hideSplashThen (второй вызов запустил бы второй таймер).
  let hideScheduled = false;
  const afterSplash: Array<() => void> = [];
  const hideSplashThen = (after?: () => void): void => {
    if (after) {
      if (phase !== "splash") after();
      else afterSplash.push(after);
    }
    if (hideScheduled) return;
    hideScheduled = true;
    const left = Math.max(0, T.minSplashMs - (performance.now() - splashShownAt));
    // Уход сплеша: fade через gsap. НО gsap-тикер завязан на requestAnimationFrame —
    // если тяжёлая инициализация интро (2 живых Spine + блюр-фильтр) застопорила rAF
    // на слабом мобильном GPU, gsap.delayedCall может не сработать → сплеш висит вечно
    // (репорт с реального телефона: красный экран, тап не помогает). Поэтому финализацию
    // делаем идемпотентной функцией, которую дёргает И gsap, И нативный setTimeout-фолбэк
    // (setTimeout не зависит от rAF). Первый добежавший прячет сплеш, второй — no-op.
    const finalizeSplash = (): void => {
      if (phase !== "splash") return;
      splash.alpha = 0;
      splash.visible = false;
      // В rss фон гасился, чтобы не светить из-под интро-АРТА, если тот не
      // докрывает край. В mines интро-арта нет — гасить нечего, а без фона
      // экран становится чёрным вместо синего. Оставляем видимым.
      bg.visible = true;
      phase = "intro";
      for (const fn of afterSplash.splice(0)) fn();
    };
    gsap.delayedCall(left / 1000, () => {
      gsap.to(splash, { alpha: 0, duration: T.splashFade, ease: "power2.in", onComplete: finalizeSplash });
    });
    // Фолбэк-страховка: если fade не отыграл за left+800мс — снять сплеш жёстко.
    setTimeout(finalizeSplash, left + T.hardCutoffMs);
  };

  return {
    setIntro(content, onLayout) {
      content.alpha = 0;
      view.addChildAt(content, 1); // над красным bg, под сплешем/надписью
      introLayout = onLayout ?? null;
      introLayout?.(app.screen.width, app.screen.height);
      // сплеш уходит (после минимума 2с) → интро и надпись проявляются.
      // Надпись показывается ТОЛЬКО здесь — на сплеше её быть не должно.
      hideSplashThen(() => {
        // rAF-троттлинг фоновой вкладки может доставить колбэк ПОСЛЕ dismiss()
        if (pressText.destroyed) return;
        gsap.to(content, { alpha: 1, duration: T.introFade });
        // шрифт загружен — форсируем перерендер текста им
        pressText.style.fontFamily = "Oswald, system-ui, sans-serif";
        pressText.text = pressText.text; // инвалидция кэша метрик
        // ПЕРЕСЧИТЫВАЕМ раскладку: fitTextWidth отработал ДО смены шрифта, на
        // метриках фоллбека — надпись оказывалась смещённой от центра.
        layoutIntro(app.screen.width, app.screen.height);
        pressText.visible = true;
        pressText.alpha = 0;
        gsap.to(pressText, { alpha: 1, duration: T.pressFade, delay: T.pressDelay });
      });
    },
    setIntroMute({ muteTex, mutedTex, initialMuted, onToggle }) {
      let muted = initialMuted;
      const apply = (): void => {
        muteSprite.texture = muted ? mutedTex : muteTex;
        // вписать арт в текущий MUTE_SIZE (пересчитан в layout по ориентации), сохранив пропорции
        const t = muteSprite.texture;
        const k = MUTE_SIZE / Math.max(t.width, t.height);
        muteSprite.scale.set(k);
      };
      applyMute = apply; // layout() зовёт его при ресайзе, чтобы mute пере-скейлился
      apply();
      // хит-область квадрат текущего MUTE_SIZE вокруг центра (anchor 0.5); читается при тапе
      muteBtn.hitArea = { contains: (x: number, y: number) => Math.abs(x) <= MUTE_SIZE / 2 && Math.abs(y) <= MUTE_SIZE / 2 };
      muteBtn.on("pointertap", (e) => {
        // НЕ стартовать игру: гасим всплытие до full-screen «press anywhere»
        e.stopPropagation();
        muted = !muted;
        apply();
        onToggle(muted);
      });
      // Показать ТОЛЬКО на интро — после ухода студийного сплеша (как pressText).
      // На красном сплеше кнопки быть не должно.
      hideSplashThen(() => {
        if (muteBtn.destroyed) return; // колбэк мог пережить dismiss() (rAF-троттлинг)
        muteBtn.visible = true;
      });
      return { setMuted: (m: boolean): void => { muted = m; apply(); } };
    },
    setProgress(p) {
      progressTween?.kill();
      const clamped = Math.min(1, p);
      progressTween = gsap.to(barFill.scale, { x: clamped, duration: T.progress, ease: "power2.out" });
    },
    waitForStart() {
      // тап В ЛЮБОМ МЕСТЕ экрана (разблокирует аудио-контекст). Надпись и пульс —
      // строго ПОСЛЕ ухода сплеша (на красном студийном экране её быть не должно).
      progressTween?.kill();
      hideSplashThen(() => {
        if (pressText.destroyed) return; // колбэк мог пережить dismiss() (rAF-троттлинг)
        pressText.visible = true;
        pulseTween = gsap.to(pressText, { alpha: 0.45, duration: T.pulse, yoyo: true, repeat: -1, ease: "sine.inOut" });
      });
      view.eventMode = "static";
      view.hitArea = { contains: () => true };
      view.cursor = "pointer";
      return new Promise<void>((resolve) => {
        view.once("pointertap", () => resolve());
      });
    },
    fail(message) {
      phase = "failed";
      progressTween?.kill();
      pulseTween?.kill();
      pressText.visible = false;
      bg.visible = true;   // вернуть красный студийный фон (finalizeSplash мог погасить)
      splash.visible = true;
      splash.alpha = 1;
      barTrack.visible = barFill.visible = false;
      failText.visible = true;
      failText.text = message;
    },
    async dismiss() {
      phase = "dismissed";
      view.eventMode = "none";
      await gsap.to(view, { alpha: 0, duration: T.dismissFade, ease: "power2.in" });
      progressTween?.kill();
      pulseTween?.kill();
      app.renderer.off("resize", layout);
      view.destroy({ children: true });
    },
  };
}
