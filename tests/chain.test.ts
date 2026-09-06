/**
 * THE CHAIN FEED AND PAPER MODE — offline, on fixtures taken from the real
 * chain on 2026-09-07.
 *
 * These tests never touch the network: `npm test` must pass on a plane. The
 * live check is `npm run chain`, which is the only thing that notices when the
 * chain stops matching these fixtures.
 *
 * Load-bearing assertions:
 *   · a token whose symbol cannot be read keeps its address — nothing is
 *     invented to fill a column;
 *   · paper snapshots label every field's provenance, and price is never
 *     claimed to be `chain` while the swap decoding is unwritten;
 *   · the price path is seeded from the token address, so a paper session is
 *     reproducible on any machine;
 *   · two live tokens sharing a symbol both survive — $CCAT launched three
 *     times in one minute on the day this was written.
 */

import { describe, expect, it } from "vitest";
import {
  PONS_LAUNCH_FACTORY,
  RH_CHAIN_ID,
  TOKEN_LAUNCHED_TOPIC,
  decodeStringResult,
  hexToNumber,
  numberToHex,
  shortAddress,
  topicToAddress,
} from "../src/live/rpc.js";
import { PaperMarket, pairConfigFor, seedFromAddress } from "../src/paper/market.js";
import type { LaunchedToken } from "../src/live/rpc.js";

/* A real TokenLaunched log, copied from the live chain. */
const REAL_TOPIC1 = "0x00000000000000000000000007344064419a08d40e33a14bdf4fea73838185de";

describe("raw log decoding", () => {
  it("pulls the token address out of an indexed topic", () => {
    expect(topicToAddress(REAL_TOPIC1)).toBe("0x07344064419a08d40e33a14bdf4fea73838185de");
  });

  it("pins the addresses and topic it queries", () => {
    expect(PONS_LAUNCH_FACTORY).toMatch(/^0x[0-9a-f]{40}$/);
    expect(TOKEN_LAUNCHED_TOPIC).toMatch(/^0x[0-9a-f]{64}$/);
    expect(RH_CHAIN_ID).toBe(4663);
  });

  it("round-trips block numbers through hex", () => {
    expect(hexToNumber("0x35bdfe4")).toBe(56352740);
    expect(numberToHex(56352740)).toBe("0x35bdfe4");
    expect(numberToHex(-5)).toBe("0x0");
  });

  it("decodes an ABI string, a bytes32 symbol, and refuses junk", () => {
    /* offset, length 4, "PONS" */
    const abi =
      "0x" +
      "0000000000000000000000000000000000000000000000000000000000000020" +
      "0000000000000000000000000000000000000000000000000000000000000004" +
      "504f4e5300000000000000000000000000000000000000000000000000000000";
    expect(decodeStringResult(abi)).toBe("PONS");

    const bytes32 =
      "0x434154000000000000000000000000000000000000000000000000000000000000".slice(0, 66);
    expect(decodeStringResult(bytes32)).toBe("CAT");

    expect(decodeStringResult("0x")).toBeNull();
    expect(decodeStringResult("0xdeadbeef")).toBeNull();
  });

  it("shortens an address the same way everywhere", () => {
    expect(shortAddress("0x07344064419a08d40e33a14bdf4fea73838185de")).toBe("0x0734…85de");
  });
});

/* ------------------------------------------------------------------ paper */

function token(address: string, symbol: string, ageSeconds = 30): LaunchedToken {
  return { address, symbol, decimals: 18, blockNumber: 56354000, ageSeconds, txHash: "0xabc" };
}

const FIXTURE: LaunchedToken[] = [
  token("0x275b59f8471cd8a7a01f3d1ccaef9a79c7c93c60", "$CHIPS", 1),
  token("0xc0992ccbdd48b4eeba8575942e4ddb0359c7f4b7", "$BAGIT", 3),
  /* the same symbol twice, as the chain really served it */
  token("0x5ab88bec846f34839984724470de70a836f86cc9", "$CCAT", 5),
  token("0x1a8e9c7c066886e64fa9cc8002c8a19d33915806", "$CCAT", 27),
  /* a token whose symbol() could not be read keeps its address */
  token("0x9760c10ba399242872ab4d0059d062bceb1efa01", "0x9760…fa01", 44),
];

function fakeFeed(tokens = FIXTURE) {
  return {
    endpoint: "https://rpc.example/test",
    recent: async (limit: number) => tokens.slice(0, limit),
    verify: async () => ({ chainId: RH_CHAIN_ID, head: 56354436, ok: true }),
  };
}

describe("the paper universe", () => {
  it("trades the real tokens, newest first", async () => {
    const market = new PaperMarket({ feed: fakeFeed(), universe: 5 });
    const pairs = await market.listPairs();
    expect(pairs[0]).toBe("$CHIPS");
    expect(pairs).toHaveLength(5);
    expect(market.pairCount).toBe(5);
  });

  it("keeps both tokens when two share a symbol", async () => {
    const market = new PaperMarket({ feed: fakeFeed(), universe: 5 });
    const pairs = await market.listPairs();
    const ccats = pairs.filter((p) => p.startsWith("$CCAT"));
    expect(ccats).toHaveLength(2);
    expect(ccats[0]).not.toBe(ccats[1]);
  });

  it("labels every field of a snapshot, and never claims a real price", async () => {
    const market = new PaperMarket({ feed: fakeFeed(), universe: 5 });
    await market.listPairs();
    market.advance(60);
    const snap = await market.snapshot("$CHIPS", 24);

    expect(snap.provenance).toEqual({ identity: "chain", price: "sim", book: "sim" });
    expect(snap.tokenAddress).toBe("0x275b59f8471cd8a7a01f3d1ccaef9a79c7c93c60");
    /* the age is the token's real age, not the sim's */
    expect(snap.ageMinutes).toBe(0);
    expect(snap.candles.length).toBeGreaterThan(0);
  });

  it("serves no pairs at all before the first read, rather than a fake one", () => {
    const market = new PaperMarket({ feed: fakeFeed(), universe: 5 });
    expect(market.pairCount).toBe(0);
    expect(market.universeRows()).toEqual([]);
  });

  it("seeds the price path from the address, so a session is reproducible", () => {
    const a = pairConfigFor(FIXTURE[0]);
    const b = pairConfigFor({ ...FIXTURE[0] });
    expect(a).toEqual(b);

    const other = pairConfigFor(FIXTURE[1]);
    expect(other.startPrice).not.toBe(a.startPrice);

    expect(seedFromAddress(FIXTURE[0].address)).toBe(seedFromAddress(FIXTURE[0].address));
    expect(seedFromAddress(FIXTURE[0].address)).not.toBe(seedFromAddress(FIXTURE[1].address));
  });

  it("derives plausible pair parameters and a real age", () => {
    const cfg = pairConfigFor(token("0xabc0000000000000000000000000000000000001", "$X", 600));
    expect(cfg.ageMinutes).toBe(10);
    expect(cfg.vol).toBeGreaterThan(0);
    expect(cfg.momentumDecay).toBeGreaterThan(0.6);
    expect(cfg.momentumDecay).toBeLessThan(0.93);
    expect(cfg.reserveEth).toBeGreaterThan(1);
  });

  it("carries the chain rows out for the terminal", async () => {
    const market = new PaperMarket({ feed: fakeFeed(), universe: 3 });
    await market.refresh();
    const rows = market.universeRows();
    expect(rows).toHaveLength(3);
    expect(rows[0].short).toBe("0x275b…3c60");
    expect(rows[0].address).toMatch(/^0x[0-9a-f]{40}$/);
  });
});

describe("the village never invents a ticker", () => {
  it("skips the cycle when the market has named no pairs yet", async () => {
    /* A market that has not answered yet: listPairs resolves empty. */
    const empty = {
      listPairs: async () => [],
      snapshot: async () => {
        throw new Error("must not be called — there is nothing to snapshot");
      },
    };
    const { Village } = await import("../src/core/village.js");
    const { heuristicBrain } = await import("../src/sim/brain.js");
    const { mulberry32 } = await import("../src/sim/rng.js");

    const v = new Village({
      market: empty,
      brain: heuristicBrain(),
      rng: mulberry32(1),
      blockingDecisions: true,
    });

    /* Long enough for every agent to have wanted to trade at least once. */
    for (let i = 0; i < 400; i++) await v.step();

    for (const agent of v.agents) {
      expect(agent.position).toBeNull();
      expect(agent.lastPair).toBeNull();
      expect(agent.trades).toBe(0);
    }
  });

  it("survives a market that throws instead of answering", async () => {
    const broken = {
      listPairs: async () => {
        throw new Error("rpc down");
      },
      snapshot: async () => {
        throw new Error("rpc down");
      },
    };
    const { Village } = await import("../src/core/village.js");
    const { heuristicBrain } = await import("../src/sim/brain.js");
    const { mulberry32 } = await import("../src/sim/rng.js");

    const v = new Village({
      market: broken,
      brain: heuristicBrain(),
      rng: mulberry32(1),
      blockingDecisions: true,
    });

    await expect((async () => {
      for (let i = 0; i < 50; i++) await v.step();
    })()).resolves.toBeUndefined();
    expect(v.tick).toBe(50);
  });
});
