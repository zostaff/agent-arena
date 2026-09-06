/**
 * DEGEN VILLAGE — paper trading against the real Robinhood Chain universe.
 *
 * PAPER MODE IS THE HONEST MIDDLE. Live mode needs an Anthropic/OpenAI/xAI key,
 * a Bitquery token and a funded wallet. Sim mode needs nothing but is a world
 * that does not exist. Paper mode needs nothing either — the public RPC is
 * free and CORS-open — and trades the tokens that are actually launching:
 *
 *   identity   REAL   token address, symbol from `symbol()`, age from the
 *                     launch block. Read straight out of `eth_getLogs`.
 *   price      SIM    Pons v2 settles through Uniswap v4; the swap decoding
 *                     is not written yet, so the price path is generated.
 *   book       SIM    same reason.
 *   fills      PAPER  nothing is signed, nothing is sent, no wallet exists.
 *
 * Every snapshot carries that split in `provenance`, and the UI prints it.
 * A paper P&L on a real ticker is easy to mistake for a real one, so the
 * labelling is not decoration — it is the feature.
 *
 * The price path per token is seeded from its address, so the same token
 * behaves the same way on every machine and a paper session is reproducible.
 */

import type { Market, Snapshot } from "../core/types.js";
import { SimMarket, type SimPairConfig } from "../sim/market.js";
import { PonsLaunchFeed, shortAddress, type LaunchFeedOptions, type LaunchedToken } from "../live/rpc.js";

export interface PaperMarketOptions extends LaunchFeedOptions {
  /** How many live tokens to trade. */
  universe?: number;
  /** Injectable for tests; defaults to a real feed on the public RPC. */
  feed?: Pick<PonsLaunchFeed, "recent" | "verify" | "endpoint">;
}

/** Deterministic 32-bit hash of an address — the per-token price seed. */
export function seedFromAddress(address: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < address.length; i++) {
    h ^= address.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * A launched token becomes a tradeable pair. The identity fields are the
 * token's own; the market parameters are derived from its address so they are
 * stable, spread across the plausible range, and obviously not measured.
 */
export function pairConfigFor(token: LaunchedToken): SimPairConfig {
  const seed = seedFromAddress(token.address);
  const pick = (shift: number, span: number): number => ((seed >>> shift) & 0xff) / 255 * span;
  return {
    symbol: token.symbol,
    startPrice: 0.0000008 + pick(0, 0.00004),
    vol: 0.0008 + pick(8, 0.0018),
    momentumDecay: 0.62 + pick(16, 0.3),
    drift: -0.00003 + pick(24, 0.00006),
    reserveEth: 1.5 + pick(4, 24),
    ageMinutes: Math.max(0, Math.round(token.ageSeconds / 60)),
  };
}

export class PaperMarket implements Market {
  private readonly feed: Pick<PonsLaunchFeed, "recent" | "verify" | "endpoint">;
  private readonly universe: number;
  private sim: SimMarket;
  private tokens = new Map<string, LaunchedToken>();
  tick = 0;

  constructor(private readonly options: PaperMarketOptions = {}) {
    this.feed = options.feed ?? new PonsLaunchFeed(options);
    this.universe = options.universe ?? 6;
    /* Until the first refresh the market has no pairs: paper mode never shows
       a made-up ticker, not even for a second. */
    this.sim = new SimMarket({ seed: 1, pairs: [], warmupCandles: 0 });
  }

  get endpoint(): string {
    return this.feed.endpoint;
  }

  /** Confirms the endpoint is really Robinhood Chain before anything trusts it. */
  verify(): Promise<{ chainId: number; head: number; ok: boolean }> {
    return this.feed.verify();
  }

  get pairCount(): number {
    return this.tokens.size;
  }

  /** Reads the chain and rebuilds the tradeable universe. */
  async refresh(): Promise<LaunchedToken[]> {
    const launched = await this.feed.recent(this.universe);
    const seen = new Set<string>();
    const configs: SimPairConfig[] = [];
    this.tokens.clear();

    for (const token of launched) {
      /* Two live tokens really can share a symbol — $CCAT launched three times
         in one minute on 2026-09-07. Disambiguate rather than drop. */
      let symbol = token.symbol;
      if (seen.has(symbol)) symbol = `${symbol}·${token.address.slice(2, 6)}`;
      seen.add(symbol);
      const named = { ...token, symbol };
      this.tokens.set(symbol, named);
      configs.push(pairConfigFor(named));
    }

    if (configs.length > 0) {
      this.sim = new SimMarket({
        seed: seedFromAddress(configs.map((c) => c.symbol).join("|")),
        pairs: configs,
        warmupCandles: 8,
      });
    }
    return [...this.tokens.values()];
  }

  advance(ticks = 1): void {
    this.tick += ticks;
    this.sim.advance(ticks);
  }

  async listPairs(): Promise<string[]> {
    if (this.tokens.size === 0) await this.refresh();
    return [...this.tokens.keys()];
  }

  async snapshot(pair: string, ctxCandles: number): Promise<Snapshot> {
    const snap = await this.sim.snapshot(pair, ctxCandles);
    const token = this.tokens.get(pair);
    return {
      ...snap,
      /* the age is the token's real age, not the sim's idea of one */
      ageMinutes: token ? Math.max(0, Math.round(token.ageSeconds / 60)) : snap.ageMinutes,
      tokenAddress: token?.address,
      provenance: { identity: token ? "chain" : "sim", price: "sim", book: "sim" },
    };
  }

  /** For the UI: the real rows behind the tickers. */
  universeRows(): Array<LaunchedToken & { short: string }> {
    return [...this.tokens.values()].map((t) => ({ ...t, short: shortAddress(t.address) }));
  }
}
