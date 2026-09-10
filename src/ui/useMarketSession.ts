/** Owns market selection and wall-clock feed polling, independent of animation. */
import { useEffect, useMemo, useState } from "react";
import { Village } from "../core/village.js";
import { PaperAccount } from "../core/paper.js";
import { SimMarket } from "../sim/market.js";
import { heuristicBrain } from "../sim/brain.js";
import { mulberry32 } from "../sim/rng.js";
import { PaperMarket } from "../paper/market.js";
import { CoinbasePaperMarket, type FeedStatus } from "../paper/coinbase.js";
import type { ChainStatus } from "./Dex.jsx";

export type MarketMode = "SIM" | "CHAIN" | "PAPER";
export const MODE_KEY = "dv_mode_v2";
export function storedMode(): MarketMode {
  const requested = new URLSearchParams(globalThis.location?.search ?? "").get("mode");
  if (requested === "SIM" || requested === "PAPER" || requested === "CHAIN") return requested;
  try {
    const saved = globalThis.localStorage?.getItem(MODE_KEY);
    return saved === "CHAIN" || saved === "PAPER" ? saved : "SIM";
  } catch { return "SIM"; }
}

export function useMarketSession(mode: MarketMode) {
  const [chain, setChain] = useState<ChainStatus>({ state: "off" });
  const [feed, setFeed] = useState<FeedStatus>({ state: "connecting", message: "Reading public quotes…" });
  const session = useMemo(() => {
    const market = mode === "PAPER" ? new CoinbasePaperMarket()
      : mode === "CHAIN" ? new PaperMarket({ universe: 6 }) : new SimMarket({ seed: 42 });
    const village = new Village({
      market, brain: heuristicBrain(), rng: mulberry32(42 ^ 0x9e3779b9),
      blockingDecisions: true,
      paperAccount: mode === "PAPER" ? new PaperAccount() : undefined,
      onTick: () => { if (!(market instanceof CoinbasePaperMarket)) market.advance(1); },
    });
    return { village, market };
  }, [mode]);

  useEffect(() => {
    let alive = true;
    let busy = false;
    setChain({ state: "off" });
    setFeed({ state: "connecting", message: "Reading public quotes…" });
    const poll = async () => {
      if (busy) return;
      busy = true;
      try {
        const market = session.market;
        if (market instanceof CoinbasePaperMarket) {
          await market.refresh();
          if (alive) setFeed(market.status());
        } else if (market instanceof PaperMarket) {
          if (alive) setChain((s) => ({ ...s, state: s.state === "off" ? "connecting" : s.state, endpoint: market.endpoint }));
          const { chainId, head, ok } = await market.verify();
          if (!ok) throw new Error(`Wrong chain: ${chainId}`);
          const tokens = await market.refresh();
          if (alive) setChain({ state: "live", endpoint: market.endpoint, chainId, head, tokens, readAt: Date.now() });
        }
      } catch (err) {
        if (alive) setChain({ state: "error", error: err instanceof Error ? err.message : String(err) });
      } finally { busy = false; }
    };
    void poll();
    const timer = setInterval(() => void poll(), mode === "PAPER" ? 5000 : 30000);
    return () => { alive = false; clearInterval(timer); };
  }, [session, mode]);
  return { ...session, chain, feed };
}
