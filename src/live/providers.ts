/**
 * DEGEN VILLAGE — the other two houses.
 *
 * src/live/brain.ts talks to Anthropic. This file talks to OpenAI and xAI
 * through one shared, defensive request loop, because the three wire contracts
 * differ in shape but not in the guarantees the village needs from them:
 *
 *   decide() never throws · every failure resolves to SKIP · sizeEth is
 *   clamped after parsing, every time, by parseVerdict.
 *
 * WIRE CONTRACTS (verified against the vendors' own docs on 2026-09-06)
 *
 *   OpenAI   POST https://api.openai.com/v1/responses
 *            Authorization: Bearer $OPENAI_API_KEY
 *            instructions + input, max_output_tokens, reasoning.effort
 *            gpt-6-astra and the GPT-5.6 family do NOT accept temperature,
 *            top_p or logprobs — OpenAI removed them on migration.
 *
 *   xAI      POST https://api.x.ai/v1/chat/completions
 *            Authorization: Bearer $XAI_API_KEY
 *            OpenAI-compatible messages, max_completion_tokens,
 *            reasoning_effort. This is the ONLY house on which the original
 *            brief's `temperature: 0` is still legal, so it is still sent.
 *
 * THE EFFORT RUNG IS THE SAME NUMBER EVERYWHERE. PTN buys a thinking budget;
 * config.ts maps it to low/medium/high/xhigh; each house carries it in its own
 * field. The village displays and prices the budget, not the field.
 *
 * DEGRADE-ONCE. `reasoning_effort` support "varies per model" on xAI, and a
 * deployment can reject a parameter the docs allow. A 400 is therefore retried
 * exactly once with the offending parameter stripped, and only then given up
 * on. A silently dead house is worse than a slightly slower one.
 *
 * See specs/04-live.md.
 */

import type { Brain, BrainOpts, Provider, Snapshot, Verdict } from "../core/types.js";
import { skipVerdict } from "../core/types.js";
import { buildSystemPrompt, buildUserPrompt, parseVerdict } from "../core/brain.js";
import { effortForBudget, MAX_OUTPUT_TOKENS, PROVIDER_META } from "../core/config.js";
import type { BrainTrace } from "./brain.js";

export const OPENAI_URL = "https://api.openai.com/v1/responses";
export const XAI_URL = "https://api.x.ai/v1/chat/completions";

type Json = Record<string, unknown>;

export interface WireAdapter {
  provider: Provider;
  url: string;
  envKey: string;
  headers(apiKey: string): Record<string, string>;
  body(snap: Snapshot, opts: BrainOpts, ctxCandles: number): Json;
  /** A 200 that carries no usable verdict: refusal, filter, truncation. */
  refusal(data: unknown): string | null;
  text(data: unknown): string;
  usage(data: unknown): { input: number; output: number };
  /** 400 recovery: a body with the rejected parameter removed, or null. */
  degrade(body: Json, errorText: string): Json | null;
}

export interface WireBrainOptions {
  apiKey?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  onTrace?: (trace: BrainTrace) => void;
  maxRetries?: number;
}

/* ------------------------------------------------------------------ shapes */

function obj(v: unknown): Json {
  return v && typeof v === "object" ? (v as Json) : {};
}

function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function int(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? Math.round(v) : 0;
}

/* ------------------------------------------------------------------ openai */

/** Walks the Responses `output` array for message text, ignoring reasoning. */
export function openaiText(data: unknown): string {
  const d = obj(data);
  if (typeof d.output_text === "string") return d.output_text.trim();
  let acc = "";
  for (const item of arr(d.output)) {
    const it = obj(item);
    if (it.type !== "message") continue;
    for (const part of arr(it.content)) {
      const p = obj(part);
      if (p.type === "output_text" && typeof p.text === "string") acc += p.text;
    }
  }
  return acc.trim();
}

export const openaiAdapter: WireAdapter = {
  provider: "openai",
  url: OPENAI_URL,
  envKey: "OPENAI_API_KEY",
  headers: (apiKey) => ({
    authorization: `Bearer ${apiKey}`,
    "content-type": "application/json",
  }),
  body(snap, opts, ctxCandles) {
    return {
      model: opts.model,
      instructions: buildSystemPrompt(opts),
      input: [{ role: "user", content: buildUserPrompt(snap, ctxCandles) }],
      max_output_tokens: MAX_OUTPUT_TOKENS + Math.max(0, opts.thinkingBudget),
      reasoning: { effort: effortForBudget(opts.thinkingBudget) },
      /* Nothing about a trading position needs to live on someone's server. */
      store: false,
    };
  },
  refusal(data) {
    const d = obj(data);
    for (const item of arr(d.output)) {
      const it = obj(item);
      for (const part of arr(it.content)) {
        const p = obj(part);
        if (p.type === "refusal") {
          return `refusal ${typeof p.refusal === "string" ? p.refusal.slice(0, 60) : ""}`.trim();
        }
      }
    }
    if (d.status === "incomplete") {
      const reason = obj(d.incomplete_details).reason;
      return `incomplete ${typeof reason === "string" ? reason : "unknown"}`;
    }
    return null;
  },
  text: openaiText,
  usage(data) {
    const u = obj(obj(data).usage);
    return { input: int(u.input_tokens), output: int(u.output_tokens) };
  },
  degrade(body, errorText) {
    const e = errorText.toLowerCase();
    if ("reasoning" in body && e.includes("reasoning")) {
      const { reasoning, ...rest } = body;
      void reasoning;
      return rest;
    }
    if ("store" in body && e.includes("store")) {
      const { store, ...rest } = body;
      void store;
      return rest;
    }
    return null;
  },
};

/* --------------------------------------------------------------------- xai */

export const xaiAdapter: WireAdapter = {
  provider: "xai",
  url: XAI_URL,
  envKey: "XAI_API_KEY",
  headers: (apiKey) => ({
    authorization: `Bearer ${apiKey}`,
    "content-type": "application/json",
  }),
  body(snap, opts, ctxCandles) {
    return {
      model: opts.model,
      messages: [
        { role: "system", content: buildSystemPrompt(opts) },
        { role: "user", content: buildUserPrompt(snap, ctxCandles) },
      ],
      max_completion_tokens: MAX_OUTPUT_TOKENS + Math.max(0, opts.thinkingBudget),
      reasoning_effort: effortForBudget(opts.thinkingBudget),
      /* The one house that still takes it. The brief asked for 0; here it is. */
      temperature: 0,
    };
  },
  refusal(data) {
    const choice = obj(arr(obj(data).choices)[0]);
    const msg = obj(choice.message);
    if (typeof msg.refusal === "string" && msg.refusal.length > 0) {
      return `refusal ${msg.refusal.slice(0, 60)}`;
    }
    if (choice.finish_reason === "content_filter") return "content_filter";
    return null;
  },
  text(data) {
    const choice = obj(arr(obj(data).choices)[0]);
    const content = obj(choice.message).content;
    return typeof content === "string" ? content.trim() : "";
  },
  usage(data) {
    const u = obj(obj(data).usage);
    return { input: int(u.prompt_tokens), output: int(u.completion_tokens) };
  },
  degrade(body, errorText) {
    const e = errorText.toLowerCase();
    if ("reasoning_effort" in body && e.includes("reasoning")) {
      const { reasoning_effort, ...rest } = body;
      void reasoning_effort;
      return rest;
    }
    if ("temperature" in body && (e.includes("temperature") || e.includes("sampling"))) {
      const { temperature, ...rest } = body;
      void temperature;
      return rest;
    }
    return null;
  },
};

/* ------------------------------------------------------------- the machine */

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * One request loop, three houses. Mirrors src/live/brain.ts exactly in what it
 * promises: a Verdict always, a throw never.
 */
export function wireBrain(
  adapter: WireAdapter,
  options: WireBrainOptions = {},
): Brain {
  const timeoutMs = options.timeoutMs ?? 20_000;
  const maxRetries = options.maxRetries ?? 2;
  /* Bound on purpose: see the note in brain.ts. */
  const doFetch = options.fetchImpl ?? globalThis.fetch?.bind(globalThis);

  async function callOnce(
    snap: Snapshot,
    opts: BrainOpts,
    ctxCandles: number,
    apiKey: string,
    body: Json,
  ): Promise<{
    verdict: Verdict | null;
    retryable: boolean;
    degraded: Json | null;
    trace: BrainTrace;
  }> {
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
      const res = await doFetch(adapter.url, {
        method: "POST",
        headers: adapter.headers(apiKey),
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      trace.status = res.status;
      trace.ms = Date.now() - started;

      if (!res.ok) {
        /* The body of a 400 names the parameter it hated. Read it, drop it. */
        let detail = "";
        if (res.status === 400) {
          try {
            detail = (await res.text()).slice(0, 400);
          } catch {
            detail = "";
          }
        }
        trace.error = `http ${res.status}${detail ? ` ${detail.slice(0, 90)}` : ""}`;
        const degraded = res.status === 400 ? adapter.degrade(body, detail) : null;
        const retryable = res.status === 429 || res.status >= 500;
        return { verdict: null, retryable, degraded, trace };
      }

      const data = (await res.json()) as unknown;
      const usage = adapter.usage(data);
      trace.inputTokens = usage.input;
      trace.outputTokens = usage.output;

      const refused = adapter.refusal(data);
      if (refused) {
        trace.error = refused;
        return { verdict: skipVerdict(refused), retryable: false, degraded: null, trace };
      }

      const text = adapter.text(data);
      trace.raw = text.slice(0, 400);
      if (!text) {
        trace.error = "empty content";
        return { verdict: null, retryable: false, degraded: null, trace };
      }

      try {
        const verdict = parseVerdict(text, opts);
        trace.ok = true;
        return { verdict, retryable: false, degraded: null, trace };
      } catch (err) {
        trace.error = `parse: ${err instanceof Error ? err.message : String(err)}`;
        return {
          verdict: skipVerdict("unparseable verdict"),
          retryable: false,
          degraded: null,
          trace,
        };
      }
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async decide(snap: Snapshot, opts: BrainOpts): Promise<Verdict> {
      const apiKey =
        options.apiKey ??
        (typeof process !== "undefined" ? process.env?.[adapter.envKey] : undefined) ??
        "";
      if (!apiKey) return skipVerdict(`no ${adapter.envKey}`);
      if (typeof doFetch !== "function") return skipVerdict("no fetch available");

      const ctxCandles = Math.max(1, snap.candles.length);
      let body = adapter.body(snap, opts, ctxCandles);
      let degradesLeft = 2;

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          const { verdict, retryable, degraded, trace } = await callOnce(
            snap,
            opts,
            ctxCandles,
            apiKey,
            body,
          );
          options.onTrace?.(trace);
          if (verdict) return verdict;
          if (degraded && degradesLeft > 0) {
            /* A rejected parameter is not a failed attempt: it is a smaller
               request. Retry immediately without burning the retry budget. */
            body = degraded;
            degradesLeft -= 1;
            attempt -= 1;
            continue;
          }
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
          if (attempt === maxRetries) return skipVerdict(msg.slice(0, 90));
          await sleep(250 * 2 ** attempt);
        }
      }
      return skipVerdict("exhausted retries");
    },
  };
}

export function openaiBrain(options: WireBrainOptions = {}): Brain {
  return wireBrain(openaiAdapter, options);
}

export function grokBrain(options: WireBrainOptions = {}): Brain {
  return wireBrain(xaiAdapter, options);
}

/** Endpoint each house is actually posted to, for the DEX overlay. */
export const HOUSE_ENDPOINT: Readonly<Record<Provider, string>> = Object.freeze({
  anthropic: PROVIDER_META.anthropic.endpoint,
  openai: OPENAI_URL,
  xai: XAI_URL,
});
