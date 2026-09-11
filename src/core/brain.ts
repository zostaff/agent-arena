/**
 * DEGEN VILLAGE — brain contract, prompt assembly, and verdict hardening.
 * Zero dependencies, isomorphic. No network here; see src/live/brain.ts.
 */

import type {
  AgentClass,
  BrainOpts,
  Snapshot,
  StrategyParams,
  Verdict,
} from "./types.js";
import { skipVerdict } from "./types.js";
import { serializeSnapshot } from "./market.js";

/** Live-mode prompt lenses. One sentence each — the class IS the sentence. */
export const CLASS_LENS: Readonly<Record<AgentClass, string>> = Object.freeze({
  SCOUT: "You favour early entries. Age under 8 minutes interests you.",
  SNIPER: "You favour precision. Skip more than you trade.",
  WHALE:
    "You favour size on high conviction only. Curve above 40% is your zone.",
  ARB: "You favour short holds and small edges. Exit fast.",
  FLY: "Local FlyWire-inspired heuristic; short holds and small positions.",
  CUSTOM: "You follow the operator's brief below and nothing else.",
});

export const DEFAULT_STRATEGY: StrategyParams = Object.freeze({
  entryThreshold: 0.012,
  maxCurve: 85,
  holdMin: 60,
  holdMax: 420,
  sizeMult: 1,
  requireBookAlign: false,
});

export const CLASS_STRATEGY: Readonly<Record<AgentClass, StrategyParams>> =
  Object.freeze({
    SCOUT: {
      entryThreshold: 0.008,
      maxCurve: 45,
      holdMin: 90,
      holdMax: 420,
      sizeMult: 0.9,
      requireBookAlign: false,
    },
    SNIPER: {
      entryThreshold: 0.022,
      maxCurve: 70,
      holdMin: 120,
      holdMax: 520,
      sizeMult: 1.1,
      requireBookAlign: true,
    },
    WHALE: {
      entryThreshold: 0.015,
      maxCurve: 95,
      holdMin: 200,
      holdMax: 900,
      sizeMult: 1.6,
      requireBookAlign: true,
    },
    ARB: {
      entryThreshold: 0.005,
      maxCurve: 100,
      holdMin: 25,
      holdMax: 110,
      sizeMult: 0.7,
      requireBookAlign: false,
    },
    FLY: { ...DEFAULT_STRATEGY, entryThreshold: 0.003, holdMin: 10, holdMax: 22, sizeMult: 0.2 },
    CUSTOM: { ...DEFAULT_STRATEGY },
  });

/**
 * System prompt. Stable prefix first (cacheable), volatile lens and operator
 * suffix last.
 */
export function buildSystemPrompt(opts: BrainOpts): string {
  const lens = opts.lens ?? CLASS_LENS[opts.agentClass] ?? CLASS_LENS.CUSTOM;
  const parts = [
    "You are a memecoin trading agent on Robinhood Chain, operating through the Pons bonding-curve DEX.",
    "You are given one pair snapshot: recent OHLC candles, a synthetic order book, and launch metadata.",
    "You return exactly one JSON object and nothing else. No prose, no markdown fences.",
    "",
    "Schema:",
    '{"action":"BUY"|"SELL"|"SKIP","sizeEth":number,"confidence":number,"holdTicks":number,"reason":string}',
    "",
    "Rules:",
    `- sizeEth must not exceed ${opts.maxSizeEth}. Anything larger is rejected and clamped.`,
    `- holdTicks must fall between ${opts.strategy.holdMin} and ${opts.strategy.holdMax}.`,
    "- confidence is 0..1.",
    "- reason is at most 90 characters.",
    "- SKIP is always available and always acceptable. A bad entry costs more than a missed one.",
    opts.inPosition
      ? "- You currently hold this position. SELL closes it; SKIP holds it."
      : "- You hold no position. SELL is not available; use BUY or SKIP.",
    "",
    `Class lens: ${lens}`,
    `Bias: enter on momentum above ${opts.strategy.entryThreshold}; avoid curve progress above ${opts.strategy.maxCurve}%.`,
    opts.strategy.requireBookAlign
      ? "Bias: require the order book to lean your way before entering."
      : "Bias: order book alignment is informative, not required.",
  ];
  if (opts.systemSuffix && opts.systemSuffix.trim().length > 0) {
    parts.push("", "Operator brief:", opts.systemSuffix.trim());
  }
  return parts.join("\n");
}

export function buildUserPrompt(snap: Snapshot, ctxCandles: number): string {
  return `${serializeSnapshot(snap, ctxCandles)}\n\nReturn the JSON verdict.`;
}

/** Strips ```json fences and any prose around the first JSON object. */
export function stripFences(raw: string): string {
  let text = raw.trim();
  const fence = /^```[a-zA-Z0-9_-]*\s*\n?([\s\S]*?)\n?```$/;
  const m = text.match(fence);
  if (m) text = m[1].trim();
  if (text.startsWith("{")) return text;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) return text.slice(start, end + 1);
  return text;
}

function num(v: unknown, fallback: number): number {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : fallback;
}

/**
 * Parses and HARDENS a model response into a Verdict.
 *
 * The model is never trusted on size: sizeEth is clamped to opts.maxSizeEth
 * AFTER parsing, every time, including on the SELL path.
 */
export function parseVerdict(raw: string, opts: BrainOpts): Verdict {
  const text = stripFences(raw);
  const data = JSON.parse(text) as Record<string, unknown>;

  const actionRaw = String(data.action ?? "").toUpperCase();
  let action: Verdict["action"] =
    actionRaw === "BUY" || actionRaw === "SELL" ? actionRaw : "SKIP";
  if (action === "SELL" && opts.inPosition === false) action = "SKIP";

  const maxSize = Math.max(0, opts.maxSizeEth);
  let sizeEth = Math.max(0, num(data.sizeEth, 0));
  if (sizeEth > maxSize) sizeEth = maxSize;
  if (action === "SKIP") sizeEth = 0;

  const confidence = Math.max(0, Math.min(1, num(data.confidence, 0)));

  const holdRaw = Math.round(num(data.holdTicks, opts.strategy.holdMin));
  const holdTicks =
    action === "SKIP"
      ? 0
      : Math.max(
          opts.strategy.holdMin,
          Math.min(opts.strategy.holdMax, Math.max(1, holdRaw)),
        );

  const reason = String(data.reason ?? "").slice(0, 90) || "no reason given";

  return { action, sizeEth, confidence, holdTicks, reason };
}

/**
 * Wraps any decide implementation so it can never throw or hang out of the
 * contract. Every failure path — network, status, JSON, timeout, refusal —
 * resolves to SKIP.
 */
export async function guardDecide(
  fn: () => Promise<Verdict>,
  reasonPrefix = "error",
): Promise<Verdict> {
  try {
    const v = await fn();
    if (!v || typeof v !== "object") return skipVerdict(`${reasonPrefix}: empty`);
    return v;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return skipVerdict(`${reasonPrefix}: ${msg}`.slice(0, 90));
  }
}
