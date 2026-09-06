import { describe, expect, it } from "vitest";
import {
  BASE_POSITION_ETH,
  MAX_CTX_CANDLES,
  MAX_STAT,
  MIN_POLL_INTERVAL_MS,
  MIN_SLIPPAGE_BPS,
  MODEL_LADDER,
  POSITION_CLAMP_MULT,
  compileConfig,
  ctxCandlesForPtn,
  effortForBudget,
  modelForPtn,
  pollIntervalForSpd,
  positionSizeFor,
  slippageBpsForGas,
  thinkingBudgetForPtn,
} from "../src/core/config.js";

const BOUNDARIES = [0, 7, 12, 15] as const;

describe("stat compiler — boundary values for each stat", () => {
  it.each(BOUNDARIES)("SPD %i maps to the documented poll interval", (spd) => {
    const expected = Math.max(MIN_POLL_INTERVAL_MS, 3200 - spd * 260);
    expect(pollIntervalForSpd(spd)).toBe(expected);
    expect(compileConfig({ spd }, 0).pollIntervalMs).toBe(expected);
  });

  it("SPD boundaries hit the exact published numbers", () => {
    expect(pollIntervalForSpd(0)).toBe(3200);
    expect(pollIntervalForSpd(7)).toBe(1380);
    expect(pollIntervalForSpd(12)).toBe(80 < 400 ? 400 : 80);
    expect(pollIntervalForSpd(12)).toBe(400);
    expect(pollIntervalForSpd(15)).toBe(400);
  });

  it.each(BOUNDARIES)("PTN %i maps to the documented context depth", (ptn) => {
    const expected = Math.min(MAX_CTX_CANDLES, 24 + ptn * 6);
    expect(ctxCandlesForPtn(ptn)).toBe(expected);
    expect(compileConfig({ ptn }, 0).ctxCandles).toBe(expected);
  });

  it("PTN boundaries hit the exact published numbers", () => {
    expect(ctxCandlesForPtn(0)).toBe(24);
    expect(ctxCandlesForPtn(7)).toBe(66);
    expect(ctxCandlesForPtn(12)).toBe(96);
    expect(ctxCandlesForPtn(15)).toBe(114);
  });

  it.each(BOUNDARIES)("GAS %i maps to the documented slippage", (gas) => {
    const expected = Math.max(MIN_SLIPPAGE_BPS, 160 - gas * 9);
    expect(slippageBpsForGas(gas)).toBe(expected);
    expect(compileConfig({ gas }, 0).slippageBps).toBe(expected);
  });

  it("GAS boundaries hit the exact published numbers", () => {
    expect(slippageBpsForGas(0)).toBe(160);
    expect(slippageBpsForGas(7)).toBe(97);
    expect(slippageBpsForGas(12)).toBe(52);
    expect(slippageBpsForGas(15)).toBe(30);
  });

  it.each(BOUNDARIES)("RSK %i maps to the documented position size", (rsk) => {
    const expected = Math.min(
      BASE_POSITION_ETH * (1 + rsk * 0.18) * (1 + 3 * 0.12),
      BASE_POSITION_ETH * POSITION_CLAMP_MULT,
    );
    expect(positionSizeFor(rsk, 3)).toBeCloseTo(expected, 12);
    expect(compileConfig({ rsk }, 3).positionSizeEth).toBeCloseTo(expected, 12);
  });

  it("clamps position size to base * 8 regardless of stat and level", () => {
    const ceiling = BASE_POSITION_ETH * POSITION_CLAMP_MULT;
    expect(positionSizeFor(15, 40)).toBe(ceiling);
    expect(compileConfig({ rsk: 15 }, 99).positionSizeEth).toBe(ceiling);
  });

  it("clamps out-of-range stats to MAX_STAT instead of trusting the caller", () => {
    const wild = compileConfig({ spd: 99, rsk: -4, ptn: 40, gas: 1e9 }, 0);
    const capped = compileConfig({ spd: MAX_STAT, rsk: 0, ptn: MAX_STAT, gas: MAX_STAT }, 0);
    expect(wild).toEqual(capped);
    expect(wild.pollIntervalMs).toBe(MIN_POLL_INTERVAL_MS);
    expect(wild.slippageBps).toBe(MIN_SLIPPAGE_BPS);
    expect(wild.ctxCandles).toBe(ctxCandlesForPtn(MAX_STAT));
    expect(wild.ctxCandles).toBeLessThanOrEqual(MAX_CTX_CANDLES);
  });
});

describe("model ladder", () => {
  it("is Opus 5 at PTN 0 and stays Opus 5 up to PTN 11", () => {
    expect(modelForPtn(0)).toBe("claude-opus-5");
    for (let ptn = 0; ptn < 12; ptn++) expect(modelForPtn(ptn)).toBe("claude-opus-5");
    expect(compileConfig({ ptn: 0 }, 0).model).toBe("claude-opus-5");
  });

  it("unlocks Fable 5.1 at PTN 12 and keeps it above", () => {
    expect(modelForPtn(12)).toBe("claude-fable-5-1");
    expect(modelForPtn(15)).toBe("claude-fable-5-1");
    expect(compileConfig({ ptn: 12 }, 0).model).toBe("claude-fable-5-1");
  });

  it("declares exactly the two documented rungs", () => {
    expect(MODEL_LADDER.map((r) => [r.minPtn, r.id])).toEqual([
      [0, "claude-opus-5"],
      [12, "claude-fable-5-1"],
    ]);
  });
});

describe("thinking budget", () => {
  it("is 0 at PTN 3", () => {
    expect(thinkingBudgetForPtn(3)).toBe(0);
    expect(compileConfig({ ptn: 3 }, 0).thinkingBudget).toBe(0);
  });
  it("is 512 at PTN 4", () => {
    expect(thinkingBudgetForPtn(4)).toBe(512);
    expect(compileConfig({ ptn: 4 }, 0).thinkingBudget).toBe(512);
  });
  it("is 1500 at PTN 8", () => {
    expect(thinkingBudgetForPtn(8)).toBe(1500);
    expect(compileConfig({ ptn: 8 }, 0).thinkingBudget).toBe(1500);
  });
  it("is 3000 at PTN 12", () => {
    expect(thinkingBudgetForPtn(12)).toBe(3000);
    expect(compileConfig({ ptn: 12 }, 0).thinkingBudget).toBe(3000);
  });
  it("maps each rung to the effort level sent on the wire", () => {
    expect(effortForBudget(0)).toBe("low");
    expect(effortForBudget(512)).toBe("medium");
    expect(effortForBudget(1500)).toBe("high");
    expect(effortForBudget(3000)).toBe("xhigh");
  });
});

describe("boosts are temporary config overrides", () => {
  const base = { spd: 5, rsk: 5, ptn: 5, gas: 5 };

  it("overclock divides the poll interval by three", () => {
    const plain = compileConfig(base, 0);
    const boosted = compileConfig(base, 0, ["overclock"]);
    expect(boosted.pollIntervalMs).toBe(Math.max(400, Math.round(plain.pollIntervalMs / 3)));
  });

  it("alphaFeed doubles context and reasoning, and repricing follows", () => {
    const plain = compileConfig(base, 0);
    const boosted = compileConfig(base, 0, ["alphaFeed"]);
    expect(boosted.ctxCandles).toBe(plain.ctxCandles * 2);
    expect(boosted.thinkingBudget).toBe(plain.thinkingBudget * 2);
    expect(boosted.costPerDecision).toBeGreaterThan(plain.costPerDecision);
  });

  it("leverage doubles the position size", () => {
    const plain = compileConfig(base, 0);
    const boosted = compileConfig(base, 0, ["leverage"]);
    expect(boosted.positionSizeEth).toBeCloseTo(plain.positionSizeEth * 2, 12);
  });

  it("zeroGas takes fees to zero and leaves slippage alone", () => {
    const plain = compileConfig(base, 0);
    const boosted = compileConfig(base, 0, ["zeroGas"]);
    expect(boosted.feeBps).toBe(0);
    expect(boosted.slippageBps).toBe(plain.slippageBps);
  });

  it("stacks without interfering", () => {
    const all = compileConfig(base, 0, ["overclock", "alphaFeed", "leverage", "zeroGas"]);
    const plain = compileConfig(base, 0);
    expect(all.pollIntervalMs).toBeLessThan(plain.pollIntervalMs);
    expect(all.ctxCandles).toBe(plain.ctxCandles * 2);
    expect(all.positionSizeEth).toBeCloseTo(plain.positionSizeEth * 2, 12);
    expect(all.feeBps).toBe(0);
  });
});
