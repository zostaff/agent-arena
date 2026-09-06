/**
 * DEGEN VILLAGE — the stat compiler.
 *
 * The village IS the config editor. Every stat bar the player fills is a real
 * field the engine reads on the next tick. Nothing here is cosmetic.
 *
 * PTN buys CONTEXT DEPTH and REASONING BUDGET, not a better model. The top
 * rung of whichever provider the agent is wired to unlocks at PTN 12.
 *
 * THREE HOUSES. An agent is wired to one provider and trains inside its
 * ladder. The provider is not a skin: it changes the model id on the wire, the
 * price of every decision, and which parameters the request may legally carry.
 */

import type { Provider } from "./types.js";

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
 * PTN does not buy intelligence until 12. Below that it buys depth on the
 * house's working model. At 12 the frontier rung unlocks — and the bill jumps.
 *
 * Model ids and prices are the real ones as of 2026-09-06. See specs/04-live.md
 * for the sources; if a house re-prices, this table is the only thing to edit.
 */
export const MODEL_LADDERS: Readonly<Record<Provider, readonly ModelRung[]>> =
  Object.freeze({
    anthropic: Object.freeze([
      { minPtn: 0, id: "claude-opus-5" },
      { minPtn: 12, id: "claude-fable-5-1" },
    ]),
    openai: Object.freeze([
      { minPtn: 0, id: "gpt-5.6-terra" },
      { minPtn: 12, id: "gpt-6-astra" },
    ]),
    xai: Object.freeze([
      { minPtn: 0, id: "grok-4.3" },
      { minPtn: 12, id: "grok-4.6" },
    ]),
  });

/** The Anthropic ladder, kept as a named export because it is the default. */
export const MODEL_LADDER: readonly ModelRung[] = MODEL_LADDERS.anthropic;

export const PROVIDERS: readonly Provider[] = Object.freeze([
  "anthropic",
  "openai",
  "xai",
]);

export const DEFAULT_PROVIDER: Provider = "anthropic";

export interface ProviderMeta {
  id: Provider;
  /** Shown in the village. */
  label: string;
  /** Endpoint the live brain posts to. */
  endpoint: string;
  /** The wire field the effort rung rides on for this house. */
  effortField: string;
  /** Whether this house still accepts `temperature` on its ladder. */
  sampling: boolean;
  /** Environment variable holding the key. */
  envKey: string;
  color: string;
  /** One line the FORGE shows under the picker. Facts, not marketing. */
  note: string;
}

export const PROVIDER_META: Readonly<Record<Provider, ProviderMeta>> =
  Object.freeze({
    anthropic: {
      id: "anthropic",
      label: "ANTHROPIC",
      endpoint: "https://api.anthropic.com/v1/messages",
      effortField: "output_config.effort",
      sampling: false,
      envKey: "ANTHROPIC_API_KEY",
      color: "#CCFF00",
      note: "Opus 5 → Fable 5.1 at PTN 12. No sampling params on this family.",
    },
    openai: {
      id: "openai",
      label: "OPENAI",
      endpoint: "https://api.openai.com/v1/responses",
      effortField: "reasoning.effort",
      sampling: false,
      envKey: "OPENAI_API_KEY",
      color: "#5be2b0",
      note: "GPT-5.6 Terra → GPT-6 Astra at PTN 12. Responses API, no temperature.",
    },
    xai: {
      id: "xai",
      label: "XAI",
      endpoint: "https://api.x.ai/v1/chat/completions",
      effortField: "reasoning_effort",
      sampling: true,
      envKey: "XAI_API_KEY",
      color: "#8ab4ff",
      note: "Grok 4.3 → Grok 4.6 at PTN 12. The only house that still takes temperature: 0.",
    },
  });

export function isProvider(v: unknown): v is Provider {
  return typeof v === "string" && (PROVIDERS as readonly string[]).includes(v);
}

export function normalizeProvider(v: unknown): Provider {
  return isProvider(v) ? v : DEFAULT_PROVIDER;
}

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
    "gpt-5.6-terra": { inputPerMTok: 2, outputPerMTok: 12 },
    "gpt-6-astra": { inputPerMTok: 10, outputPerMTok: 50 },
    "grok-4.3": { inputPerMTok: 1.25, outputPerMTok: 2.5 },
    "grok-4.6": { inputPerMTok: 2, outputPerMTok: 6 },
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
  /** Which house this agent is wired to. */
  provider: Provider;
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
  /** Which house the agent is wired to. Defaults to Anthropic. */
  provider?: Provider;
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

/** Highest rung of this house's ladder whose minPtn the agent has reached. */
export function modelForPtn(
  ptn: number,
  provider: Provider = DEFAULT_PROVIDER,
): string {
  const ladder = MODEL_LADDERS[normalizeProvider(provider)];
  let id = ladder[0].id;
  for (const rung of ladder) {
    if (ptn >= rung.minPtn) id = rung.id;
  }
  return id;
}

/** The house an arbitrary model id belongs to, or the default if unknown. */
export function providerForModel(model: string): Provider {
  for (const p of PROVIDERS) {
    if (MODEL_LADDERS[p].some((r) => r.id === model)) return p;
  }
  return DEFAULT_PROVIDER;
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

  const provider = normalizeProvider(options.provider);
  const model = modelForPtn(stats.ptn, provider);

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
    provider,
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
