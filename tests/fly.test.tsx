import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import baseline from "./fixtures/pre-fly-seed42.json";
import { describe, expect, it, vi } from "vitest";
import App from "../src/ui/App.js";
import { FlyScene, MotorCommands, NeuralReplay } from "../src/ui/fly/FlyScene.js";
import { AgentTerminal } from "../src/ui/fly/Terminal.js";
import { flyMotion, keyPosition } from "../src/ui/fly/motion.js";
import { FlyModel } from "../src/ui/fly/FlyModel.js";
import { FlyChart } from "../src/ui/fly/FlyChart.js";
import { polyBody } from "../src/ui/fly/mesh.js";
import { chartData, CHANNEL_TICKS, flyNet, monitorCoin, neuralState, type CoinView } from "../src/ui/fly/state.js";
import { FLY_PROVIDER, FLY_STATS } from "../src/core/fly.js";
import { compileConfig, PROVIDERS } from "../src/core/config.js";
import { Village } from "../src/core/village.js";
import { SimMarket } from "../src/sim/market.js";
import { heuristicBrain } from "../src/sim/brain.js";
import { mulberry32 } from "../src/sim/rng.js";
import { joinFlySwarm } from "../src/fly/roster.js";
import { attachFlyShortcut, flyKey } from "../src/fly/shortcut.js";
import { parseBuild, EMPTY_DRAFT } from "../src/core/build.js";

function session() {
  const market = new SimMarket({ seed: 42 });
  return new Village({ market, brain: heuristicBrain(), rng: mulberry32(42 ^ 0x9e3779b9),
    blockingDecisions: true, onTick: () => market.advance(1) });
}
function coin(pair: string, last = 1): CoinView {
  return { pair, snap: { pair, last, candles: [], bids: [], asks: [], ageMinutes: 0,
    uniqueBuyers: 0, curveProgressPct: 0, reserveEth: 0, provenance: { identity: "sim", price: "sim", book: "sim" } } };
}
const noop = () => {};
const render = (element: React.ReactElement) => renderToStaticMarkup(element);

/** Snapshot captured from commit 7e4bd8d, before FLY existed. Transcendental
 * math can differ in low floating-point bits between V8 platforms; do not use
 * a cross-platform byte hash. All keys, strings, counters and actions stay exact.
 */
function expectReplay(actual: unknown, expected: unknown, path = "view"): void {
  if (typeof expected === "number" && !Number.isInteger(expected)) {
    expect(typeof actual, path).toBe("number");
    expect(Math.abs((actual as number) - expected), path).toBeLessThanOrEqual(
      Math.max(1e-14, Math.abs(expected) * 1e-12),
    );
  } else if (expected !== null && typeof expected === "object") {
    expect(actual !== null && typeof actual === "object", path).toBe(true);
    expect(Array.isArray(actual), path).toBe(Array.isArray(expected));
    expect(Object.keys(actual as object), path).toEqual(Object.keys(expected));
    for (const [key, value] of Object.entries(expected)) {
      expectReplay((actual as Record<string, unknown>)[key], value, `${path}.${key}`);
    }
  } else expect(actual, path).toBe(expected);
}

describe("fly swarm runtime and integration", () => {
  it("evaluates the default application export and leaves the scene out of initial HTML", () => {
    const html = render(<App />);
    expect(html).toContain("🪰 FLY SWARM");
    expect(html).toContain("▣ TERMINAL");
    expect(html).not.toContain("FLYTRADER");
    expect(html).not.toContain("Fly swarm trading room");
  });
  it("preserves the pre-feature 4,000-tick seed-42 engine output across runtimes", async () => {
    const village = session();
    await village.run(4000);
    expectReplay(JSON.parse(JSON.stringify(village.view())), baseline);
  });
  it("uses the real zero pricing table after training and boosts; FORGE stays paid-only", () => {
    expect(FLY_PROVIDER.neurons).toBe(139255);
    expect(FLY_PROVIDER.synapses).toBe(50e6);
    expect(PROVIDERS).toEqual(["anthropic", "openai", "xai"]);
    for (const ptn of [2, 8, 15]) {
      const cfg = compileConfig({ ...FLY_STATS, ptn }, 1, ["alphaFeed"], { basePositionEth: 0.01, provider: "connectome" });
      expect(cfg.model).toBe("flywire-783");
      expect(cfg.costPerDecision).toBe(0);
      expect(cfg.thinkingBudget).toBe(0);
      expect(cfg.ctxCandles).toBe(24);
    }
    const parsed = parseBuild({ ...EMPTY_DRAFT, provider: "connectome" });
    expect(parsed.ok && parsed.draft.provider).toBe("anthropic");
  });
  it("joins four real agents exactly once, free, without consuming FORGE slots", () => {
    const village = session(), treasury = village.treasury;
    const swarm = joinFlySwarm(village);
    expect(joinFlySwarm(village)).toEqual(swarm);
    expect(village.agents).toHaveLength(8);
    expect(village.treasury).toBe(treasury);
    expect(village.customCount).toBe(0);
    expect(village.notifications.filter((n) => n.text === "CONNECTOME ONLINE")).toHaveLength(4);
    expect(swarm.every((a) => a.custom && a.cls === "FLY" && a.provider === "connectome")).toBe(true);
    expect(swarm.every((a) => a.strategy.holdMax === 22)).toBe(true);
  });
  it("trades all four flies through Village.step with real P&L and no inference spend", async () => {
    const village = session();
    const swarm = joinFlySwarm(village);
    await village.run(8000);
    for (const fly of swarm) {
      expect(fly.trades).toBeGreaterThan(0);
      expect(fly.realizedPnlEth).not.toBe(0);
      expect(fly.spentUsd).toBe(0);
    }
    const html = render(<AgentTerminal ui={village.view()} onClose={noop} />);
    expect(html).toContain("FLY-00"); expect(html).toContain("FLY-03");
    expect(html).toContain("$0.00");
    const restored = session();
    expect(restored.restore(village.save())).toBe(true);
    joinFlySwarm(restored);
    expect(restored.agents.filter((a) => a.cls === "FLY")).toHaveLength(4);
    expect(restored.agents.filter((a) => a.cls === "FLY").every((a) => restored.configFor(a).costPerDecision === 0)).toBe(true);
  });
});

describe("monitor coverage and chart boundaries", () => {
  it("cycles automatically, prefers a mover, and still shows every pair", () => {
    const coins = [coin("A"), coin("B"), coin("C"), coin("D")];
    coins[3].snap.candles = [{ t: 0, o: 0.1, c: 1, h: 1, l: 0.1, v: 1 }];
    expect(monitorCoin(coins, 0, 0)?.pair).toBe("A");
    expect(monitorCoin(coins, CHANNEL_TICKS, 0)?.pair).toBe("D");
    const seen = new Set(Array.from({ length: coins.length * 2 }, (_, i) => monitorCoin(coins, i * CHANNEL_TICKS, 0)?.pair));
    expect(seen.size).toBe(coins.length);
    // Coverage slots stay fair even when current-mover ranking reverses each slot.
    for (let i = 0; i < coins.length; i++) {
      coins[3].snap.last = i % 2 ? 0.01 : 3;
      expect(monitorCoin(coins, i * 2 * CHANNEL_TICKS, 0)?.pair).toBe(coins[i].pair);
    }
  });
  it("position locks override browsing, including a missing snapshot", () => {
    const coins = [coin("A"), coin("B")];
    for (let i = 0; i < 10; i++) expect(monitorCoin(coins, i * CHANNEL_TICKS, 1, "B")?.pair).toBe("B");
    expect(monitorCoin(coins, 10, 0, "MISSING")).toBeUndefined();
    expect(monitorCoin([], 0, 0)).toBeUndefined();
  });
  it("has finite coordinates with no candles, a flat market, and an underwater entry", () => {
    for (const last of [0, 1, 1e-15]) {
      const chart = chartData(coin("A", last).snap, 2);
      expect([chart.min, chart.range, chart.y(last), chart.y(2)].every(Number.isFinite)).toBe(true);
      expect(chart.range).toBeGreaterThan(0);
    }
    expect(chartData().y(0)).toBeGreaterThan(0);
  });
});

describe("SVG scene and state-driven telemetry", () => {
  it.each(["null", "empty", "absent", "flat", "losing"])("renders %s cleanly at tick zero", (mode) => {
    const village = session();
    const coins = [coin("A", 0.5)];
    if (mode === "flat" || mode === "losing") joinFlySwarm(village);
    if (mode === "losing") {
      const fly = village.agents.find((a) => a.cls === "FLY")!;
      fly.realizedPnlEth = -0.01;
      fly.position = { pair: "A", entryPrice: 1, sizeEth: 0.01, tokens: 0.01, openedTick: 0, holdTicks: 22, feePaidEth: 0, unrealizedEth: -0.005 };
    }
    const ui = mode === "null" ? null : mode === "empty" ? {} : { ...village.view(), snapshots: coins };
    const html = render(<FlyScene ui={ui} onClose={noop} onJoin={noop} />);
    expect(html).toContain("FLYTRADER");
    expect(html).not.toMatch(/NaN|Infinity/);
    expect(html.match(/Faceted fly operating a trading keyboard/g)).toHaveLength(4);
    if (mode === "losing") expect(html).toContain("FLY BUY");
  });
  it("draws sorted visible flat-shaded facets, deterministic without an RNG", () => {
    const options = { cx: 10, cy: 20, rx: 60, ry: 40, base: [150, 170, 190] as [number, number, number], jitter: 0.1 };
    const facets = polyBody(options);
    expect(facets.length).toBeGreaterThan(50);
    expect(facets.every((f) => f.normal[2] > 0)).toBe(true);
    expect(facets.every((f, i) => i === 0 || f.depth >= facets[i - 1].depth)).toBe(true);
    expect(new Set(facets.map((f) => f.fill)).size).toBeGreaterThan(20);
    expect(facets).toEqual(polyBody(options));
    expect(JSON.stringify(facets)).not.toMatch(/NaN|Infinity/);
  });
  it("densifies the raster, drives BUY, and lowers dopamine when a held position loses", () => {
    const village = session(); joinFlySwarm(village);
    const agent = village.view().agents.find((a) => a.cls === "FLY")!;
    const flat = neuralState(agent, 50);
    const before = render(<NeuralReplay agent={agent} tick={50} />);
    agent.position = { pair: "A", entryPrice: 1, sizeEth: 0.01, tokens: 0.01, openedTick: 0, holdTicks: 22, feePaidEth: 0, unrealizedEth: -0.005 };
    agent.unrealizedPnlEth = -0.005;
    const held = neuralState(agent, 50);
    expect(held.cells.filter((c) => c.on).length).toBeGreaterThan(flat.cells.filter((c) => c.on).length * 2);
    expect(held.spikes).toBeGreaterThan(flat.spikes);
    expect(held.motors.BUY).toBeGreaterThan(0.8);
    expect(flat.motors.HOLD).toBeGreaterThan(0.8);
    expect(held.dopamine).toBeLessThan(flat.dopamine);
    expect(flyNet(agent)).toBeLessThan(0);
    expect(render(<NeuralReplay agent={agent} tick={50} />)).not.toBe(before);
    expect(render(<MotorCommands agent={agent} tick={50} joined onJoin={noop} />)).toContain("IN POSITION");
    agent.state = "SETTLE";
    expect(neuralState(agent, 50).motors.SELL).toBeGreaterThan(0.8);
    expect(neuralState(agent, 70).cells).not.toEqual(held.cells);
  });
});

describe("typed fly code", () => {
  function key(key: string, extra = {}) {
    return { key, target: null, metaKey: false, ctrlKey: false, altKey: false, ...extra } as KeyboardEvent;
  }
  it("opens on three characters, ignores editing/modifiers/special keys, and resets", () => {
    const buffer = { current: "" };
    expect(flyKey(buffer, key("f"))).toBe(false);
    expect(flyKey(buffer, key("l"))).toBe(false);
    expect(flyKey(buffer, key("y"))).toBe(true);
    expect(buffer.current).toBe("");
    for (const extra of [{ target: { tagName: "INPUT" } }, { target: { tagName: "TEXTAREA" } },
      { target: { isContentEditable: true } }, { ctrlKey: true }, { altKey: true }, { metaKey: true }]) {
      for (const c of "fly") expect(flyKey(buffer, key(c, extra))).toBe(false);
    }
    for (const c of ["f", "ArrowLeft", "l", "y"]) expect(flyKey(buffer, key(c))).toBe(false);
  });
  it("attaches in capture phase and removes the exact listener", () => {
    const addEventListener = vi.fn(), removeEventListener = vi.fn(), open = vi.fn();
    const cleanup = attachFlyShortcut({ addEventListener, removeEventListener }, { current: "" }, open);
    const [name, handler, options] = addEventListener.mock.calls[0];
    expect(name).toBe("keydown"); expect(options).toEqual({ capture: true });
    for (const c of "fly") handler(key(c));
    expect(open).toHaveBeenCalledOnce();
    cleanup();
    expect(removeEventListener).toHaveBeenCalledWith(name, handler, options);
  });
});


describe("coordinated fly input gestures", () => {
  it("puts the typing foot on the illuminated key at contact", () => {
    for (let tick = 0; tick < 240; tick++) {
      const pose = flyMotion(tick);
      if (!pose.pressed) continue;
      const key = keyPosition(pose.key);
      expect(pose.hand.x).toBeCloseTo(key.x, 10);
      expect(pose.hand.y).toBeCloseTo(key.y + 2, 10);
    }
  });
  it("moves without timers, is deterministic on pause, and separates swarm phases", () => {
    expect(flyMotion(50)).toEqual(flyMotion(50));
    expect(flyMotion(50).mouseX).not.toBe(flyMotion(70).mouseX);
    expect(flyMotion(50).hand).not.toEqual(flyMotion(70).hand);
    expect(flyMotion(50, undefined, 0)).not.toEqual(flyMotion(50, undefined, 1));
    const v = session(); joinFlySwarm(v);
    const agent = v.view().agents.find((a) => a.cls === "FLY")!;
    agent.state = "DECIDE";
    expect(flyMotion(50, agent).engaged).toBe(true);
    expect(flyMotion(50, agent).key).not.toBe(flyMotion(50).key);
  });
  it("renders mouse and screen cursor from the same station pose", () => {
    const pose = flyMotion(93, undefined, 2);
    const fly = render(<FlyModel tick={93} station={2} />);
    const monitor = render(<FlyChart tick={93} station={2} />);
    expect(fly).toContain(`translate(${pose.mouseX.toFixed(2)} ${pose.mouseY.toFixed(2)})`);
    expect(monitor).toContain(`translate(${pose.cursorX.toFixed(2)} ${pose.cursorY.toFixed(2)})`);
    expect(monitor).toContain("ROBINHOOD CHAIN");
    expect(fly + monitor).not.toMatch(/NaN|Infinity/);
  });
});
