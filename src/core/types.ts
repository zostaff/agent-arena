/**
 * DEGEN VILLAGE — core type contracts.
 * Zero dependencies, isomorphic: this file must import nothing.
 */

export type Action = "BUY" | "SELL" | "SKIP";

/**
 * The three houses an agent can be wired to. This is a contract type, not a
 * cosmetic label: it selects the ladder in config.ts and the wire adapter in
 * src/live. See specs/04-live.md.
 */
export type Provider = "anthropic" | "openai" | "xai";

export type AgentClass = "SCOUT" | "SNIPER" | "WHALE" | "ARB" | "CUSTOM";

export type AgentState =
  | "REST"
  | "TRAIN"
  | "SCAN"
  | "DECIDE"
  | "HOLD"
  | "SETTLE";

export interface Candle {
  /** Tick index at which the candle opened. */
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  /** Volume in ETH. */
  v: number;
}

export interface BookLevel {
  price: number;
  /** Size in ETH at this level. */
  size: number;
}

/**
 * Where each field of a snapshot came from. `chain` means it was read from
 * Robinhood Chain; `sim` means the engine produced it. Never blurred: a paper
 * session shows real tokens with simulated prices, and the UI says which is
 * which rather than letting the player assume.
 */
export interface SnapshotProvenance {
  identity: "chain" | "sim";
  price: "chain" | "sim";
  book: "chain" | "sim";
}

export interface Snapshot {
  pair: string;
  last: number;
  candles: Candle[];
  bids: BookLevel[];
  asks: BookLevel[];
  ageMinutes: number;
  uniqueBuyers: number;
  curveProgressPct: number;
  reserveEth: number;
  /** Set by markets that mix real and simulated fields. */
  provenance?: SnapshotProvenance;
  /** ERC-20 address when the pair is a real token. */
  tokenAddress?: string;
}

export interface Market {
  listPairs(): Promise<string[]>;
  snapshot(pair: string, ctxCandles: number): Promise<Snapshot>;
}

export interface Verdict {
  action: Action;
  sizeEth: number;
  confidence: number;
  holdTicks: number;
  reason: string;
}

/** Strategy parameters the sim brain reads. Authored in FORGE. */
export interface StrategyParams {
  /** Momentum (fractional, e.g. 0.012 = 1.2%) required before an entry. */
  entryThreshold: number;
  /** Skip pairs whose bonding curve is beyond this percentage. */
  maxCurve: number;
  holdMin: number;
  holdMax: number;
  /** Multiplier applied to the compiled position size. */
  sizeMult: number;
  /** Require book depth to agree with the trade direction. */
  requireBookAlign: boolean;
}

export interface BrainOpts {
  /** Hard ceiling. The verdict's sizeEth is clamped to this AFTER parsing. */
  maxSizeEth: number;
  /** Model id from the ladder in config.ts. */
  model: string;
  /** House the model belongs to. Selects the wire adapter in live mode. */
  provider?: Provider;
  /** Reasoning budget in tokens; mapped to output_config.effort in live mode. */
  thinkingBudget: number;
  agentClass: AgentClass;
  strategy: StrategyParams;
  /** Live mode only: appended to the system prompt (FORGE field). */
  systemSuffix?: string;
  /** Live mode only: class lens sentence. */
  lens?: string;
  /** Whether the agent currently holds a position (enables SELL). */
  inPosition?: boolean;
  /** Abort signal for the network call. */
  signal?: AbortSignal;
}

export interface Brain {
  /** Never throws. Any failure resolves to a SKIP verdict. */
  decide(snap: Snapshot, opts: BrainOpts): Promise<Verdict>;
}

export const SKIP: Verdict = Object.freeze({
  action: "SKIP",
  sizeEth: 0,
  confidence: 0,
  holdTicks: 0,
  reason: "skip",
});

export function skipVerdict(reason: string): Verdict {
  return { action: "SKIP", sizeEth: 0, confidence: 0, holdTicks: 0, reason };
}
