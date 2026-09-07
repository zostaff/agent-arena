/**
 * DEGEN VILLAGE — Robinhood Chain over raw JSON-RPC. No indexer, no API key.
 *
 * The public RPC is free and open: chain 4663, https://rpc.mainnet.chain.robinhood.com.
 * That is the whole point of this file — a player can run the village against
 * the real chain without signing up for anything.
 *
 * WHAT IS READ FROM CHAIN HERE, AND NOTHING ELSE IS CLAIMED:
 *
 *   · token births — `TokenLaunched(address,address,address,address,uint256,uint256)`
 *     emitted by the Pons launch factory, topic0
 *     0x8d4aad4953d0ca700d468f3753aa14432d1b35b43ec6409f051fb6aa43a89607.
 *     topics[1] is the token. Verified against live logs on 2026-09-07.
 *   · the symbol — ERC-20 `symbol()` via `eth_call`, standard everywhere.
 *   · the age — the block timestamp of the launch.
 *
 * Trades on Pons v2 settle through Uniswap v4, so a price series needs the
 * PoolManager's `Swap` logs and a pool id. That is NOT decoded here yet, and
 * this file does not pretend otherwise: `PaperMarket` labels every field it
 * serves as `chain` or `sim`, and price is `sim` until this file can honestly
 * say otherwise. See specs/11-chain-feed.md.
 *
 * Robinhood Chain produces roughly ten blocks a second, so a "recent" window is
 * measured in tens of thousands of blocks, not tens.
 */

export const RH_CHAIN_ID = 4663;
export const RH_PUBLIC_RPC = "https://rpc.mainnet.chain.robinhood.com";

/** Pons launch factory: emitter of TokenLaunched. */
export const PONS_LAUNCH_FACTORY = "0x7ed598bcef8bd9edd8c97a195c6d13f40801ec7e";
/** Pons router: the address a buy or sell is sent to. */
export const PONS_ROUTER = "0xe33e9e479df8802cb0866d5d05258bec4cf62948";

export const TOKEN_LAUNCHED_TOPIC =
  "0x8d4aad4953d0ca700d468f3753aa14432d1b35b43ec6409f051fb6aa43a89607";

/** `symbol()` and `decimals()` selectors. */
const SYMBOL_SELECTOR = "0x95d89b41";
const DECIMALS_SELECTOR = "0x313ce567";

/** ~10 blocks a second: this is about fifteen minutes of chain. */
export const DEFAULT_LOOKBACK_BLOCKS = 9000;

export interface RpcLog {
  address: string;
  topics: string[];
  data: string;
  blockNumber: string;
  transactionHash: string;
}

export interface LaunchedToken {
  /** ERC-20 address, lowercased. */
  address: string;
  /** From `symbol()`, or a shortened address when the call fails. */
  symbol: string;
  decimals: number;
  blockNumber: number;
  /** Seconds since the launch block, at the time of the read. */
  ageSeconds: number;
  txHash: string;
}

export interface RpcOptions {
  url?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export class RpcError extends Error {}

/** Minimal JSON-RPC client. Throws RpcError; callers decide what that means. */
export class RobinhoodRpc {
  readonly url: string;
  private readonly doFetch: typeof fetch;
  private readonly timeoutMs: number;
  private id = 0;

  constructor(options: RpcOptions = {}) {
    this.url = options.url ?? envUrl() ?? RH_PUBLIC_RPC;
    /* globalThis.fetch must be bound: called as a bare reference in a browser
       it throws "Illegal invocation". Node tolerates it; Chrome does not. */
    this.doFetch = options.fetchImpl ?? globalThis.fetch?.bind(globalThis);
    this.timeoutMs = options.timeoutMs ?? 15_000;
  }

  async call<T>(method: string, params: unknown[]): Promise<T> {
    if (typeof this.doFetch !== "function") throw new RpcError("no fetch available");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await this.doFetch(this.url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: ++this.id, method, params }),
        signal: controller.signal,
      });
      if (!res.ok) throw new RpcError(`${method}: http ${res.status}`);
      const body = (await res.json()) as { result?: T; error?: { message?: string } };
      if (body.error) throw new RpcError(`${method}: ${body.error.message ?? "rpc error"}`);
      if (body.result === undefined) throw new RpcError(`${method}: empty result`);
      return body.result;
    } finally {
      clearTimeout(timer);
    }
  }

  async chainId(): Promise<number> {
    return hexToNumber(await this.call<string>("eth_chainId", []));
  }

  async blockNumber(): Promise<number> {
    return hexToNumber(await this.call<string>("eth_blockNumber", []));
  }

  async blockTimestamp(block: number): Promise<number> {
    const b = await this.call<{ timestamp: string } | null>("eth_getBlockByNumber", [
      numberToHex(block),
      false,
    ]);
    if (!b) throw new RpcError("block not found");
    return hexToNumber(b.timestamp);
  }

  async getLogs(params: {
    fromBlock: number | "latest";
    toBlock: number | "latest";
    address?: string | string[];
    topics?: (string | null)[];
  }): Promise<RpcLog[]> {
    return this.call<RpcLog[]>("eth_getLogs", [
      {
        fromBlock: typeof params.fromBlock === "number" ? numberToHex(params.fromBlock) : "latest",
        toBlock: typeof params.toBlock === "number" ? numberToHex(params.toBlock) : "latest",
        ...(params.address ? { address: params.address } : {}),
        ...(params.topics ? { topics: params.topics } : {}),
      },
    ]);
  }

  async getCode(address: string): Promise<string> {
    return this.call<string>("eth_getCode", [address, "latest"]);
  }

  async ethCall(to: string, data: string): Promise<string> {
    return this.call<string>("eth_call", [{ to, data }, "latest"]);
  }
}

function envUrl(): string | undefined {
  if (typeof process === "undefined") return undefined;
  const v = process.env?.RH_RPC_URL;
  return v && v.length > 0 ? v : undefined;
}

export function hexToNumber(hex: string): number {
  const n = Number.parseInt(hex, 16);
  if (!Number.isFinite(n)) throw new RpcError(`bad hex: ${hex}`);
  return n;
}

export function numberToHex(n: number): string {
  return `0x${Math.max(0, Math.floor(n)).toString(16)}`;
}

/** An indexed address topic is the low 20 bytes of a 32-byte word. */
export function topicToAddress(topic: string): string {
  const clean = topic.replace(/^0x/, "").padStart(64, "0");
  return `0x${clean.slice(24)}`.toLowerCase();
}

/**
 * Decodes an ABI-encoded `string` return. Falls back to null rather than
 * throwing: some tokens return bytes32, some revert, and neither is fatal.
 */
export function decodeStringResult(hex: string): string | null {
  const body = hex.replace(/^0x/, "");
  if (body.length === 0) return null;
  try {
    if (body.length >= 128) {
      const length = Number.parseInt(body.slice(64, 128), 16);
      if (Number.isFinite(length) && length > 0 && length <= 64) {
        const bytes = body.slice(128, 128 + length * 2);
        const text = hexToUtf8(bytes);
        if (text) return text;
      }
    }
    /* bytes32-style symbol: trailing zero padding, no length prefix */
    const text = hexToUtf8(body.slice(0, 64));
    return text || null;
  } catch {
    return null;
  }
}

function hexToUtf8(hex: string): string {
  let out = "";
  for (let i = 0; i + 1 < hex.length; i += 2) {
    const code = Number.parseInt(hex.slice(i, i + 2), 16);
    if (code === 0) continue;
    if (code < 32 || code > 126) return "";
    out += String.fromCharCode(code);
  }
  return out.trim();
}

export interface LaunchFeedOptions extends RpcOptions {
  factory?: string;
  lookbackBlocks?: number;
  /** Cap on symbol() calls per refresh; the public RPC is rate limited. */
  maxSymbolCalls?: number;
  /** Milliseconds a refresh is reused. */
  cacheMs?: number;
  /** Spacing between symbol() calls; the public RPC is shared. */
  symbolGapMs?: number;
}

/**
 * Recent Pons launches, newest first, straight out of `eth_getLogs`.
 *
 * Every field here is read from chain. Nothing is derived, guessed or filled
 * in — a token whose `symbol()` cannot be read keeps its shortened address as
 * its name rather than being given a plausible one.
 */
export class PonsLaunchFeed {
  private readonly rpc: RobinhoodRpc;
  private readonly factory: string;
  private readonly lookback: number;
  private readonly maxSymbolCalls: number;
  private readonly symbolGapMs: number;
  private readonly cacheMs: number;
  private readonly symbols = new Map<string, string>();
  private cache: { at: number; tokens: LaunchedToken[] } | null = null;

  constructor(options: LaunchFeedOptions = {}) {
    this.rpc = new RobinhoodRpc(options);
    this.factory = options.factory ?? PONS_LAUNCH_FACTORY;
    this.lookback = options.lookbackBlocks ?? DEFAULT_LOOKBACK_BLOCKS;
    this.maxSymbolCalls = options.maxSymbolCalls ?? 12;
    this.symbolGapMs = options.symbolGapMs ?? 70;
    this.cacheMs = options.cacheMs ?? 20_000;
  }

  get endpoint(): string {
    return this.rpc.url;
  }

  /** Confirms the endpoint really is Robinhood Chain before anything trusts it. */
  async verify(): Promise<{ chainId: number; head: number; ok: boolean }> {
    const [chainId, head] = await Promise.all([this.rpc.chainId(), this.rpc.blockNumber()]);
    return { chainId, head, ok: chainId === RH_CHAIN_ID };
  }

  async recent(limit = 12): Promise<LaunchedToken[]> {
    const now = Date.now();
    if (this.cache && now - this.cache.at < this.cacheMs) {
      return this.cache.tokens.slice(0, limit);
    }

    const head = await this.rpc.blockNumber();
    const logs = await this.rpc.getLogs({
      fromBlock: Math.max(0, head - this.lookback),
      toBlock: "latest",
      address: this.factory,
      topics: [TOKEN_LAUNCHED_TOPIC],
    });

    const headTime = await this.rpc.blockTimestamp(head).catch(() => 0);

    const seen = new Set<string>();
    const tokens: LaunchedToken[] = [];
    /* newest first: the chain hands them back in ascending block order */
    for (const log of [...logs].reverse()) {
      const topic = log.topics?.[1];
      if (!topic) continue;
      const address = topicToAddress(topic);
      if (seen.has(address)) continue;
      seen.add(address);
      const blockNumber = hexToNumber(log.blockNumber);
      tokens.push({
        address,
        symbol: this.symbols.get(address) ?? shortAddress(address),
        decimals: 18,
        blockNumber,
        /* ~10 blocks a second on this chain; exact enough for an age column,
           and it costs no extra round trip per token. */
        ageSeconds: headTime > 0 ? Math.max(0, Math.round((head - blockNumber) / 10)) : 0,
        txHash: log.transactionHash,
      });
      if (tokens.length >= limit) break;
    }

    await this.fillSymbols(tokens);
    this.cache = { at: now, tokens };
    return tokens;
  }

  /**
   * `symbol()` per token, capped, cached forever — a symbol does not change.
   *
   * Paced: the public RPC is shared and rate limited, and a burst of a dozen
   * eth_calls right behind a getLogs comes back empty. A token whose symbol is
   * refused keeps its address and is retried on the next refresh, because a
   * failure is never cached.
   */
  private async fillSymbols(tokens: LaunchedToken[]): Promise<void> {
    let calls = 0;
    for (const token of tokens) {
      const cached = this.symbols.get(token.address);
      if (cached) {
        token.symbol = cached;
        continue;
      }
      if (calls >= this.maxSymbolCalls) continue;
      if (calls > 0) await pause(this.symbolGapMs);
      calls += 1;
      try {
        const raw = await this.rpc.ethCall(token.address, SYMBOL_SELECTOR);
        const symbol = decodeStringResult(raw);
        if (symbol) {
          const tidy = `$${symbol.replace(/^\$/, "").slice(0, 12).toUpperCase()}`;
          this.symbols.set(token.address, tidy);
          token.symbol = tidy;
        }
      } catch {
        /* an unreadable symbol keeps the address. Nothing is invented. */
      }
    }
  }

  async decimalsOf(address: string): Promise<number> {
    try {
      const raw = await this.rpc.ethCall(address, DECIMALS_SELECTOR);
      const n = hexToNumber(raw);
      return n >= 0 && n <= 36 ? n : 18;
    } catch {
      return 18;
    }
  }
}

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Whether a 4-byte selector appears in deployed bytecode.
 *
 * Crude on purpose: a selector can live behind a proxy, and a match is not a
 * guarantee that the arguments mean what you think. But a MISS is proof — the
 * call cannot possibly dispatch — and that is the direction that matters
 * before signing anything.
 */
export function selectorPresent(code: string, selector: string): boolean {
  const needle = selector.replace(/^0x/, "").toLowerCase();
  if (needle.length !== 8) return false;
  return code.toLowerCase().includes(needle);
}

export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}
