/**
 * COST-ADJUSTED P&L — the bill is subtracted, and the same run is priced on
 * every house.
 *
 * Load-bearing assertions here:
 *   · gross is house-independent (the sim brain never reads a model id), so a
 *     difference in gross across houses would mean the sim leaked the model;
 *   · net is exactly gross minus spend at ASSUMED_ETH_USD — no rounding, no
 *     fudge factor;
 *   · `netByHouse` from ONE run matches an actual run on that house, which is
 *     what makes pricing all three houses free;
 *   · the FORGE verdict follows net, so a build that wins gross and loses
 *     after the bill does not read as BETTER.
 */

import { describe, expect, it } from "vitest";
import {
  ASSUMED_ETH_USD,
  compileConfig,
  usdToEth,
} from "../src/core/config.js";
import { DEFAULT_STRATEGY } from "../src/core/brain.js";
import {
  backtest,
  backtestAgainstBaseline,
  netByHouse,
  type BacktestBuild,
} from "../src/sim/backtest.js";

const BUILD: BacktestBuild = {
  name: "NET TEST",
  stats: { spd: 5, rsk: 5, ptn: 12, gas: 3 },
  strategy: { ...DEFAULT_STRATEGY },
};

/* 1200 ticks keeps the suite fast; the assertions are about accounting, and
   determinism at 7000 is covered in determinism.test.ts. */
const OPTS = { ticks: 1200 };

describe("the inference bill is subtracted", () => {
  it("computes net as gross minus spend at the assumed rate, exactly", async () => {
    const r = await backtest({ ...BUILD, provider: "openai" }, OPTS);
    expect(r.spentEth).toBeCloseTo(r.spentUsd / ASSUMED_ETH_USD, 15);
    expect(r.netEth).toBeCloseTo(r.pnlEth - r.spentEth, 15);
    expect(r.netEth).toBeLessThan(r.pnlEth);
  });

  it("bills decisions at the house's own price", async () => {
    const r = await backtest({ ...BUILD, provider: "xai" }, OPTS);
    const cfg = compileConfig(r.finalStats, 0, [], { provider: "xai" });
    expect(r.costPerDecisionUsd).toBeCloseTo(cfg.costPerDecision, 15);
    /* the agent is frozen, so the whole bill is decisions x a constant */
    expect(r.spentUsd).toBeCloseTo(r.decisions * cfg.costPerDecision, 9);
    expect(r.decisions).toBeGreaterThan(0);
  });

  it("keeps GROSS identical across houses and moves only NET", async () => {
    const [x, o] = await Promise.all([
      backtest({ ...BUILD, provider: "xai" }, OPTS),
      backtest({ ...BUILD, provider: "openai" }, OPTS),
    ]);

    /* same trades, tick for tick — the sim brain cannot see the model */
    expect(x.pnlEth).toBe(o.pnlEth);
    expect(x.trades).toBe(o.trades);
    expect(x.decisions).toBe(o.decisions);
    expect(x.equity).toEqual(o.equity);

    /* only the bill differs, and it differs a lot */
    expect(o.spentUsd).toBeGreaterThan(x.spentUsd * 5);
    expect(x.netEth).toBeGreaterThan(o.netEth);
  });
});

describe("pricing one run on all three houses", () => {
  it("matches a real run on each house", async () => {
    const base = await backtest({ ...BUILD, provider: "anthropic" }, OPTS);
    const priced = netByHouse(base);
    expect(priced.map((h) => h.provider)).toEqual(["anthropic", "openai", "xai"]);

    for (const house of priced) {
      const real = await backtest({ ...BUILD, provider: house.provider }, OPTS);
      expect(house.spentUsd).toBeCloseTo(real.spentUsd, 9);
      expect(house.netEth).toBeCloseTo(real.netEth, 12);
      expect(house.model).toBe(
        compileConfig(base.finalStats, 0, [], { provider: house.provider }).model,
      );
    }
  });

  it("ranks xAI cheapest and the two frontier houses level on spend", async () => {
    const r = await backtest({ ...BUILD, provider: "anthropic" }, OPTS);
    const by = Object.fromEntries(netByHouse(r).map((h) => [h.provider, h]));
    /* PTN 12: grok-4.6 $2/$6 vs fable-5.1 and gpt-6-astra both $10/$50 */
    expect(by.xai.spentUsd).toBeLessThan(by.anthropic.spentUsd);
    expect(by.openai.spentUsd).toBeCloseTo(by.anthropic.spentUsd, 9);
    expect(by.xai.netEth).toBeGreaterThan(by.anthropic.netEth);
  });
});

describe("the FORGE verdict follows net", () => {
  it("compares against the baseline on the same house", async () => {
    const cmp = await backtestAgainstBaseline({ ...BUILD, provider: "xai" }, OPTS);
    expect(cmp.build.provider).toBe("xai");
    expect(cmp.baseline.provider).toBe("xai");
    expect(cmp.netDelta).toBeCloseTo(cmp.build.netEth - cmp.baseline.netEth, 15);
    expect(cmp.houses).toHaveLength(3);
  });

  it("reads the verdict off the net delta, not the gross delta", async () => {
    const cmp = await backtestAgainstBaseline({ ...BUILD, provider: "openai" }, OPTS);
    const expected =
      cmp.netDelta > 1e-9 ? "BETTER" : cmp.netDelta < -1e-9 ? "WORSE" : "EVEN";
    expect(cmp.verdict).toBe(expected);
  });

  it("charges a deeper build more than the baseline it is measured against", async () => {
    /* PTN 12 reads 96 candles and thinks 3000 tokens; the SNIPER preset at
       PTN 7 reads 66 and thinks 512. Depth is not free, and the comparison is
       where that shows up. */
    const cmp = await backtestAgainstBaseline({ ...BUILD, provider: "anthropic" }, OPTS);
    expect(cmp.build.spentUsd).toBeGreaterThan(cmp.baseline.spentUsd);
    expect(cmp.build.netEth - cmp.build.pnlEth).toBeLessThan(
      cmp.baseline.netEth - cmp.baseline.pnlEth,
    );
  });
});

describe("the assumed rate", () => {
  it("is the only dollar price in the engine and converts linearly", () => {
    expect(ASSUMED_ETH_USD).toBeGreaterThan(0);
    expect(usdToEth(ASSUMED_ETH_USD)).toBe(1);
    expect(usdToEth(0)).toBe(0);
    expect(usdToEth(250)).toBeCloseTo(250 / ASSUMED_ETH_USD, 15);
  });
});
