import { describe, expect, it } from "vitest";
import {
  BUILD_VERSION,
  EMPTY_DRAFT,
  MAX_BUILD_JSON_LENGTH,
  MAX_SYSTEM_SUFFIX_LENGTH,
  parseBuild,
  parseBuildJson,
} from "../src/core/build.js";
import { Village } from "../src/core/village.js";
import { SimMarket } from "../src/sim/market.js";
import { heuristicBrain } from "../src/sim/brain.js";

describe("build import", () => {
  it("loads current exports but discards compiled config and claimed backtest results", () => {
    const parsed = parseBuildJson(JSON.stringify({
      version: BUILD_VERSION,
      ...EMPTY_DRAFT,
      provider: "xai",
      compiled: { positionSizeEth: 999 },
      backtest: { netEth: 999 },
    }));
    expect(parsed).toEqual({ ok: true, draft: { ...EMPTY_DRAFT, provider: "xai" } });
  });

  it.each([undefined, "unknown", null, {}, "__proto__"])("defaults an unrecognized house (%j) to Anthropic", (provider) => {
    const parsed = parseBuild({ ...EMPTY_DRAFT, provider });
    expect(parsed.ok && parsed.draft.provider).toBe("anthropic");
  });

  it("accepts unversioned legacy builds and a missing suffix", () => {
    expect(parseBuild({ ...EMPTY_DRAFT, systemSuffix: undefined })).toEqual({ ok: true, draft: EMPTY_DRAFT });
  });

  it.each([null, [], 12, "build", {}, { ...EMPTY_DRAFT, version: 2 }])("refuses an invalid envelope (%j)", (input) => {
    expect(parseBuild(input).ok).toBe(false);
  });

  it.each([-1, 16, 1.5, "5", NaN, Infinity])("refuses an invalid stat (%j)", (spd) => {
    expect(parseBuild({ ...EMPTY_DRAFT, stats: { ...EMPTY_DRAFT.stats, spd } }).ok).toBe(false);
  });

  it("refuses missing stats and allocations above the total budget", () => {
    expect(parseBuild({ ...EMPTY_DRAFT, stats: { spd: 5 } }).ok).toBe(false);
    expect(parseBuild({ ...EMPTY_DRAFT, stats: { spd: 15, rsk: 15, ptn: 0, gas: 0 } }).ok).toBe(false);
  });

  it.each([
    { entryThreshold: 0 }, { maxCurve: 101 }, { holdMin: 9 },
    { holdMax: 1201 }, { sizeMult: Infinity }, { sizeMult: "1" },
    { requireBookAlign: "false" }, { holdMin: 600, holdMax: 20 },
  ])("rejects invalid strategy fields (%j)", (strategy) => {
    expect(parseBuild({ ...EMPTY_DRAFT, strategy: { ...EMPTY_DRAFT.strategy, ...strategy } }).ok).toBe(false);
  });

  it("refuses invalid names and oversized prompts", () => {
    for (const name of ["", "   ", "a".repeat(17)]) {
      expect(parseBuild({ ...EMPTY_DRAFT, name }).ok).toBe(false);
    }
    expect(parseBuild({ ...EMPTY_DRAFT, systemSuffix: "a".repeat(MAX_SYSTEM_SUFFIX_LENGTH + 1) }).ok).toBe(false);
  });

  it("reports malformed and oversized JSON without throwing", () => {
    expect(parseBuildJson("{")).toMatchObject({ ok: false, error: "Invalid JSON. Paste an exported build object." });
    expect(parseBuildJson(" ".repeat(MAX_BUILD_JSON_LENGTH + 1))).toMatchObject({ ok: false, error: "Build JSON is too large." });
  });

  it("copies authored fields so later changes to the input cannot mutate the imported build", () => {
    const input = structuredClone(EMPTY_DRAFT);
    const parsed = parseBuild(input);
    input.stats.spd = 15;
    input.strategy.sizeMult = 3;
    expect(parsed).toEqual({ ok: true, draft: EMPTY_DRAFT });
  });
});

describe("deployment boundary", () => {
  it("refuses an over-budget build without spending treasury or adding an agent", () => {
    const village = new Village({ market: new SimMarket(), brain: heuristicBrain() });
    const before = village.save();
    expect(village.deployCustom({ ...EMPTY_DRAFT, stats: { spd: 15, rsk: 15, ptn: 15, gas: 15 } })).toBeNull();
    expect(village.save()).toEqual(before);
  });
});
