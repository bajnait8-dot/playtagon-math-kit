import { Assets, Container, Text } from "pixi.js";
import { Spine } from "@esotericsoftware/spine-pixi-v8";

/**
 * Фишки из пака GSR (Golden Star Roulette) — спайн-скелеты со своими
 * анимациями выбора.
 *
 * Скелеты рисуют ТОЛЬКО кружок: поле в центре пустое, номинал на арте не
 * напечатан (в скелете под него заведён слот Text_Placement). Подпись поэтому
 * наша, поверх — на арте номинала нет.
 */

const B = import.meta.env.BASE_URL;
const SPINE_BASE = `${B}spine/`;
const ATLAS_ALIAS = "gsr-chips";

/**
 * Номиналы, которые ЕСТЬ в паке (мажорные единицы). RGS-лестница своя, и она
 * не обязана совпадать — сопоставление ниже, в skeletonFor.
 */
const PACK_DENOMS = [0.5, 1, 2, 5, 10, 25, 50, 100, 500] as const;

/**
 * Во сколько раз пак ужимает НЕвыбранную фишку. Setup-поза скелета = выбранная
 * (scale 1), а Deselect уводит кость Chip5Base в 0.56 — замерено по анимациям,
 * одинаково во всех девяти скелетах.
 */
export const DESELECT_SCALE = 0.56;

/** Имя файла скелета по номиналу пака: 0.5 → Chip05, 100 → Chip100. */
function skeletonName(denom: number): string {
  return `Chip${denom === 0.5 ? "05" : String(denom)}`;
}

/**
 * Скелет под ПРОИЗВОЛЬНЫЙ номинал: берём ближайший НЕ ПРЕВЫШАЮЩИЙ из пака.
 *
 * У RGS ставка бывает любой (в Sic Bo лестница 1/5/10/50/100/1000), а пак
 * заканчивается на 500 — фишка 1000 без фоллбека осталась бы без арта вовсе.
 * «Ближайший меньший», а не «ближайший вообще»: так самый дорогой номинал
 * всегда получает самую дорогую фишку палитры, и порядок цветов по возрастанию
 * ставки не ломается.
 */
export function skeletonFor(denomMajor: number): string {
  let pick: number = PACK_DENOMS[0];
  for (const d of PACK_DENOMS) if (d <= denomMajor) pick = d;
  return skeletonName(pick);
}

/** Анимации скелета: выбранная фишка и невыбранная. */
export type ChipSpineState = "select" | "deselect";

/**
 * Разменять сумму на фишки пака — как крупье выкладывает выплату: сначала
 * крупные, потом мельче.
 *
 * Нужно, потому что выигрыш бывает большим (180:1 со ставки $1 — это $180), и
 * выкладывать его фишками одного номинала значило бы строить башню из сотни
 * штук. Размен даёт компактную стопку из нескольких цветов.
 *
 * @param amountMajor сумма в МАЖОРНЫХ единицах
 * @param limit сколько фишек максимум — остаток сворачивается в последнюю
 * @returns номиналы от крупного к мелкому
 */
export function breakIntoChips(amountMajor: number, limit = 6): number[] {
  const out: number[] = [];
  // Копейки не размениваем: пак начинается с 0.5, и хвост меньше него всё
  // равно не изобразить.
  let left = Math.round(amountMajor * 100) / 100;
  const denoms = [...PACK_DENOMS].reverse();

  for (const d of denoms) {
    while (left >= d - 1e-9 && out.length < limit) {
      out.push(d);
      left = Math.round((left - d) * 100) / 100;
    }
  }
  // Не уложились в лимит — весь остаток кладём на последнюю фишку: пусть
  // стопка будет неточной по номиналам, но сумма сойдётся.
  if (left > 1e-9 && out.length > 0) out[out.length - 1] += left;
  else if (out.length === 0 && amountMajor > 0) out.push(amountMajor);
  return out;
}

/**
 * Номинал НА фишке: только число, без знака валюты — как на настоящих фишках
 * казино. Валюта и так видна в BET / BALANCE, а «$» съедал место в поле и
 * заставлял ужимать текст.
 *
 * Дробные показываем с двумя знаками (0.50), целые — без хвоста (1, 1000):
 * лестница RGS бывает и дробной (USD min 0.01).
 */
export function chipLabel(denomMajor: number): string {
  return Number.isInteger(denomMajor)
    ? String(denomMajor)
    : denomMajor.toFixed(2);
}

let loaded: Promise<void> | undefined;

/**
 * Загрузить атлас и все скелеты фишек. Идемпотентно — держим промис, а не
 * флаг: параллельные вызовы должны ждать ОДНУ загрузку, иначе Assets.load
 * стартует по разу на каждый.
 */
export function loadChipSpine(): Promise<void> {
  loaded ??= (async () => {
    await Assets.load({
      alias: ATLAS_ALIAS,
      src: `${SPINE_BASE}ChipAllBettingAreaNeighboursGsBettingAreaFrameGoldenStar.atlas`,
    });
    await Promise.all(PACK_DENOMS.map((d) => {
      const name = skeletonName(d);
      return Assets.load({ alias: `gsr-${name}`, src: `${SPINE_BASE}${name}.json` });
    }));
  })();
  return loaded;
}

export interface ChipSpineOptions {
  /** Радиус фишки в дизайн-пикселях (скелет масштабируется под него). */
  radius: number;
  /** Подпись номинала — рисуем сами, на арте её нет. */
  label?: string;
  /** Начальное состояние. */
  state?: ChipSpineState;
}

export interface ChipSpineHandle {
  view: Container;
  /** Переключить выбор. Анимация проигрывается, если она есть в скелете. */
  setState(state: ChipSpineState): void;
  destroy(): void;
}

/**
 * Собрать фишку. Возвращает контейнер с центром в (0,0) — вызывающий ставит
 * его сам, как и рисованную стопку.
 *
 * ВАЖНО: loadChipSpine() должен быть await-нут до вызова. Assets.get на
 * незагруженный скелет вернёт undefined, и Spine.from бросит.
 */
export function makeChipSpine(denomMajor: number, opts: ChipSpineOptions): ChipSpineHandle {
  const root = new Container();
  const skeleton = `gsr-${skeletonFor(denomMajor)}`;

  const spine = Spine.from({ skeleton, atlas: ATLAS_ALIAS });
  // Слот под номинал гасим: подпись печатает игра. У восьми скелетов он пуст, а
  // у Chip5 художник оставил тестовую цифру «5» — она просвечивала из-под нашей
  // и двоилась. Скрываем у ВСЕХ, чтобы не зависеть от того, где её забыли.
  spine.skeleton.findSlot("Text_Placement")?.setAttachment(null);
  // Скелет 146x155.5 в единицах пака; приводим к запрошенному радиусу по ШИРИНЕ
  // (фишка круглая, а высота включает тень под ней).
  //
  // radius — это размер ВЫБРАННОЙ фишки: в паке setup-поза = выбранная (scale 1),
  // а Deselect ужимает кость до 0.56. Считать fit по чему-то ещё нельзя — иначе
  // выбранная вылезает за ячейку, ведь она крупнее покоящейся почти вдвое.
  const fit = (opts.radius * 2) / Math.max(1, spine.skeleton.data.width);
  spine.scale.set(fit);
  root.addChild(spine);

  // Подпись рисуем поверх скелета — на арте номинала нет. Её базовый масштаб
  // подбираем под ПОЛЕ фишки (светлый кружок внутри ободка ≈ 0.62 диаметра),
  // а не под весь скелет: иначе текст ложится на насечки по краю.
  let label: Text | undefined;
  let labelBase = 1;
  if (opts.label) {
    label = new Text({
      text: opts.label,
      style: {
        fontFamily: "Oswald, system-ui, sans-serif",
        fontSize: Math.max(9, opts.radius * 0.46),
        fontWeight: "700",
        fill: 0x1a1a1a,          // поле фишки светлое — тёмный текст читается
        align: "center",
      },
    });
    label.anchor.set(0.5);
    // «$1,000.00» длиннее поля — ужимаем под его хорду.
    const maxW = opts.radius * 1.05;
    if (label.width > maxW) labelBase = maxW / label.width;
    label.scale.set(labelBase);
    root.addChild(label);
  }

  /** Проиграна ли уже хоть одна смена состояния (см. setState). */
  let started = false;

  const setState = (state: ChipSpineState): void => {
    const once = state === "select" ? "Select" : "Deselect";
    const idle = state === "select" ? "SelectIdle" : "DeselectIdle";
    const data = spine.skeleton.data;

    // ПЕРВАЯ установка — сразу в Idle, БЕЗ разовой анимации.
    //
    // Разовые в паке — это ПЕРЕХОДЫ: Deselect стартует с масштаба 1.0 и за
    // 0.167с ужимает кость до 0.56. Проигрывать её при рождении фишки нельзя —
    // фишка вспыхивает крупной и схлопывается, и это читается как «поп» (на
    // вылете летящей, на приземлении в зоне). Переход уместен только когда
    // состояние действительно МЕНЯЕТСЯ.
    if (!started) {
      started = true;
      if (data.findAnimation(idle)) spine.state.setAnimation(0, idle, true);
      // Применяем позу СРАЗУ, иначе первый кадр Idle доедет лишь на следующем
      // апдейте и фишка мелькнёт в setup-масштабе.
      //
      // setToSetupPose() здесь звать НЕЛЬЗЯ: он возвращает слотам исходные
      // вложения, то есть чинит обратно тестовую цифру «5», которую мы сняли
      // выше, — на Chip5 номинал начинал двоиться.
      spine.state.apply(spine.skeleton);
    } else if (data.findAnimation(once)) {
      // Idle-вариации зациклены, разовые — нет. Играем разовую и ставим Idle
      // следом: без него фишка после Select замирала бы на последнем кадре.
      spine.state.setAnimation(0, once, false);
      if (data.findAnimation(idle)) spine.state.addAnimation(0, idle, true, 0);
    } else if (data.findAnimation(idle)) {
      spine.state.setAnimation(0, idle, true);
    }
    // Подпись — НЕ часть скелета, и сама за ним не следует. В паке невыбранная
    // фишка ужата костью до 0.56 (setup-поза = выбранная), поэтому тот же
    // множитель применяем к тексту вручную: иначе на мелкой фишке он торчал бы
    // за края.
    if (label) label.scale.set(labelBase * (state === "select" ? 1 : DESELECT_SCALE));
  };
  setState(opts.state ?? "deselect");

  return {
    view: root,
    setState,
    destroy: () => { if (!root.destroyed) root.destroy({ children: true }); },
  };
}
