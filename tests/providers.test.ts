/**
 * THREE HOUSES — the ladder, the bill, and the two new wire contracts.
 *
 * Load-bearing assertions in this file:
 *   · every rung of every ladder has a price, or costPerDecision silently
 *     returns 0 and the village lies about what it is spending;
 *   · PTN 12 is the unlock on all three houses, not just Anthropic;
 *   · OpenAI never receives `temperature`, xAI always does;
 *   · a 400 that names a parameter is retried once WITHOUT that parameter,
 *     because a silently dead house is worse than a slower one;
 *   · every failure path still resolves to SKIP and never throws.
 */

import { describe, expect, it, vi } from "vitest";
import {
  MAX_OUTPUT_TOKENS,
  MODEL_LADDERS,
  MODEL_PRICING,
  PROVIDERS,
  PROVIDER_META,
  TOKENS_BOOK,
  TOKENS_PER_CANDLE,
  TOKENS_SYSTEM,
  compileConfig,
  isProvider,
  modelForPtn,
  normalizeProvider,
  providerForModel,
} from "../src/core/config.js";
import type { BrainOpts, Provider, Snapshot } from "../src/core/types.js";
import { DEFAULT_STRATEGY } from "../src/core/brain.js";
import {
  grokBrain,
  openaiAdapter,
  openaiBrain,
  openaiText,
  wireBrain,
  xaiAdapter,
} from "../src/live/providers.js";
import { liveBrain } from "../src/live/router.js";
import { Village } from "../src/core/village.js";
import { SimMarket } from "../src/sim/market.js";
import { heuristicBrain } from "../src/sim/brain.js";
import { mulberry32 } from "../src/sim/rng.js";

const snap: Snapshot = {
  pair: "$DEGEN",
  last: 0.0012,
  candles: [{ t: 0, o: 0.001, h: 0.0013, l: 0.0009, c: 0.0012, v: 4 }],
  bids: [{ price: 0.0011, size: 3 }],
  asks: [{ price: 0.0013, size: 2 }],
  ageMinutes: 5,
  uniqueBuyers: 40,
  curveProgressPct: 22,
  reserveEth: 18,
};

function opts(over: Partial<BrainOpts> = {}): BrainOpts {
  return {
    maxSizeEth: 0.4,
    model: "gpt-6-astra",
    provider: "openai",
    thinkingBudget: 1500,
    agentClass: "SNIPER",
    strategy: DEFAULT_STRATEGY,
    ...over,
  };
}

const VERDICT = JSON.stringify({
  action: "BUY",
  sizeEth: 0.2,
  confidence: 0.7,
  holdTicks: 120,
  reason: "momentum",
});

function okResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

function errResponse(status: number, text = ""): Response {
  return {
    ok: false,
    status,
    json: async () => ({}),
    text: async () => text,
  } as unknown as Response;
}

const openaiOk = okResponse({
  status: "completed",
  output: [
    { type: "reasoning", summary: [] },
    { type: "message", content: [{ type: "output_text", text: VERDICT }] },
  ],
  usage: { input_tokens: 900, output_tokens: 40 },
});

const xaiOk = okResponse({
  choices: [{ finish_reason: "stop", message: { role: "assistant", content: VERDICT } }],
  usage: { prompt_tokens: 900, completion_tokens: 40 },
});

/* ------------------------------------------------------------------ ladder */

describe("the three ladders", () => {
  it("prices every rung of every house", () => {
    for (const p of PROVIDERS) {
      for (const rung of MODEL_LADDERS[p]) {
        expect(MODEL_PRICING[rung.id], `${p}/${rung.id}`).toBeDefined();
        expect(MODEL_PRICING[rung.id].inputPerMTok).toBeGreaterThan(0);
        expect(MODEL_PRICING[rung.id].outputPerMTok).toBeGreaterThan(0);
      }
    }
  });

  it("unlocks the frontier rung at PTN 12 on all three, and not at 11", () => {
    for (const p of PROVIDERS) {
      const ladder = MODEL_LADDERS[p];
      expect(ladder[0].minPtn).toBe(0);
      expect(ladder[1].minPtn).toBe(12);
      expect(modelForPtn(11, p)).toBe(ladder[0].id);
      expect(modelForPtn(12, p)).toBe(ladder[1].id);
    }
  });

  it("keeps the Anthropic ladder as the default, unchanged", () => {
    expect(modelForPtn(0)).toBe("claude-opus-5");
    expect(modelForPtn(12)).toBe("claude-fable-5-1");
    expect(compileConfig({ ptn: 12 }).provider).toBe("anthropic");
  });

  it("maps a model id back to its house", () => {
    expect(providerForModel("gpt-6-astra")).toBe("openai");
    expect(providerForModel("grok-4.3")).toBe("xai");
    expect(providerForModel("nonsense")).toBe("anthropic");
  });

  it("normalizes junk to the default rather than compiling an unknown house", () => {
    expect(isProvider("openai")).toBe(true);
    expect(isProvider("bard")).toBe(false);
    expect(normalizeProvider(undefined)).toBe("anthropic");
    expect(compileConfig({ ptn: 12 }, 0, [], { provider: "xai" }).model).toBe("grok-4.6");
  });

  it("names a real endpoint and env key for each house", () => {
    for (const p of PROVIDERS) {
      expect(PROVIDER_META[p].endpoint).toMatch(/^https:\/\//);
      expect(PROVIDER_META[p].envKey).toMatch(/API_KEY$/);
    }
  });
});

/* -------------------------------------------------------------------- cost */

describe("the bill changes with the house", () => {
  function manual(model: string, ctx: number, thinking: number): number {
    const price = MODEL_PRICING[model];
    const input = TOKENS_SYSTEM + ctx * TOKENS_PER_CANDLE + TOKENS_BOOK;
    const output = MAX_OUTPUT_TOKENS + thinking;
    return (input / 1e6) * price.inputPerMTok + (output / 1e6) * price.outputPerMTok;
  }

  it("prices the same stats differently on each house at PTN 12", () => {
    const xai = compileConfig({ ptn: 12 }, 0, [], { provider: "xai" });
    const anth = compileConfig({ ptn: 12 }, 0, [], { provider: "anthropic" });
    const oai = compileConfig({ ptn: 12 }, 0, [], { provider: "openai" });

    expect(xai.costPerDecision).toBeCloseTo(manual("grok-4.6", 96, 3000), 12);
    expect(anth.costPerDecision).toBeCloseTo(manual("claude-fable-5-1", 96, 3000), 12);
    expect(oai.costPerDecision).toBeCloseTo(manual("gpt-6-astra", 96, 3000), 12);

    /* Grok 4.6 at $2/$6 is the cheap lane; the other two frontier rungs are
       both $10/$50 and therefore cost the same per decision. */
    expect(xai.costPerDecision).toBeLessThan(anth.costPerDecision);
    expect(oai.costPerDecision).toBeCloseTo(anth.costPerDecision, 12);
  });

  it("leaves everything except model and cost identical across houses", () => {
    const a = compileConfig({ spd: 7, rsk: 4, ptn: 9, gas: 6 }, 3, [], { provider: "anthropic" });
    const x = compileConfig({ spd: 7, rsk: 4, ptn: 9, gas: 6 }, 3, [], { provider: "xai" });
    expect(x.pollIntervalMs).toBe(a.pollIntervalMs);
    expect(x.ctxCandles).toBe(a.ctxCandles);
    expect(x.thinkingBudget).toBe(a.thinkingBudget);
    expect(x.effort).toBe(a.effort);
    expect(x.positionSizeEth).toBeCloseTo(a.positionSizeEth, 12);
    expect(x.model).not.toBe(a.model);
    expect(x.costPerDecision).not.toBeCloseTo(a.costPerDecision, 6);
  });
});

/* ---------------------------------------------------------------- the wire */

describe("the OpenAI wire", () => {
  it("sends instructions + input, the effort rung, and NO sampling parameters", () => {
    const body = openaiAdapter.body(snap, opts({ thinkingBudget: 3000 }), 24);
    expect(body.model).toBe("gpt-6-astra");
    expect(body).not.toHaveProperty("temperature");
    expect(body).not.toHaveProperty("top_p");
    expect(body.reasoning).toEqual({ effort: "xhigh" });
    expect(body.max_output_tokens).toBe(MAX_OUTPUT_TOKENS + 3000);
    expect(body.store).toBe(false);
    expect(String(body.instructions)).toContain("memecoin trading agent");
  });

  it("reads text out of the output array, ignoring reasoning blocks", () => {
    expect(openaiText({ output: [{ type: "reasoning" }, { type: "message", content: [{ type: "output_text", text: " x " }] }] })).toBe("x");
    expect(openaiText({ output_text: "y" })).toBe("y");
    expect(openaiText({})).toBe("");
    expect(openaiText(null)).toBe("");
  });

  it("treats a refusal and a truncation as SKIP, not as a crash", () => {
    expect(openaiAdapter.refusal({ output: [{ type: "message", content: [{ type: "refusal", refusal: "no" }] }] })).toContain("refusal");
    expect(openaiAdapter.refusal({ status: "incomplete", incomplete_details: { reason: "max_output_tokens" } })).toContain("max_output_tokens");
    expect(openaiAdapter.refusal({ status: "completed", output: [] })).toBeNull();
  });

  it("parses a good response into a hardened verdict", async () => {
    const fetchImpl = vi.fn(async () => openaiOk) as unknown as typeof fetch;
    const brain = openaiBrain({ apiKey: "k", fetchImpl });
    const v = await brain.decide(snap, opts({ maxSizeEth: 0.1 }));
    expect(v.action).toBe("BUY");
    /* clamped after parsing, exactly as on the Anthropic path */
    expect(v.sizeEth).toBe(0.1);
  });
});

describe("the xAI wire", () => {
  it("sends OpenAI-shaped messages, reasoning_effort, and temperature 0", () => {
    const body = xaiAdapter.body(snap, opts({ model: "grok-4.6", provider: "xai", thinkingBudget: 512 }), 24);
    expect(body.model).toBe("grok-4.6");
    expect(body.temperature).toBe(0);
    expect(body.reasoning_effort).toBe("medium");
    expect(body.max_completion_tokens).toBe(MAX_OUTPUT_TOKENS + 512);
    const messages = body.messages as Array<{ role: string }>;
    expect(messages.map((m) => m.role)).toEqual(["system", "user"]);
  });

  it("reads choices[0].message.content and flags a filtered answer", () => {
    expect(xaiAdapter.text({ choices: [{ message: { content: " z " } }] })).toBe("z");
    expect(xaiAdapter.refusal({ choices: [{ finish_reason: "content_filter" }] })).toBe("content_filter");
    expect(xaiAdapter.refusal({ choices: [{ message: { refusal: "nope" } }] })).toContain("refusal");
  });

  it("parses a good response", async () => {
    const fetchImpl = vi.fn(async () => xaiOk) as unknown as typeof fetch;
    const brain = grokBrain({ apiKey: "k", fetchImpl });
    const v = await brain.decide(snap, opts({ model: "grok-4.6", provider: "xai" }));
    expect(v.action).toBe("BUY");
    expect(v.sizeEth).toBeCloseTo(0.2, 12);
  });
});

/* ----------------------------------------------------------- degrade-once */

describe("degrade-once on a rejected parameter", () => {
  it("retries without reasoning_effort when xAI rejects it, and succeeds", async () => {
    const bodies: Array<Record<string, unknown>> = [];
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      bodies.push(body);
      if ("reasoning_effort" in body) {
        return errResponse(400, '{"error":"reasoning_effort is not supported for this model"}');
      }
      return xaiOk;
    }) as unknown as typeof fetch;

    const brain = grokBrain({ apiKey: "k", fetchImpl, maxRetries: 0 });
    const v = await brain.decide(snap, opts({ model: "grok-4.6", provider: "xai" }));

    expect(v.action).toBe("BUY");
    expect(bodies).toHaveLength(2);
    expect(bodies[0]).toHaveProperty("reasoning_effort");
    expect(bodies[1]).not.toHaveProperty("reasoning_effort");
    /* the rest of the request survives the degrade */
    expect(bodies[1].temperature).toBe(0);
  });

  it("gives up with a SKIP when the 400 is about something it cannot drop", async () => {
    const fetchImpl = vi.fn(async () => errResponse(400, '{"error":"invalid model"}')) as unknown as typeof fetch;
    const brain = grokBrain({ apiKey: "k", fetchImpl, maxRetries: 0 });
    const v = await brain.decide(snap, opts({ provider: "xai" }));
    expect(v.action).toBe("SKIP");
    expect(v.sizeEth).toBe(0);
  });
});

/* ------------------------------------------------------------- never throw */

describe("every failure path is a SKIP", () => {
  const cases: Array<[string, typeof fetch]> = [
    ["500", (async () => errResponse(500)) as unknown as typeof fetch],
    ["429", (async () => errResponse(429)) as unknown as typeof fetch],
    ["transport", (async () => {
      throw new Error("socket hang up");
    }) as unknown as typeof fetch],
    ["empty content", (async () => okResponse({ output: [] })) as unknown as typeof fetch],
    ["garbage json", (async () => okResponse({ output: [{ type: "message", content: [{ type: "output_text", text: "not json" }] }] })) as unknown as typeof fetch],
  ];

  for (const [label, fetchImpl] of cases) {
    it(`resolves ${label} to SKIP without throwing`, async () => {
      const brain = openaiBrain({ apiKey: "k", fetchImpl, maxRetries: 0 });
      const v = await brain.decide(snap, opts());
      expect(v.action).toBe("SKIP");
      expect(v.sizeEth).toBe(0);
    });
  }

  it("skips with a named env var when the house has no key", async () => {
    const noKey = { ...process.env };
    delete process.env.OPENAI_API_KEY;
    delete process.env.XAI_API_KEY;
    try {
      const v1 = await openaiBrain({}).decide(snap, opts());
      const v2 = await grokBrain({}).decide(snap, opts({ provider: "xai" }));
      expect(v1.reason).toBe("no OPENAI_API_KEY");
      expect(v2.reason).toBe("no XAI_API_KEY");
    } finally {
      process.env = noKey;
    }
  });

  it("reports the wire through onTrace even when it fails", async () => {
    const traces: string[] = [];
    const brain = wireBrain(openaiAdapter, {
      apiKey: "k",
      maxRetries: 0,
      fetchImpl: (async () => errResponse(503)) as unknown as typeof fetch,
      onTrace: (t) => traces.push(`${t.model} ${t.status} ${t.error ?? ""}`),
    });
    await brain.decide(snap, opts());
    expect(traces[0]).toContain("gpt-6-astra");
    expect(traces[0]).toContain("503");
  });
});

/* ------------------------------------------------------------------ router */

describe("the house router", () => {
  it("sends each agent to its own house in one village", async () => {
    const hits: string[] = [];
    const make = (label: string) =>
      (async () => {
        hits.push(label);
        return label === "openai" ? openaiOk : xaiOk;
      }) as unknown as typeof fetch;

    const brain = liveBrain({
      openai: { apiKey: "k", fetchImpl: make("openai") },
      xai: { apiKey: "k", fetchImpl: make("xai") },
    });

    await brain.decide(snap, opts({ provider: "openai" }));
    await brain.decide(snap, opts({ provider: "xai", model: "grok-4.6" }));
    expect(hits).toEqual(["openai", "xai"]);
  });

  it("falls back to Anthropic when the provider is missing", async () => {
    const hits: string[] = [];
    const brain = liveBrain({
      anthropic: {
        apiKey: "k",
        fetchImpl: (async () => {
          hits.push("anthropic");
          return okResponse({
            content: [{ type: "text", text: VERDICT }],
            usage: { input_tokens: 1, output_tokens: 1 },
          });
        }) as unknown as typeof fetch,
      },
    });
    const v = await brain.decide(snap, { ...opts(), provider: undefined });
    expect(hits).toEqual(["anthropic"]);
    expect(v.action).toBe("BUY");
  });
});

/* ------------------------------------------------------------------ REWIRE */

describe("REWIRE in the village", () => {
  function village(): Village {
    return new Village({
      market: new SimMarket({ seed: 42 }),
      brain: heuristicBrain(),
      rng: mulberry32(42),
      blockingDecisions: true,
      startingTreasury: 200,
    });
  }

  it("moves an agent between houses for coins and recompiles its model", () => {
    const v = village();
    const a = v.agents[0];
    a.stats = { ...a.stats, ptn: 12 };
    expect(v.configFor(a).model).toBe("claude-fable-5-1");

    expect(v.rewire(a.id, "xai")).toBe(true);
    expect(v.treasury).toBe(140);
    expect(v.configFor(a).model).toBe("grok-4.6");
    expect(v.configFor(a).provider).toBe("xai");
    /* the stats did not move with it */
    expect(v.configFor(a).ctxCandles).toBe(96);
  });

  it("refuses a no-op, an unknown agent, an open position, and an empty treasury", () => {
    const v = village();
    const a = v.agents[0];
    expect(v.rewire(a.id, "anthropic")).toBe(false);
    expect(v.rewire("nobody", "xai")).toBe(false);

    a.position = {
      pair: "$X",
      entryPrice: 1,
      sizeEth: 0.1,
      tokens: 1,
      openedTick: 0,
      holdTicks: 10,
      feePaidEth: 0,
      unrealizedEth: 0,
    };
    expect(v.rewire(a.id, "xai")).toBe(false);
    a.position = null;

    v.treasury = 10;
    expect(v.rewire(a.id, "xai")).toBe(false);
    expect(v.treasury).toBe(10);
  });

  it("carries the house into the deployed custom agent", () => {
    const v = village();
    const agent = v.deployCustom({
      name: "GROKKED",
      stats: { spd: 5, rsk: 5, ptn: 5, gas: 5 },
      strategy: DEFAULT_STRATEGY,
      systemSuffix: "",
      provider: "xai",
    });
    expect(agent).not.toBeNull();
    expect(agent?.provider).toBe("xai");
    expect(v.configFor(agent!).model).toBe("grok-4.3");
  });
});
