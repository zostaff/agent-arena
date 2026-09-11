import { FORGE_STAT_BUDGET, MAX_STAT, STAT_KEYS, normalizeProvider, type Stats } from "./config.js";
import { DEFAULT_STRATEGY } from "./brain.js";
import type { Provider, StrategyParams } from "./types.js";

export const BUILD_VERSION = 1;
export const MAX_BUILD_JSON_LENGTH = 65_536;
export const MAX_SYSTEM_SUFFIX_LENGTH = 4000;

export interface CustomAgentSpec {
  name: string;
  stats: Stats;
  strategy: StrategyParams;
  systemSuffix: string;
  provider?: Provider;
}

export interface ForgeDraft extends CustomAgentSpec {
  provider: Provider;
}

export const EMPTY_DRAFT: ForgeDraft = {
  name: "UNNAMED",
  stats: { spd: 5, rsk: 5, ptn: 5, gas: 5 },
  strategy: { ...DEFAULT_STRATEGY },
  systemSuffix: "",
  provider: "anthropic",
};

export const STRATEGY_LIMITS = {
  entryThreshold: { min: 0.001, max: 0.06 },
  maxCurve: { min: 5, max: 100 },
  holdMin: { min: 10, max: 600 },
  holdMax: { min: 20, max: 1200 },
  sizeMult: { min: 0.2, max: 3 },
} as const;

export type BuildParseResult =
  | { ok: true; draft: ForgeDraft }
  | { ok: false; error: string };

export function statsSpent(stats: Stats): number {
  return STAT_KEYS.reduce((total, key) => total + stats[key], 0);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function inRange(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

export function parseBuild(input: unknown): BuildParseResult {
  if (!isRecord(input)) return { ok: false, error: "Build must be a JSON object." };
  if (input.version !== undefined && input.version !== BUILD_VERSION) {
    return { ok: false, error: "Unsupported build version." };
  }
  if (typeof input.name !== "string" || !input.name.trim() || input.name.length > 16) {
    return { ok: false, error: "Name must contain 1–16 characters." };
  }
  if (!isRecord(input.stats)) return { ok: false, error: "Stats are required." };
  const stats = {} as Stats;
  for (const key of STAT_KEYS) {
    const value = input.stats[key];
    if (!inRange(value, 0, MAX_STAT) || !Number.isInteger(value)) {
      return { ok: false, error: `${key.toUpperCase()} must be an integer from 0 to ${MAX_STAT}.` };
    }
    stats[key] = value;
  }
  if (statsSpent(stats) > FORGE_STAT_BUDGET) {
    return { ok: false, error: `Stats exceed the ${FORGE_STAT_BUDGET}-point budget.` };
  }
  if (!isRecord(input.strategy)) return { ok: false, error: "Strategy is required." };
  const strategy = {} as StrategyParams;
  for (const key of Object.keys(STRATEGY_LIMITS) as Array<keyof typeof STRATEGY_LIMITS>) {
    const value = input.strategy[key];
    const limits = STRATEGY_LIMITS[key];
    if (!inRange(value, limits.min, limits.max)) {
      return { ok: false, error: `${key} must be between ${limits.min} and ${limits.max}.` };
    }
    strategy[key] = value;
  }
  if (strategy.holdMax < strategy.holdMin) {
    return { ok: false, error: "holdMax must be greater than or equal to holdMin." };
  }
  if (typeof input.strategy.requireBookAlign !== "boolean") {
    return { ok: false, error: "requireBookAlign must be true or false." };
  }
  strategy.requireBookAlign = input.strategy.requireBookAlign;
  const systemSuffix = input.systemSuffix ?? "";
  if (typeof systemSuffix !== "string" || systemSuffix.length > MAX_SYSTEM_SUFFIX_LENGTH) {
    return { ok: false, error: `System suffix must be at most ${MAX_SYSTEM_SUFFIX_LENGTH} characters.` };
  }
  return {
    ok: true,
    draft: {
      name: input.name.trim(),
      stats,
      strategy,
      systemSuffix,
      provider: normalizeProvider(input.provider === "connectome" ? undefined : input.provider),
    },
  };
}

export function parseBuildJson(text: string): BuildParseResult {
  if (text.length > MAX_BUILD_JSON_LENGTH) return { ok: false, error: "Build JSON is too large." };
  try {
    return parseBuild(JSON.parse(text));
  } catch {
    return { ok: false, error: "Invalid JSON. Paste an exported build object." };
  }
}
