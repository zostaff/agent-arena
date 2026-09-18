import type { Candle, Snapshot } from "../core/types.js";

export const WATCHERS = [
  { id: "volume", name: "RIPPLE", label: "Volume pulse", rule: "2× the previous 8 candles", color: "#ccff00" },
  { id: "breakout", name: "LEAP", label: "Range break", rule: "0.2% beyond the 8-candle range", color: "#a3c653" },
  { id: "book", name: "DEPTH", label: "Book imbalance", rule: "65% of top-five visible depth", color: "#d6b65b" },
] as const;
export type Pattern = typeof WATCHERS[number]["id"];
export type RadarCoin = { pair: string; snap: Snapshot };
export interface Contact {
  id: string;
  pair: string;
  pattern: Pattern;
  direction: "up" | "down" | "pulse";
  metric: string;
  reason: string;
  provenance: "sim" | "chain" | "exchange";
  strength: number;
}
export interface RadarScan {
  contacts: Contact[];
  pairs: number;
  ready: Record<Pattern, number>;
  stale: number;
}
const positive = (n: number) => Number.isFinite(n) && n > 0;
function validCandle(c: Candle) {
  return [c.t, c.o, c.h, c.l, c.c, c.v].every(Number.isFinite) && c.t >= 0 &&
    c.v >= 0 && c.l > 0 && c.l <= Math.min(c.o, c.c) && c.h >= Math.max(c.o, c.c);
}
function closedHistory(snap: Snapshot, now: number) {
  const exchange = snap.provenance?.price === "exchange";
  const closed = exchange ? snap.candles : snap.candles.slice(0, -1);
  const history = closed.slice(-9);
  if (history.length < 9 || history.some((c, i) => !validCandle(c) || (i > 0 && c.t <= history[i - 1].t))) return null;
  if (exchange && history.some(c => (c.t + 60) * 1000 > now)) return null;
  if (exchange && now - (history[8].t + 60) * 1000 > 180_000) return null;
  return history;
}

/** Current matches only. This function never mutates snapshots or initiates I/O. */
export function scanRadar(coins: readonly RadarCoin[], now: number): RadarScan {
  const result: RadarScan = { contacts: [], pairs: 0, ready: { volume: 0, breakout: 0, book: 0 }, stale: 0 };
  const seen = new Set<string>();
  for (const { pair, snap } of coins) {
    if (seen.has(pair)) continue;
    seen.add(pair);
    result.pairs++;
    const exchange = snap.provenance?.price === "exchange" || snap.provenance?.book === "exchange";
    if (exchange && (!Number.isFinite(now) || !Number.isFinite(snap.observedAt) ||
      !Number.isFinite(snap.validUntil) || snap.observedAt! > now || snap.validUntil! <= now)) {
      result.stale++;
      continue;
    }
    const add = (pattern: Pattern, direction: Contact["direction"], metric: string, reason: string, strength: number) => {
      if (!Number.isFinite(strength)) return;
      result.contacts.push({ id: `${pair}:${pattern}`, pair, pattern, direction, metric, reason, strength,
        provenance: (pattern === "book" ? snap.provenance?.book : snap.provenance?.price) ?? "sim" });
    };
    const history = closedHistory(snap, now);
    if (history) {
      const baseline = history.slice(0, 8), recent = history[8];
      const mean = baseline.reduce((sum, c) => sum + c.v / 8, 0);
      if (positive(mean)) {
        result.ready.volume++;
        const ratio = recent.v / mean;
        if (ratio >= 2) add("volume", "pulse", `${ratio.toFixed(2)}×`,
          "Closed-candle ETH volume / previous 8 mean ≥ 2×", ratio / 2);
      }
      if (positive(snap.last)) {
        result.ready.breakout++;
        const high = Math.max(...baseline.map(c => c.h)), low = Math.min(...baseline.map(c => c.l));
        const up = snap.last / high - 1, down = 1 - snap.last / low;
        if (snap.last >= high * 1.002) add("breakout", "up", `+${(up * 100).toFixed(2)}%`,
          "Observed price above previous 8-candle high by ≥ 0.2%", up / 0.002);
        else if (snap.last <= low * 0.998) add("breakout", "down", `−${(down * 100).toFixed(2)}%`,
          "Observed price below previous 8-candle low by ≥ 0.2%", down / 0.002);
      }
    }
    const bids = snap.bids.slice(0, 5), asks = snap.asks.slice(0, 5);
    const valid = bids.length >= 3 && asks.length >= 3 && [...bids, ...asks].every(l => positive(l.price) && positive(l.size)) &&
      bids.every((l, i) => i === 0 || l.price < bids[i - 1].price) &&
      asks.every((l, i) => i === 0 || l.price > asks[i - 1].price) && bids[0].price < asks[0].price;
    if (valid) {
      const bid = bids.reduce((sum, l) => sum + l.size, 0), ask = asks.reduce((sum, l) => sum + l.size, 0);
      if (!positive(bid + ask)) continue;
      result.ready.book++;
      const share = bid / (bid + ask);
      if (share >= 0.65 || share <= 0.35) {
        const side = share >= 0.65 ? "bid" : "ask", dominant = Math.max(share, 1 - share);
        add("book", side === "bid" ? "up" : "down", `${(dominant * 100).toFixed(1)}% ${side}`,
          "Top-five displayed ETH depth on one side ≥ 65%; not trade flow", dominant / 0.65);
      }
    }
  }
  result.contacts.sort((a, b) => b.strength - a.strength || a.id.localeCompare(b.id));
  return result;
}

/** Stable spatial identity; radius is decorative, not a confidence score. */
export function contactPoint(id: string) {
  let hash = 2166136261;
  for (const ch of id) hash = Math.imul(hash ^ ch.charCodeAt(0), 16777619) >>> 0;
  const angle = (hash % 360) * Math.PI / 180, radius = 52 + ((hash >>> 9) % 115);
  return { x: 360 + Math.cos(angle) * radius, y: 240 + Math.sin(angle) * radius };
}
