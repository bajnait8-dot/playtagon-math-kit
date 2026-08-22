import { Container, Text, type TextStyleFontWeight } from "pixi.js";
import { ControlView } from "../vendor/slot-ui-pixi/index";
import { resolvePlacement, type Control, type OpenUI, type ValueDisplay } from "../vendor/slot-ui-core/index";

/**
 * Инлайн value-view для Balance/Bet: «LABEL: sum» одной строкой (без odometer-покрутки).
 * Две части: приглушённый лейбл (alpha из theme.labelAlpha) + яркая сумма. Подключается
 * через `controlSkins` (Charter P7). Читает ValueDisplay-контрол (value/currency Signal),
 * обновляет при изменении баланса/ставки/локали. Формат — Intl.NumberFormat по currency.
 */
export interface ValueLineTheme {
  family: string;
  fill: number;
  fontSize: number;
  labelWeight: TextStyleFontWeight;   // лейбл BALANCE:/BET: — тонкий (напр. "200")
  amountWeight: TextStyleFontWeight;  // сумма — жирная (напр. "800")
  labelAlpha: number;                 // прозрачность лейбла (0..1), сумма всегда 1.0
  gap: number;                        // зазор между лейблом и суммой, px
  /** Доля ширины экрана, за которую строка не должна вылезать (напр. 0.9). Если задана
   *  и строка шире — ужимаем row.scale пропорционально. Спасает узкий portrait от
   *  длинных сумм («TOTAL WIN: $12,345.00»). Учитывает layout-scale контрола. */
  maxWidthFrac?: number;
}

export function valueLineView(theme: ValueLineTheme) {
  return (c: Control, ui: OpenUI): ControlView => new ValueLineView(c, ui, theme);
}

class ValueLineView extends ControlView {
  private readonly row = new Container();
  private readonly labelText: Text;
  private readonly amountText: Text;
  private readonly vd: ValueDisplay;

  constructor(control: Control, ui: OpenUI, private readonly theme: ValueLineTheme) {
    super(control, ui);
    this.vd = control as unknown as ValueDisplay;

    const base = {
      fontFamily: theme.family,
      fontSize: theme.fontSize,
      fill: theme.fill,
      dropShadow: { color: 0x000000, alpha: 0.6, blur: 4, distance: 2, angle: Math.PI / 2 },
    };

    // лейбл — тонкий и приглушённый; сумма — жирная и яркая
    this.labelText = new Text({ text: "", style: { ...base, fontWeight: theme.labelWeight } });
    this.labelText.alpha = theme.labelAlpha;
    this.amountText = new Text({ text: "", style: { ...base, fontWeight: theme.amountWeight } });
    this.labelText.anchor.set(0, 0.5);
    this.amountText.anchor.set(0, 0.5);
    this.row.addChild(this.labelText, this.amountText);
    this.addChild(this.row);

    const redraw = () => this.redraw();
    redraw();
    this.disposers.push(this.vd.value.subscribe(redraw));
    this.disposers.push(this.vd.currency.subscribe(redraw));
    this.disposers.push(ui.locale.subscribe(redraw));
    // resize/orientation → пересчёт fit по ширине экрана
    if (theme.maxWidthFrac) this.disposers.push(ui.screen.subscribe(redraw));
  }

  private redraw(): void {
    const cur = this.vd.currency.get();
    const label = this.vd.label ? this.ui.t(this.vd.label) : "";
    const amount = this.formatAmount(this.vd.get(), cur);
    // ВЕРХНИЙ регистр; лейбл с двоеточием, сумма отдельным Text (полная яркость)
    this.labelText.text = label ? `${label}:`.toUpperCase() : "";
    this.amountText.text = amount.toUpperCase();

    // раскладка в строку: label слева, gap, amount справа
    this.labelText.position.set(0, 0);
    this.amountText.position.set(this.labelText.width + (label ? this.theme.gap : 0), 0);

    // Анкор-флаги считаем ЖИВЫМИ из this.control.layout (НЕ замораживаем в конструкторе):
    // responsive-слой перезаписывает layout при смене ориентации ПОСЛЕ конструирования.
    // (total-win в landscape-дефолте bottom-center, в portrait bottom-right — заморозка
    //  давала центр-pivot в портрете → строка вылезала за правый край на полширины.)
    const a = this.control.layout.anchor;
    const rightAnchored = a.includes("right");
    const centerAnchored = a === "center" || (a.includes("center") && !a.includes("left") && !a.includes("right"));

    // fit по ширине экрана: если строка (с учётом layout-scale view) шире доли экрана —
    // ужимаем row.scale. Делаем ДО pivot (pivot в нескейленных локальных координатах).
    let fit = 1;
    if (this.theme.maxWidthFrac) {
      const screen = this.ui.screen.get();
      const avail = screen.width * this.theme.maxWidthFrac;
      // layout-scale берём детерминированно из placement (не из this.scale — тот может
      // отставать на кадр относительно ui.screen-подписки).
      const layoutScale = resolvePlacement(this.control.layout, screen).scale || 1;
      const eff = this.row.width * layoutScale;       // ширина строки на экране при scale=1
      if (eff > avail) fit = avail / eff;
    }
    // pivot в ЛОКАЛЬНЫХ (нескейленных) координатах (row.width ПОСЛЕ scale.set вернул бы
    // масштабированную ширину). Считаем при scale=1, потом применяем fit.
    this.row.scale.set(1);
    const trueW = this.row.width;
    const pivotX = centerAnchored ? trueW / 2 : rightAnchored ? trueW : 0;

    this.row.pivot.x = pivotX;
    this.row.scale.set(fit);
  }

  private formatAmount(value: number, cur: { code: string; decimals: number; symbol?: string; display?: string; position?: string }): string {
    const num = new Intl.NumberFormat("en-US", {
      minimumFractionDigits: cur.decimals,
      maximumFractionDigits: cur.decimals,
    }).format(value);
    const token = cur.display === "symbol" && cur.symbol ? cur.symbol : cur.code;
    return cur.position === "suffix" ? `${num} ${token}` : `${token}${cur.display === "symbol" ? "" : " "}${num}`;
  }
}
