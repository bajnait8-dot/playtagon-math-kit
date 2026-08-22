import type { Ticker } from 'pixi.js';
import type { OpenUI, SpecIssue } from '../slot-ui-core/index';
import type { ControlView } from './views/ControlView';
import type { ControlViewFactory } from './views/blockColumn';

/**
 * Вторая половина Charter P7. `controlSkins` подменяет вид ИЗВЕСТНОГО контрола;
 * здесь — вид контрола, которого библиотека не знает, зарегистрированного хостом
 * через `ui.register()`. Без этого чужой контрол зарегистрирован, но невидим,
 * и расширение UI под другие жанры упирается в рендер.
 *
 * Живёт отдельным модулем, а не внутри `OpenUIPixi`: решение «кому нужен view»
 * — чистая логика над реестром контролов, к отрисовке отношения не имеет. Так
 * она тестируется без WebGL — тем же приёмом, каким в ядре Control отделён от
 * ControlView.
 */
export function resolveExtraViews(
  ui: OpenUI,
  known: ReadonlySet<string>,
  extraViews: Partial<Record<string, ControlViewFactory>> = {},
  ticker: Ticker,
  onDataIssue?: (issue: SpecIssue) => void,
): Array<[string, ControlView]> {
  const out: Array<[string, ControlView]> = [];
  for (const snap of ui.snapshot()) {
    if (known.has(snap.id)) continue;
    const make = extraViews[snap.id];
    if (!make) {
      onDataIssue?.({
        level: 'warn',
        path: `controls.${snap.id}`,
        code: 'no-view',
        message: `Контрол "${snap.id}" зарегистрирован, но view для него нет — передайте extraViews["${snap.id}"].`,
      });
      continue;
    }
    const control = ui.control(snap.id);
    if (control) out.push([snap.id, make(control, ui, ticker)]);
  }
  return out;
}
