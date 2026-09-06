import { describe, expect, it } from "vitest";
import {
  MAX_OUTPUT_TOKENS,
  MODEL_PRICING,
  TOKENS_BOOK,
  TOKENS_PER_CANDLE,
  TOKENS_SYSTEM,
  compileConfig,
  costPerDecision,
} from "../src/core/config.js";

/**
 * The manual calculation, spelled out rather than imported, so the test fails
 * if the formula quietly changes shape.
 */
function manual(model: "claude-opus-5" | "claude-fable-5-1", ctxCandles: number, thinking: number): number {
  const price = MODEL_PRICING[model];
  const inputTokens = TOKENS_SYSTEM + ctxCandles * TOKENS_PER_CANDLE + TOKENS_BOOK;
  const outputTokens = MAX_OUTPUT_TOKENS + thinking;
  return (inputTokens / 1e6) * price.inputPerMTok + (outputTokens / 1e6) * price.outputPerMTok;
}

describe("costPerDecision", () => {
  it("matches the manual calculation at PTN 0 (Opus 5, 24 candles, no reasoning)", () => {
    const cfg = compileConfig({ ptn: 0 }, 0);
    expect(cfg.model).toBe("claude-opus-5");
    expect(cfg.ctxCandles).toBe(24);
    expect(cfg.thinkingBudget).toBe(0);

    /* 320 + 24*18 + 120 = 872 input, 300 output */
    const expected = (872 / 1e6) * 5 + (300 / 1e6) * 25;
    expect(expected).toBeCloseTo(0.01186, 10);
    expect(cfg.costPerDecision).toBeCloseTo(expected, 12);
    expect(cfg.costPerDecision).toBeCloseTo(manual("claude-opus-5", 24, 0), 12);
  });

  it("matches the manual calculation at PTN 12 (Fable 5.1, 96 candles, 3000 reasoning)", () => {
    const cfg = compileConfig({ ptn: 12 }, 0);
    expect(cfg.model).toBe("claude-fable-5-1");
    expect(cfg.ctxCandles).toBe(96);
    expect(cfg.thinkingBudget).toBe(3000);

    /* 320 + 96*18 + 120 = 2168 input, 300 + 3000 = 3300 output */
    const expected = (2168 / 1e6) * 10 + (3300 / 1e6) * 50;
    expect(expected).toBeCloseTo(0.18668, 10);
    expect(cfg.costPerDecision).toBeCloseTo(expected, 12);
    expect(cfg.costPerDecision).toBeCloseTo(manual("claude-fable-5-1", 96, 3000), 12);
  });

  it("prices the ladder monotonically across PTN", () => {
    let previous = -Infinity;
    for (let ptn = 0; ptn <= 15; ptn++) {
      const cost = compileConfig({ ptn }, 0).costPerDecision;
      expect(cost).toBeGreaterThanOrEqual(previous);
      previous = cost;
    }
  });

  it("PTN 12 costs more than fifteen times PTN 0 — the ladder is a real decision", () => {
    const cheap = compileConfig({ ptn: 0 }, 0).costPerDecision;
    const dear = compileConfig({ ptn: 12 }, 0).costPerDecision;
    expect(dear / cheap).toBeGreaterThan(15);
  });

  it("returns zero for a model with no published pricing", () => {
    expect(costPerDecision("claude-not-a-model", 24, 0)).toBe(0);
  });

  it("reprices when ALPHA FEED doubles context and reasoning", () => {
    const boosted = compileConfig({ ptn: 12 }, 0, ["alphaFeed"]);
    expect(boosted.ctxCandles).toBe(192);
    expect(boosted.thinkingBudget).toBe(6000);
    expect(boosted.costPerDecision).toBeCloseTo(manual("claude-fable-5-1", 192, 6000), 12);
  });

  it("sets maxTokens to the 300-token verdict plus reasoning headroom", () => {
    expect(compileConfig({ ptn: 0 }, 0).maxTokens).toBe(300);
    expect(compileConfig({ ptn: 4 }, 0).maxTokens).toBe(812);
    expect(compileConfig({ ptn: 12 }, 0).maxTokens).toBe(3300);
  });
});
