/**
 * DEGEN VILLAGE — deterministic backtest behind the FORGE bar.
 *
 * Seed 42, 7000 ticks, one agent, blocking decisions. Two runs of the same
 * build return byte-identical numbers; that is what makes the BUILDS
 * leaderboard a leaderboard and not a lottery.
 *
 * GROSS IS HOUSE-INDEPENDENT. The sim brain is a heuristic that never reads a
 * model id, so the same build produces the same trades on Anthropic, OpenAI
 * and xAI, to the tick. The house shows up on the COST side only — which is
 * why `netByHouse` can price all three from a single run instead of three.
 *
 * NET IS THE HONEST NUMBER. A build that clears +0.02 ETH gross while burning
 * $9 of GPT-6 Astra lost money. Gross alone was defensible when every agent
 * billed $0.01186 a decision; with houses 100x apart on price it is a lie by
 * omission, so every result carries both.
 */

import type { Provider, StrategyParams } from "../core/types.js";
import type { Stats } from "../core/config.js";
import {
  PROVIDERS,
  compileConfig,
  normalizeProvider,
  usdToEth,
} from "../core/config.js";
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
  /** House the build is wired to. Changes the bill, never the trades. */
  provider?: Provider;
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
  /** Inference spend on the build's own house, in USD. */
  spentUsd: number;
  /** `spentUsd` at ASSUMED_ETH_USD. */
  spentEth: number;
  /** pnlEth - spentEth. The number that decides whether the build made money. */
  netEth: number;
  provider: Provider;
  /** Constant across the run: the agent is frozen, so its config never moves. */
  costPerDecisionUsd: number;
  finalLevel: number;
  finalStats: Stats;
}

export interface HouseNet {
  provider: Provider;
  model: string;
  spentUsd: number;
  netEth: number;
}

/** The build every FORGE result is measured against. */
export const BASELINE_BUILD: BacktestBuild = {
  name: "SNIPER PRESET",
  stats: { spd: 4, rsk: 5, ptn: 7, gas: 4 },
  strategy: { ...CLASS_STRATEGY.SNIPER },
};

/**
 * What this run would have netted on each of the three houses.
 *
 * Derivable from one run because the agent is frozen — its stats never move,
 * so `costPerDecision` is a constant and the whole bill is
 * `decisions * costPerDecision`. No second simulation required.
 */
export function netByHouse(result: BacktestResult): HouseNet[] {
  return PROVIDERS.map((provider) => {
    const cfg = compileConfig(result.finalStats, 0, [], { provider });
    const spentUsd = result.decisions * cfg.costPerDecision;
    return {
      provider,
      model: cfg.model,
      spentUsd,
      netEth: result.pnlEth - usdToEth(spentUsd),
    };
  });
}

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
        provider: build.provider,
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

  const spentEth = usdToEth(agent.spentUsd);
  const config = village.configFor(agent);

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
    spentEth,
    netEth: agent.netPnlEth - spentEth,
    provider: normalizeProvider(build.provider),
    costPerDecisionUsd: config.costPerDecision,
    finalLevel: agent.level,
    finalStats: { ...agent.stats },
  };
}

export interface BacktestComparison {
  build: BacktestResult;
  baseline: BacktestResult;
  pnlDelta: number;
  /** Delta AFTER inference, on the same house for both. This drives verdict. */
  netDelta: number;
  winRateDelta: number;
  drawdownDelta: number;
  verdict: "BETTER" | "WORSE" | "EVEN";
  /** The same build's net on each of the three houses. */
  houses: HouseNet[];
}

export async function backtestAgainstBaseline(
  build: BacktestBuild,
  options: BacktestOptions = {},
): Promise<BacktestComparison> {
  /* The baseline runs on the SAME house, so the comparison stays a comparison
     of builds. Gross is house-independent anyway; this keeps net honest too. */
  const provider = normalizeProvider(build.provider);
  const [a, b] = await Promise.all([
    backtest(build, options),
    backtest({ ...BASELINE_BUILD, provider }, options),
  ]);
  const pnlDelta = a.pnlEth - b.pnlEth;
  const netDelta = a.netEth - b.netEth;
  return {
    build: a,
    baseline: b,
    pnlDelta,
    netDelta,
    winRateDelta: a.winRate - b.winRate,
    drawdownDelta: a.maxDrawdownEth - b.maxDrawdownEth,
    /* Verdict follows the net: a build that wins gross and loses after the
       bill did not win. */
    verdict: netDelta > 1e-9 ? "BETTER" : netDelta < -1e-9 ? "WORSE" : "EVEN",
    houses: netByHouse(a),
  };
}
