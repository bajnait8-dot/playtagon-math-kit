import { Container, Text, type Ticker, type TextStyleOptions } from 'pixi.js';
import gsap from 'gsap';
import { ControlView } from '../vendor/slot-ui-pixi/index';
import type { Control, OpenUI, ScreenState } from '../vendor/slot-ui-core/index';

/**
 * Стиль строки баннера. Золотой goldStyle из RSS здесь НЕ используется: он
 * тянет за собой дисплейный шрифт и градиент серии, а на зелёном сукне Sic Bo
 * выглядит чужеродно. Спокойный светлый текст в шрифте HUD.
 */
const bannerStyle: TextStyleOptions = {
  fontFamily: 'Oswald, system-ui, sans-serif',
  fontSize: 40,
  fontWeight: '300',
  fill: 0xdfe9e6,
  letterSpacing: 6,
  align: 'center',
};

/** Как долго висит одно сообщение тикера (мс) — как в слоте. */
const TICKER_MS = 4000;

/**
 * Геометрия стола для баннера: половина высоты в локальных единицах. Ставит её
 * SicBoTableView при пересборке — фиксированный отступ не годится, портретный
 * стол почти вдвое выше ландшафтного, и баннер печатался бы поверх зон.
 *
 * (В mines то же самое приходило из boardGeometry, который вырезан вместе с
 * сеткой мин.)
 */
export const tableBannerGeometry = {
  halfHeight: 380,
  gap: 46,
  /**
   * Смещение ЦЕНТРА стола от центра сцены (экранные пиксели). В портрете стол
   * поднят layout-offset'ом, и без этой поправки баннер отсчитывался от центра
   * СЦЕНЫ — то есть попадал внутрь опущенного относительно него стола и
   * печатался поверх зон.
   */
  tableCenterY: 0,
};

/**
 * Баннер-тикер над столом — тот же приём, что промо-строка над барабанами в
 * слоте: несколько сообщений сменяют друг друга через fade.
 *
 * В mines баннер ДЕЛИЛ место с лестницей множителей и прятался, как только та
 * получала первую ступень. В Sic Bo лестницы нет: баннер живёт, пока игрок
 * расставляет фишки, и уступает место плашке выигрыша в фазе результата —
 * видимостью управляет хост через setActive().
 */
export function bannerView(_family: string) {
  return (c: Control, ui: OpenUI, ticker: Ticker): ControlView => new BannerView(c, ui, ticker);
}

class BannerView extends ControlView {
  private readonly timer: ReturnType<typeof setInterval>;
  private readonly messages: Text[] = [];

  constructor(control: Control, ui: OpenUI, _ticker: Ticker) {
    super(control, ui);

    const texts = [
      'Good luck!',
      'Place your chips on any zone',
      'Triple pays 180x — Any Triple pays 30x',
      'Small and Big lose on a triple',
      'Bet on a face: pays 1:1, 2:1 or 3:1',
    ];

    const messages = this.messages;
    for (const t of texts) {
      const msg = new Text({ text: t, style: bannerStyle });
      msg.anchor.set(0.5);
      msg.visible = false;
      this.addChild(msg as Container);
      messages.push(msg);
    }

    let idx = 0;
    messages[0]!.visible = true;

    this.timer = setInterval(() => {
      const prev = messages[idx]!;
      idx = (idx + 1) % messages.length;
      const next = messages[idx]!;
      gsap.to(prev, { alpha: 0, duration: 0.3, onComplete: () => { prev.visible = false; prev.alpha = 1; } });
      next.visible = true;
      next.alpha = 0;
      gsap.to(next, { alpha: 1, duration: 0.3 });
    }, TICKER_MS);

    this.disposers.push(() => clearInterval(this.timer));
  }

  /** Показать/спрятать баннер. Зовёт хост при смене фазы раунда. */
  setActive(on: boolean): void {
    if (this.visible === on) return;
    gsap.killTweensOf(this);
    if (on) {
      this.visible = true;
      this.alpha = 0;
      gsap.to(this, { alpha: 1, duration: 0.3 });
    } else {
      gsap.to(this, { alpha: 0, duration: 0.2, onComplete: () => { this.visible = false; } });
    }
  }

  /**
   * Штатное позиционирование даёт ЦЕНТР сцены; отсюда поднимаемся к верхней
   * кромке стола.
   *
   * `position` от resolvePlacement — в ЭКРАННЫХ пикселях, а геометрия стола в
   * локальных (реф-) единицах: домножаем на screen.scale, иначе на узком экране
   * отступ выходит кратно больше нужного и баннер улетает за кромку.
   */
  override applyLayout(screen: ScreenState): void {
    super.applyLayout(screen);
    const k = screen.scale || 1;

    // Баннер ставится от НИЖНЕЙ КРОМКИ СТОЛА, а не от собственного места в
    // раскладке: фиксированный отступ не годится — портретный стол почти вдвое
    // выше, и баннер печатался бы поверх зон.
    //
    // Обе величины от стола УЖЕ в экранных пикселях (halfHeight умножен на его
    // fit): домножать их на screen.scale нельзя — так у баннера выходил двойной
    // масштаб. Отдельно берём смещение центра стола: в портрете он поднят
    // layout-offset'ом, и отсчёт от центра сцены заводил баннер внутрь стола.
    const g = tableBannerGeometry;
    this.y = screen.height / 2 + g.tableCenterY + g.halfHeight + g.gap * k;

    const maxW = (screen.width * 0.94) / k;
    for (const m of this.messages) {
      m.scale.set(1); // сброс перед замером natural-ширины
      const nat = m.width;
      if (Number.isFinite(nat) && nat > 0 && nat > maxW) m.scale.set(maxW / nat);
    }
  }
}
