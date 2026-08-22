import { Assets, type Texture } from 'pixi.js';
import type { OpenUIIcons } from '../vendor/slot-ui-pixi/index';

/**
 * Арт круглых кнопок HUD (шов OpenUIIcons в mountHud) — спрайты из RSS,
 * public/ui/*.webp. Взят весь пак слота; здесь подключается то, что имеет
 * смысл в Sic Bo.
 *
 * В отличие от mines, ТУРБО подключено: ускоренный бросок в Sic Bo есть, и
 * арт под него в паке уже лежал (turbo_off/turbo_on) — просто не был включён.
 */
// BASE_URL с завершающим '/', пути без ведущего слэша: работает на sub-path
// платформы. Абсолютный '/ui/...' даёт 404 — ловушка, которую check не видит.
const B = import.meta.env.BASE_URL;

const ICON_URLS: Partial<Record<keyof OpenUIIcons, string>> = {
  // autoplay — 3 стейта: default(idle) · counter(active, +число рисуется поверх)
  // · close(picking, ✕ — окно выбора открыто). AutoplayView свапает по состоянию.
  autoIdle: `${B}ui/autoplay_default.webp`,
  autoActive: `${B}ui/autoplay_counter.webp`,
  autoPicking: `${B}ui/autoplay_close.webp`,
  // settings (☰) и bet — toggle-кнопки: closed = свой арт, open = общий ✕.
  settingsIdle: `${B}ui/settings_idle.webp`,
  betPicker: `${B}ui/bet_idle.webp`,
  close: `${B}ui/close.webp`,
  // sound on/off. ВАЖНО: оба или ни одного — библиотека свапает текстуру
  // только при наличии пары.
  mute: `${B}ui/mute.webp`,
  muteMuted: `${B}ui/mute_muted.webp`,
  // turbo — ускоренный бросок. Пара off/on, как у mute: TurboView свапает
  // текстуру только когда есть обе.
  turboOff: `${B}ui/turbo_off.webp`,
  turboOn: `${B}ui/turbo_on.webp`,
};

/** Тумблеры для окон настроек (кладём в Assets, чтобы были готовы к отрисовке). */
const EXTRA_URLS = [
  `${B}ui/toggle_on.webp`,
  `${B}ui/toggle_off.webp`,
];

export async function loadUiIcons(): Promise<OpenUIIcons> {
  const entries = Object.entries(ICON_URLS) as Array<[keyof OpenUIIcons, string]>;
  const textures = await Promise.all(entries.map(([, url]) => Assets.load<Texture>(url)));
  await Promise.all(EXTRA_URLS.map((u) => Assets.load<Texture>(u)));

  const icons: OpenUIIcons = {};
  entries.forEach(([key], i) => {
    (icons as Record<string, Texture>)[key] = textures[i]!;
  });
  return icons;
}
