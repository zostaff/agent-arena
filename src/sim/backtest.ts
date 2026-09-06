/**
 * DEGEN VILLAGE — deterministic backtest behind the FORGE bar.
 *
 * Seed 42, 7000 ticks, one agent, blocking decisions. Two runs of the same
 * build return byte-identical numbers; that is what makes the BUILDS
 * leaderboard a leaderboard and not a lottery.
 */

import type { StrategyParams } from "../core/types.js";
import type { Stats } from "../core/config.js";
import { CLASS_STRATEGY } from "../core/brain.js";
import { Village } from "../core/village.js";
import { mulberry32 } from "./rng.js";
import { SimMarket } from "./market.js";
import { heuristicBrain } from "./brain.js";

export const BACKTEST_SEED = 42;
export const BACKTEST_TICKS = 7000;
export const EQUITY_SAMPLES = 120;

export interface BacktestBuild {
  name: string;
  stats: Stats;
  strategy: StrategyParams;
  systemSuffix?: string;
}

export interface BacktestResult {
  name: string;
  seed: number;
  ticks: number;
  pnlEth: number;
  trades: number;
  wins: number;
  winRate: number;
  maxDrawdownEth: number;
  /** EQUITY_SAMPLES evenly spaced points, in ETH, starting at 0. */
  equity: number[];
  skips: number;
  decisions: number;
  spentUsd: number;
  finalLevel: number;
  finalStats: Stats;
}

/** The build every FORGE result is measured against. */
export const BASELINE_BUILD: BacktestBuild = {
  name: "SNIPER PRESET",
  stats: { spd: 4, rsk: 5, ptn: 7, gas: 4 },
  strategy: { ...CLASS_STRATEGY.SNIPER },
};

export interface BacktestOptions {
  seed?: number;
  ticks?: number;
  samples?: number;
}

export async function backtest(
  build: BacktestBuild,
  options: BacktestOptions = {},
): Promise<BacktestResult> {
  const seed = options.seed ?? BACKTEST_SEED;
  const ticks = options.ticks ?? BACKTEST_TICKS;
  const samples = options.samples ?? EQUITY_SAMPLES;

  const market = new SimMarket({ seed });
  const village = new Village({
    market,
    brain: heuristicBrain(),
    rng: mulberry32(seed ^ 0x5f3759df),
    blockingDecisions: true,
    startingTreasury: 0,
    onTick: () => market.advance(1),
    roster: [
      {
        id: "backtest",
        name: build.name,
        cls: "CUSTOM",
        stats: build.stats,
        targetStats: build.stats,
        home: { gx: 6, gy: 5 },
        strategy: build.strategy,
        systemSuffix: build.systemSuffix ?? "",
        custom: true,
        frozen: true,
      },
    ],
  });

  const agent = village.agents[0];
  const equity: number[] = [];
  const every = Math.max(1, Math.floor(ticks / samples));
  let peak = 0;
  let maxDrawdown = 0;

  for (let t = 0; t < ticks; t++) {
    await village.step();
    const eq = agent.netPnlEth;
    if (eq > peak) peak = eq;
    const dd = peak - eq;
    if (dd > maxDrawdown) maxDrawdown = dd;
    if (t % every === 0) equity.push(eq);
  }
  equity.push(agent.netPnlEth);

  return {
    name: build.name,
    seed,
    ticks,
    pnlEth: agent.netPnlEth,
    trades: agent.trades,
    wins: agent.wins,
    winRate: agent.winRate,
    maxDrawdownEth: maxDrawdown,
    equity,
    skips: agent.skips,
    decisions: agent.decisions,
    spentUsd: agent.spentUsd,
    finalLevel: agent.level,
    finalStats: { ...agent.stats },
  };
}

export interface BacktestComparison {
  build: BacktestResult;
  baseline: BacktestResult;
  pnlDelta: number;
  winRateDelta: number;
  drawdownDelta: number;
  verdict: "BETTER" | "WORSE" | "EVEN";
}

export async function backtestAgainstBaseline(
  build: BacktestBuild,
  options: BacktestOptions = {},
): Promise<BacktestComparison> {
  const [a, b] = await Promise.all([
    backtest(build, options),
    backtest(BASELINE_BUILD, options),
  ]);
  const pnlDelta = a.pnlEth - b.pnlEth;
  return {
    build: a,
    baseline: b,
    pnlDelta,
    winRateDelta: a.winRate - b.winRate,
    drawdownDelta: a.maxDrawdownEth - b.maxDrawdownEth,
    verdict: pnlDelta > 1e-9 ? "BETTER" : pnlDelta < -1e-9 ? "WORSE" : "EVEN",
  };
}
