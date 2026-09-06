/**
 * DEGEN VILLAGE — node entry point.
 *
 *   MODE=sim  npm run sim    SimMarket  + heuristicBrain, 60fps
 *   MODE=live npm run live   PonsMarket + liveBrain,     pollIntervalMs
 *
 * liveBrain routes each agent to the house it is wired to: Anthropic, OpenAI
 * or xAI. AGENT_PROVIDERS=xai,openai wires the roster in order at boot.
 *
 * Same Village, same agents, same stat compiler. Only the two injected
 * interfaces change, which is the entire point of the core/ boundary.
 */

import { Village, type VillageOptions } from "./core/village.js";
import { compileConfig, isProvider } from "./core/config.js";
import { SimMarket } from "./sim/market.js";
import { heuristicBrain } from "./sim/brain.js";
import { mulberry32 } from "./sim/rng.js";
import { PonsMarket } from "./live/pons.js";
import type { BrainTrace } from "./live/brain.js";
import { liveBrain } from "./live/router.js";

const FRAME_MS = 1000 / 60;

function env(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fmt(n: number, dp = 3): string {
  return n.toFixed(dp).padStart(dp + 4);
}

function report(village: Village, mode: string): void {
  const v = village.view();
  const head =
    `[${mode}] t=${String(v.tick).padStart(6)} ` +
    `treasury=${fmt(v.treasury, 1)} ` +
    `net=${fmt(v.netPnlEth)} ETH ` +
    `spent=$${v.totalSpentUsd.toFixed(4)}`;
  const rows = v.agents
    .map((a) => {
      const cfg = a.config;
      return (
        `  ${a.name.padEnd(12)} ${a.state.padEnd(7)} L${a.level} ` +
        `spd${a.stats.spd} rsk${a.stats.rsk} ptn${a.stats.ptn} gas${a.stats.gas} ` +
        `| ${cfg.provider}:${cfg.model} ctx${cfg.ctxCandles} think${cfg.thinkingBudget} ` +
        `poll${cfg.pollIntervalMs}ms size${cfg.positionSizeEth.toFixed(3)} ` +
        `slip${cfg.slippageBps} $${cfg.costPerDecision.toFixed(5)}/dec ` +
        `| pnl ${a.realizedPnlEth >= 0 ? "+" : ""}${a.realizedPnlEth.toFixed(3)} ` +
        `${a.trades}t ${a.wins}w ${a.skips}s`
      );
    })
    .join("\n");
  console.log(`${head}\n${rows}`);
}

async function runSim(): Promise<void> {
  const seed = Number(env("SEED", "42"));
  const ticks = Number(env("TICKS", "0"));
  const market = new SimMarket({ seed });
  const village = new Village({
    market,
    brain: heuristicBrain(),
    rng: mulberry32(seed ^ 0x9e3779b9),
    blockingDecisions: true,
    onTick: () => market.advance(1),
  });

  console.log(`DEGEN VILLAGE — sim, seed ${seed}, 60fps${ticks ? `, ${ticks} ticks` : ""}`);
  let frame = 0;
  const started = Date.now();
  for (;;) {
    await village.step();
    frame += 1;
    if (frame % 600 === 0) report(village, "sim");
    if (ticks > 0 && frame >= ticks) break;
    const drift = started + frame * FRAME_MS - Date.now();
    if (drift > 1) await sleep(drift);
  }
  report(village, "sim");
}

async function runLive(): Promise<void> {
  const market = new PonsMarket();
  const trace = {
    onTrace: (t: BrainTrace) => {
      const tag = t.ok ? "ok" : `ERR ${t.error ?? t.status}`;
      console.log(
        `  <${t.model}> ${t.pair} effort=${t.effort} ${t.ms}ms ` +
          `in=${t.inputTokens} out=${t.outputTokens} ${tag}`,
      );
    },
  };
  const brain = liveBrain({ shared: trace, anthropic: trace });

  const options: VillageOptions = { market, brain, blockingDecisions: false };
  const village = new Village(options);

  /* AGENT_PROVIDERS wires the roster without touching the code: the nth agent
     takes the nth house, and anything past the end of the list stays default. */
  const wiring = env("AGENT_PROVIDERS", "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);
  wiring.forEach((name, i) => {
    const agent = village.agents[i];
    if (agent && isProvider(name)) agent.provider = name;
  });

  console.log("DEGEN VILLAGE — live: Pons on Robinhood Chain, three houses in the loop.");
  for (const agent of village.agents) {
    const cfg = village.configFor(agent);
    console.log(`  ${agent.name.padEnd(12)} ${cfg.provider.padEnd(10)} ${cfg.model}`);
  }
  console.log("Execution stays in dry run until DRY_RUN=0 is set explicitly.");

  let frame = 0;
  for (;;) {
    await village.step();
    frame += 1;
    if (frame % 30 === 0) report(village, "live");

    /* The fastest agent sets the cadence; SPD is a real clock, not a bar. */
    let poll = Infinity;
    for (const agent of village.agents) {
      const cfg = compileConfig(agent.stats, agent.level, village.activeBoostKinds, {
        provider: agent.provider,
      });
      poll = Math.min(poll, cfg.pollIntervalMs);
    }
    await sleep(Number.isFinite(poll) ? poll : 1000);
  }
}

async function main(): Promise<void> {
  const mode = env("MODE", "sim").toLowerCase();
  if (mode === "live") {
    await runLive();
  } else if (mode === "sim") {
    await runSim();
  } else {
    console.error(`unknown MODE "${mode}" — expected "sim" or "live"`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack ?? err.message : String(err));
  process.exitCode = 1;
});
