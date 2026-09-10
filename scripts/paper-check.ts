/** Read-only live-feed smoke/soak check. No wallet, model keys or exchange orders. */
import assert from "node:assert/strict";
import { Village } from "../src/core/village.js";
import { PaperAccount } from "../src/core/paper.js";
import { CoinbasePaperMarket } from "../src/paper/coinbase.js";
import { heuristicBrain } from "../src/sim/brain.js";
import { mulberry32 } from "../src/sim/rng.js";

const seconds = Number(process.env.PAPER_CHECK_SECONDS ?? "180");
assert(Number.isFinite(seconds) && seconds > 0, "PAPER_CHECK_SECONDS must be positive");
const account = new PaperAccount();
const market = new CoinbasePaperMarket();
const village = new Village({market, brain: heuristicBrain(), paperAccount: account,
  rng: mulberry32(42), blockingDecisions: true});
const started = Date.now();
let nextReport = started;
let liveReads = 0;
let errorReads = 0;
while (Date.now() - started < seconds * 1000) {
  if (Date.now() >= nextReport) {
    await market.refresh();
    const status = market.status();
    if (status.state === "live") liveReads++; else errorReads++;
    console.log(JSON.stringify({seconds: Math.round((Date.now() - started) / 1000),
      feed: status.state, message: status.message, ticks: village.tick,
      cashEth: account.cashEth, fillsInRecentTape: village.tape.length}));
    nextReport = Date.now() + 10000;
  }
  await village.step();
  const locked = village.agents.reduce((sum, a) => sum + (a.position ? a.position.sizeEth + a.position.feePaidEth : 0), 0);
  const realized = village.agents.reduce((sum, a) => sum + a.realizedPnlEth, 0);
  assert(Number.isFinite(account.cashEth) && account.cashEth >= 0, "Invalid cash balance");
  assert(Math.abs(account.cashEth + locked - account.initialEth - realized) < 1e-9, "Ledger reconciliation failed");
  await new Promise(resolve => setTimeout(resolve, 1000 / 60));
}
console.log(JSON.stringify({result: "complete", seconds: Math.round((Date.now() - started) / 1000),
  ticks: village.tick, liveReads, errorReads,
  closedTrades: village.agents.reduce((sum, a) => sum + a.trades, 0),
  openPositions: village.agents.filter(a => a.position).length,
  cashEth: account.cashEth}));
assert(liveReads > 0, "No complete fresh market observation received");
