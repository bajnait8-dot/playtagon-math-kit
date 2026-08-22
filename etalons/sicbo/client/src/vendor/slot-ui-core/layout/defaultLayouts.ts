import type { LayoutSpec } from './anchor';

/**
 * The reference HUD arrangement, cloned 1:1 from the Figma design frames.
 *
 * Landscape ("Desk DEF", 1920×1080 = the landscape reference, so px map
 * directly): a bottom bar — balance · play · SPIN · turbo · bet (with the ±
 * steppers stacked to its right) — plus the ☰ menu on the lower-left rail and
 * the buy (bonus) button on the lower-right rail. Everything lives in the
 * bottom ~320 reference px so the reels area above stays clear.
 *
 * Portrait ("Mobile DEF", 360-wide × 3 = the 1080×2337 portrait reference):
 * a thumb-friendly stack — buy · play · SPIN · turbo · ☰ on one row, the bet ±
 * steppers below SPIN, balance/bet tilted into the corners, readouts larger.
 *
 * These are the LIBRARY defaults: `OpenUI` constructs controls with the
 * landscape values, and `createUI` installs the portrait set as a built-in
 * `responsive.portrait` bucket (layered UNDER host overrides — a host's static
 * `controls.{id}.layout` wins everywhere, and a host's own
 * `responsive.portrait` entry wins per-control).
 */
// RSS edge-anchored раскладка (перенесена из hud.ts controls-override 2026-07-28;
// slot-ui-* — наш форк open-slot-ui, синка из upstream нет → правим дефолты напрямую).
// Контролы по краям safe-frame, рилы центр. bonus — широкая плашка (bonusPlateView).
export const landscapeDefaultLayouts: Readonly<Record<string, LayoutSpec>> = Object.freeze({
  // Правая spin-зона: spin крупный bottom-right, auto/turbo ряд под ним
  spin: { anchor: 'bottom-right', offset: [-130, -280] },
  autoplay: { anchor: 'bottom-right', offset: [-200, -120] },
  turbo: { anchor: 'bottom-right', offset: [-60, -120] },
  // bet± степперы скрыты (ставку меняет степпер в buy-модалке) — hidden в hud.ts
  'bet-plus': { anchor: 'bottom-right', offset: [-120, -188], rotation: 5 },
  'bet-minus': { anchor: 'bottom-right', offset: [-120, -104], rotation: 5 },
  // BONUS — широкая плашка / chips активного бонуса, center-right. Y поднят (100→40),
  // чтобы chips-плашка после активации не налезала на круглую spin-кнопку снизу.
  bonus: { anchor: 'center-right', offset: [-130, 40] },
  // ридауты нижний ряд (-40): balance прав · win/total-win центр · bet лев
  balance: { anchor: 'bottom-right', offset: [-20, -40] },
  bet: { anchor: 'bottom-left', offset: [20, -40] },
  'total-win': { anchor: 'bottom-center', offset: [0, -40] },
  win: { anchor: 'bottom-center', offset: [0, -40] },
  'total-cost': { anchor: 'bottom-left', offset: [200, -40] },
  // левый нижний столбик: settings над mute; bet-picker (монеты) справа от них
  settings: { anchor: 'bottom-left', offset: [60, -120] },
  mute: { anchor: 'top-right', offset: [-60, 60] },
  'bet-picker': { anchor: 'bottom-left', offset: [200, -120] },
  fullscreen: { anchor: 'top-right', offset: [-46, 46] },
  rtp: { anchor: 'top-left', offset: [20, 18] },
  'session-timer': { anchor: 'top-left', offset: [20, 46] },
  'net-position': { anchor: 'top-left', offset: [20, 74] },
  // clock ("Game · HH:MM") — верхний левый угол
  clock: { anchor: 'top-left', offset: [40, 20] },
});

// RSS portrait раскладка (перенесена из hud.ts responsive.portrait 2026-07-28).
//
// ШПАРГАЛКА ПО OFFSET (важно — offset = сдвиг ВНУТРЬ от края STAGE, не экрана):
//   • offset в РЕФЕРЕНС-координатах (ширина 1080), НЕ в пикселях экрана
//   • bottom-* контролы: Y должен быть ОТРИЦАТЕЛЬНЫМ (−40…−480), иначе уходят ВНИЗ
//     за экран (stage выше экрана — «дно» stage ниже видимого края). offset [0,-40] =
//     чуть выше нижнего края; чем больше минус, тем выше.
//   • top-* контролы: Y = 0…60 (0 = у верха, плюс опускает)
//   • X: минус = влево, плюс = вправо (от точки anchor)
//   • scale: множитель размера контрола (текст/графика целиком)
export const portraitDefaultLayouts: Readonly<Record<string, LayoutSpec>> = Object.freeze({
  // spin-ряд: spin по центру, bonus (круглая BuyBonus2) — СПРАВА от spin на той же Y-линии
  spin: { anchor: 'bottom-center', offset: [0, -540], scale: 2.0 },
  // bonus — К ПРАВОМУ КРАЮ (не center+400: на узких экранах широкая chips-карточка
  // с ✕ уезжала за экран). −132 = полуширина круглой buy2 (60×2) + отступ 12;
  // chips-карточка в portrait right-align'ится на ту же линию своим вью.
  bonus: { anchor: 'bottom-right', offset: [-132, -540], scale: 2.0 },
  // нижний бар (одна Y=-220): mute · autoplay · turbo · bet-picker · settings.
  // ВАЖНО: на телефоне stage == экран — контрол с offset [0,…] у bottom-left/right
  // стоит ЦЕНТРОМ на краю (полкнопки за экраном). Края втянуты на полуширину
  // кнопки (~80 реф) + отступ; на таблете «спасал» letterbox, на телефоне резало.
  mute: { anchor: 'bottom-left', offset: [96, -220], scale: 2.0 },
  'bet-picker': { anchor: 'bottom-center', offset: [200, -220], scale: 2.0 },
  autoplay: { anchor: 'bottom-center', offset: [-200, -220], scale: 2.0 },
  turbo: { anchor: 'bottom-center', offset: [0, -220], scale: 2.0 },
  settings: { anchor: 'bottom-right', offset: [-96, -220], scale: 2.0 },
  // ридауты нижний край (-40): balance прав · win/total-win центр · bet лев —
  // выносы за край (±80) втянуты: текст обрезался на телефоне
  balance: { anchor: 'bottom-right', offset: [-16, -40], scale: 2.0 },
  bet: { anchor: 'bottom-left', offset: [16, -40], scale: 2.0 }, // Y −40: иначе уходит за низ
  win: { anchor: 'bottom-center', offset: [0, -40], scale: 2.0 },
  // ВТОРОЙ ЯРУС РАЗНЕСЁН НА 90, А НЕ НА 60.
  //
  // Замер: ридаут в портрете идёт СТОЛБИКОМ (подпись над суммой, `stacked` в
  // hud.ts) и занимает ~75 реф-px при scale 2.0 — кегль 28 плюс подпись плюс
  // отрицательный `stackedGap`. Ярусы же стояли на -40 и -100, то есть с шагом
  // 60: второй налезал на первый на 15 px, и total win перекрывал balance.
  //
  // 90 даёт просвет 15 реф-px между ярусами. Колонки НЕ меняем: центр занят
  // `win`, и он виден одновременно с total win (ни один из них не скрывается),
  // так что перенос туда дал бы наложение вместо лечения.
  'total-win': { anchor: 'bottom-right', offset: [-16, -130], scale: 2.0 },
  'total-cost': { anchor: 'bottom-left', offset: [16, -130], scale: 2.0 },
  // степперы скрыты в портрете (ставку меняет bet-drawer) — hidden в hud.ts
  'bet-minus': { anchor: 'bottom-center', offset: [-105, -267], scale: 1.5 },
  'bet-plus': { anchor: 'bottom-center', offset: [105, -267], scale: 1.5 },
  // clock — верхний левый угол. На реф-аспекте телефона stage == экран, поэтому
  // отрицательный X резал текст слева — отступ строго ВНУТРЬ stage.
  // scale ОБЯЗАТЕЛЕН (без него текст ~6px).
  clock: { anchor: 'top-left', offset: [16, 8], scale: 2.0 },
  fullscreen: { anchor: 'top-right', offset: [-57, 57], scale: 1.5 },
  // Compliance readouts scale up ~2× on mobile with wider line spacing.
  rtp: { anchor: 'top-left', offset: [16, 16], scale: 2 },
  'session-timer': { anchor: 'top-left', offset: [16, 66], scale: 2 },
  'net-position': { anchor: 'top-left', offset: [16, 116], scale: 2 },
});

/** A control's default layout for the landscape reference frame (cloned — safe to mutate). */
export function defaultLayout(id: string): LayoutSpec {
  const l = landscapeDefaultLayouts[id];
  if (!l) return { anchor: 'center' };
  return { anchor: l.anchor, offset: l.offset ? [l.offset[0], l.offset[1]] : undefined, scale: l.scale, rotation: l.rotation };
}
