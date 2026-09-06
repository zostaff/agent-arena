/**
 * DEGEN VILLAGE — deterministic sim market.
 *
 * Momentum random walk per pair, folded into OHLC candles, with a synthetic
 * order book derived from the same seeded stream. Same seed, same tape.
 */

import type { BookLevel, Candle, Market, Snapshot } from "../core/types.js";
import { CandleAggregator, TICKS_PER_CANDLE } from "../core/market.js";
import { gaussian, mulberry32 } from "./rng.js";

export const DEFAULT_PAIRS = ["$RUG", "$MCAT", "$DGEN", "$WJK"] as const;

export interface SimPairConfig {
  symbol: string;
  startPrice: number;
  /** Per-tick volatility of the log return. */
  vol: number;
  /** How strongly the previous move carries into the next one, 0..1. */
  momentumDecay: number;
  /** Per-tick drift; negative pairs bleed by construction. */
  drift: number;
  /** ETH already in the bonding curve at tick zero. */
  reserveEth: number;
  /** Minutes since launch at tick zero. */
  ageMinutes: number;
}

/**
 * Per-tick sigma, not per-candle. The momentum term is AR(1), so a shock is
 * carried forward and amplified by roughly 1/(1 - momentumDecay); at 30 ticks
 * to a candle these numbers land a candle range in the low single-digit
 * percents, which is what a live memecoin tape actually looks like.
 */
export const DEFAULT_PAIR_CONFIG: readonly SimPairConfig[] = Object.freeze([
  { symbol: "$RUG", startPrice: 0.0000042, vol: 0.0021, momentumDecay: 0.86, drift: -0.000042, reserveEth: 3.1, ageMinutes: 2 },
  { symbol: "$MCAT", startPrice: 0.0000185, vol: 0.0011, momentumDecay: 0.74, drift: 0.000012, reserveEth: 11.4, ageMinutes: 14 },
  { symbol: "$DGEN", startPrice: 0.0000091, vol: 0.0015, momentumDecay: 0.81, drift: 0.000005, reserveEth: 6.8, ageMinutes: 6 },
  { symbol: "$WJK", startPrice: 0.0000337, vol: 0.0008, momentumDecay: 0.68, drift: 0.000018, reserveEth: 22.9, ageMinutes: 41 },
]);

/** ETH in the curve at which a pair graduates. */
export const GRADUATION_ETH = 85;
/** Hard ceiling on the curve so a runaway pair cannot break the book maths. */
export const MAX_RESERVE_ETH = 140;

interface PairState {
  cfg: SimPairConfig;
  price: number;
  momentum: number;
  reserveEth: number;
  uniqueBuyers: number;
  agg: CandleAggregator;
  /** Book regenerated once per candle so a snapshot inside a candle is stable. */
  bookEpoch: number;
  bids: BookLevel[];
  asks: BookLevel[];
}

export interface SimMarketOptions {
  seed?: number;
  pairs?: readonly SimPairConfig[];
  /** Ticks per candle; must match what the village assumes. */
  ticksPerCandle?: number;
  /** Candles pre-rolled before tick zero so a brain has history to read. */
  warmupCandles?: number;
}

export class SimMarket implements Market {
  readonly seed: number;
  private readonly rng: () => number;
  private readonly states = new Map<string, PairState>();
  private readonly ticksPerCandle: number;
  tick = 0;

  constructor(opts: SimMarketOptions = {}) {
    this.seed = opts.seed ?? 42;
    this.rng = mulberry32(this.seed);
    this.ticksPerCandle = opts.ticksPerCandle ?? TICKS_PER_CANDLE;
    const cfgs = opts.pairs ?? DEFAULT_PAIR_CONFIG;
    for (const cfg of cfgs) {
      this.states.set(cfg.symbol, {
        cfg,
        price: cfg.startPrice,
        momentum: 0,
        reserveEth: cfg.reserveEth,
        uniqueBuyers: 8 + Math.floor(this.rng() * 40),
        agg: new CandleAggregator(this.ticksPerCandle, 512),
        bookEpoch: -1,
        bids: [],
        asks: [],
      });
    }
    const warmup = (opts.warmupCandles ?? 8) * this.ticksPerCandle;
    for (let i = 0; i < warmup; i++) this.advance(1);
  }

  async listPairs(): Promise<string[]> {
    return [...this.states.keys()];
  }

  /** Steps every pair forward. The village calls this once per tick. */
  advance(ticks: number): void {
    for (let i = 0; i < ticks; i++) {
      this.tick += 1;
      for (const st of this.states.values()) {
        const shock = gaussian(this.rng) * st.cfg.vol;
        st.momentum = st.momentum * st.cfg.momentumDecay + shock;
        const ret = st.cfg.drift + st.momentum;
        st.price = Math.max(1e-12, st.price * Math.exp(ret));

        /* Buy flow slightly outweighs sell flow, so a curve fills over a run
           rather than instantly: roughly 4x reserve growth across 7000 ticks. */
        const volume = st.reserveEth * (0.0006 + Math.abs(ret) * 1.5) * (0.4 + this.rng());
        st.reserveEth = Math.max(
          0.05,
          Math.min(MAX_RESERVE_ETH, st.reserveEth + volume * (ret > 0 ? 0.514 : -0.486)),
        );
        if (this.rng() < 0.09) st.uniqueBuyers += 1;

        st.agg.push(this.tick, st.price, volume);
      }
    }
  }

  private ageMinutes(st: PairState): number {
    return st.cfg.ageMinutes + this.tick / 60;
  }

  /** Bonding curve fills at GRADUATION_ETH of reserve. */
  private curvePct(st: PairState): number {
    return Math.max(0, Math.min(100, (st.reserveEth / GRADUATION_ETH) * 100));
  }

  private refreshBook(st: PairState): void {
    const epoch = Math.floor(this.tick / this.ticksPerCandle);
    if (st.bookEpoch === epoch && st.bids.length > 0) return;
    st.bookEpoch = epoch;

    /* A thin curve quotes wide. This is where the GAS stat earns its keep:
       a young pair can price a fill outside an untrained agent's tolerance. */
    const spreadUnit = Math.max(0.0004, 0.035 / (1 + st.reserveEth * 0.9));
    const baseSize = Math.max(0.03, st.reserveEth / 45);
    const lean = Math.tanh(st.momentum * 90);
    const bids: BookLevel[] = [];
    const asks: BookLevel[] = [];
    for (let i = 0; i < 8; i++) {
      const step = spreadUnit * (i + 1) * 0.5;
      const bidSize = baseSize * (0.5 + this.rng() * 1.2) * (1 + lean) * (1 - i * 0.07);
      const askSize = baseSize * (0.5 + this.rng() * 1.2) * (1 - lean) * (1 - i * 0.07);
      bids.push({ price: st.price * (1 - step), size: Math.max(0.01, bidSize) });
      asks.push({ price: st.price * (1 + step), size: Math.max(0.01, askSize) });
    }
    st.bids = bids;
    st.asks = asks;
  }

  async snapshot(pair: string, ctxCandles: number): Promise<Snapshot> {
    const st = this.states.get(pair);
    if (!st) throw new Error(`sim: unknown pair ${pair}`);
    this.refreshBook(st);
    const candles: Candle[] = st.agg.view(Math.max(1, ctxCandles));
    return {
      pair,
      last: st.price,
      candles,
      bids: st.bids.map((l) => ({ ...l })),
      asks: st.asks.map((l) => ({ ...l })),
      ageMinutes: this.ageMinutes(st),
      uniqueBuyers: st.uniqueBuyers,
      curveProgressPct: this.curvePct(st),
      reserveEth: st.reserveEth,
    };
  }
}
