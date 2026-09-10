/** Read-only public exchange adapter. All prices and book sizes are in ETH. */
import type { BookLevel, Candle, Market, Snapshot } from "../core/types.js";

export const PAPER_PRODUCTS = ["SOL-ETH", "LINK-ETH", "ADA-ETH"] as const;
const ENDPOINT = "https://api.exchange.coinbase.com";
const POLL_MS = 5000;
const MAX_AGE_MS = 15000;

function positive(value: unknown): number {
  if (typeof value !== "string" && typeof value !== "number") throw new Error("Invalid market number");
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) throw new Error("Invalid market number");
  return n;
}

export function parseBook(raw: unknown): { bids: BookLevel[]; asks: BookLevel[]; time: number } {
  if (!raw || typeof raw !== "object") throw new Error("Invalid book");
  const row = raw as Record<string, unknown>;
  if (row.auction_mode === true) throw new Error("Auction book is not executable");
  function side(value: unknown, ascending: boolean): BookLevel[] {
    if (!Array.isArray(value) || !value.length) throw new Error("Empty book");
    return value.map((level) => {
      if (!Array.isArray(level)) throw new Error("Invalid level");
      const price = positive(level[0]);
      const size = positive(level[1]) * price;
      if (!Number.isFinite(size)) throw new Error("Invalid depth");
      return { price, size };
    }).sort((a, b) => ascending ? a.price - b.price : b.price - a.price).slice(0, 50);
  }
  const bids = side(row.bids, false), asks = side(row.asks, true);
  const time = typeof row.time === "string" ? Date.parse(row.time) : NaN;
  if (!Number.isFinite(time) || bids[0].price >= asks[0].price) throw new Error("Invalid or crossed book");
  return { bids, asks, time };
}

export function parseCandles(raw: unknown, now: number): Candle[] {
  if (!Array.isArray(raw)) throw new Error("Invalid candles");
  const candles = new Map<number, Candle>();
  for (const row of raw) {
    if (!Array.isArray(row) || row.length < 6) throw new Error("Invalid candle");
    const [time, low, high, open, close, volume] = row.map(Number);
    if (![time, low, high, open, close, volume].every(Number.isFinite) ||
      time <= 0 || low <= 0 || high < low || open < low || open > high || close < low || close > high || volume < 0) {
      throw new Error("Invalid candle values");
    }
    if ((time + 60) * 1000 > now) continue; // Only closed exchange candles.
    candles.set(time, { t: time, o: open, h: high, l: low, c: close, v: volume * close });
  }
  return [...candles.values()].sort((a, b) => a.t - b.t).slice(-120);
}

export interface FeedStatus { state: "connecting" | "live" | "error"; message: string; readAt?: number }
interface CachedPair { snap: Snapshot; readAt: number }
export class CoinbasePaperMarket implements Market {
  readonly endpoint = ENDPOINT;
  private cache = new Map<string, CachedPair>();
  private candles = new Map<string, { data: Candle[]; readAt: number }>();
  private pending = new Map<string, Promise<Snapshot>>();
  private retryAt = new Map<string, number>();
  private errors = new Map<string, string>();
  constructor(private readonly options: { fetch?: typeof fetch; now?: () => number } = {}) {}
  private now(): number { return (this.options.now ?? Date.now)(); }

  async listPairs(): Promise<string[]> { return [...PAPER_PRODUCTS]; }

  status(): FeedStatus {
    const stale = PAPER_PRODUCTS.filter((p) => !this.cache.has(p) || this.cache.get(p)!.snap.validUntil! <= this.now());
    const error = [...this.errors.entries()][0];
    if (error) return { state: "error", message: `${error[0]}: ${error[1]}` };
    if (stale.length) return { state: "connecting", message: `Waiting for fresh quotes: ${stale.join(", ")}` };
    return { state: "live", message: "Coinbase · real book midpoints · virtual fills", readAt: Math.min(...[...this.cache.values()].map((c) => c.readAt)) };
  }

  private async json(path: string): Promise<unknown> {
    const response = await (this.options.fetch ?? globalThis.fetch.bind(globalThis))(`${ENDPOINT}${path}`, {
      signal: AbortSignal.timeout(8000), cache: "no-store",
    });
    if (!response.ok) throw new Error(`Feed HTTP ${response.status}`);
    return response.json();
  }

  async refresh(): Promise<void> {
    await Promise.all(PAPER_PRODUCTS.map((pair) => this.snapshot(pair, 120).catch(() => undefined)));
  }

  async snapshot(pair: string, ctxCandles: number): Promise<Snapshot> {
    if (!(PAPER_PRODUCTS as readonly string[]).includes(pair)) throw new Error("Unknown paper pair");
    const cached = this.cache.get(pair);
    if (this.now() < (this.retryAt.get(pair) ?? 0)) throw new Error(this.errors.get(pair) ?? "Feed backing off");
    if (cached && this.now() - cached.readAt < POLL_MS && this.now() < cached.snap.validUntil!) {
      return { ...cached.snap, candles: cached.snap.candles.slice(-ctxCandles) };
    }
    let work = this.pending.get(pair);
    if (!work) {
      work = this.read(pair).catch((err: unknown) => {
        this.errors.set(pair, err instanceof Error ? err.message : String(err));
        this.retryAt.set(pair, this.now() + POLL_MS);
        this.cache.delete(pair);
        throw err;
      }).finally(() => this.pending.delete(pair));
      this.pending.set(pair, work);
    }
    const snap = await work;
    return { ...snap, candles: snap.candles.slice(-ctxCandles) };
  }

  private async read(pair: string): Promise<Snapshot> {
    let history = this.candles.get(pair);
    if (!history || this.now() - history.readAt >= 60000) {
      const raw = await this.json(`/products/${pair}/candles?granularity=60`);
      history = { data: parseCandles(raw, this.now()), readAt: this.now() };
      if (history.data.length < 2) throw new Error("Waiting for candle history");
      this.candles.set(pair, history);
    }
    const book = parseBook(await this.json(`/products/${pair}/book?level=2`));
    const now = this.now();
    if (now - book.time >= MAX_AGE_MS || book.time - now > 5000) throw new Error("Stale book or clock mismatch");
    const snap: Snapshot = {
      pair, last: (book.bids[0].price + book.asks[0].price) / 2,
      candles: history.data, bids: book.bids, asks: book.asks,
      ageMinutes: 0, uniqueBuyers: 0, curveProgressPct: 0, reserveEth: 0,
      provenance: { identity: "exchange", price: "exchange", book: "exchange" },
      observedAt: book.time, validUntil: Math.min(now, book.time) + MAX_AGE_MS,
    };
    this.cache.set(pair, { snap, readAt: now });
    this.errors.delete(pair);
    this.retryAt.delete(pair);
    return snap;
  }
}
