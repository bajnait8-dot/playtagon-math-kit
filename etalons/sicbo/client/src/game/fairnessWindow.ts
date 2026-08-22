import { Application, Container, Graphics, Rectangle, Text } from "pixi.js";
import type { OpenUI } from "../vendor/slot-ui-core/index";
import { makeWindowAnim } from "./windowAnim";
import { sfx, noteActivity } from "./sound";
import type { PFService } from "./pf";
import type { SeedState } from "@playtagon/front-sdk";

/**
 * PROVABLY FAIR — окно проверки честности. Содержимое перенесено из клиента
 * DICE (shared/components/FairnessWindow.tsx): активная пара сидов, счётчик
 * ставок на паре, следующий серверный хеш и смена клиентского сида. Данные даёт
 * SDK через pf.ts.
 *
 * Раскладка — как у окна BET AMOUNT (betPicker.ts): стеклянная карточка,
 * POP-анимация, тап мимо закрывает. Открывается из GAME MENU строкой
 * «PROVABLY FAIR» — так же, как оттуда открывается GAME INFO.
 */

const RADIUS = 40;
const PAD = 30;
const ROW_GAP = 22;
/** Ширина карточки по ориентациям (в дизайн-px): сиды длинные, нужна ширина. */
const CARD_W = { landscape: 720, portrait: 640 } as const;
const TITLE_FONT = { landscape: 26, portrait: 40 } as const;
const LABEL_FONT = { landscape: 15, portrait: 26 } as const;
const VALUE_FONT = { landscape: 17, portrait: 28 } as const;

export interface FairnessWindowHandle {
  view: Container;
  applyLayout: (screenW: number, screenH: number) => void;
  open: () => void;
  close: () => void;
  dispose: () => void;
}

export function mountFairnessWindow(
  app: Application,
  ui: OpenUI,
  pf: PFService,
): FairnessWindowHandle {
  const disposers: Array<() => void> = [];
  const root = new Container();
  root.zIndex = 20_000;
  root.visible = false;
  root.eventMode = "static";

  const catcher = new Graphics();
  catcher.eventMode = "static";
  catcher.on("pointertap", () => close());
  root.addChild(catcher);

  const card = new Container();
  card.eventMode = "static"; // тап по карточке не всплывает до catcher
  root.addChild(card);

  const font = ui.theme.type.family;
  const cardBg = new Graphics();
  card.addChild(cardBg);

  const title = new Text({
    text: "PROVABLY FAIR",
    style: { fontFamily: font, fontSize: TITLE_FONT.landscape, fontWeight: "700", fill: 0xffffff },
  });
  title.anchor.set(0.5, 0.5);
  card.addChild(title);

  const rowsWrap = new Container();
  card.addChild(rowsWrap);

  /** Сообщение об ошибке — PF не должен ронять игру, показываем внутри окна. */
  const errorText = new Text({
    text: "",
    style: { fontFamily: font, fontSize: LABEL_FONT.landscape, fontWeight: "400", fill: 0xff6b6b, wordWrap: true },
  });
  errorText.visible = false;
  card.addChild(errorText);

  let seed: SeedState | null = null;
  let error = "";
  /** Активная вкладка: сиды (что сейчас в игре) или проверка (пересчёт раунда). */
  let tab: "seeds" | "verify" = "seeds";
  // Поля вкладки VERIFY. Сиды вставляются из буфера (их игрок копирует на
  // вкладке SEEDS или получает после ротации), номер ставки — счётчиком.
  let vServerSeed = "";
  let vClientSeed = "";
  let vNonce = 0;
  let vResult = "";
  let verifying = false;
  let cardW: number = CARD_W.landscape;
  let cardH = 400;
  let mode: "landscape" | "portrait" = "landscape";

  /** Длинные хеши не влезают — режем середину, как это делает dice. */
  const short = (s: string, keep: number): string =>
    s.length <= keep * 2 + 3 ? s : `${s.slice(0, keep)}…${s.slice(-keep)}`;

  const copy = (value: string): void => {
    void navigator.clipboard?.writeText(value).catch(() => { /* буфер недоступен — не беда */ });
    sfx("ui_click");
  };

  /** Одна строка «подпись → значение (+ кнопка)». */
  const makeRow = (
    label: string,
    value: string,
    y: number,
    action?: { text: string; onTap: () => void },
  ): number => {
    const row = new Container();
    row.position.set(PAD, y);

    const cap = new Text({
      text: label,
      style: { fontFamily: font, fontSize: LABEL_FONT[mode], fontWeight: "200", fill: 0xffffff },
    });
    cap.alpha = 0.7;
    row.addChild(cap);

    const val = new Text({
      text: value,
      style: { fontFamily: font, fontSize: VALUE_FONT[mode], fontWeight: "700", fill: 0xffffff },
    });
    val.position.set(0, cap.height + 6);
    row.addChild(val);

    // Кнопка справа: «COPY» для значений, «CHANGE» для смены клиентского сида.
    const btnLabel = action?.text ?? "COPY";
    const btn = new Text({
      text: btnLabel,
      style: { fontFamily: font, fontSize: LABEL_FONT[mode], fontWeight: "700", fill: 0x9bf3ef },
    });
    btn.anchor.set(1, 0);
    btn.position.set(cardW - PAD * 2, cap.height + 6);
    btn.eventMode = "static";
    btn.cursor = "pointer";
    btn.hitArea = new Rectangle(-btn.width - 12, -10, btn.width + 24, btn.height + 20);
    btn.on("pointertap", (e) => {
      e.stopPropagation();
      noteActivity();
      if (action) action.onTap(); else copy(value);
    });
    row.addChild(btn);

    rowsWrap.addChild(row);
    return row.height + ROW_GAP;
  };

  /** Переключатель вкладок под заголовком: SEEDS · VERIFY. */
  const makeTabs = (y: number): number => {
    const row = new Container();
    row.position.set(PAD, y);
    const mk = (label: string, key: "seeds" | "verify", x: number): number => {
      const t = new Text({
        text: label,
        style: { fontFamily: font, fontSize: LABEL_FONT[mode] + 2, fontWeight: "700", fill: tab === key ? 0x9bf3ef : 0xffffff },
      });
      t.alpha = tab === key ? 1 : 0.5;
      t.position.set(x, 0);
      t.eventMode = "static";
      t.cursor = "pointer";
      t.hitArea = new Rectangle(-10, -10, t.width + 20, t.height + 20);
      t.on("pointertap", (e) => {
        e.stopPropagation();
        if (tab === key) return;
        tab = key;
        sfx("ui_click");
        rebuild();
        applyLayout(app.screen.width, app.screen.height);
      });
      row.addChild(t);
      return t.width;
    };
    const w1 = mk("SEEDS", "seeds", 0);
    mk("VERIFY", "verify", w1 + 28);
    rowsWrap.addChild(row);
    return row.height + ROW_GAP;
  };

  /** Строка вкладки VERIFY: значение вставляется из буфера обмена. */
  const makePasteRow = (label: string, value: string, y: number, onSet: (v: string) => void): number => {
    return makeRow(label, value || "tap PASTE", y, {
      text: value ? "CLEAR" : "PASTE",
      onTap: () => {
        if (value) { onSet(""); return; }
        void navigator.clipboard?.readText()
          .then((t) => onSet(t.trim()))
          .catch(() => { error = "Clipboard is not available — check browser permissions."; rebuild(); });
      },
    });
  };

  const rebuild = (): void => {
    rowsWrap.removeChildren().forEach((c) => c.destroy({ children: true }));
    title.style.fontSize = TITLE_FONT[mode];
    cardW = CARD_W[mode];

    const titleZone = TITLE_FONT[mode] + 40;
    let y = makeTabs(0);

    if (tab === "verify") {
      // Пересчёт раунда по чужой паре сидов: игрок вставляет раскрытый серверный
      // сид, свой клиентский и номер ставки — сервер прогоняет тот же поток.
      y += makePasteRow("SERVER SEED (REVEALED)", vServerSeed, y, (v) => {
        vServerSeed = v; vResult = ""; rebuild(); applyLayout(app.screen.width, app.screen.height);
      });
      y += makePasteRow("CLIENT SEED", vClientSeed, y, (v) => {
        vClientSeed = v; vResult = ""; rebuild(); applyLayout(app.screen.width, app.screen.height);
      });
      y += makeRow("BET NUMBER (NONCE)", String(vNonce), y, {
        text: "+1",
        onTap: () => { vNonce++; vResult = ""; rebuild(); applyLayout(app.screen.width, app.screen.height); },
      });
      y += makeRow(
        "RESULT",
        verifying ? "checking…" : vResult || "fill both seeds, then VERIFY",
        y,
        { text: "VERIFY", onTap: () => { void handleVerify(); } },
      );
      rowsWrap.position.set(0, PAD + titleZone);
      cardH = PAD * 2 + titleZone + y;
      finishCard(titleZone);
      return;
    }

    if (seed) {
      // Активная пара: по ней считались все прошлые раунды.
      y += makeRow("ACTIVE CLIENT SEED", seed.clientSeed, y);
      y += makeRow("ACTIVE SERVER SEED (HASHED)", short(seed.serverSeedHash, 16), y);
      y += makeRow("BETS WITH THIS PAIR", String(seed.nonce), y);
      // Следующая пара: хеш публикуется ЗАРАНЕЕ — в этом и смысл проверки.
      y += makeRow("NEXT SERVER SEED (HASHED)", short(seed.nextServerSeedHash, 16), y);
      y += makeRow("CLIENT SEED", "tap CHANGE for a new one", y, {
        text: "CHANGE",
        onTap: () => { void handleRotate(); },
      });
    } else if (!error) {
      y += makeRow("STATUS", "loading…", y);
    }

    rowsWrap.position.set(0, PAD + titleZone);
    cardH = PAD * 2 + titleZone + y;
    finishCard(titleZone);
  };

  /** Дорисовать подложку и ошибку — общее для обеих вкладок. */
  const finishCard = (titleZone: number): void => {
    errorText.visible = !!error;
    if (error) {
      errorText.text = error;
      errorText.style.fontSize = LABEL_FONT[mode];
      errorText.style.wordWrapWidth = cardW - PAD * 2;
      errorText.position.set(PAD, cardH - PAD);
      cardH += errorText.height + 10;
    }

    cardBg.clear()
      .roundRect(0, 0, cardW, cardH, RADIUS).fill({ color: 0x000000, alpha: 0.85 })
      .roundRect(5, 5, cardW - 10, cardH - 10, RADIUS - 5).fill({ color: 0xffffff, alpha: 0.1 })
      .stroke({ width: 2, color: 0xffffff, alpha: 0.3 });
    title.position.set(cardW / 2, PAD + titleZone / 2);
  };

  async function refresh(): Promise<void> {
    try {
      seed = await pf.getSeedState();
      error = "";
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    rebuild();
    applyLayout(app.screen.width, app.screen.height);
  }

  /** Пересчитать раунд по вставленным сидам и показать раскладку мин. */
  async function handleVerify(): Promise<void> {
    if (!vServerSeed || !vClientSeed) {
      error = "Paste both seeds first.";
      rebuild();
      applyLayout(app.screen.width, app.screen.height);
      return;
    }
    verifying = true;
    error = "";
    rebuild();
    try {
      const rounds = await pf.verify(vServerSeed, vClientSeed, vNonce, vNonce);
      const data = rounds[0]?.data;
      // Показываем сам бросок и его сумму — это всё, что даёт RNG в Sic Bo.
      vResult = data
        ? `dice ${data.roll.join(" · ")} — total ${data.roll.reduce((s: number, v: number) => s + v, 0)}`
        : "no result for this nonce";
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      vResult = "";
    }
    verifying = false;
    rebuild();
    applyLayout(app.screen.width, app.screen.height);
  }

  async function handleRotate(): Promise<void> {
    try {
      const { state } = await pf.rotateAndReveal();
      seed = state;
      error = "";
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    rebuild();
    applyLayout(app.screen.width, app.screen.height);
  }

  let baseScale = 1;
  const applyLayout = (screenW: number, screenH: number): void => {
    catcher.clear().rect(0, 0, screenW, screenH).fill({ color: 0x000000, alpha: 0.001 });
    const next: "landscape" | "portrait" = screenH > screenW ? "portrait" : "landscape";
    if (next !== mode) { mode = next; rebuild(); }
    // Окно длинное — вписываем по обеим осям и держим по центру (как betPicker
    // в portrait; здесь так же и в landscape, кнопки-владельца у него нет).
    const s = Math.min((screenW - 32) / cardW, (screenH - 32) / cardH, 1);
    baseScale = s;
    card.scale.set(s);
    card.position.set(
      Math.round((screenW - cardW * s) / 2),
      Math.max(16, Math.round(screenH * 0.5 - (cardH * s) / 2)),
    );
  };
  rebuild();
  applyLayout(app.screen.width, app.screen.height);

  const anim = makeWindowAnim(root, card, () => baseScale);
  let shown = false;
  const open = (): void => {
    if (shown) return;
    shown = true;
    void refresh(); // состояние сидов могло измениться с прошлого открытия
    anim.open();
  };
  const close = (): void => {
    if (!shown) return;
    shown = false;
    anim.close();
  };

  const dispose = (): void => {
    anim.dispose();
    for (const d of disposers) d();
    if (!root.destroyed) root.destroy({ children: true });
  };

  return { view: root, applyLayout, open, close, dispose };
}
