/**
 * DEGEN VILLAGE — market primitives shared by sim and live.
 * Zero dependencies, isomorphic.
 */

import type { BookLevel, Candle, Snapshot } from "./types.js";

/** Ticks folded into one candle by the sim clock. */
export const TICKS_PER_CANDLE = 30;

/**
 * Folds a tick stream into OHLC candles. Both markets use it so a sim candle
 * and a live candle mean the same thing to a brain.
 */
export class CandleAggregator {
  private readonly candles: Candle[] = [];
  private open = 0;
  private high = 0;
  private low = 0;
  private close = 0;
  private volume = 0;
  private startedAt = 0;
  private filled = 0;

  constructor(
    private readonly ticksPerCandle: number = TICKS_PER_CANDLE,
    private readonly maxCandles: number = 512,
  ) {}

  push(tick: number, price: number, volume: number): void {
    if (this.filled === 0) {
      this.startedAt = tick;
      this.open = price;
      this.high = price;
      this.low = price;
      this.volume = 0;
    }
    this.high = Math.max(this.high, price);
    this.low = Math.min(this.low, price);
    this.close = price;
    this.volume += volume;
    this.filled += 1;
    if (this.filled >= this.ticksPerCandle) this.seal();
  }

  private seal(): void {
    this.candles.push({
      t: this.startedAt,
      o: this.open,
      h: this.high,
      l: this.low,
      c: this.close,
      v: this.volume,
    });
    if (this.candles.length > this.maxCandles) {
      this.candles.splice(0, this.candles.length - this.maxCandles);
    }
    this.filled = 0;
  }

  /** Sealed candles plus the candle currently forming, newest last. */
  view(limit: number): Candle[] {
    const live: Candle[] =
      this.filled > 0
        ? [
            {
              t: this.startedAt,
              o: this.open,
              h: this.high,
              l: this.low,
              c: this.close,
              v: this.volume,
            },
          ]
        : [];
    const all = this.candles.concat(live);
    return all.slice(Math.max(0, all.length - limit));
  }

  get length(): number {
    return this.candles.length + (this.filled > 0 ? 1 : 0);
  }
}

/** Fractional close-to-close change across the last `lookback` candles. */
export function momentum(candles: readonly Candle[], lookback: number): number {
  if (candles.length < 2) return 0;
  const n = Math.min(lookback, candles.length);
  const first = candles[candles.length - n];
  const last = candles[candles.length - 1];
  if (!first || !last || first.c === 0) return 0;
  return (last.c - first.c) / first.c;
}

/** Mean absolute candle range as a fraction of close. */
export function volatility(candles: readonly Candle[], lookback: number): number {
  if (candles.length === 0) return 0;
  const n = Math.min(lookback, candles.length);
  let acc = 0;
  for (let i = candles.length - n; i < candles.length; i++) {
    const c = candles[i];
    if (c.c === 0) continue;
    acc += (c.h - c.l) / c.c;
  }
  return acc / n;
}

export function depth(levels: readonly BookLevel[]): number {
  let acc = 0;
  for (const l of levels) acc += l.size;
  return acc;
}

/**
 * Book imbalance in [-1, 1]. Positive means bids outweigh asks — buyers are
 * leaning in. `requireBookAlign` strategies read this.
 */
export function bookImbalance(snap: Snapshot): number {
  const b = depth(snap.bids);
  const a = depth(snap.asks);
  const total = b + a;
  if (total === 0) return 0;
  return (b - a) / total;
}

export function spreadBps(snap: Snapshot): number {
  const bestBid = snap.bids[0]?.price ?? 0;
  const bestAsk = snap.asks[0]?.price ?? 0;
  if (bestBid <= 0 || bestAsk <= 0) return 0;
  const mid = (bestBid + bestAsk) / 2;
  return ((bestAsk - bestBid) / mid) * 10_000;
}

/** Price after slippage on a buy of `sizeEth`, walking the ask side. */
export function fillPrice(
  levels: readonly BookLevel[],
  sizeEth: number,
  fallback: number,
): number {
  if (levels.length === 0 || sizeEth <= 0) return fallback;
  let remaining = sizeEth;
  let cost = 0;
  for (const level of levels) {
    const take = Math.min(remaining, level.size);
    cost += take * level.price;
    remaining -= take;
    if (remaining <= 1e-12) break;
  }
  if (remaining > 1e-12) {
    const last = levels[levels.length - 1];
    cost += remaining * last.price;
  }
  return cost / sizeEth;
}

function round(n: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

/**
 * The exact text the live brain sends. Compact on purpose — every candle costs
 * roughly TOKENS_PER_CANDLE, and the player paid PTN for each one.
 */
export function serializeSnapshot(snap: Snapshot, ctxCandles: number): string {
  const candles = snap.candles.slice(Math.max(0, snap.candles.length - ctxCandles));
  const rows = candles
    .map(
      (c) =>
        `${c.t},${round(c.o, 8)},${round(c.h, 8)},${round(c.l, 8)},${round(c.c, 8)},${round(c.v, 4)}`,
    )
    .join("\n");
  const bids = snap.bids
    .slice(0, 8)
    .map((l) => `${round(l.price, 8)}x${round(l.size, 4)}`)
    .join(" ");
  const asks = snap.asks
    .slice(0, 8)
    .map((l) => `${round(l.price, 8)}x${round(l.size, 4)}`)
    .join(" ");
  return [
    `PAIR ${snap.pair}`,
    `LAST ${round(snap.last, 8)}`,
    `AGE_MINUTES ${round(snap.ageMinutes, 2)}`,
    `UNIQUE_BUYERS ${snap.uniqueBuyers}`,
    `CURVE_PROGRESS_PCT ${round(snap.curveProgressPct, 2)}`,
    `RESERVE_ETH ${round(snap.reserveEth, 4)}`,
    `SPREAD_BPS ${round(spreadBps(snap), 1)}`,
    `BOOK_IMBALANCE ${round(bookImbalance(snap), 4)}`,
    "",
    `CANDLES t,o,h,l,c,v (${candles.length}, oldest first)`,
    rows,
    "",
    `BIDS ${bids}`,
    `ASKS ${asks}`,
  ].join("\n");
}
