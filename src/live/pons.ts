/**
 * DEGEN VILLAGE — live market: Pons bonding-curve DEX on Robinhood Chain,
 * read through Bitquery's streaming GraphQL endpoint.
 *
 * Two queries:
 *   PonsLaunches — recently launched pairs with unique buyer counts
 *   PonsOHLC     — candle history for one pair
 *
 * Snapshots are cached for 8 seconds. An agent with SPD 15 polls every 400ms;
 * without the cache it would bill Bitquery twenty times for the same candle.
 *
 * A bonding curve has no central limit order book, so the book in the snapshot
 * is DERIVED from the curve: the price you actually get for size X, walked out
 * in eight steps either side. It is synthetic and honest about it — the number
 * that matters, the slippage on a real fill, is exactly right.
 */

import type { BookLevel, Candle, Market, Snapshot } from "../core/types.js";

export const BITQUERY_URL = "https://streaming.bitquery.io/graphql";
export const ROBINHOOD_CHAIN_ID = 4663;
export const SNAPSHOT_CACHE_MS = 8_000;

export const PONS_LAUNCHES_QUERY = `
query PonsLaunches($network: evm_network!, $router: String!, $since: DateTime!, $limit: Int!) {
  EVM(network: $network, dataset: combined) {
    DEXTrades(
      where: {
        Trade: { Dex: { SmartContract: { is: $router } } }
        Block: { Time: { since: $since } }
      }
      orderBy: { descendingByField: "buyers" }
      limit: { count: $limit }
    ) {
      Trade {
        Buy {
          Currency { Symbol SmartContract Decimals }
        }
        Sell {
          Currency { Symbol }
        }
      }
      buyers: count(distinct: Transaction_From)
      trades: count
      volume: sum(of: Trade_Buy_AmountInUSD)
      reserve: sum(of: Trade_Sell_Amount)
      firstSeen: minimum(of: Block_Time)
      lastPrice: maximum(of: Trade_Buy_Price, selectWhere: { ne: "0" })
    }
  }
}`;

export const PONS_OHLC_QUERY = `
query PonsOHLC($network: evm_network!, $token: String!, $router: String!, $limit: Int!, $interval: Int!) {
  EVM(network: $network, dataset: combined) {
    DEXTradeByTokens(
      where: {
        Trade: {
          Currency: { SmartContract: { is: $token } }
          Dex: { SmartContract: { is: $router } }
        }
      }
      orderBy: { descendingByField: "Block_timeInterval" }
      limit: { count: $limit }
    ) {
      Block {
        timeInterval: time(interval: { in: minutes, count: $interval })
      }
      Trade {
        open: Price(minimum: Block_Number)
        high: Price(maximum: Trade_Price)
        low: Price(minimum: Trade_Price)
        close: Price(maximum: Block_Number)
      }
      volume: sum(of: Trade_Amount)
      count
    }
  }
}`;

export interface PonsMarketOptions {
  /** Bitquery OAuth token. Falls back to process.env.BITQUERY_TOKEN. */
  token?: string;
  /** Pons router address; also the DEX filter in both queries. */
  router?: string;
  /** Bitquery network slug for Robinhood Chain. */
  network?: string;
  /** Candle interval in minutes. */
  intervalMinutes?: number;
  /** Only surface pairs launched within this many minutes. */
  launchWindowMinutes?: number;
  /** Pairs to keep in the rotation. */
  maxPairs?: number;
  cacheMs?: number;
  fetchImpl?: typeof fetch;
  /** ETH in the curve at which the pair graduates; drives curveProgressPct. */
  graduationEth?: number;
  timeoutMs?: number;
}

interface PairMeta {
  symbol: string;
  address: string;
  decimals: number;
  buyers: number;
  reserveEth: number;
  firstSeen: number;
  lastPrice: number;
}

interface CacheEntry {
  at: number;
  snap: Snapshot;
}

function toNumber(v: unknown, fallback = 0): number {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : fallback;
}

function toMillis(v: unknown): number {
  if (typeof v !== "string") return Date.now();
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : Date.now();
}

export class PonsMarket implements Market {
  private readonly token: string;
  private readonly router: string;
  private readonly network: string;
  private readonly intervalMinutes: number;
  private readonly launchWindowMinutes: number;
  private readonly maxPairs: number;
  private readonly cacheMs: number;
  private readonly doFetch: typeof fetch;
  private readonly graduationEth: number;
  private readonly timeoutMs: number;

  private readonly meta = new Map<string, PairMeta>();
  private readonly cache = new Map<string, CacheEntry>();
  private pairsAt = 0;
  private pairsCache: string[] = [];

  constructor(options: PonsMarketOptions = {}) {
    this.token =
      options.token ??
      (typeof process !== "undefined" ? process.env?.BITQUERY_TOKEN ?? "" : "");
    this.router =
      options.router ??
      (typeof process !== "undefined" ? process.env?.PONS_ROUTER ?? "" : "");
    this.network = options.network ?? "robinhood";
    this.intervalMinutes = options.intervalMinutes ?? 1;
    this.launchWindowMinutes = options.launchWindowMinutes ?? 180;
    this.maxPairs = options.maxPairs ?? 8;
    this.cacheMs = options.cacheMs ?? SNAPSHOT_CACHE_MS;
    this.doFetch = options.fetchImpl ?? globalThis.fetch;
    this.graduationEth = options.graduationEth ?? 85;
    this.timeoutMs = options.timeoutMs ?? 15_000;
  }

  private async query<T>(
    query: string,
    variables: Record<string, unknown>,
  ): Promise<T> {
    if (typeof this.doFetch !== "function") throw new Error("pons: no fetch available");
    if (!this.token) throw new Error("pons: BITQUERY_TOKEN is not set");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await this.doFetch(BITQUERY_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.token}`,
        },
        body: JSON.stringify({ query, variables }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`pons: bitquery http ${res.status}`);
      const body = (await res.json()) as { data?: T; errors?: { message: string }[] };
      if (body.errors && body.errors.length > 0) {
        throw new Error(`pons: ${body.errors.map((e) => e.message).join("; ")}`);
      }
      if (!body.data) throw new Error("pons: empty data");
      return body.data;
    } finally {
      clearTimeout(timer);
    }
  }

  /** PonsLaunches. Recent pairs, ranked by unique buyers. */
  async listPairs(): Promise<string[]> {
    const now = Date.now();
    if (this.pairsCache.length > 0 && now - this.pairsAt < this.cacheMs * 4) {
      return this.pairsCache;
    }
    const since = new Date(now - this.launchWindowMinutes * 60_000).toISOString();
    const data = await this.query<{
      EVM?: { DEXTrades?: unknown[] };
    }>(PONS_LAUNCHES_QUERY, {
      network: this.network,
      router: this.router,
      since,
      limit: this.maxPairs,
    });

    const rows = (data.EVM?.DEXTrades ?? []) as Array<Record<string, any>>;
    const symbols: string[] = [];
    for (const row of rows) {
      const cur = row?.Trade?.Buy?.Currency;
      const symbol = String(cur?.Symbol ?? "").trim();
      const address = String(cur?.SmartContract ?? "").trim();
      if (!symbol || !address) continue;
      const key = symbol.startsWith("$") ? symbol : `$${symbol}`;
      this.meta.set(key, {
        symbol: key,
        address,
        decimals: toNumber(cur?.Decimals, 18),
        buyers: toNumber(row.buyers, 0),
        reserveEth: toNumber(row.reserve, 0),
        firstSeen: toMillis(row.firstSeen),
        lastPrice: toNumber(row.lastPrice, 0),
      });
      symbols.push(key);
      if (symbols.length >= this.maxPairs) break;
    }
    this.pairsCache = symbols;
    this.pairsAt = now;
    return symbols;
  }

  /** PonsOHLC. Newest-first from Bitquery, returned oldest-first. */
  private async candles(meta: PairMeta, limit: number): Promise<Candle[]> {
    const data = await this.query<{ EVM?: { DEXTradeByTokens?: unknown[] } }>(
      PONS_OHLC_QUERY,
      {
        network: this.network,
        token: meta.address,
        router: this.router,
        limit: Math.max(1, Math.min(500, limit)),
        interval: this.intervalMinutes,
      },
    );
    const rows = (data.EVM?.DEXTradeByTokens ?? []) as Array<Record<string, any>>;
    const candles: Candle[] = rows
      .map((row) => {
        const t = toMillis(row?.Block?.timeInterval);
        const trade = row?.Trade ?? {};
        const close = toNumber(trade.close, meta.lastPrice);
        return {
          t: Math.floor(t / 1000),
          o: toNumber(trade.open, close),
          h: toNumber(trade.high, close),
          l: toNumber(trade.low, close),
          c: close,
          v: toNumber(row.volume, 0),
        } satisfies Candle;
      })
      .filter((c) => c.c > 0);
    candles.sort((a, b) => a.t - b.t);
    return candles;
  }

  /**
   * Curve-implied book. A constant-product curve with `reserveEth` on one side
   * gives an exact fill price for any size; eight steps out either way is the
   * same information a book would carry, without pretending one exists.
   */
  private syntheticBook(last: number, reserveEth: number): { bids: BookLevel[]; asks: BookLevel[] } {
    const depth = Math.max(0.05, reserveEth);
    const step = depth / 40;
    const bids: BookLevel[] = [];
    const asks: BookLevel[] = [];
    for (let i = 1; i <= 8; i++) {
      const cumulative = step * i;
      /* Constant product: buying pushes price up by cumulative/reserve. */
      const impact = cumulative / depth;
      asks.push({ price: last * (1 + impact), size: step });
      bids.push({ price: last * (1 - impact / (1 + impact)), size: step });
    }
    return { bids, asks };
  }

  async snapshot(pair: string, ctxCandles: number): Promise<Snapshot> {
    const now = Date.now();
    const cached = this.cache.get(pair);
    if (cached && now - cached.at < this.cacheMs && cached.snap.candles.length >= ctxCandles) {
      return {
        ...cached.snap,
        candles: cached.snap.candles.slice(
          Math.max(0, cached.snap.candles.length - ctxCandles),
        ),
      };
    }

    if (this.meta.size === 0) await this.listPairs();
    const meta = this.meta.get(pair);
    if (!meta) throw new Error(`pons: unknown pair ${pair}`);

    /* Over-fetch so the 8s cache can serve a deeper ctxCandles without a refill. */
    const candles = await this.candles(meta, Math.max(ctxCandles, 120));
    const last = candles.length > 0 ? candles[candles.length - 1].c : meta.lastPrice;
    const { bids, asks } = this.syntheticBook(last, meta.reserveEth);

    const snap: Snapshot = {
      pair,
      last,
      candles,
      bids,
      asks,
      ageMinutes: (now - meta.firstSeen) / 60_000,
      uniqueBuyers: meta.buyers,
      curveProgressPct: Math.max(
        0,
        Math.min(100, (meta.reserveEth / this.graduationEth) * 100),
      ),
      reserveEth: meta.reserveEth,
    };

    this.cache.set(pair, { at: now, snap });
    return {
      ...snap,
      candles: snap.candles.slice(Math.max(0, snap.candles.length - ctxCandles)),
    };
  }

  /** Token address for a pair, needed by execute.ts. */
  tokenAddress(pair: string): string | null {
    return this.meta.get(pair)?.address ?? null;
  }
}
