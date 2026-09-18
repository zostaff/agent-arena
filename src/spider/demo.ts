import type { Snapshot } from "../core/types.js";
import type { WatchWallet, WebEvent } from "./engine.js";
export const DEMO_WALLETS: WatchWallet[] = ["ORBIT", "SILK", "VENOM", "GHOST", "THREAD", "NIGHT"].map((label, i) => ({ address: `demo-wallet-${i}`, label, smart: i < 4 }));
export function demoEvent(step: number, now: number): WebEvent {
  const turn = Math.floor(step / 6), index = step % 6, tokenIndex = turn % 2;
  const symbol = ["$SILK", "$WEB"][tokenIndex], token = `demo-token-${tokenIndex}`;
  const price = (tokenIndex + 1) * 0.0001 * (1 + Math.sin(turn * 0.7) * 0.06);
  const snap = { last: price, observedAt: now, validUntil: now + 5000,
    asks: [{ price: price * 1.001, size: 1 }], bids: [{ price: price * 0.999, size: 1 }],
    candles: [], provenance: { price: "sim" } } as unknown as Snapshot;
  // First two rounds buy both assets, next two exit; repeat with fresh prices.
  return { id: `demo-${step}`, source: "demo", wallet: DEMO_WALLETS[index].address,
    peer: "demo-pool", token, symbol, at: now, kind: turn % 4 < 2 ? "buy" : "sell", amount: "0.01 ETH", snap };
}
