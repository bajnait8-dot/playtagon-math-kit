import { ReplayTransport } from "@playtagon/runtime/transport";
import type { DiceGameTypes, DiceReplayData } from "../server/model/types.js";
import type { ReplayRound } from "@playtagon/front-sdk";

const appEl = document.getElementById("app")!;

async function init() {
  const transport = new ReplayTransport<DiceGameTypes>();
  let round: ReplayRound<DiceGameTypes>;

  try {
    round = await transport.loadReplay();
  } catch (err) {
    appEl.innerHTML = `<div class="error">${(err as Error).message}</div>`;
    return;
  }

  function fmt(amount: number): string {
    const divisor = Math.pow(10, round.denomination);
    try {
      return new Intl.NumberFormat("en-US", { style: "currency", currency: round.currency }).format(amount / divisor);
    } catch {
      return (amount / divisor).toFixed(round.denomination) + " " + round.currency;
    }
  }

  function displayRoll(serverRoll: number): string {
    return (serverRoll / 100).toFixed(2);
  }

  function displayTarget(serverTarget: number): string {
    return (serverTarget / 100).toFixed(2);
  }

  const rows = round.stages.map((s, i) => {
    const r = s.replayData as DiceReplayData;
    const isWin = r.win > 0;
    return `<tr>
      <td>${i + 1}</td>
      <td>${r.condition}</td>
      <td>${displayTarget(r.target)}</td>
      <td>${displayRoll(r.roll)}</td>
      <td class="${isWin ? "win" : "lose"}">${isWin ? "WIN" : "MISS"}</td>
      <td>${r.multiplier.toFixed(4)}</td>
      <td>${fmt(r.bet)}</td>
      <td class="${isWin ? "win" : "lose"}">${fmt(r.win)}</td>
    </tr>`;
  }).join("");

  appEl.innerHTML = `
    <h1>Replay Viewer — Dice</h1>
    <div class="info">
      Round: <strong>${round.id.slice(0, 8)}</strong> |
      Balance at start: <strong>${fmt(round.balanceAtStart)}</strong> |
      Total Bet: <strong>${fmt(round.totalBet)}</strong> |
      Total Win: <strong class="${round.totalWin > 0 ? "win" : "lose"}">${fmt(round.totalWin)}</strong>
    </div>
    <table>
      <thead>
        <tr><th>#</th><th>Condition</th><th>Target</th><th>Roll</th><th>Result</th><th>Multiplier</th><th>Bet</th><th>Win</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

init();
