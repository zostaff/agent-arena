import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Snapshot } from "../src/core/types.js";
import { contactPoint, scanRadar } from "../src/frog/radar.js";
import { attachFrogShortcut, frogKey } from "../src/frog/shortcut.js";
import { FrogEasterEgg, FrogRadar } from "../src/ui/frog/FrogRadar.js";

const NOW = 1_800_000_000_000;
function snapshot(): Snapshot {
  return { pair: "TEST-ETH", last: 100, candles: Array.from({ length: 10 }, (_, t) => ({ t, o: 100, c: 100, h: 101, l: 99, v: 10 })),
    bids: [99, 98, 97, 96, 95].map(price => ({ price, size: 10 })),
    asks: [101, 102, 103, 104, 105].map(price => ({ price, size: 10 })),
    ageMinutes: 1, uniqueBuyers: 10, reserveEth: 100, curveProgressPct: 10,
    provenance: { identity: "sim", price: "sim", book: "sim" } };
}
function scan(snap = snapshot(), now = NOW) { return scanRadar([{ pair: snap.pair, snap }], now); }
function exchange(): Snapshot {
  const snap = snapshot();
  snap.provenance = { identity: "exchange", price: "exchange", book: "exchange" };
  snap.candles = snap.candles.slice(0, 9).map((c, i) => ({ ...c, t: NOW / 1000 - (9 - i) * 60 }));
  snap.observedAt = NOW - 1000;
  snap.validUntil = NOW + 14_000;
  return snap;
}

describe("frog pattern detection", () => {
  it("stays quiet in a balanced market, has no empty-data matches and preserves its inputs", () => {
    const snap = snapshot(), before = JSON.stringify(snap);
    expect(scan(snap)).toMatchObject({ pairs: 1, ready: { volume: 1, breakout: 1, book: 1 }, contacts: [] });
    expect(JSON.stringify(snap)).toBe(before);
    expect(scanRadar([], NOW)).toEqual({ contacts: [], pairs: 0, ready: { volume: 0, breakout: 0, book: 0 }, stale: 0 });
  });
  it("uses closed candles, fires at the 2x volume boundary and ignores a forming spike", () => {
    const snap = snapshot();
    snap.candles[9].v = 1000;
    expect(scan(snap).contacts).toHaveLength(0);
    snap.candles[8].v = 19.99;
    expect(scan(snap).contacts).toHaveLength(0);
    snap.candles[8].v = 20;
    expect(scan(snap).contacts).toEqual([expect.objectContaining({ pattern: "volume", metric: "2.00×", provenance: "sim" })]);
  });
  it("does not discard the last closed exchange candle", () => {
    const snap = exchange();
    snap.candles[8].v = 30;
    expect(scan(snap).contacts).toEqual([expect.objectContaining({ pattern: "volume", metric: "3.00×", provenance: "exchange" })]);
  });
  it.each(["up", "down"])("detects %s breakouts at the boundary, excluding the latest closed bar", direction => {
    const snap = snapshot();
    snap.last = direction === "up" ? 101 * 1.002 : 99 * 0.998;
    snap.candles[8] = { t: 8, o: 100, c: snap.last, h: Math.max(101, snap.last), l: Math.min(99, snap.last), v: 10 };
    expect(scan(snap).contacts).toEqual([expect.objectContaining({ pattern: "breakout", direction })]);
    snap.last = direction === "up" ? 101 * 1.00199 : 99 * 0.99801;
    expect(scan(snap).contacts).toHaveLength(0);
  });
  it.each(["bid", "ask"])("measures ETH depth and detects the 65%% %s boundary", side => {
    const snap = snapshot();
    snap.bids.forEach(l => { l.size = side === "bid" ? 13 : 7; });
    snap.asks.forEach(l => { l.size = side === "ask" ? 13 : 7; });
    // Deep outliers beyond level five do not dominate the radar.
    snap.asks.push({ price: 106, size: 1e9 });
    expect(scan(snap).contacts).toEqual([expect.objectContaining({ pattern: "book", metric: `65.0% ${side}` })]);
  });
  it("rejects invalid, crossed, unordered and shallow books", () => {
    for (const bad of ["crossed", "shallow", "negative", "unordered", "nan", "overflow"]) {
      const snap = snapshot();
      snap.bids.forEach(l => { l.size = 100; });
      if (bad === "crossed") snap.bids[0].price = 102;
      if (bad === "shallow") snap.asks = snap.asks.slice(0, 2);
      if (bad === "negative") snap.bids[0].size = -1;
      if (bad === "unordered") snap.bids.reverse();
      if (bad === "nan") snap.asks[0].price = NaN;
      if (bad === "overflow") snap.bids.forEach(l => { l.size = Number.MAX_VALUE; });
      expect(scan(snap).contacts, bad).toHaveLength(0);
      expect(scan(snap).ready.book, bad).toBe(0);
    }
  });
  it("requires a positive baseline, enough history and valid ordered OHLCV", () => {
    for (const bad of ["zero", "short", "negative", "nan", "ohlc", "duplicate", "unordered"]) {
      const snap = snapshot();
      snap.candles[8].v = 40;
      if (bad === "zero") snap.candles.slice(0, 8).forEach(c => { c.v = 0; });
      if (bad === "short") snap.candles.shift();
      if (bad === "negative") snap.candles[2].v = -5;
      if (bad === "nan") snap.candles[2].c = NaN;
      if (bad === "ohlc") snap.candles[2].l = 102;
      if (bad === "duplicate") snap.candles[2].t = 1;
      if (bad === "unordered") snap.candles.reverse();
      expect(scan(snap).contacts, bad).toHaveLength(0);
      expect(scan(snap).ready.volume, bad).toBe(0);
    }
  });
  it("expires exchange contacts at the exact quote deadline, including on a paused tick", () => {
    const snap = exchange(); snap.candles[8].v = 30;
    expect(scan(snap).contacts).toHaveLength(1);
    expect(scan(snap, snap.validUntil).contacts).toHaveLength(0);
    expect(scan(snap, snap.validUntil).stale).toBe(1);
    delete snap.observedAt;
    expect(scan(snap).stale).toBe(1);
    snap.observedAt = NOW + 1;
    expect(scan(snap).stale).toBe(1);
    snap.observedAt = NOW;
    delete snap.validUntil;
    expect(scan(snap).stale).toBe(1);
  });
  it("rejects old or future exchange candles even when the book is fresh", () => {
    for (const delta of [-181, 1]) {
      const snap = exchange();
      snap.candles.forEach(c => { c.t += delta; });
      snap.candles[8].v = 30;
      expect(scan(snap).contacts).toHaveLength(0);
      expect(scan(snap).ready).toEqual({ volume: 0, breakout: 0, book: 1 });
    }
  });
  it("preserves simulated provenance for real chain identities and deduplicates repeated pairs", () => {
    const snap = snapshot(); snap.provenance!.identity = "chain"; snap.candles[8].v = 30;
    const coin = { pair: snap.pair, snap };
    const result = scanRadar([coin, coin], NOW);
    expect(result.pairs).toBe(1);
    expect(result.contacts).toEqual([expect.objectContaining({ provenance: "sim" })]);
  });
  it("keeps marker positions finite, deterministic and inside the pond", () => {
    for (const name of ["", "TEST-ETH:volume", "🐸:book", "x".repeat(1000)]) {
      const point = contactPoint(name);
      expect(point).toEqual(contactPoint(name));
      expect(Math.hypot(point.x - 360, point.y - 240)).toBeLessThanOrEqual(167);
    }
  });
});

describe("frog entry and presentation", () => {
  const key = (key: string, extra = {}) => ({ key, target: null, metaKey: false, ctrlKey: false, altKey: false, isComposing: false, repeat: false, ...extra } as KeyboardEvent);
  it("recognizes mixed-case code and ignores editing, composition and shortcut modifiers", () => {
    const buffer = { current: "" };
    expect([..."frOG"].map(c => frogKey(buffer, key(c)))).toEqual([false, false, false, true]);
    for (const extra of [{ target: { tagName: "INPUT" } }, { target: { tagName: "TEXTAREA" } }, { target: { tagName: "SELECT" } },
      { target: { isContentEditable: true } }, { target: { closest: () => ({}) } }, { metaKey: true }, { ctrlKey: true }, { altKey: true }, { isComposing: true }, { repeat: true }]) {
      for (const c of "frog") expect(frogKey(buffer, key(c, extra))).toBe(false);
    }
    for (const c of ["f", "r", "Escape", "o", "g"]) expect(frogKey(buffer, key(c))).toBe(false);
  });
  it("removes the same capture listener and opens once for each code", () => {
    const target = { addEventListener: vi.fn(), removeEventListener: vi.fn() }, open = vi.fn();
    const cleanup = attachFrogShortcut(target, { current: "" }, open);
    const [name, handler, options] = target.addEventListener.mock.calls[0];
    for (const c of "frog") handler(key(c));
    expect(open).toHaveBeenCalledOnce();
    cleanup();
    expect(target.removeEventListener).toHaveBeenCalledWith(name, handler, { capture: true });
    expect(options).toEqual({ capture: true });
  });
  it("renders hidden entry, empty pond and actual matches without non-finite coordinates", () => {
    const initial = renderToStaticMarkup(<FrogEasterEgg />);
    expect(initial).toContain("Open frog radar");
    expect(initial).not.toContain('role="dialog"');
    const empty = renderToStaticMarkup(<FrogRadar ui={null} onClose={() => {}} />);
    expect(empty).toContain("The pond is warming up.");
    const snap = snapshot(); snap.candles[8].v = 30;
    const html = renderToStaticMarkup(<FrogRadar ui={{ tick: 12, snapshots: [{ pair: snap.pair, snap }] }} mode="CHAIN" onClose={() => {}} />);
    expect(html).toContain("3.00×");
    expect(html).toContain("real Pons identities / simulated prices &amp; books");
    expect(html).toContain('data-frog-contact="TEST-ETH:volume"');
    expect(html.match(/data-frog-pose=/g)).toHaveLength(3);
    expect(html + empty).not.toMatch(/NaN|Infinity/);
  });
});
