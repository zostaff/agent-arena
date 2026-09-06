/**
 * DEGEN VILLAGE — the live brain. Real Claude, real money on the other side.
 *
 * Raw fetch on purpose: src/core is isomorphic and dependency-free, and this
 * file is the only thing standing between a parsed JSON blob and a signed
 * transaction. Everything here is defensive.
 *
 * WIRE CONTRACT
 *   POST https://api.anthropic.com/v1/messages
 *   x-api-key, anthropic-version: 2023-06-01, content-type: application/json
 *   system separate from messages, max_tokens 300 (+ reasoning headroom)
 *
 * TWO DELIBERATE DEVIATIONS from the original spec, both forced by the API:
 *
 *   1. `temperature: 0` is REJECTED WITH A 400 on claude-opus-5 and
 *      claude-fable-5-1 — sampling parameters were removed on that model
 *      family. It is sent only for models that still accept it. Determinism in
 *      the sim comes from src/sim, which never calls this file.
 *
 *   2. `thinking: {type:"enabled", budget_tokens:N}` is also rejected with a
 *      400 on both models. The reasoning budget the player buys with PTN is
 *      expressed as `output_config.effort`, which is the current control:
 *          0 -> low, 512 -> medium, 1500 -> high, 3000 -> xhigh
 *      The budget number is still what the village displays and prices, and
 *      it still rides on max_tokens as reasoning headroom.
 *
 * See specs/04-live.md.
 */

import type { Brain, BrainOpts, Snapshot, Verdict } from "../core/types.js";
import { skipVerdict } from "../core/types.js";
import { buildSystemPrompt, buildUserPrompt, parseVerdict } from "../core/brain.js";
import { effortForBudget, MAX_OUTPUT_TOKENS } from "../core/config.js";

export const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
export const ANTHROPIC_VERSION = "2023-06-01";

/** Models that still accept sampling parameters. */
const SAMPLING_SUPPORTED = new Set<string>(["claude-haiku-4-5"]);

export interface ClaudeBrainOptions {
  apiKey?: string;
  /** Milliseconds before the request is aborted and the verdict becomes SKIP. */
  timeoutMs?: number;
  /** Injectable for tests. Defaults to globalThis.fetch. */
  fetchImpl?: typeof fetch;
  /** Called with every request/response pair, for the DEX overlay log. */
  onTrace?: (trace: BrainTrace) => void;
  /** Retries on 429 / 5xx before giving up and returning SKIP. */
  maxRetries?: number;
}

export interface BrainTrace {
  model: string;
  effort: string;
  pair: string;
  ok: boolean;
  status: number;
  ms: number;
  inputTokens: number;
  outputTokens: number;
  raw: string;
  error?: string;
}

interface AnthropicContentBlock {
  type: string;
  text?: string;
}

interface AnthropicResponse {
  content?: AnthropicContentBlock[];
  stop_reason?: string;
  stop_details?: { type?: string; category?: string | null; explanation?: string };
  usage?: { input_tokens?: number; output_tokens?: number };
}

/** Concatenates every text block, dropping thinking and tool blocks. */
export function extractText(data: AnthropicResponse): string {
  const blocks = Array.isArray(data.content) ? data.content : [];
  return blocks
    .filter((b) => b && b.type === "text" && typeof b.text === "string")
    .map((b) => b.text as string)
    .join("")
    .trim();
}

export function buildRequestBody(
  snap: Snapshot,
  opts: BrainOpts,
  ctxCandles: number,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: opts.model,
    max_tokens: MAX_OUTPUT_TOKENS + Math.max(0, opts.thinkingBudget),
    system: buildSystemPrompt(opts),
    messages: [{ role: "user", content: buildUserPrompt(snap, ctxCandles) }],
    output_config: { effort: effortForBudget(opts.thinkingBudget) },
  };
  if (SAMPLING_SUPPORTED.has(opts.model)) body.temperature = 0;
  return body;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function claudeBrain(options: ClaudeBrainOptions = {}): Brain {
  const timeoutMs = options.timeoutMs ?? 20_000;
  const maxRetries = options.maxRetries ?? 2;
  /* Bound on purpose: a bare globalThis.fetch reference throws "Illegal
     invocation" when called in a browser. */
  const doFetch = options.fetchImpl ?? globalThis.fetch?.bind(globalThis);

  async function callOnce(
    snap: Snapshot,
    opts: BrainOpts,
    ctxCandles: number,
    apiKey: string,
  ): Promise<{ verdict: Verdict | null; retryable: boolean; trace: BrainTrace }> {
    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    if (opts.signal) {
      if (opts.signal.aborted) controller.abort();
      else opts.signal.addEventListener("abort", () => controller.abort(), { once: true });
    }

    const trace: BrainTrace = {
      model: opts.model,
      effort: effortForBudget(opts.thinkingBudget),
      pair: snap.pair,
      ok: false,
      status: 0,
      ms: 0,
      inputTokens: 0,
      outputTokens: 0,
      raw: "",
    };

    try {
      const res = await doFetch(ANTHROPIC_URL, {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": ANTHROPIC_VERSION,
          "content-type": "application/json",
        },
        body: JSON.stringify(buildRequestBody(snap, opts, ctxCandles)),
        signal: controller.signal,
      });
      trace.status = res.status;
      trace.ms = Date.now() - started;

      if (!res.ok) {
        trace.error = `http ${res.status}`;
        const retryable = res.status === 429 || res.status >= 500;
        return { verdict: null, retryable, trace };
      }

      const data = (await res.json()) as AnthropicResponse;
      trace.inputTokens = data.usage?.input_tokens ?? 0;
      trace.outputTokens = data.usage?.output_tokens ?? 0;

      /* A refusal is a 200 with no usable content. It is a SKIP, not a crash. */
      if (data.stop_reason === "refusal") {
        trace.error = `refusal:${data.stop_details?.category ?? "unknown"}`;
        return {
          verdict: skipVerdict(`refusal ${data.stop_details?.category ?? ""}`.trim()),
          retryable: false,
          trace,
        };
      }

      const text = extractText(data);
      trace.raw = text.slice(0, 400);
      if (!text) {
        trace.error = "empty content";
        return { verdict: null, retryable: false, trace };
      }

      /* A malformed body is the model's problem, not a transport problem.
         Never retry it, never throw it — SKIP and move on. */
      try {
        const verdict = parseVerdict(text, opts);
        trace.ok = true;
        return { verdict, retryable: false, trace };
      } catch (err) {
        trace.error = `parse: ${err instanceof Error ? err.message : String(err)}`;
        return { verdict: skipVerdict("unparseable verdict"), retryable: false, trace };
      }
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async decide(snap: Snapshot, opts: BrainOpts): Promise<Verdict> {
      const apiKey =
        options.apiKey ??
        (typeof process !== "undefined" ? process.env?.ANTHROPIC_API_KEY : undefined) ??
        "";
      if (!apiKey) return skipVerdict("no ANTHROPIC_API_KEY");
      if (typeof doFetch !== "function") return skipVerdict("no fetch available");

      const ctxCandles = Math.max(1, snap.candles.length);

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          const { verdict, retryable, trace } = await callOnce(snap, opts, ctxCandles, apiKey);
          options.onTrace?.(trace);
          if (verdict) return verdict;
          if (!retryable || attempt === maxRetries) {
            return skipVerdict(trace.error ?? "no verdict");
          }
          await sleep(250 * 2 ** attempt);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          options.onTrace?.({
            model: opts.model,
            effort: effortForBudget(opts.thinkingBudget),
            pair: snap.pair,
            ok: false,
            status: 0,
            ms: 0,
            inputTokens: 0,
            outputTokens: 0,
            raw: "",
            error: msg,
          });
          /* Timeout, DNS, aborted socket, bad JSON — all of it lands here. */
          if (attempt === maxRetries) return skipVerdict(msg.slice(0, 90));
          await sleep(250 * 2 ** attempt);
        }
      }
      return skipVerdict("exhausted retries");
    },
  };
}
