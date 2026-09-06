import { describe, expect, it, vi } from "vitest";
import type { BrainOpts, Snapshot } from "../src/core/types.js";
import { DEFAULT_STRATEGY, parseVerdict, stripFences } from "../src/core/brain.js";
import { claudeBrain, buildRequestBody, extractText } from "../src/live/brain.js";

const SNAP: Snapshot = {
  pair: "$DGEN",
  last: 0.0000091,
  candles: [
    { t: 1, o: 0.000009, h: 0.0000093, l: 0.0000089, c: 0.0000091, v: 1.2 },
    { t: 31, o: 0.0000091, h: 0.0000096, l: 0.000009, c: 0.0000095, v: 2.1 },
  ],
  bids: [{ price: 0.000009, size: 1.4 }],
  asks: [{ price: 0.0000092, size: 1.1 }],
  ageMinutes: 6,
  uniqueBuyers: 44,
  curveProgressPct: 18,
  reserveEth: 6.8,
};

function opts(over: Partial<BrainOpts> = {}): BrainOpts {
  return {
    maxSizeEth: 0.25,
    model: "claude-opus-5",
    thinkingBudget: 0,
    agentClass: "SNIPER",
    strategy: { ...DEFAULT_STRATEGY },
    inPosition: false,
    ...over,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

function textBlock(text: string) {
  return { content: [{ type: "text", text }], usage: { input_tokens: 900, output_tokens: 40 } };
}

describe("verdict clamping — the model is never trusted on size", () => {
  it("caps sizeEth to maxSizeEth after parsing", () => {
    const v = parseVerdict(
      '{"action":"BUY","sizeEth":99999,"confidence":0.9,"holdTicks":200,"reason":"send it"}',
      opts({ maxSizeEth: 0.25 }),
    );
    expect(v.action).toBe("BUY");
    expect(v.sizeEth).toBe(0.25);
  });

  it("caps a size delivered as a string", () => {
    const v = parseVerdict(
      '{"action":"BUY","sizeEth":"4.2","confidence":1,"holdTicks":90,"reason":"x"}',
      opts({ maxSizeEth: 0.4 }),
    );
    expect(v.sizeEth).toBe(0.4);
  });

  it("floors a negative size at zero", () => {
    const v = parseVerdict(
      '{"action":"BUY","sizeEth":-5,"confidence":0.5,"holdTicks":90,"reason":"x"}',
      opts(),
    );
    expect(v.sizeEth).toBe(0);
  });

  it("zeroes size on SKIP whatever the model claimed", () => {
    const v = parseVerdict(
      '{"action":"SKIP","sizeEth":10,"confidence":0.5,"holdTicks":300,"reason":"x"}',
      opts(),
    );
    expect(v).toMatchObject({ action: "SKIP", sizeEth: 0, holdTicks: 0 });
  });

  it("downgrades SELL to SKIP when the agent holds nothing", () => {
    const v = parseVerdict(
      '{"action":"SELL","sizeEth":1,"confidence":1,"holdTicks":10,"reason":"x"}',
      opts({ inPosition: false }),
    );
    expect(v.action).toBe("SKIP");
  });

  it("clamps holdTicks into the strategy window and confidence into 0..1", () => {
    const v = parseVerdict(
      '{"action":"BUY","sizeEth":0.1,"confidence":42,"holdTicks":99999,"reason":"x"}',
      opts({ strategy: { ...DEFAULT_STRATEGY, holdMin: 60, holdMax: 420 } }),
    );
    expect(v.confidence).toBe(1);
    expect(v.holdTicks).toBe(420);
  });

  it("treats an unknown action as SKIP", () => {
    const v = parseVerdict('{"action":"YOLO","sizeEth":1}', opts());
    expect(v.action).toBe("SKIP");
  });

  it("strips markdown fences before parsing", () => {
    expect(stripFences('```json\n{"a":1}\n```')).toBe('{"a":1}');
    expect(stripFences('here you go: {"a":1} cheers')).toBe('{"a":1}');
    const v = parseVerdict(
      '```json\n{"action":"BUY","sizeEth":0.05,"confidence":0.6,"holdTicks":100,"reason":"fenced"}\n```',
      opts(),
    );
    expect(v).toMatchObject({ action: "BUY", sizeEth: 0.05, reason: "fenced" });
  });
});

describe("decide() never throws — every failure is a SKIP", () => {
  it("SKIPs on a JSON parse failure", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(textBlock("not json at all")));
    const brain = claudeBrain({ apiKey: "k", fetchImpl: fetchImpl as unknown as typeof fetch, maxRetries: 0 });
    const v = await brain.decide(SNAP, opts());
    expect(v.action).toBe("SKIP");
    expect(v.sizeEth).toBe(0);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("SKIPs on a bad HTTP status", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: "nope" }, 400));
    const brain = claudeBrain({ apiKey: "k", fetchImpl: fetchImpl as unknown as typeof fetch, maxRetries: 0 });
    const v = await brain.decide(SNAP, opts());
    expect(v.action).toBe("SKIP");
    expect(v.reason).toContain("400");
  });

  it("SKIPs on a timeout / aborted request", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new DOMException("The operation was aborted.", "AbortError");
    });
    const brain = claudeBrain({ apiKey: "k", fetchImpl: fetchImpl as unknown as typeof fetch, maxRetries: 0, timeoutMs: 5 });
    const v = await brain.decide(SNAP, opts());
    expect(v.action).toBe("SKIP");
  });

  it("SKIPs when the transport itself explodes", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("ECONNRESET");
    });
    const brain = claudeBrain({ apiKey: "k", fetchImpl: fetchImpl as unknown as typeof fetch, maxRetries: 0 });
    const v = await brain.decide(SNAP, opts());
    expect(v).toMatchObject({ action: "SKIP", sizeEth: 0, holdTicks: 0 });
    expect(v.reason).toContain("ECONNRESET");
  });

  it("SKIPs on an empty content array", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ content: [] }));
    const brain = claudeBrain({ apiKey: "k", fetchImpl: fetchImpl as unknown as typeof fetch, maxRetries: 0 });
    expect((await brain.decide(SNAP, opts())).action).toBe("SKIP");
  });

  it("SKIPs on a refusal stop_reason without touching content", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ content: [], stop_reason: "refusal", stop_details: { category: "cyber" } }),
    );
    const brain = claudeBrain({ apiKey: "k", fetchImpl: fetchImpl as unknown as typeof fetch, maxRetries: 0 });
    const v = await brain.decide(SNAP, opts());
    expect(v.action).toBe("SKIP");
    expect(v.reason).toContain("refusal");
  });

  it("SKIPs when no API key is configured, without making a request", async () => {
    const fetchImpl = vi.fn();
    const brain = claudeBrain({ apiKey: "", fetchImpl: fetchImpl as unknown as typeof fetch });
    expect((await brain.decide(SNAP, opts())).action).toBe("SKIP");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("retries a 429 and then returns the parsed verdict", async () => {
    let call = 0;
    const fetchImpl = vi.fn(async () => {
      call += 1;
      if (call === 1) return jsonResponse({ error: "rate limited" }, 429);
      return jsonResponse(
        textBlock('{"action":"BUY","sizeEth":0.09,"confidence":0.7,"holdTicks":140,"reason":"ok"}'),
      );
    });
    const brain = claudeBrain({ apiKey: "k", fetchImpl: fetchImpl as unknown as typeof fetch, maxRetries: 2 });
    const v = await brain.decide(SNAP, opts());
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(v).toMatchObject({ action: "BUY", sizeEth: 0.09 });
  });

  it("clamps the size returned by a well-formed live response", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(textBlock('{"action":"BUY","sizeEth":50,"confidence":1,"holdTicks":100,"reason":"max bid"}')),
    );
    const brain = claudeBrain({ apiKey: "k", fetchImpl: fetchImpl as unknown as typeof fetch, maxRetries: 0 });
    const v = await brain.decide(SNAP, opts({ maxSizeEth: 0.12 }));
    expect(v.sizeEth).toBe(0.12);
  });
});

describe("wire contract", () => {
  it("sends the pinned headers and endpoint", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(textBlock('{"action":"SKIP","sizeEth":0,"confidence":0,"holdTicks":0,"reason":"n"}')),
    );
    const brain = claudeBrain({ apiKey: "secret-key", fetchImpl: fetchImpl as unknown as typeof fetch, maxRetries: 0 });
    await brain.decide(SNAP, opts());

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      "x-api-key": "secret-key",
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    });
  });

  it("keeps the system prompt out of messages and caps max_tokens at 300 with no reasoning", () => {
    const body = buildRequestBody(SNAP, opts({ thinkingBudget: 0 }), 24);
    expect(body.model).toBe("claude-opus-5");
    expect(body.max_tokens).toBe(300);
    expect(typeof body.system).toBe("string");
    expect(String(body.system)).toContain("Class lens");
    expect(body.messages).toHaveLength(1);
    expect(JSON.stringify(body.messages)).not.toContain("Class lens");
  });

  it("omits temperature on models that reject sampling parameters", () => {
    expect(buildRequestBody(SNAP, opts({ model: "claude-opus-5" }), 24)).not.toHaveProperty("temperature");
    expect(buildRequestBody(SNAP, opts({ model: "claude-fable-5-1" }), 24)).not.toHaveProperty("temperature");
    expect(buildRequestBody(SNAP, opts({ model: "claude-haiku-4-5" }), 24).temperature).toBe(0);
  });

  it("expresses the reasoning budget as output_config.effort and never as budget_tokens", () => {
    const body = buildRequestBody(SNAP, opts({ thinkingBudget: 3000 }), 96);
    expect(body).not.toHaveProperty("thinking");
    expect(body.output_config).toEqual({ effort: "xhigh" });
    expect(body.max_tokens).toBe(3300);
  });

  it("appends the FORGE system suffix to the system prompt only", () => {
    const body = buildRequestBody(SNAP, opts({ systemSuffix: "Only touch dog coins." }), 24);
    expect(String(body.system)).toContain("Only touch dog coins.");
  });

  it("keeps only text blocks when reading the response", () => {
    expect(
      extractText({
        content: [
          { type: "thinking", text: "hidden" },
          { type: "text", text: '{"a":' },
          { type: "text", text: "1}" },
        ],
      }),
    ).toBe('{"a":1}');
  });
});
