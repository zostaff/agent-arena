import { describe, expect, it } from "vitest";
import { Village } from "../src/core/village.js";
import { SimMarket } from "../src/sim/market.js";
import { heuristicBrain } from "../src/sim/brain.js";
import { mulberry32 } from "../src/sim/rng.js";
import { backtest, BACKTEST_SEED, BACKTEST_TICKS } from "../src/sim/backtest.js";

const TICKS = 10_000;

interface RunDigest {
  tick: number;
  treasury: number;
  netPnlEth: number;
  totalSpentUsd: number;
  agents: unknown[];
  tape: unknown[];
  prices: Array<[string, number]>;
}

async function run(seed: number, ticks: number): Promise<RunDigest> {
  const market = new SimMarket({ seed });
  const village = new Village({
    market,
    brain: heuristicBrain(),
    rng: mulberry32(seed ^ 0x9e3779b9),
    blockingDecisions: true,
    onTick: () => market.advance(1),
  });
  for (let i = 0; i < ticks; i++) await village.step();

  const prices: Array<[string, number]> = [];
  for (const pair of await market.listPairs()) {
    prices.push([pair, (await market.snapshot(pair, 1)).last]);
  }

  return {
    tick: village.tick,
    treasury: village.treasury,
    netPnlEth: village.netPnlEth,
    totalSpentUsd: village.totalSpentUsd,
    agents: village.agents.map((a) => ({
      ...a.toJSON(),
      gx: a.gx,
      gy: a.gy,
      cyclesSinceTrain: a.cyclesSinceTrain,
    })),
    tape: village.tape,
    prices,
  };
}

describe("deterministic replay", () => {
  it(`replays ${TICKS} ticks on seed 42 identically across two runs`, async () => {
    const a = await run(42, TICKS);
    const b = await run(42, TICKS);
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  }, 120_000);

  it("actually did something worth replaying", async () => {
    const a = await run(42, TICKS);
    expect(a.tick).toBe(TICKS);
    expect(a.tape.length).toBeGreaterThan(0);
    expect(a.agents.length).toBe(4);
  }, 120_000);

  it("diverges on a different seed, so the seed is doing real work", async () => {
    const a = await run(42, 4000);
    const b = await run(1337, 4000);
    expect(JSON.stringify(b)).not.toBe(JSON.stringify(a));
  }, 120_000);

  it("produces identical candles for the same seed", async () => {
    const m1 = new SimMarket({ seed: 42 });
    const m2 = new SimMarket({ seed: 42 });
    m1.advance(3000);
    m2.advance(3000);
    const s1 = await m1.snapshot("$DGEN", 80);
    const s2 = await m2.snapshot("$DGEN", 80);
    expect(s2).toEqual(s1);
  });

  it("runs the FORGE backtest to identical numbers twice", async () => {
    const build = {
      name: "REPLAY",
      stats: { spd: 8, rsk: 5, ptn: 4, gas: 3 },
      strategy: {
        entryThreshold: 0.01,
        maxCurve: 80,
        holdMin: 60,
        holdMax: 300,
        sizeMult: 1,
        requireBookAlign: false,
      },
    };
    const a = await backtest(build);
    const b = await backtest(build);
    expect(a.seed).toBe(BACKTEST_SEED);
    expect(a.ticks).toBe(BACKTEST_TICKS);
    expect(b).toEqual(a);
    expect(a.equity.length).toBeGreaterThan(50);
  }, 120_000);
});
