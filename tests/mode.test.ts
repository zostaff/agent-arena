import { afterEach, describe, expect, it, vi } from "vitest";
import { storedMode } from "../src/ui/useMarketSession.js";

afterEach(() => vi.unstubAllGlobals());

describe("shareable market mode", () => {
  it("opens PAPER from the URL even when browser storage is unavailable", () => {
    vi.stubGlobal("location", {search: "?mode=PAPER"});
    vi.stubGlobal("localStorage", {getItem: () => {throw new Error("blocked");}});
    expect(storedMode()).toBe("PAPER");
  });
  it("URL selection overrides a saved mode", () => {
    vi.stubGlobal("location", {search: "?mode=SIM"});
    vi.stubGlobal("localStorage", {getItem: () => "PAPER"});
    expect(storedMode()).toBe("SIM");
  });
  it("unknown URL values fall back to saved preferences", () => {
    vi.stubGlobal("location", {search: "?mode=LIVE"});
    vi.stubGlobal("localStorage", {getItem: () => "CHAIN"});
    expect(storedMode()).toBe("CHAIN");
  });
});
