import { describe, expect, it } from "vitest";
import {
  CandleAggregator,
  bookImbalance,
  fillPrice,
  momentum,
  serializeSnapshot,
  spreadBps,
  volatility,
} from "../src/core/market.js";
import { DEFAULT_PAIRS, SimMarket } from "../src/sim/market.js";
import { mulberry32 } from "../src/sim/rng.js";
import { iso, sortByDepth } from "../src/ui/iso.js";

describe("mulberry32", () => {
  it("is deterministic and stays inside [0, 1)", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 500; i++) {
      const v = a();
      expect(v).toBe(b());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
  it("separates streams by seed", () => {
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
  });
});

describe("candle aggregation", () => {
  it("seals a candle every N ticks with correct OHLC", () => {
    const agg = new CandleAggregator(4, 10);
    agg.push(1, 10, 1);
    agg.push(2, 14, 1);
    agg.push(3, 6, 1);
    agg.push(4, 12, 1);
    const [c] = agg.view(1);
    expect(c).toEqual({ t: 1, o: 10, h: 14, l: 6, c: 12, v: 4 });
  });
  it("exposes the candle currently forming", () => {
    const agg = new CandleAggregator(4, 10);
    agg.push(1, 10, 1);
    agg.push(2, 11, 1);
    expect(agg.view(5)).toHaveLength(1);
    expect(agg.view(5)[0].c).toBe(11);
  });
});

describe("signal helpers", () => {
  const candles = [
    { t: 0, o: 1, h: 1.1, l: 0.9, c: 1, v: 1 },
    { t: 1, o: 1, h: 1.2, l: 1, c: 1.1, v: 1 },
    { t: 2, o: 1.1, h: 1.3, l: 1.05, c: 1.2, v: 1 },
  ];
  it("computes close-to-close momentum", () => {
    expect(momentum(candles, 3)).toBeCloseTo(0.2, 12);
    expect(momentum([], 3)).toBe(0);
  });
  it("computes mean candle range", () => {
    expect(volatility(candles, 3)).toBeGreaterThan(0);
  });
  it("computes book imbalance and spread", () => {
    const snap = {
      pair: "$X",
      last: 100,
      candles,
      bids: [{ price: 99, size: 3 }],
      asks: [{ price: 101, size: 1 }],
      ageMinutes: 1,
      uniqueBuyers: 1,
      curveProgressPct: 1,
      reserveEth: 1,
    };
    expect(bookImbalance(snap)).toBeCloseTo(0.5, 12);
    expect(spreadBps(snap)).toBeCloseTo(200, 6);
    expect(serializeSnapshot(snap, 2)).toContain("PAIR $X");
    expect(serializeSnapshot(snap, 2).split("\n").filter((l) => l.startsWith("0,") || l.startsWith("1,") || l.startsWith("2,"))).toHaveLength(2);
  });
  it("walks the book for a fill price", () => {
    const asks = [
      { price: 10, size: 1 },
      { price: 12, size: 1 },
    ];
    expect(fillPrice(asks, 1, 10)).toBe(10);
    expect(fillPrice(asks, 2, 10)).toBe(11);
    /* Beyond the book, the last level is extrapolated rather than free. */
    expect(fillPrice(asks, 4, 10)).toBe(11.5);
    expect(fillPrice([], 1, 7)).toBe(7);
  });
});

describe("sim market", () => {
  it("lists the four default pairs", async () => {
    const m = new SimMarket({ seed: 42 });
    expect(await m.listPairs()).toEqual([...DEFAULT_PAIRS]);
  });

  it("returns a snapshot with a bounded curve and a two-sided book", async () => {
    const m = new SimMarket({ seed: 42 });
    m.advance(3000);
    const s = await m.snapshot("$MCAT", 40);
    expect(s.candles.length).toBeGreaterThan(10);
    expect(s.candles.length).toBeLessThanOrEqual(40);
    expect(s.bids).toHaveLength(8);
    expect(s.asks).toHaveLength(8);
    expect(s.bids[0].price).toBeLessThan(s.last);
    expect(s.asks[0].price).toBeGreaterThan(s.last);
    expect(s.curveProgressPct).toBeGreaterThanOrEqual(0);
    expect(s.curveProgressPct).toBeLessThanOrEqual(100);
    expect(s.ageMinutes).toBeGreaterThan(0);
  });

  it("rejects an unknown pair", async () => {
    const m = new SimMarket({ seed: 42 });
    await expect(m.snapshot("$NOPE", 10)).rejects.toThrow(/unknown pair/);
  });

  it("keeps candle ranges in a believable band over a long run", async () => {
    const m = new SimMarket({ seed: 42 });
    m.advance(7000);
    for (const pair of await m.listPairs()) {
      const s = await m.snapshot(pair, 60);
      expect(volatility(s.candles, 20)).toBeLessThan(0.25);
      expect(volatility(s.candles, 20)).toBeGreaterThan(0);
    }
  });
});

describe("isometric projection", () => {
  it("uses the pinned formula", () => {
    expect(iso(0, 0)).toEqual({ x: 0, y: 0 });
    expect(iso(1, 0)).toEqual({ x: 31, y: 15.5 });
    expect(iso(0, 1)).toEqual({ x: -31, y: 15.5 });
    expect(iso(3, 2)).toEqual({ x: 31, y: 77.5 });
  });
  it("sorts by gx + gy and keeps ties stable", () => {
    const items = [
      { gx: 5, gy: 5, id: "far" },
      { gx: 0, gy: 0, id: "near" },
      { gx: 2, gy: 1, id: "a" },
      { gx: 1, gy: 2, id: "b" },
    ];
    expect(sortByDepth(items).map((i) => i.id)).toEqual(["near", "a", "b", "far"]);
  });
});
