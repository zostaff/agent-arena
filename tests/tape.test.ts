import { describe, expect, it } from "vitest";
import { Village, defaultRoster } from "../src/core/village.js";
import type { Brain, Snapshot } from "../src/core/types.js";

const snapshot: Snapshot = {
  pair: "$TEST", last: 1, candles: [],
  bids: [{ price: 1, size: 10 }], asks: [{ price: 1, size: 10 }],
  ageMinutes: 1, uniqueBuyers: 10, curveProgressPct: 10, reserveEth: 10,
};

function makeVillage(brain?: Brain): Village {
  return new Village({
    market: { listPairs: async () => [snapshot.pair], snapshot: async () => snapshot },
    brain: brain ?? { decide: async () => ({ action: "BUY", sizeEth: 0.01, confidence: 1, holdTicks: 3, reason: "fixture" }) },
    roster: [{ ...defaultRoster()[0], provider: "xai" }],
    rng: () => 0.5,
    blockingDecisions: true,
  });
}

describe("trade house attribution", () => {
  it("keeps the original house on both fills after the agent is rewired", async () => {
    const village = makeVillage();
    for (let tick = 0; tick < 1000 && village.tape.length < 2; tick++) await village.step();
    expect(village.tape.map((event) => [event.action, event.provider])).toEqual([["BUY", "xai"], ["SELL", "xai"]]);
    expect(village.rewire(village.agents[0].id, "openai")).toBe(true);
    for (let tick = 0; tick < 1000 && village.tape.length < 3; tick++) await village.step();
    expect(village.tape.map((event) => event.provider)).toEqual(["xai", "xai", "openai"]);
  });

  it("refuses rewiring between a decision request and consuming its verdict", async () => {
    const village = makeVillage();
    for (let tick = 0; tick < 1000 && !village.agents[0].pendingVerdict; tick++) await village.step();
    expect(village.agents[0].pendingVerdict?.action).toBe("BUY");
    const treasury = village.treasury;
    expect(village.rewire(village.agents[0].id, "openai")).toBe(false);
    expect(village.treasury).toBe(treasury);
    expect(village.agents[0].provider).toBe("xai");
  });
});
