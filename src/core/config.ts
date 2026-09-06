/**
 * DEGEN VILLAGE — the stat compiler.
 *
 * The village IS the config editor. Every stat bar the player fills is a real
 * field the engine reads on the next tick. Nothing here is cosmetic.
 *
 * Every agent starts on Opus 5 from tick zero. PTN buys CONTEXT DEPTH and
 * REASONING BUDGET, not a better model. Fable 5.1 unlocks at PTN 12.
 */

/** Stat ceiling. Training and level-ups clamp here. */
export const MAX_STAT = 15;

/** Points a FORGE build may distribute across the four stats. */
export const FORGE_STAT_BUDGET = 20;

export interface Stats {
  /** SPD — poll interval. Faster eyes on the tape. */
  spd: number;
  /** RSK — position size. Conviction with the wallet. */
  rsk: number;
  /** PTN — context depth + reasoning budget + model ladder. */
  ptn: number;
  /** GAS — slippage tolerance. Cheaper, tighter fills. */
  gas: number;
}

export type StatKey = keyof Stats;

export const STAT_KEYS: readonly StatKey[] = ["spd", "rsk", "ptn", "gas"];

export type BoostKind = "overclock" | "alphaFeed" | "leverage" | "zeroGas";

export interface ModelRung {
  minPtn: number;
  id: string;
}

/**
 * PTN does not buy intelligence until 12. Below that it buys depth on Opus 5.
 */
export const MODEL_LADDER: readonly ModelRung[] = Object.freeze([
  { minPtn: 0, id: "claude-opus-5" },
  { minPtn: 12, id: "claude-fable-5-1" },
]);

export interface ModelPricing {
  /** USD per million input tokens. */
  inputPerMTok: number;
  /** USD per million output tokens. Thinking tokens bill as output. */
  outputPerMTok: number;
}

export const MODEL_PRICING: Readonly<Record<string, ModelPricing>> =
  Object.freeze({
    "claude-opus-5": { inputPerMTok: 5, outputPerMTok: 25 },
    "claude-fable-5-1": { inputPerMTok: 10, outputPerMTok: 50 },
  });

/** Base position size in ETH before RSK and level scaling. */
export const BASE_POSITION_ETH = 0.05;

/** Hard multiple the compiled position size can never exceed. */
export const POSITION_CLAMP_MULT = 8;

/** Router fee in basis points with no ZERO GAS boost active. */
export const BASE_FEE_BPS = 30;

export const MIN_POLL_INTERVAL_MS = 400;
export const MAX_CTX_CANDLES = 120;
export const MIN_SLIPPAGE_BPS = 30;

/**
 * Token accounting used for costPerDecision. These are the shape of the prompt
 * the live brain actually sends (see src/live/brain.ts), rounded to whole
 * tokens so the number is reproducible in a test.
 */
export const TOKENS_SYSTEM = 320;
export const TOKENS_PER_CANDLE = 18;
export const TOKENS_BOOK = 120;
/** max_tokens on every request, per the wire contract. */
export const MAX_OUTPUT_TOKENS = 300;

export interface CompiledConfig {
  model: string;
  pollIntervalMs: number;
  ctxCandles: number;
  thinkingBudget: number;
  positionSizeEth: number;
  slippageBps: number;
  feeBps: number;
  /** USD burned by one decide() call at this configuration. */
  costPerDecision: number;
  /** max_tokens sent on the wire: MAX_OUTPUT_TOKENS plus reasoning headroom. */
  maxTokens: number;
  /** Effort rung the thinking budget maps to on the current API. */
  effort: Effort;
}

export type Effort = "low" | "medium" | "high" | "xhigh";

export interface CompileOptions {
  /** Override the base position size (FORGE sizeMult folds in here). */
  basePositionEth?: number;
  /** NEXUS levels: +12% position size each. */
  nexusLevel?: number;
}

function clampStat(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(MAX_STAT, Math.floor(v)));
}

export function normalizeStats(stats: Partial<Stats>): Stats {
  return {
    spd: clampStat(stats.spd ?? 0),
    rsk: clampStat(stats.rsk ?? 0),
    ptn: clampStat(stats.ptn ?? 0),
    gas: clampStat(stats.gas ?? 0),
  };
}

/** Highest rung whose minPtn the agent has reached. */
export function modelForPtn(ptn: number): string {
  let id = MODEL_LADDER[0].id;
  for (const rung of MODEL_LADDER) {
    if (ptn >= rung.minPtn) id = rung.id;
  }
  return id;
}

/** PTN 0-3 → 0, 4-7 → 512, 8-11 → 1500, 12+ → 3000. */
export function thinkingBudgetForPtn(ptn: number): number {
  return ptn >= 12 ? 3000 : ptn >= 8 ? 1500 : ptn >= 4 ? 512 : 0;
}

/**
 * budget_tokens is rejected with a 400 on Opus 5 and Fable 5.1, so the budget
 * the village sells the player is expressed on the wire as output_config.effort.
 * See specs/04-live.md for the full note.
 */
export function effortForBudget(budget: number): Effort {
  if (budget >= 3000) return "xhigh";
  if (budget >= 1500) return "high";
  if (budget >= 512) return "medium";
  return "low";
}

export function pollIntervalForSpd(spd: number): number {
  return Math.max(MIN_POLL_INTERVAL_MS, 3200 - spd * 260);
}

export function ctxCandlesForPtn(ptn: number): number {
  return Math.min(MAX_CTX_CANDLES, 24 + ptn * 6);
}

export function slippageBpsForGas(gas: number): number {
  return Math.max(MIN_SLIPPAGE_BPS, 160 - gas * 9);
}

export function positionSizeFor(
  rsk: number,
  level: number,
  base: number = BASE_POSITION_ETH,
): number {
  const raw = base * (1 + rsk * 0.18) * (1 + level * 0.12);
  return Math.min(raw, base * POSITION_CLAMP_MULT);
}

/**
 * Cost of a single decide() at this configuration, in USD.
 *
 * input  = system + candles + order book
 * output = the 300-token verdict + whatever reasoning the budget bought
 */
export function costPerDecision(
  model: string,
  ctxCandles: number,
  thinkingBudget: number,
): number {
  const pricing = MODEL_PRICING[model];
  if (!pricing) return 0;
  const inputTokens =
    TOKENS_SYSTEM + ctxCandles * TOKENS_PER_CANDLE + TOKENS_BOOK;
  const outputTokens = MAX_OUTPUT_TOKENS + thinkingBudget;
  return (
    (inputTokens / 1_000_000) * pricing.inputPerMTok +
    (outputTokens / 1_000_000) * pricing.outputPerMTok
  );
}

/**
 * The whole game in one function.
 *
 *   pollIntervalMs  = max(400, 3200 - spd * 260)
 *   ctxCandles      = min(120, 24 + ptn * 6)
 *   thinkingBudget  = ladder on PTN
 *   positionSizeEth = base * (1 + rsk * 0.18) * (1 + level * 0.12), <= base * 8
 *   slippageBps     = max(30, 160 - gas * 9)
 *
 * Boosts are temporary overrides applied on top, then the cost is recomputed
 * because ALPHA FEED genuinely changes what the request costs.
 */
export function compileConfig(
  rawStats: Partial<Stats>,
  level: number = 0,
  boosts: readonly BoostKind[] = [],
  options: CompileOptions = {},
): CompiledConfig {
  const stats = normalizeStats(rawStats);
  const lvl = Math.max(0, Math.floor(level));
  const base = options.basePositionEth ?? BASE_POSITION_ETH;
  const nexus = Math.max(0, options.nexusLevel ?? 0);

  const model = modelForPtn(stats.ptn);

  let pollIntervalMs = pollIntervalForSpd(stats.spd);
  let ctxCandles = ctxCandlesForPtn(stats.ptn);
  let thinkingBudget = thinkingBudgetForPtn(stats.ptn);
  let positionSizeEth = positionSizeFor(stats.rsk, lvl, base) * (1 + nexus * 0.12);
  const slippageBps = slippageBpsForGas(stats.gas);
  let feeBps = BASE_FEE_BPS;

  const set = new Set(boosts);
  if (set.has("overclock")) {
    pollIntervalMs = Math.max(MIN_POLL_INTERVAL_MS, Math.round(pollIntervalMs / 3));
  }
  if (set.has("alphaFeed")) {
    ctxCandles = Math.min(MAX_CTX_CANDLES * 2, ctxCandles * 2);
    thinkingBudget = thinkingBudget * 2;
  }
  if (set.has("leverage")) {
    positionSizeEth = positionSizeEth * 2;
  }
  if (set.has("zeroGas")) {
    feeBps = 0;
  }

  return {
    model,
    pollIntervalMs,
    ctxCandles,
    thinkingBudget,
    positionSizeEth,
    slippageBps,
    feeBps,
    costPerDecision: costPerDecision(model, ctxCandles, thinkingBudget),
    maxTokens: MAX_OUTPUT_TOKENS + thinkingBudget,
    effort: effortForBudget(thinkingBudget),
  };
}

/** Which building trains which stat. */
export const STAT_BUILDING: Readonly<Record<StatKey, string>> = Object.freeze({
  spd: "BARRACKS",
  ptn: "LAB",
  rsk: "VAULT",
  gas: "REFINERY",
});

export const STAT_LABEL: Readonly<Record<StatKey, string>> = Object.freeze({
  spd: "SPD",
  rsk: "RSK",
  ptn: "PTN",
  gas: "GAS",
});
