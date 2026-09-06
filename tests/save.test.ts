/**
 * PERSISTENCE — the village survives a reload, and a corrupt save never takes
 * the game down with it.
 *
 * Load-bearing assertions here:
 *   · everything the player paid for survives: treasury, building levels,
 *     running jobs, boosts, stats, level, XP, house, record;
 *   · open positions do NOT survive, and unrealised P&L is discarded rather
 *     than banked — the trade never closed, so it never counted;
 *   · a save from another version, or shaped wrong, is refused whole and the
 *     village it was handed to is left exactly as it was;
 *   · a hostile save cannot smuggle in values the engine would never produce
 *     (stats past the ceiling, unknown buildings, negative treasury).
 */

import { describe, expect, it } from "vitest";
import {
  MAX_BUILDING_LEVEL,
  SAVE_VERSION,
  Village,
  parseSave,
  type VillageSave,
} from "../src/core/village.js";
import { MAX_STAT } from "../src/core/config.js";
import { SimMarket } from "../src/sim/market.js";
import { heuristicBrain } from "../src/sim/brain.js";
import { mulberry32 } from "../src/sim/rng.js";

function village(seed = 42): Village {
  const market = new SimMarket({ seed });
  return new Village({
    market,
    brain: heuristicBrain(),
    rng: mulberry32(seed),
    blockingDecisions: true,
    startingTreasury: 500,
    onTick: () => market.advance(1),
  });
}

async function run(v: Village, ticks: number): Promise<void> {
  for (let i = 0; i < ticks; i++) await v.step();
}

describe("round trip", () => {
  it("carries progress across a reload", async () => {
    const a = village();
    a.build("ACADEMY");
    a.buyBoost("overclock");
    await run(a, 400);
    a.agents[0].stats = { ...a.agents[0].stats, ptn: 9 };
    a.rewire(a.agents[0].id, "xai");
    a.agents[1].realizedPnlEth = 0.037;
    a.agents[1].trades = 4;
    a.agents[1].wins = 3;
    a.agents[1].spentUsd = 1.25;

    const save = a.save();
    const b = village();
    expect(b.restore(save)).toBe(true);

    expect(b.tick).toBe(a.tick);
    expect(b.treasury).toBe(a.treasury);
    expect(b.totalSpentUsd).toBe(a.totalSpentUsd);
    expect(b.levelOf("ACADEMY")).toBe(a.levelOf("ACADEMY"));
    expect(b.building("ACADEMY").job?.ticksLeft).toBe(a.building("ACADEMY").job?.ticksLeft);
    expect(b.boosts.map((x) => x.kind)).toEqual(a.boosts.map((x) => x.kind));

    expect(b.agents).toHaveLength(a.agents.length);
    expect(b.agents[0].provider).toBe("xai");
    expect(b.agents[0].stats.ptn).toBe(9);
    expect(b.configFor(b.agents[0]).model).toBe("grok-4.3");
    expect(b.agents[1].realizedPnlEth).toBeCloseTo(0.037, 12);
    expect(b.agents[1].trades).toBe(4);
    expect(b.agents[1].wins).toBe(3);
    expect(b.agents[1].spentUsd).toBeCloseTo(1.25, 12);
    for (const [i, agent] of b.agents.entries()) {
      expect(agent.level).toBe(a.agents[i].level);
      expect(agent.xp).toBe(a.agents[i].xp);
      expect(agent.cls).toBe(a.agents[i].cls);
    }
  });

  it("is stable: save → restore → save is identical", async () => {
    const a = village();
    await run(a, 300);
    const first = a.save();
    const b = village();
    b.restore(first);
    expect(b.save()).toEqual(first);
  });

  it("keeps a deployed custom build, its target stats and its house", () => {
    const a = village();
    a.deployCustom({
      name: "GROKKED",
      stats: { spd: 6, rsk: 4, ptn: 7, gas: 3 },
      strategy: { entryThreshold: 0.02, maxCurve: 60, holdMin: 30, holdMax: 300, sizeMult: 1.4, requireBookAlign: true },
      systemSuffix: "operator brief",
      provider: "xai",
    });

    const b = village();
    expect(b.restore(a.save())).toBe(true);
    const custom = b.agents.find((x) => x.custom);
    expect(custom).toBeDefined();
    expect(custom?.name).toBe("GROKKED");
    expect(custom?.provider).toBe("xai");
    expect(custom?.targetStats?.ptn).toBe(7);
    expect(custom?.strategy.requireBookAlign).toBe(true);
    expect(custom?.systemSuffix).toBe("operator brief");
  });
});

describe("what deliberately does not survive", () => {
  it("drops the open position and does not bank its unrealised P&L", () => {
    const a = village();
    const agent = a.agents[0];
    agent.realizedPnlEth = 0.01;
    agent.position = {
      pair: "$X",
      entryPrice: 1,
      sizeEth: 0.1,
      tokens: 1,
      openedTick: 5,
      holdTicks: 50,
      feePaidEth: 0.001,
      unrealizedEth: 0.4,
    };
    expect(a.agents[0].netPnlEth).toBeCloseTo(0.41, 12);

    const b = village();
    b.restore(a.save());
    expect(b.agents[0].position).toBeNull();
    expect(b.agents[0].realizedPnlEth).toBeCloseTo(0.01, 12);
    expect(b.agents[0].netPnlEth).toBeCloseTo(0.01, 12);
  });

  it("starts agents at REST rather than mid-walk", async () => {
    const a = village();
    await run(a, 200);
    const b = village();
    b.restore(a.save());
    for (const agent of b.agents) {
      expect(agent.state).toBe("REST");
      expect(agent.gx).toBe(agent.home.gx);
    }
  });
});

describe("a save is data from anywhere", () => {
  it("refuses another version and leaves the village untouched", async () => {
    const a = village();
    await run(a, 100);
    const before = a.save();
    expect(a.restore({ ...before, version: SAVE_VERSION + 1 })).toBe(false);
    expect(a.save()).toEqual(before);
  });

  it("refuses junk of every shape", () => {
    const v = village();
    for (const junk of [null, undefined, 42, "save", [], {}, { version: SAVE_VERSION }]) {
      expect(v.restore(junk)).toBe(false);
    }
    /* right version, no usable agents → still refused */
    expect(v.restore({ version: SAVE_VERSION, agents: [], buildings: [] })).toBe(false);
    expect(v.restore({ version: SAVE_VERSION, agents: [{}], buildings: [] })).toBe(false);
  });

  it("clamps values the engine would never have produced", () => {
    const hostile = {
      version: SAVE_VERSION,
      tick: -50,
      treasury: -9999,
      totalSpentUsd: Number.NaN,
      buildings: [
        { id: "BARRACKS", level: 99, job: null },
        { id: "NOT_A_BUILDING", level: 5, job: null },
      ],
      boosts: [
        { kind: "overclock", ticksLeft: 10, totalTicks: 1 },
        { kind: "wallhack", ticksLeft: 999, totalTicks: 999 },
        { kind: "leverage", ticksLeft: 0, totalTicks: 10 },
      ],
      agents: [
        {
          id: "cheat",
          name: "X".repeat(200),
          cls: "GODMODE",
          stats: { spd: 999, rsk: -4, ptn: 12.9, gas: 3 },
          level: -3,
          trades: 2.7,
          spentUsd: -100,
        },
      ],
    };

    const parsed = parseSave(hostile);
    expect(parsed).not.toBeNull();
    expect(parsed!.tick).toBe(0);
    expect(parsed!.treasury).toBe(0);
    expect(parsed!.totalSpentUsd).toBe(0);

    expect(parsed!.buildings.map((b) => b.id)).toEqual(["BARRACKS"]);
    expect(parsed!.buildings[0].level).toBe(MAX_BUILDING_LEVEL);

    /* unknown boost dropped, expired boost dropped, totalTicks repaired */
    expect(parsed!.boosts).toHaveLength(1);
    expect(parsed!.boosts[0].kind).toBe("overclock");
    expect(parsed!.boosts[0].totalTicks).toBeGreaterThanOrEqual(parsed!.boosts[0].ticksLeft);

    const agent = parsed!.agents[0];
    expect(agent.cls).toBe("CUSTOM");
    expect(agent.name.length).toBeLessThanOrEqual(24);
    expect(agent.stats.spd).toBe(MAX_STAT);
    expect(agent.stats.rsk).toBe(0);
    expect(agent.stats.ptn).toBe(12);
    expect(agent.level).toBe(0);
    expect(agent.trades).toBe(2);
    expect(agent.spentUsd).toBe(0);
    expect(agent.provider).toBe("anthropic");

    /* and it actually loads */
    const v = village();
    expect(v.restore(hostile)).toBe(true);
    expect(v.agents[0].stats.spd).toBe(MAX_STAT);
  });

  it("fills a missing building back to its default rather than losing it", () => {
    const save: VillageSave = { ...village().save(), buildings: [] };
    const v = village();
    expect(v.restore(save)).toBe(true);
    expect(v.levelOf("BARRACKS")).toBe(1);
    expect(v.levelOf("ACADEMY")).toBe(0);
  });
});
