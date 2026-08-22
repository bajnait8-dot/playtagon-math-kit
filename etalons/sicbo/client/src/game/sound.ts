/**
 * Звуковой движок Royal Mews. Механика ПЕРЕНЕСЕНА ИЗ RSS (games/rss/.../sound.ts)
 * без изменений: SFX и музыка — @schmooky/zvuk (шины sfx/music, старт из
 * декодированного буфера, полифония/войс-стилинг движка), музыка — лупы через
 * engine.loadMusic()/Music.play() с кроссфейдом хэндлов MusicVoice, дакинг под
 * фанфары — ручной dip шины music (fadeTo), idle-приглушение множителем поверх
 * пользовательских слайдеров.
 *
 * Своё в mines — только СЛОВАРЬ: SfxId, гейны, дакеры, прелоад.
 * ОТСУТСТВУЮЩИЙ файл = тишина без ошибок. Маппинг и промпты: games/sicbo/SOUNDS.md.
 */

import { createEngine } from "@schmooky/zvuk";
import type { Music, MusicVoice } from "@schmooky/zvuk";

/** Два трека: спокойный в простое и напряжённый, пока идёт раунд. Развилка
 *  жанровая — в слоте это была база/фриспины, здесь «есть что терять». */
/** Один трек: раунд одношаговый, развилки «спокойно / идёт» нет. */
export type MusicId = "bgm_base";
export type SfxId =
  // ── бросок ──
  | "dice_drop" | "round_start"
  // ── ставки ──
  | "chip_place" | "chip_pick" | "chips_clear"
  // ── выигрыш ──
  | "cashout" | "win_tick" | "win_big"
  // ── UI (общий словарь со слотом — окна/кнопки одни и те же) ──
  | "ui_click" | "ui_bet_step" | "ui_toggle" | "ui_modal_open" | "ui_modal_close"
  | "ui_error" | "ui_start";

/** Пер-звуковой гейн относительно шины (UI тише игровых, тики совсем тихие). */
const GAIN: Partial<Record<SfxId | MusicId, number>> = {
  // Фишка на сукне — самый частый звук игры: держим тихим и сухим, иначе за
  // десяток ставок утомляет (та же логика, что reel_tick в слоте).
  chip_place: 0.5, chip_pick: 0.45, chips_clear: 0.6,
  // Кубик стучит по столу до трёх раз подряд, но это ГЛАВНОЕ событие раунда —
  // громче фишек и почти вровень с фанфарами. На 0.45 броска было почти не
  // слышно за музыкой.
  dice_drop: 0.9,
  round_start: 0.7,
  cashout: 1.0, win_tick: 0.4, win_big: 1.0,
  // UI — как в слоте: был не слышен на 0.35, держим читаемый уровень.
  ui_click: 0.6, ui_bet_step: 0.6, ui_toggle: 0.65,
  ui_modal_open: 0.6, ui_modal_close: 0.6, ui_error: 0.6,
  bgm_base: 0.4,
};

/** Жёсткий кап длительности (сек): звук авто-стопится, даже если файл длиннее. */
const MAXDUR: Partial<Record<SfxId, number>> = {};

/** Фанфары, под которые музыка дакается на -6 дБ. */
const DUCKERS = new Set<SfxId>(["cashout", "win_big"]);

/** zvuk грузит пути КАК ЕСТЬ — префиксуем BASE_URL, иначе 404 на sub-path. */
const resolve = (id: string, ext: string): string =>
  `${import.meta.env.BASE_URL}audio/${id}.${ext}`;
/** ladder: сначала webm/opus, m4a-фоллбек, mp3 — финальный фоллбек. */
const ladder = (id: string): string[] => [resolve(id, "webm"), resolve(id, "m4a"), resolve(id, "mp3")];

let musicVolume = 1;
let sfxVolume = 1;
let muted = false;

// ── zvuk engine (shared SFX + music buses) ──
let _engine: ReturnType<typeof createEngine> | null = null;
function engine(): ReturnType<typeof createEngine> {
  if (!_engine) {
    _engine = createEngine({
      buses: {
        music: { level: 1 },
        // Полифония в zvuk — свойство ШИНЫ, а не звука (ConcurrencyConfig):
        // в mines кликают по клеткам быстрее, чем отзвучивает хвост, и без капа
        // наложения копятся. 'oldest' — самый старый голос уступает новому.
        sfx: { level: 1, concurrency: { max: 12, steal: "oldest" } },
      },
      master: { headroom: -3, limiter: { threshold: -1 } },
    });
  }
  return _engine;
}

const loaded = new Set<string>();
const failed = new Set<string>();

// Короткие swish/тики НЕ нормализуем — RMS-нормализация задавливает короткий звук
// (мало энергии → тихо после выравнивания). Играют на своём уровне × gain.
const NO_NORMALIZE = new Set<string>(["cell_pick", "win_tick"]);

function ensureLoaded(id: string): void {
  if (loaded.has(id) || failed.has(id)) return;
  loaded.add(id); // optimistic; on error we move to failed
  void engine()
    .loadSound(id, ladder(id), { bus: "sfx", normalize: !NO_NORMALIZE.has(id) })
    .catch(() => { loaded.delete(id); failed.add(id); }); // missing = silence, no throw
}

let unlocked = false;
/** zvuk требует unlock() из пользовательского жеста; первый sfx()/playMusic() уже гарантированно после tap-to-start. */
function unlockOnce(): void {
  if (unlocked) return;
  unlocked = true;
  void engine().unlock?.();
}

/** [DBG] Лог звуков в консоль: `window.__SFXLOG__ = false` выключает.
 *  Печатает id, задержку от предыдущего звука и место вызова — по нему видно,
 *  ЧТО и ОТКУДА звучит. Приём из rss, помогает при звуковом дизайне. */
let lastSfxAt = 0;
function dbgLogSfx(id: string): void {
  const w = window as unknown as Record<string, unknown>;
  if (w.__SFXLOG__ === false) return;
  const now = performance.now();
  const gap = lastSfxAt ? Math.round(now - lastSfxAt) : 0;
  lastSfxAt = now;
  const at = (new Error().stack ?? "").split("\n")[3]?.trim().replace(/^at\s+/, "") ?? "?";
  console.log(`%c♪ ${id}%c  +${gap}ms  ← ${at}`, "color:#9bf3ef;font-weight:700", "color:#888");
}

/** Играет первый звук, который реально загрузился. Нужен, когда новый id уже
 *  подключён в коде, но аудиофайл ещё не сгенерирован: вместо тишины звучит
 *  запасной. Пример: sfxAny("ui_bonus_open", "ui_modal_open"). */
export function sfxAny(...ids: SfxId[]): void {
  for (const id of ids) {
    if (failed.has(id)) continue;      // файла нет — пробуем следующий
    sfx(id);
    if (loaded.has(id)) return;        // прогрелся/сыграл — дальше не идём
  }
}

export function sfx(
  id: SfxId,
  // gain — МНОЖИТЕЛЬ к табличному уровню, а не замена: базовый баланс звуков
  // остаётся в GAIN, а вызывающий может приглушить конкретный случай (прилёт
  // кубика в табло тише, чем удар о стол).
  opts?: { rate?: number; jitter?: number; gain?: number },
): void {
  unlockOnce();
  if (import.meta.env.DEV) dbgLogSfx(id);
  if (muted || document.hidden) return;
  if (!loaded.has(id)) { ensureLoaded(id); return; } // холодный вызов: грузим на будущее, этот кадр пропускаем
  const gain = Math.min(1, (GAIN[id] ?? 1) * (opts?.gain ?? 1));
  const j = opts?.jitter ?? 0;
  const pitch = j > 0 ? { base: opts?.rate ?? 1, jitter: j } : (opts?.rate ?? 1);
  const volume = j > 0 ? { base: gain, jitter: Math.min(gain, 0.06) } : gain;
  const dur = MAXDUR[id]; // жёсткий кап длительности
  try {
    engine().sound(id).play(dur ? { pitch, volume, duration: dur } : { pitch, volume });
  } catch { /* play() упал — тишина, раунд не должен ломаться */ }
  if (DUCKERS.has(id)) duck();
}

// ── Музыка: zvuk Music/MusicVoice, один активный трек, кроссфейд хэндлов ──
const musicAssets = new Map<MusicId, Music>();
const musicLoading = new Map<MusicId, Promise<Music | null>>();
let musicVoice: MusicVoice | null = null;
let musicId: MusicId | null = null;

/** Грузит Music-ассет (лениво, один раз); ОТСУТСТВУЮЩИЙ файл = тишина, без throw. */
function ensureMusic(id: MusicId): Promise<Music | null> {
  const cached = musicAssets.get(id);
  if (cached) return Promise.resolve(cached);
  let pending = musicLoading.get(id);
  if (!pending) {
    pending = engine()
      .loadMusic(id, { loop: ladder(id) }, { bus: "music", loopCrossfade: 0.1 })
      .then((m) => { musicAssets.set(id, m); return m; })
      .catch(() => null) // missing/broken asset = silence, never throw
      .finally(() => { musicLoading.delete(id); });
    musicLoading.set(id, pending);
  }
  return pending;
}

/** Плавно переключает музыку: новый трек fade-in, предыдущий fade-out-стоп. */
export function playMusic(id: MusicId): void {
  unlockOnce();
  if (musicId === id) return; // idempotent
  const prevVoice = musicVoice;
  musicId = id;
  musicVoice = null;
  void ensureMusic(id).then((asset) => {
    // guard: a newer playMusic() call may have superseded this one while loading
    if (musicId !== id || !asset) return;
    try {
      // per-track gain only — overall volume is controlled by the music bus level
      const volume = Math.min(1, GAIN[id] ?? 1);
      musicVoice = asset.play({ volume, fadeIn: 0.4 });
    } catch { /* play() упал — тишина, раунд не должен ломаться */ }
  });
  prevVoice?.stop({ fade: 0.4 }); // crossfade out the previous track
}

export function stopMusic(): void {
  musicVoice?.stop({ fade: 0.3 });
  musicVoice = null;
  musicId = null;
}

// ── Дакинг музыки под фанфары: ручной timed dip шины music (не сайдчейн — не на каждый sfx) ──
let duckTimer: ReturnType<typeof setTimeout> | null = null;
function duck(): void {
  if (muted) return;
  // от ТЕКУЩЕГО уровня шины (busLevel), а не от musicVolume: иначе возврат после
  // фанфары поднял бы музыку на полную, отменив idle-приглушение
  void engine().bus("music").fadeTo(busLevel("music") * 0.5, 0.08); // ≈ −6 дБ
  if (duckTimer) clearTimeout(duckTimer);
  duckTimer = setTimeout(() => {
    duckTimer = null;
    if (!muted) void engine().bus("music").fadeTo(busLevel("music"), 0.6);
  }, 2500);
}

// ── Idle-приглушение ────────────────────────────────────────────────────────
// Игрок долго не играет (открыл правила, отвлёкся, оставил вкладку) — уводим
// громкость вниз, на первом же действии возвращаем. Против «звуковой усталости».
//
// ВАЖНО: это МНОЖИТЕЛЬ поверх пользовательских слайдеров, а не запись в них.
// Писать приглушённое значение в musicVolume/sfxVolume нельзя — слайдеры Music/
// Sound в меню читают те же поля, и выход из простоя затёр бы настройку игрока.
const IDLE_DUCK = { music: 0.35, sfx: 0.6 };
/** Сколько ждать без действий до приглушения. */
const IDLE_DUCK_AFTER_MS = 45_000;
const IDLE_FADE = { down: 2.0, up: 0.25 }; // вниз незаметно, вверх мгновенно

let idleDucked = false;
let idleTimer: ReturnType<typeof setTimeout> | null = null;

/** Целевой уровень шины с учётом mute и idle-приглушения. */
function busLevel(bus: "music" | "sfx"): number {
  if (muted && bus === "music") return 0;
  const base = bus === "music" ? musicVolume : sfxVolume;
  return idleDucked ? base * IDLE_DUCK[bus] : base;
}
function applyBusLevels(fade: number): void {
  void engine().bus("music").fadeTo(busLevel("music"), fade);
  void engine().bus("sfx").fadeTo(busLevel("sfx"), fade);
}

/** Дёргать на КАЖДОЕ действие игрока (ставка, тап по клетке, тап по кнопке):
 *  снимает приглушение и заново заводит таймер простоя. Идемпотентно и дёшево. */
export function noteActivity(): void {
  if (idleDucked) {
    idleDucked = false;
    applyBusLevels(IDLE_FADE.up);
  }
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    idleTimer = null;
    if (idleDucked || muted) return;
    idleDucked = true;
    applyBusLevels(IDLE_FADE.down);
  }, IDLE_DUCK_AFTER_MS);
}

// ── Шины (вайрятся на слайдеры Music/Sound и mute HUD'а) ──
export function setMusicVolume(v: number): void {
  musicVolume = v;
  if (!muted) engine().bus("music").level = busLevel("music");
}
export function setSfxVolume(v: number): void {
  sfxVolume = v;
  engine().bus("sfx").level = busLevel("sfx");
}
export function setMuted(m: boolean): void {
  muted = m;
  engine().bus("music").level = busLevel("music");
}

/** Прогрев: загрузить SFX/музыку заранее, чтобы первый плей был мгновенным.
 *  ОБЯЗАТЕЛЕН для «горячих» звуков: sfx() на незагруженный звук грузит его и
 *  ПРОПУСКАЕТ текущий кадр — первый клик по клетке был бы беззвучным. */
export function preloadSounds(ids: Array<SfxId | MusicId>): void {
  for (const id of ids) {
    if (id.startsWith("bgm_")) void ensureMusic(id as MusicId);
    else ensureLoaded(id);
  }
}
