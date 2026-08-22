import { renderHistoryHtml } from "./history";

/**
 * Всплывающая история ставок — HTML-слой поверх канваса.
 *
 * Зачем HTML, а не Pixi: список длинный (до MAX_ENTRIES записей с roundId), ему
 * нужен нативный скролл и перенос строк. В Pixi это пришлось бы писать руками, а
 * разметка УЖЕ ЕСТЬ — renderHistoryHtml рисует ту же вкладку в info-меню.
 *
 * Почему не открываем сразу вкладку HISTORY в info-меню: его setOpen() жёстко
 * зовёт showPane('info'), а наружу отдаёт только open()/close() — попасть на
 * нужную панель нельзя, не правя вендорный пакет (он генерится из packages/,
 * и правка потребовала бы vendor-sync ради одного шеврона).
 *
 * Слой кладём в контейнер игры, а не в body: там же живёт слой 3D-кубиков, и
 * порядок z-index считается в одной системе координат.
 */
export interface HistoryPopover {
  open(): void;
  close(): void;
  toggle(): void;
  readonly isOpen: boolean;
  dispose(): void;
}

export interface HistoryPopoverOptions {
  /** Формат МАЖОРНЫХ юнитов с валютой — тот же, что во вкладке info-меню. */
  format(major: number): string;
  /** Закрылось (тап по фону / ✕) — HUD снимает подсветку с шеврона. */
  onClose?(): void;
}

const CSS = `
.sb-hist {
  position: absolute; inset: 0; z-index: 40;
  display: none; align-items: flex-end; justify-content: center;
  background: rgba(0, 0, 0, .55);
  font-family: Oswald, system-ui, sans-serif;
}
.sb-hist.open { display: flex; }
.sb-hist__sheet {
  width: 100%; max-height: 70%;
  display: flex; flex-direction: column;
  background: #12241f;
  border-top-left-radius: 16px; border-top-right-radius: 16px;
  box-shadow: 0 -8px 32px rgba(0, 0, 0, .5);
  color: #f2efe0;
  transform: translateY(100%);
  transition: transform .24s cubic-bezier(.2, .8, .3, 1);
}
.sb-hist.open .sb-hist__sheet { transform: translateY(0); }
.sb-hist__head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 18px 10px;
  border-bottom: 1px solid rgba(242, 239, 224, .14);
}
.sb-hist__title { font-size: 18px; font-weight: 700; letter-spacing: .04em; }
.sb-hist__close {
  width: 32px; height: 32px; padding: 0;
  background: none; border: 0; cursor: pointer;
  color: #f2efe0; font-size: 22px; line-height: 1;
}
.sb-hist__body {
  padding: 4px 18px 18px;
  overflow-y: auto; -webkit-overflow-scrolling: touch;
}
/* Разметку отдаёт renderHistoryHtml — она писалась под светлое info-меню,
   поэтому её служебные классы перекрашиваем под тёмный лист. */
.sb-hist__body .ohm-hint { color: rgba(242, 239, 224, .6); font-size: 13px; }
.sb-hist__body .ohm-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; font-size: 15px; }
.sb-hist__body > .ohm-setting > div { border-bottom-color: rgba(242, 239, 224, .12) !important; }
`;

export function mountHistoryPopover(host: HTMLElement, opts: HistoryPopoverOptions): HistoryPopover {
  const layer = document.createElement("div");
  layer.className = "sb-hist";
  layer.innerHTML =
    '<div class="sb-hist__sheet">' +
    '<div class="sb-hist__head">' +
    '<span class="sb-hist__title">HISTORY</span>' +
    '<button class="sb-hist__close" data-close aria-label="Close">&times;</button>' +
    '</div>' +
    '<div class="sb-hist__body"></div>' +
    '</div>';

  const style = document.createElement("style");
  style.textContent = CSS;
  layer.appendChild(style);

  // Контейнер игры — точка отсчёта для absolute-слоя, иначе он ляжет
  // относительно body (та же оговорка, что в diceOverlay).
  if (getComputedStyle(host).position === "static") host.style.position = "relative";
  host.appendChild(layer);

  const body = layer.querySelector<HTMLElement>(".sb-hist__body")!;
  const sheet = layer.querySelector<HTMLElement>(".sb-hist__sheet")!;
  let open = false;

  const setOpen = (next: boolean): void => {
    if (open === next) return;
    open = next;
    // Содержимое перерисовываем на КАЖДОМ открытии: история живая, кэш соврёт.
    if (next) body.innerHTML = renderHistoryHtml(opts.format);
    layer.classList.toggle("open", next);
    if (!next) opts.onClose?.();
  };

  // Тап по ФОНУ закрывает, тап по самому листу — нет: иначе скролл списка
  // пальцем закрывал бы окно на каждом касании.
  layer.addEventListener("pointerup", (e) => {
    if (!sheet.contains(e.target as Node)) setOpen(false);
  });
  layer.querySelector("[data-close]")!.addEventListener("click", () => setOpen(false));

  return {
    open: () => setOpen(true),
    close: () => setOpen(false),
    toggle: () => setOpen(!open),
    get isOpen() { return open; },
    dispose() {
      layer.remove();
    },
  };
}
