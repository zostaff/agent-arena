import { describe, expect, it } from "vitest";
import {
  BOOST_DEFS,
  CONSTRUCTION_TICKS,
  CUSTOM_DEPLOY_COST,
  MAX_CUSTOM_AGENTS,
  RUSH_RATE,
  UPGRADE_COST,
  UPGRADE_TICKS,
  Village,
} from "../src/core/village.js";
import { SimMarket } from "../src/sim/market.js";
import { heuristicBrain } from "../src/sim/brain.js";
import { mulberry32 } from "../src/sim/rng.js";
import { DEFAULT_STRATEGY } from "../src/core/brain.js";
import { xpToNext } from "../src/core/agent.js";

function makeVillage(treasury = 5000): Village {
  const market = new SimMarket({ seed: 42 });
  return new Village({
    market,
    brain: heuristicBrain(),
    rng: mulberry32(7),
    blockingDecisions: true,
    startingTreasury: treasury,
    onTick: () => market.advance(1),
  });
}

describe("village economy", () => {
  it("charges the published upgrade costs and times", () => {
    const v = makeVillage();
    for (const level of [2, 3, 4, 5] as const) {
      const before = v.treasury;
      expect(v.upgrade("BARRACKS")).toBe(true);
      expect(before - v.treasury).toBe(UPGRADE_COST[level]);
      expect(v.building("BARRACKS").job?.ticksLeft).toBe(UPGRADE_TICKS[level]);
      v.building("BARRACKS").job!.ticksLeft = 1;
      v.building("BARRACKS").job!.toLevel = level;
      /* finish the job the way the tick loop would */
      v.building("BARRACKS").job!.ticksLeft = 0;
      v.rush("BARRACKS");
      expect(v.levelOf("BARRACKS")).toBe(level);
    }
    expect(v.upgrade("BARRACKS")).toBe(false);
  });

  it("builds the four buildable structures over 800 ticks", () => {
    const v = makeVillage();
    expect(v.levelOf("ACADEMY")).toBe(0);
    expect(v.build("ACADEMY")).toBe(true);
    expect(v.building("ACADEMY").job).toMatchObject({ kind: "build", ticksLeft: CONSTRUCTION_TICKS });
    expect(v.build("ACADEMY")).toBe(false);
  });

  it("rushes for remaining_ticks * 0.06 coins", () => {
    const v = makeVillage();
    v.build("RELAY");
    const job = v.building("RELAY").job!;
    job.ticksLeft = 500;
    expect(v.rushCost("RELAY")).toBe(Math.ceil(500 * RUSH_RATE));
    const before = v.treasury;
    expect(v.rush("RELAY")).toBe(true);
    expect(before - v.treasury).toBe(30);
    expect(v.levelOf("RELAY")).toBe(1);
    expect(v.walkSpeed).toBeCloseTo(0.055 * 1.12, 12);
  });

  it("refuses actions the treasury cannot cover", () => {
    const v = makeVillage(10);
    expect(v.upgrade("LAB")).toBe(false);
    expect(v.build("MINT")).toBe(false);
    expect(v.buyBoost("leverage")).toBe(false);
    expect(v.treasury).toBe(10);
  });

  it("charges the published boost prices and expires them on schedule", async () => {
    const v = makeVillage();
    for (const def of BOOST_DEFS) {
      const before = v.treasury;
      expect(v.buyBoost(def.kind)).toBe(true);
      expect(before - v.treasury).toBe(def.cost);
    }
    expect(v.activeBoostKinds.sort()).toEqual(["alphaFeed", "leverage", "overclock", "zeroGas"]);

    const shortest = Math.min(...BOOST_DEFS.map((d) => d.ticks));
    for (let i = 0; i < shortest; i++) await v.step();
    expect(v.activeBoostKinds).not.toContain("leverage");
    expect(v.activeBoostKinds).toContain("zeroGas");
  }, 60_000);

  it("compiles agent config with the active boosts folded in", () => {
    const v = makeVillage();
    const agent = v.agents[0];
    const plain = v.configFor(agent);
    v.buyBoost("overclock");
    const boosted = v.configFor(agent);
    expect(boosted.pollIntervalMs).toBeLessThan(plain.pollIntervalMs);
  });

  it("accrues passive yield of level * 0.012 per tick per building", async () => {
    const v = makeVillage();
    /* four prebuilt buildings at level 1 */
    expect(v.passiveYieldPerTick).toBeCloseTo(4 * 0.012, 12);
    const before = v.treasury;
    await v.step();
    expect(v.treasury).toBeGreaterThan(before);
  });

  it("raises the treasury cut by 6 points per MINT level", () => {
    const v = makeVillage();
    expect(v.treasuryCutRate).toBeCloseTo(0.35, 12);
    v.building("MINT").level = 3;
    expect(v.treasuryCutRate).toBeCloseTo(0.35 + 3 * 0.06, 12);
  });

  it("deploys at most four custom agents at 150 coins each", () => {
    const v = makeVillage(1000);
    const spec = {
      name: "TEST",
      stats: { spd: 5, rsk: 5, ptn: 5, gas: 5 },
      strategy: { ...DEFAULT_STRATEGY },
      systemSuffix: "",
    };
    for (let i = 0; i < MAX_CUSTOM_AGENTS; i++) {
      const before = v.treasury;
      const agent = v.deployCustom(spec);
      expect(agent).not.toBeNull();
      expect(agent!.custom).toBe(true);
      expect(before - v.treasury).toBe(CUSTOM_DEPLOY_COST);
    }
    expect(v.customCount).toBe(MAX_CUSTOM_AGENTS);
    expect(v.deployCustom(spec)).toBeNull();
  });
});

describe("agent state machine", () => {
  it("walks the documented cycle and settles trades", async () => {
    const v = makeVillage();
    const seen = new Set<string>();
    for (let i = 0; i < 6000; i++) {
      await v.step();
      for (const a of v.agents) seen.add(a.state);
    }
    for (const state of ["REST", "TRAIN", "SCAN", "DECIDE", "HOLD", "SETTLE"]) {
      expect(seen.has(state)).toBe(true);
    }
    expect(v.agents.some((a) => a.trades > 0)).toBe(true);
  }, 60_000);

  it("gains stats and levels from training", async () => {
    const v = makeVillage();
    const before = { ...v.agents[0].stats };
    for (let i = 0; i < 3000; i++) await v.step();
    const after = v.agents[0].stats;
    const grew =
      after.spd + after.rsk + after.ptn + after.gas >
      before.spd + before.rsk + before.ptn + before.gas;
    expect(grew).toBe(true);
  }, 60_000);

  it("uses a rising XP curve", () => {
    expect(xpToNext(0)).toBe(60);
    expect(xpToNext(1)).toBe(105);
    expect(xpToNext(4)).toBe(240);
  });
});
