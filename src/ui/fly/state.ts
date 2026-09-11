import type { VillageView } from "../../core/village.js";
import type { Candle, Snapshot } from "../../core/types.js";
import { compileConfig, usdToEth } from "../../core/config.js";
import { FLY_STATS } from "../../core/fly.js";

export type FlyView = Partial<VillageView> | null | undefined;
export type AgentView = VillageView["agents"][number];
export type CoinView = VillageView["snapshots"][number];
export const CHANNEL_TICKS = 240;
export const finite = (n: number | undefined, fallback = 0): number =>
  typeof n === "number" && Number.isFinite(n) ? n : fallback;
export const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
export const signed = (n: number, places = 2) => `${n >= 0 ? "+" : ""}${finite(n).toFixed(places)}`;
export function flyNet(agent?: AgentView) {
  return finite(agent?.realizedPnlEth) + finite(agent?.unrealizedPnlEth) - usdToEth(finite(agent?.spentUsd));
}
export function flyConfig(agent?: AgentView) {
  return agent?.config ?? compileConfig(FLY_STATS, 1, [], { basePositionEth: 0.01, provider: "connectome" });
}

/** Actual snapshots include the forming candle. Launch price is not available in this adapter. */
export function windowMove(snap: Snapshot) {
  const start = snap.candles?.find((c) => Number.isFinite(c.o) && c.o > 0)?.o;
  return start ? (finite(snap.last, start) - start) / start : 0;
}
export function interest(coin: CoinView) {
  const cs = coin.snap.candles ?? [];
  const prev = cs[Math.max(0, cs.length - 6)]?.c;
  const mom = prev && prev > 0 ? (coin.snap.last - prev) / prev : 0;
  return Math.max(Math.abs(windowMove(coin.snap)), Math.abs(finite(mom)));
}
/** Even slots guarantee coverage in stable pair order; odd slots visit current movers.
 * Fairness does not depend on the ranking staying still. A position always wins.
 */
export function monitorCoin(coins: readonly CoinView[], tick: number, station: number, pair?: string) {
  if (pair) return coins.find((c) => c.pair === pair);
  if (!coins.length) return undefined;
  const ordered = [...coins].sort((a, b) => a.pair.localeCompare(b.pair));
  const slot = Math.floor(Math.max(0, finite(tick)) / CHANNEL_TICKS);
  const lap = Math.floor(slot / 2) + station;
  if (slot % 2 === 0) return ordered[lap % ordered.length];
  const ranked = [...ordered].sort((a, b) => interest(b) - interest(a) || a.pair.localeCompare(b.pair));
  // Prefer the strongest mover, but do not repeat the preceding coverage channel.
  const previous = ordered[lap % ordered.length];
  return ranked.find((c) => c.pair !== previous.pair) ?? previous;
}

export function chartData(snap?: Snapshot, entry?: number) {
  const candles: Candle[] = (snap?.candles ?? []).filter((c) =>
    [c.o, c.h, c.l, c.c].every(Number.isFinite)).slice(-36);
  const price = finite(snap?.last, candles.at(-1)?.c ?? 0);
  const values = [price, ...candles.flatMap((c) => [c.o, c.h, c.l, c.c])];
  if (entry !== undefined && Number.isFinite(entry)) values.push(entry);
  const low = Math.min(...values), high = Math.max(...values);
  const pad = Math.max((high - low) * 0.1, Math.abs(price) * 0.002, 1e-12);
  const min = low - pad, range = Math.max(high - low + pad * 2, 1e-12);
  return { candles, price, min, range, y: (n: number) => 162 - (finite(n, price) - min) / range * 140 };
}

export function neuralState(agent: AgentView | undefined, tick: number) {
  const holding = Boolean(agent?.position);
  const pnl = flyNet(agent);
  const dopamine = clamp(86.7 + Math.sin(tick * 0.013) * 3.5 + Math.tanh(pnl * 120) * 32, 48, 126);
  const spikes = Math.round((holding ? 1_250_000 : 625_000) * (1 + 0.075 * Math.sin(tick * 0.09)));
  const cells = Array.from({ length: 15 * 58 }, (_, i) => {
    const cell = Math.floor(i / 58), column = i % 58;
    const signal = Math.sin(cell * 3.91 + column * 1.72 + tick * 0.11) +
      Math.sin(cell * 0.81 - column * 2.37 + tick * 0.073);
    return { cell, column, on: signal > (holding ? -0.3 : 1.15) };
  });
  // The engine is spot-only: SELL means an actual exit, never an invented short.
  const exiting = holding && (agent?.state === "SETTLE" || agent?.verdict?.action === "SELL");
  const beat = 0.035 * Math.sin(tick * 0.16);
  const buy = holding && !exiting ? 0.91 + beat : 0;
  const sell = exiting ? 0.95 + beat : 0;
  const hold = !holding ? 0.96 + beat : 0.04;
  return { holding, dopamine, spikes, cells, motors: { BUY: buy, SELL: sell, HOLD: hold } };
}
