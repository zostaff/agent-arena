import { describe, expect, it, vi } from "vitest";
import { PaperAccount } from "../src/core/paper.js";
import { CoinbasePaperMarket, parseBook, parseCandles } from "../src/paper/coinbase.js";
import { Village } from "../src/core/village.js";
import type { Snapshot } from "../src/core/types.js";

const NOW = 1800000000000;
function book(time = NOW) {
  return { time: new Date(time).toISOString(), bids: [["1.99", "20", 42]], asks: [["2.01", "20", 100]], auction_mode: false };
}
function snap(): Snapshot {
  return { pair: "SOL-ETH", last: 2, asks: [{price: 2.01, size: 40.2}], bids: [{price: 1.99, size: 39.8}],
    candles: [], ageMinutes: 0, uniqueBuyers: 0, curveProgressPct: 0, reserveEth: 0, validUntil: NOW + 15000 };
}
const candles = [[NOW/1000-120, 1, 3, 2, 2.2, 10], [NOW/1000-180, 1, 3, 2, 2.1, 5]];
function feedFixture() {
  let now = NOW;
  let failed = false;
  const fetcher = vi.fn(async (url: string | URL | Request) => new Response(JSON.stringify(
    String(url).includes("candles") ? candles : book(now)), {status: failed ? 503 : 200}));
  const market = new CoinbasePaperMarket({fetch: fetcher as typeof fetch, now: () => now});
  return { market, fetcher, advance: (ms: number) => {now += ms;}, fail: (v: boolean) => {failed = v;} };
}

describe("real exchange paper data", () => {
  it("converts base quantity into ETH depth without multiplying order count", () => {
    expect(parseBook(book()).asks[0].size).toBeCloseTo(40.2);
  });
  it.each([
    {...book(), auction_mode: true}, {...book(), bids: []}, {...book(), asks: [["1", "1"]]},
    {...book(), asks: [["NaN", "1"]]}, {...book(), time: "garbage"}, {...book(), asks: [["2", "-1"]]},
  ])("rejects untradeable book %#", (raw) => expect(() => parseBook(raw)).toThrow());
  it("sorts and deduplicates closed candles and converts their volume", () => {
    const parsed = parseCandles([...candles, candles[0], [NOW/1000, 1, 3, 2, 2, 5]], NOW);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].t).toBeLessThan(parsed[1].t);
    expect(parsed[1].v).toBe(22);
  });
  it("coalesces reads, caches quotes and labels all real fields", async () => {
    const f = feedFixture();
    const [a,b] = await Promise.all([f.market.snapshot("SOL-ETH", 24), f.market.snapshot("SOL-ETH", 1)]);
    expect(a.provenance).toEqual({identity: "exchange", price: "exchange", book: "exchange"});
    expect(b.candles).toHaveLength(1);
    await f.market.snapshot("SOL-ETH", 24);
    expect(f.fetcher).toHaveBeenCalledTimes(2);
  });
  it("backs off errors, does not serve cached quotes on failure, and recovers", async () => {
    const f = feedFixture();
    await f.market.snapshot("SOL-ETH", 24);
    f.advance(5001); f.fail(true);
    await expect(f.market.snapshot("SOL-ETH", 24)).rejects.toThrow("503");
    const count = f.fetcher.mock.calls.length;
    await expect(f.market.snapshot("SOL-ETH", 24)).rejects.toThrow();
    expect(f.fetcher).toHaveBeenCalledTimes(count);
    expect(f.market.status().state).toBe("error");
    f.advance(5001); f.fail(false);
    await expect(f.market.snapshot("SOL-ETH", 24)).resolves.toMatchObject({last: 2});
  });
  it("refuses stale book timestamps and unknown symbols", async () => {
    const market = new CoinbasePaperMarket({now: () => NOW + 30000,
      fetch: vi.fn(async (url) => new Response(JSON.stringify(String(url).includes("candles") ? candles : book()))) as typeof fetch});
    await expect(market.snapshot("SOL-ETH", 24)).rejects.toThrow("Stale");
    await expect(market.snapshot("FAKE-ETH", 24)).rejects.toThrow("Unknown");
  });
});

describe("virtual account execution", () => {
  it("debits principal and fee, sells by held token quantity, and reconciles cash", () => {
    const account = new PaperAccount(10, 60, () => NOW);
    const buy = account.buy(snap(), 2.01, 100)!;
    expect(buy.tokens).toBeCloseTo(1);
    expect(account.cashEth).toBeCloseTo(10 - 2.01 - 2.01 * .006);
    const sell = account.sell(snap(), buy.tokens, 100)!;
    expect(sell.quote).toBeCloseTo(1.99);
    expect(account.cashEth).toBeCloseTo(10 - .02 - (2.01 + 1.99) * .006);
  });
  it("walks asks using quote budget (harmonic average), not a quote-weighted price", () => {
    const s = snap(); s.last = 1.5; s.asks = [{price: 1, size: 1}, {price: 2, size: 2}];
    const fill = new PaperAccount(10, 0, () => NOW).buy(s, 3, 10000)!;
    expect(fill.tokens).toBe(2); expect(fill.price).toBe(1.5);
  });
  it("refuses insufficient cash including fees, insufficient depth and bad sizes atomically", () => {
    const account = new PaperAccount(2, 60, () => NOW);
    expect(account.buy(snap(), 2, 100)).toBeNull();
    expect(account.buy(snap(), NaN, 100)).toBeNull();
    expect(account.sell(snap(), 21, 100)).toBeNull();
    expect(account.cashEth).toBe(2);
  });
  it("refuses stale data and excessive slippage on both sides", () => {
    const account = new PaperAccount(10, 0, () => NOW);
    expect(account.buy(snap(), 1, 10)).toBeNull();
    expect(account.sell(snap(), 1, 10)).toBeNull();
    expect(account.buy({...snap(), validUntil: NOW}, 1, 100)).toBeNull();
    expect(account.cashEth).toBe(10);
  });
  it("does not stop the village or settle stale positions during an outage", async () => {
    let offline = false;
    const account = new PaperAccount(10, 60, () => NOW);
    const market = {listPairs: async () => ["SOL-ETH"], snapshot: async () => {
      if (offline) throw new Error("offline"); return snap();
    }};
    const v = new Village({market, paperAccount: account, markInterval: 1, blockingDecisions: true,
      brain: {decide: async () => ({action: "BUY", sizeEth: .01, confidence: 1, holdTicks: 10000, reason: "fixture"})}});
    v.agents = [v.agents[0]];
    for (let i = 0; i < 1500 && !v.agents[0].position; i++) await v.step();
    const a = v.agents[0];
    expect(a.position).not.toBeNull();
    a.state = "SETTLE";
    offline = true;
    await expect(v.run(10)).resolves.toBeUndefined();
    expect(a.position).not.toBeNull();
    expect(v.tape.filter(t => t.action === "SELL")).toHaveLength(0);
    offline = false;
    await v.step();
    expect(a.position).toBeNull();
    await v.step();
    expect(v.tape.filter(t => t.action === "SELL")).toHaveLength(1);
    expect(account.cashEth - account.initialEth).toBeCloseTo(a.realizedPnlEth);
    expect(v.view().paperPnlEth).toBeCloseTo(a.realizedPnlEth);
    expect(v.view().paperFeeBps).toBe(60);
  });
});
