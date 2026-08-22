/** Responsive screen model: orientation, a named breakpoint, and a fit scale. */

export type Orientation = 'landscape' | 'portrait';

/** A named device bucket. Config can target these to restyle per device. */
export type Breakpoint = 'mobile' | 'tablet' | 'desktop';

/** The uniformly-scaled DESIGN FRAME ("stage") rect, in screen pixels. */
export interface StageRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ScreenState {
  width: number;
  height: number;
  orientation: Orientation;
  /** Named device bucket, derived from the shorter screen edge (see LayoutConfig). */
  breakpoint: Breakpoint;
  /** Multiply reference-px sizes by this to fit the current screen. */
  scale: number;
  /**
   * The reference design frame, scaled UNIFORMLY by `scale` and placed in the viewport
   * (letterboxed by `stageAnchor` when the aspect ratio differs). Every control anchors
   * to THIS rect — not the raw screen — so the whole HUD scales as one homogeneous unit
   * and the relative gaps between controls never change with aspect ratio. At the
   * reference resolution `stage` exactly equals the screen, so authored layouts are
   * pixel-identical there.
   */
  stage: StageRect;
}

export interface LayoutConfig {
  /** Reference design resolution for landscape / portrait. */
  refLandscape: [number, number];
  refPortrait: [number, number];
  /**
   * РУЧНАЯ ПРАВКА (см. заметку в `computeScreen`): ТРЕТИЙ опорный кадр — планшетный.
   *
   * Необязательное поле: без него всё работает ровно как раньше (планшет получает
   * портретный кадр), поэтому публичный тип вендора остаётся совместимым.
   *
   * ЗАЧЕМ. Портретный кадр 1080×2337 — ТЕЛЕФОННЫЙ (аспект 0.462). Планшет живёт на
   * ~0.70–0.75, и вписывание телефонного кадра упиралось в ВЫСОТУ: на iPad Pro 11
   * (834×1194) скейл выходил 0.511 вместо 0.772 — UI мельчал на треть, а по бокам
   * оставались поля. Кадр 1080×1440 — это ровно 3:4 классического iPad.
   */
  refTablet?: [number, number];
  /** Aspect ratio (w/h) below which we switch to the portrait layout. */
  portraitBelowAspect: number;
  /**
   * Breakpoint thresholds on the SHORTER screen edge (px). A phone is "mobile" in
   * both orientations because its short edge stays small — the right intuition for
   * "what device is this". `<= mobile` → mobile, `<= tablet` → tablet, else desktop.
   */
  breakpoints: { mobile: number; tablet: number };
  /**
   * Where the uniformly-scaled design frame sits in the viewport when the aspect ratio
   * doesn't match the reference (i.e. how the letterbox margins are distributed), as
   * `[x, y]` factors in `0..1`. `[0.5, 1]` (default) = bottom-centre: the bottom bar
   * always hugs the screen bottom and any extra vertical room opens ABOVE (the reel
   * area, filled by the game); horizontal slack splits evenly. `[0.5, 0.5]` centres it.
   */
  stageAnchor: [number, number];
}

export const defaultLayoutConfig: LayoutConfig = {
  // Reference design frames, matching the Figma "DEF" frames 1:1 so offsets map
  // directly: desktop 1920×1080, mobile 360×779 (×3 = 1080×2337). The portrait
  // aspect matches real phones (~0.46), so scaling no longer squashes vertically.
  refLandscape: [1920, 1080],
  refPortrait: [1080, 2337],
  // Планшетный кадр 3:4 — аспект классического iPad (768×1024, 810×1080,
  // 1024×1366 — все ровно 0.750). Ширина взята та же, что у портрета (1080),
  // чтобы X-оффсеты двух портретных таблиц читались в одной шкале.
  refTablet: [1080, 1440],
  portraitBelowAspect: 0.85,
  breakpoints: { mobile: 480, tablet: 840 },
  // Bottom bar hugs the screen bottom; extra height opens above (reel area).
  stageAnchor: [0.5, 1],
};

/** Classify the shorter edge into a named device bucket. Pure, total. */
export function breakpointFor(width: number, height: number, cfg: LayoutConfig): Breakpoint {
  const short = Math.min(Math.max(width, 1), Math.max(height, 1));
  if (short <= cfg.breakpoints.mobile) return 'mobile';
  if (short <= cfg.breakpoints.tablet) return 'tablet';
  return 'desktop';
}

/**
 * ЗДЕСЬ БЫЛ НИЖНИЙ ПОРОГ СКЕЙЛА (`MIN_UI_SCALE`). ЕГО УБРАЛИ — НЕ ВОЗВРАЩАЙТЕ.
 *
 * Идея была такая: кнопки HUD рисуются размером `iconTarget: 80` реф-px, и
 * чтобы физический размер не падал ниже пальцевого таргета 44 px, скейлу не
 * давали опуститься ниже `44 / 80 / множитель` (0.550 в ландшафте, 0.275 в
 * портрете). На низком окне UI переставал мельчать.
 *
 * ПОЧЕМУ ЭТО ОКАЗАЛОСЬ НЕВЕРНО. Аргумент про палец справедлив для ТЕЛЕФОНА,
 * где маленькое окно означает маленький экран. Но игра живёт и в popup на
 * десктопе, а там маленькое окно — это всё та же мышь и обычный монитор:
 * 44 px не нужны, нужен пропорциональный интерфейс.
 *
 * Что было видно в popup размера S (~810×455, landscape): скейл упирался в
 * 0.550 и переставал следовать за окном, spin с турбо-кольцом занимал четверть
 * экрана и наезжал на mute, BET и BALANCE раздувались до нечитаемо крупных.
 * То есть порог не защищал удобство, а ломал раскладку.
 *
 * Если пальцевый минимум когда-нибудь понадобится — он должен зависеть от
 * СПОСОБА ВВОДА (touch против mouse), а не от размера окна.
 */

/**
 * Граница «телефонный портрет / ПЛАНШЕТНЫЙ портрет» ПО АСПЕКТУ (w/h).
 *
 * Середина между двумя реальными классами, а не круглое число с потолка:
 *   • телефоны   — 0.42…0.50 (iPhone 390×844 = 0.462, 360×640 = 0.563 — старый
 *                  Android самый «широкий» из телефонов)
 *   • планшеты   — 0.70…0.75 (iPad 3:4 = 0.750, iPad Pro 11 = 0.698)
 *
 * 0.62 разводит их с запасом в обе стороны: самый широкий телефон (0.563) в
 * планшетный кадр не проваливается, самый узкий планшет (0.698) — попадает.
 */
export const TABLET_ABOVE_ASPECT = 0.62;

export function computeScreen(width: number, height: number, cfg: LayoutConfig): ScreenState {
  const w = Math.max(width, 1);
  const h = Math.max(height, 1);
  const orientation: Orientation = w / h < cfg.portraitBelowAspect ? 'portrait' : 'landscape';
  // ТРЕТИЙ ОПОРНЫЙ КАДР (ручная правка). Планшет в ПОРТРЕТЕ считается от
  // собственного кадра 3:4, а не от телефонного 0.46 — иначе вписывание
  // упирается в высоту и UI мельчает при полных полях по бокам.
  //
  // ЛАНДШАФТНЫЙ планшет намеренно НЕ трогаем: там опорный 1920×1080 (аспект
  // 1.78) и так близок к планшетному ландшафту (1.33), и общий с десктопом
  // кадр — это ровно то, чего мы хотим. Правка адресна: широкий ПОРТРЕТ.
  //
  // КРИТЕРИЙ — АСПЕКТ, А НЕ `breakpoint`. Взять `breakpoint === 'tablet'` было
  // бы соблазнительно (значение и так считается), но порог там — 840 px по
  // КОРОТКОЙ стороне, и iPad Pro 12.9 в портрете (1024×1366) в него не попадает:
  // 1024 > 840, то есть «desktop». А болезнь у него ровно планшетная — вписывание
  // упиралось бы в высоту (scale 0.585, кадр занимает 62% ширины экрана).
  // Мельчает UI не от того, «какой это девайс», а от того, что аспект экрана
  // далёк от телефонного, — по нему и выбираем.
  const useTablet = orientation === 'portrait' && !!cfg.refTablet && w / h >= TABLET_ABOVE_ASPECT;
  const [rw, rh] = useTablet
    ? (cfg.refTablet as [number, number])
    : orientation === 'portrait'
      ? cfg.refPortrait
      : cfg.refLandscape;
  // КАДР И ТАБЛИЦА ОБЯЗАНЫ РЕШАТЬСЯ ОДНИМ КРИТЕРИЕМ.
  //
  // Раскладку выбирает `installResponsive` по `breakpoint` (бакет `tablet`), а
  // кадр — по аспекту выше. Разойдись эти два ответа — и оффсеты, размеченные
  // в кадре 1080×1440, применились бы в шкале кадра 1080×2337. Ровно так и
  // было на iPad Pro 12.9 (1024×1366): аспект 0.750 → планшетный КАДР, но
  // короткая сторона 1024 > 840 → breakpoint `desktop` → ПОРТРЕТНАЯ таблица.
  //
  // Поэтому `useTablet` — единственный источник правды: он же и объявляет
  // экран планшетом. Для всех остальных случаев breakpoint считается как
  // раньше, и его смысл («какой это девайс») не меняется.
  const breakpoint: Breakpoint = useTablet ? 'tablet' : breakpointFor(w, h, cfg);
  // Скейл — честное вписывание по худшей оси, БЕЗ нижнего порога.
  //
  // Порог здесь был и оказался ошибкой (см. `MIN_UI_SCALE` ниже). Его завели,
  // чтобы кнопка не становилась мельче пальцевого таргета 44 px на низком окне.
  // Аргумент верен для ТЕЛЕФОНА, где маленькое окно = маленький экран. Но в
  // popup на десктопе маленькое окно — это по-прежнему мышь и обычный монитор:
  // 44 px там не нужны, нужен пропорциональный UI. С порогом кнопки переставали
  // уменьшаться вместе с окном, и в popup S spin с турбо-кольцом занимал
  // четверть экрана и наезжал на mute, а BET/BALANCE раздувались.
  const scale = Math.min(w / rw, h / rh);
  // `stageAnchor` больше не читается: letterbox'а не осталось ни по одной оси
  // (см. блок ниже), а значит нечего и распределять. Поле в конфиге оставлено
  // как есть — оно часть публичного типа вендора, и трогать его мы не вправе.

  // ЭТО ТОЧКА ПРАВДЫ РАСКЛАДКИ (решение владельца, 16.08.2026).
  //
  // Раньше здесь была рамка «РУЧНЫЕ ПРАВКИ В ГЕНЕРАТЕ» — правки жили в
  // вендор-копии egf-pixi и восстанавливались руками после каждого
  // `vendor-sync`. Теперь они подняты СЮДА, а игры получают их синком.
  //
  // Что в этой версии и почему (эталон — клиент egf-pixi):
  //  1. LETTERBOX ПО ОБЕИМ ОСЯМ — `stage` = вписанный опорный кадр, якорь
  //     `stageAnchor`. Коммиты 73dd7ac6/84784554 делали stage во весь экран;
  //     владелец вернул letterbox как эталон для всех игр.
  //  2. Планшетный кадр 1080×1440 в `defaultLayoutConfig`; игра без
  //     планшетного бакета пишет `refTablet: undefined`.
  //  3. Нижнего порога скейла НЕТ (см. заметку про `MIN_UI_SCALE` выше).
  //
  // STAGE ТЯНЕТСЯ НА ВСЮ ШИРИНУ ЭКРАНА, а не на ширину опорного кадра.
  //
  // Раньше здесь было `sw = rw * scale` — вписанный кадр, и весь HUD липнул к
  // его краям. На аспекте, отличном от опорного, это давало мёртвые поля:
  // опорный портрет — аспект ~0.46, телефонный, а у планшета ~0.70, поэтому
  // кадр вписывался ПО ШИРИНЕ и stage выходил узкой колонкой (на iPad Pro 11
  // 552 px из 834). Кнопки честно стояли «у края» — у края колонки, с полями
  // по 110–200 px с каждой стороны.
  //
  // ПОЧЕМУ ЭТО БЕЗОПАСНО. `scale` считается ПО-ПРЕЖНЕМУ от опорного кадра и
  // здесь не тронут — значит размеры контролов и отступы (offset × scale)
  // остаются пропорциональными, ничего не растягивается. Меняется ТОЛЬКО то,
  // где проходит край, к которому липнут якоря. Это две разные задачи, и
  // раньше они были склеены в один прямоугольник.
  //
  // STAGE ТЯНЕТСЯ И НА ВСЮ ВЫСОТУ — вторая половина той же правки.
  //
  // Раньше здесь стояло `y: (h - sh) * ay, height: sh`, и в комментарии это
  // объявлялось осмысленным: `stageAnchor [0.5, 1]` прижимает нижний бар к низу,
  // лишняя высота открывается сверху под барабаны. Для ДОСКИ это правда, но для
  // HUD — нет: при letterbox'е по высоте верхняя кромка stage уезжает вниз, и
  // всё с якорем `top-*` едет вместе с ней. Кнопка mute (`top-right`) при
  // сжатии окна по высоте уползала вниз, тогда как та же кнопка на заставке
  // (она живёт вне stage) вела себя правильно.
  //
  // Это третий выход одной и той же болезни. Дважды её лечили точечно:
  // персонаж получил `resolveScreenPlacement` (иначе гоблин уезжал в центр
  // letterbox-поля вместо края экрана), центровка доски — счёт вертикали от
  // экрана (db72675d). Заплатки не закрывали причину: следующий элемент с
  // верхним якорем приезжал с тем же дефектом.
  //
  // Теперь stage равен экрану целиком: `top-*` считается от верха экрана,
  // `bottom-*` от низа — как в CSS, без сюрпризов.
  //
  // ПОЧЕМУ НИЖНИЙ БАР НЕ ПОСТРАДАЛ. Он и раньше липнул к низу ЭКРАНА, а не к
  // низу вписанного кадра: при `ay = 1` нижняя кромка stage совпадала с нижней
  // кромкой экрана (`y + sh === h`). Растяжение вверх эту кромку не двигает.
  //
  // ПОЧЕМУ ДОСКА НЕ ПОЕХАЛА. Она вписывается не в stage, а в собственный рект
  // (`resolveGridFit` в sceneLayouts.ts), и вертикаль там уже считается от
  // экрана — ровно с той правки центровки. От stage доска не зависит.
  //
  // STAGE — ВПИСАННЫЙ ОПОРНЫЙ КАДР (вендорное поведение).
  //
  // Возврат от «stage = экран» осознанный. Растянутый stage убирал чёрные
  // поля, но взамен ломал главное: пропорции раскладки менялись вместе с
  // аспектом окна, и UI «плыл» на каждом нетипичном устройстве. Игра
  // тянулась так, как не тянется ни один слот на рынке.
  //
  // Теперь HUD снова живёт в кадре с фиксированным аспектом: расстояния между
  // контролами и их положение относительно друг друга ОДИНАКОВЫ на всех
  // устройствах. Цена — letterbox по той оси, где аспект окна отличается от
  // опорного (чёрные поля), и это принято сознательно: стабильность важнее
  // заполнения кромок.
  //
  // ЧТО ВОЗВРАЩАЕТСЯ ВМЕСТЕ С ЭТИМ (знать заранее, чтобы не искать заново):
  //   • элементы с якорем `top-*` считаются от верха КАДРА, а не экрана: при
  //     letterbox по высоте они уезжают вниз вместе с кромкой;
  //   • на планшетном аспекте кадр вписывается по ширине и stage выходит
  //     колонкой — поля по бокам шире, чем на телефоне.
  // Оба следствия — плата за постоянство пропорций, а не дефекты.
  const sw = rw * scale;
  const sh = rh * scale;
  const [ax, ay] = cfg.stageAnchor;
  const stage: StageRect = { x: (w - sw) * ax, y: (h - sh) * ay, width: sw, height: sh };
  return { width: w, height: h, orientation, breakpoint, scale, stage };
}
