/**
 * DEGEN VILLAGE — the village engine: buildings, treasury, boosts, roster.
 * Zero dependencies, isomorphic. Market and Brain are injected.
 */

import type {
  AgentClass,
  Brain,
  BrainOpts,
  Market,
  Provider,
  Snapshot,
  StrategyParams,
  Verdict,
} from "./types.js";
import type { BoostKind, CompiledConfig, StatKey, Stats } from "./config.js";
import { compileConfig, normalizeProvider, PROVIDER_META, STAT_LABEL } from "./config.js";
import { CLASS_LENS, CLASS_STRATEGY } from "./brain.js";
import { fillPrice } from "./market.js";
import type { AgentInit, AgentTickCtx, GridPos, NotifyKind } from "./agent.js";
import { VillageAgent } from "./agent.js";

export const GRID = 14;
export const COIN_PER_ETH = 1000;
/** Ticks between mark-to-market refreshes for pairs with open positions. */
export const MARK_INTERVAL = 15;
/** Base share of a winning trade the village takes. */
export const BASE_TREASURY_CUT = 0.35;
export const MINT_CUT_PER_LEVEL = 0.06;
export const MAX_CUSTOM_AGENTS = 4;
export const CUSTOM_DEPLOY_COST = 150;
/** REWIRE: moving one agent to another house, mid-run, costs this many coins. */
export const REWIRE_COST = 60;
/** Grid units per tick before RELAY. */
export const BASE_WALK_SPEED = 0.055;

export type BuildingId =
  | "BARRACKS"
  | "LAB"
  | "VAULT"
  | "REFINERY"
  | "ACADEMY"
  | "MINT"
  | "RELAY"
  | "NEXUS";

export interface BuildingDef {
  id: BuildingId;
  /** Stat this building trains, or null for a utility building. */
  trains: StatKey | null;
  pos: GridPos;
  /** Present from tick zero, or has to be constructed. */
  prebuilt: boolean;
  effect: string;
}

export const BUILDING_DEFS: readonly BuildingDef[] = Object.freeze([
  { id: "BARRACKS", trains: "spd", pos: { gx: 2, gy: 2 }, prebuilt: true, effect: "trains SPD" },
  { id: "LAB", trains: "ptn", pos: { gx: 11, gy: 2 }, prebuilt: true, effect: "trains PTN" },
  { id: "VAULT", trains: "rsk", pos: { gx: 2, gy: 11 }, prebuilt: true, effect: "trains RSK" },
  { id: "REFINERY", trains: "gas", pos: { gx: 11, gy: 11 }, prebuilt: true, effect: "trains GAS" },
  { id: "ACADEMY", trains: null, pos: { gx: 6, gy: 1 }, prebuilt: false, effect: "+25% XP per level" },
  { id: "MINT", trains: null, pos: { gx: 1, gy: 7 }, prebuilt: false, effect: "+6% treasury cut per level" },
  { id: "RELAY", trains: null, pos: { gx: 12, gy: 6 }, prebuilt: false, effect: "+12% walk speed per level" },
  { id: "NEXUS", trains: null, pos: { gx: 7, gy: 12 }, prebuilt: false, effect: "+12% position size per level" },
]);

export const TERMINAL_POS: GridPos = Object.freeze({ gx: 6.5, gy: 6.5 });

/** Coins to reach level N. Index 0 is unused; L2 = 40 ... L5 = 650. */
export const UPGRADE_COST: Readonly<Record<number, number>> = Object.freeze({
  2: 40,
  3: 110,
  4: 280,
  5: 650,
});

export const UPGRADE_TICKS: Readonly<Record<number, number>> = Object.freeze({
  2: 420,
  3: 700,
  4: 1100,
  5: 1700,
});

export const CONSTRUCTION_TICKS = 800;
/** Coins per remaining tick when rushing. */
export const RUSH_RATE = 0.06;
export const MAX_BUILDING_LEVEL = 5;

export interface BoostDef {
  kind: BoostKind;
  label: string;
  cost: number;
  ticks: number;
  effect: string;
}

export const BOOST_DEFS: readonly BoostDef[] = Object.freeze([
  { kind: "overclock", label: "OVERCLOCK", cost: 60, ticks: 900, effect: "poll interval / 3" },
  { kind: "alphaFeed", label: "ALPHA FEED", cost: 90, ticks: 1200, effect: "context x2, reasoning x2" },
  { kind: "leverage", label: "LEVERAGE", cost: 110, ticks: 600, effect: "position size x2" },
  { kind: "zeroGas", label: "ZERO GAS", cost: 70, ticks: 1500, effect: "fees to zero" },
]);

export interface BuildingState {
  id: BuildingId;
  level: number;
  pos: GridPos;
  trains: StatKey | null;
  /** null when idle; otherwise the job currently running. */
  job: { kind: "build" | "upgrade"; toLevel: number; ticksLeft: number; totalTicks: number } | null;
}

export interface ActiveBoost {
  kind: BoostKind;
  ticksLeft: number;
  totalTicks: number;
}

export interface VillageNotification {
  id: number;
  agentId: string;
  text: string;
  kind: NotifyKind;
  tick: number;
  gx: number;
  gy: number;
}

export interface TradeEvent {
  id: number;
  tick: number;
  agentId: string;
  agentName: string;
  cls: AgentClass;
  pair: string;
  action: "BUY" | "SELL";
  price: number;
  sizeEth: number;
  pnlEth: number;
  reason: string;
}

export interface CustomAgentSpec {
  name: string;
  stats: Stats;
  strategy: StrategyParams;
  systemSuffix: string;
  /** House the build is wired to. Defaults to Anthropic. */
  provider?: Provider;
}

export interface VillageOptions {
  market: Market;
  brain: Brain;
  /** Deterministic RNG. Sim passes a seeded mulberry32; live may pass Math.random. */
  rng?: () => number;
  /** Await every decision inline. Required for deterministic replays. */
  blockingDecisions?: boolean;
  startingTreasury?: number;
  /** Preset roster; defaults to one of each class. */
  roster?: AgentInit[];
  /** Ticks between mark-to-market refreshes. */
  markInterval?: number;
  /** Called once per tick before agents step. The sim market advances here. */
  onTick?: (tick: number) => void | Promise<void>;
}

function classHome(index: number): GridPos {
  const ring: GridPos[] = [
    { gx: 4, gy: 5 },
    { gx: 9, gy: 5 },
    { gx: 4, gy: 9 },
    { gx: 9, gy: 9 },
    { gx: 6, gy: 4 },
    { gx: 7, gy: 9 },
    { gx: 5, gy: 7 },
    { gx: 8, gy: 7 },
  ];
  return ring[index % ring.length];
}

export function defaultRoster(): AgentInit[] {
  const classes: AgentClass[] = ["SCOUT", "SNIPER", "WHALE", "ARB"];
  const seed: Record<AgentClass, Stats> = {
    SCOUT: { spd: 4, rsk: 1, ptn: 2, gas: 2 },
    SNIPER: { spd: 1, rsk: 2, ptn: 4, gas: 2 },
    WHALE: { spd: 1, rsk: 5, ptn: 2, gas: 1 },
    ARB: { spd: 5, rsk: 1, ptn: 1, gas: 3 },
    CUSTOM: { spd: 0, rsk: 0, ptn: 0, gas: 0 },
  };
  return classes.map((cls, i) => ({
    id: cls.toLowerCase(),
    name: cls,
    cls,
    stats: seed[cls],
    home: classHome(i),
    strategy: { ...CLASS_STRATEGY[cls] },
  }));
}

export class Village {
  readonly market: Market;
  readonly brain: Brain;
  readonly rng: () => number;
  readonly blockingDecisions: boolean;
  readonly markInterval: number;
  readonly onTick: ((tick: number) => void | Promise<void>) | null;

  tick = 0;
  treasury: number;
  agents: VillageAgent[] = [];
  buildings = new Map<BuildingId, BuildingState>();
  boosts: ActiveBoost[] = [];
  notifications: VillageNotification[] = [];
  tape: TradeEvent[] = [];

  /** Latest snapshot per pair, refreshed on decisions and marks. */
  readonly snapshots = new Map<string, Snapshot>();
  private pairs: string[] = [];
  private pairCursor = 0;
  private notifSeq = 0;
  private tapeSeq = 0;
  private pending: Promise<void>[] = [];

  totalSpentUsd = 0;

  constructor(opts: VillageOptions) {
    this.market = opts.market;
    this.brain = opts.brain;
    this.rng = opts.rng ?? Math.random;
    this.blockingDecisions = opts.blockingDecisions ?? false;
    this.markInterval = opts.markInterval ?? MARK_INTERVAL;
    this.onTick = opts.onTick ?? null;
    this.treasury = opts.startingTreasury ?? 200;

    for (const def of BUILDING_DEFS) {
      this.buildings.set(def.id, {
        id: def.id,
        level: def.prebuilt ? 1 : 0,
        pos: def.pos,
        trains: def.trains,
        job: null,
      });
    }
    for (const init of opts.roster ?? defaultRoster()) {
      this.agents.push(new VillageAgent(init));
    }
  }

  /* ---------------------------------------------------------------- roster */

  addAgent(init: AgentInit): VillageAgent {
    const agent = new VillageAgent(init);
    this.agents.push(agent);
    return agent;
  }

  get customCount(): number {
    return this.agents.filter((a) => a.custom).length;
  }

  /** DEPLOY from FORGE. Costs 150 coins, capped at 4 custom agents. */
  deployCustom(spec: CustomAgentSpec): VillageAgent | null {
    if (this.customCount >= MAX_CUSTOM_AGENTS) return null;
    if (this.treasury < CUSTOM_DEPLOY_COST) return null;
    this.treasury -= CUSTOM_DEPLOY_COST;
    const agent = this.addAgent({
      id: `custom-${this.customCount + 1}-${Math.floor(this.rng() * 1e6)}`,
      name: spec.name,
      cls: "CUSTOM",
      stats: { spd: 0, rsk: 0, ptn: 0, gas: 0 },
      targetStats: spec.stats,
      home: classHome(4 + this.customCount),
      strategy: spec.strategy,
      systemSuffix: spec.systemSuffix,
      provider: spec.provider,
      custom: true,
    });
    this.pushNotification(agent, `DEPLOY ${spec.name}`, "info");
    return agent;
  }

  /**
   * REWIRE — move a live agent to another house.
   *
   * The stats do not move: PTN 12 on Anthropic is PTN 12 on xAI, it just costs
   * a different amount per decision and rides a different wire. An agent
   * holding a position is not rewired mid-trade, because the verdict that
   * opened it came from the old house.
   */
  rewire(agentId: string, provider: Provider): boolean {
    const agent = this.agents.find((a) => a.id === agentId);
    if (!agent) return false;
    const next = normalizeProvider(provider);
    if (agent.provider === next) return false;
    if (agent.position) return false;
    if (this.treasury < REWIRE_COST) return false;
    this.treasury -= REWIRE_COST;
    agent.provider = next;
    this.pushNotification(
      agent,
      `REWIRE → ${PROVIDER_META[next].label}`,
      "info",
    );
    return true;
  }

  /* ------------------------------------------------------------- buildings */

  building(id: BuildingId): BuildingState {
    const b = this.buildings.get(id);
    if (!b) throw new Error(`unknown building ${id}`);
    return b;
  }

  levelOf(id: BuildingId): number {
    return this.buildings.get(id)?.level ?? 0;
  }

  /** Cost of the next action on this building, or null if none is possible. */
  nextCost(id: BuildingId): { cost: number; ticks: number; toLevel: number } | null {
    const b = this.building(id);
    if (b.job) return null;
    if (b.level === 0) return { cost: UPGRADE_COST[2], ticks: CONSTRUCTION_TICKS, toLevel: 1 };
    const to = b.level + 1;
    if (to > MAX_BUILDING_LEVEL) return null;
    return { cost: UPGRADE_COST[to], ticks: UPGRADE_TICKS[to], toLevel: to };
  }

  /** Starts construction of an unbuilt building. */
  build(id: BuildingId): boolean {
    const b = this.building(id);
    if (b.level !== 0 || b.job) return false;
    const cost = UPGRADE_COST[2];
    if (this.treasury < cost) return false;
    this.treasury -= cost;
    b.job = { kind: "build", toLevel: 1, ticksLeft: CONSTRUCTION_TICKS, totalTicks: CONSTRUCTION_TICKS };
    return true;
  }

  upgrade(id: BuildingId): boolean {
    const b = this.building(id);
    if (b.level === 0 || b.job || b.level >= MAX_BUILDING_LEVEL) return false;
    const to = b.level + 1;
    const cost = UPGRADE_COST[to];
    if (this.treasury < cost) return false;
    this.treasury -= cost;
    b.job = { kind: "upgrade", toLevel: to, ticksLeft: UPGRADE_TICKS[to], totalTicks: UPGRADE_TICKS[to] };
    return true;
  }

  rushCost(id: BuildingId): number {
    const b = this.building(id);
    if (!b.job) return 0;
    return Math.ceil(b.job.ticksLeft * RUSH_RATE);
  }

  /** Pays remaining_ticks * 0.06 coins to finish the job this tick. */
  rush(id: BuildingId): boolean {
    const b = this.building(id);
    if (!b.job) return false;
    const cost = this.rushCost(id);
    if (this.treasury < cost) return false;
    this.treasury -= cost;
    b.job.ticksLeft = 0;
    this.completeJob(b);
    return true;
  }

  private completeJob(b: BuildingState): void {
    if (!b.job) return;
    b.level = b.job.toLevel;
    b.job = null;
  }

  /* ----------------------------------------------------------------- boosts */

  boostDef(kind: BoostKind): BoostDef {
    const d = BOOST_DEFS.find((x) => x.kind === kind);
    if (!d) throw new Error(`unknown boost ${kind}`);
    return d;
  }

  buyBoost(kind: BoostKind): boolean {
    const def = this.boostDef(kind);
    if (this.treasury < def.cost) return false;
    this.treasury -= def.cost;
    const existing = this.boosts.find((b) => b.kind === kind);
    if (existing) {
      existing.ticksLeft += def.ticks;
      existing.totalTicks = Math.max(existing.totalTicks, existing.ticksLeft);
    } else {
      this.boosts.push({ kind, ticksLeft: def.ticks, totalTicks: def.ticks });
    }
    return true;
  }

  get activeBoostKinds(): BoostKind[] {
    return this.boosts.filter((b) => b.ticksLeft > 0).map((b) => b.kind);
  }

  /* --------------------------------------------------------------- derived */

  get walkSpeed(): number {
    return BASE_WALK_SPEED * (1 + this.levelOf("RELAY") * 0.12);
  }

  get xpMult(): number {
    return 1 + this.levelOf("ACADEMY") * 0.25;
  }

  get treasuryCutRate(): number {
    return BASE_TREASURY_CUT + this.levelOf("MINT") * MINT_CUT_PER_LEVEL;
  }

  get passiveYieldPerTick(): number {
    let acc = 0;
    for (const b of this.buildings.values()) acc += b.level * 0.012;
    return acc;
  }

  configFor(agent: VillageAgent): CompiledConfig {
    return compileConfig(agent.stats, agent.level, this.activeBoostKinds, {
      basePositionEth: 0.05 * agent.strategy.sizeMult,
      nexusLevel: this.levelOf("NEXUS"),
      provider: agent.provider,
    });
  }

  get netPnlEth(): number {
    let acc = 0;
    for (const a of this.agents) acc += a.netPnlEth;
    return acc;
  }

  /* ------------------------------------------------------------------ tick */

  private pushNotification(agent: VillageAgent, text: string, kind: NotifyKind): void {
    this.notifications.push({
      id: ++this.notifSeq,
      agentId: agent.id,
      text,
      kind,
      tick: this.tick,
      gx: agent.gx,
      gy: agent.gy,
    });
    if (this.notifications.length > 40) this.notifications.splice(0, this.notifications.length - 40);
  }

  private pushTape(e: Omit<TradeEvent, "id">): void {
    this.tape.push({ ...e, id: ++this.tapeSeq });
    if (this.tape.length > 120) this.tape.splice(0, this.tape.length - 120);
  }

  private ctxFor(agent: VillageAgent): AgentTickCtx {
    const config = this.configFor(agent);
    return {
      tick: this.tick,
      config,
      walkSpeed: this.walkSpeed,
      xpMult: this.xpMult,
      buildingLevel: (stat) => {
        for (const b of this.buildings.values()) if (b.trains === stat) return Math.max(1, b.level);
        return 1;
      },
      buildingPos: (stat) => {
        for (const b of this.buildings.values()) if (b.trains === stat) return b.pos;
        return TERMINAL_POS;
      },
      terminal: TERMINAL_POS,
      requestDecision: (a) => this.dispatchDecision(a, config),
      openPosition: (a, v) => this.openPosition(a, v, config),
      markToMarket: (a) => this.markToMarket(a),
      closePosition: (a) => this.closePosition(a),
      notify: (a, text, kind) => this.pushNotification(a, text, kind),
      rng: this.rng,
    };
  }

  private async ensurePairs(): Promise<void> {
    if (this.pairs.length > 0) return;
    this.pairs = await this.market.listPairs();
  }

  private nextPair(): string {
    if (this.pairs.length === 0) return "$RUG";
    const p = this.pairs[this.pairCursor % this.pairs.length];
    this.pairCursor += 1;
    return p;
  }

  private brainOpts(agent: VillageAgent, config: CompiledConfig): BrainOpts {
    return {
      maxSizeEth: config.positionSizeEth,
      model: config.model,
      provider: config.provider,
      thinkingBudget: config.thinkingBudget,
      agentClass: agent.cls,
      strategy: agent.strategy,
      systemSuffix: agent.systemSuffix,
      lens: CLASS_LENS[agent.cls],
      inPosition: agent.position !== null,
    };
  }

  /**
   * Kicks off snapshot + decide. In blocking mode the promise is collected and
   * awaited before the tick returns, which is what makes replays reproducible.
   */
  private dispatchDecision(agent: VillageAgent, config: CompiledConfig): void {
    const pair = agent.position?.pair ?? this.nextPair();
    agent.lastPair = pair;
    const work = (async () => {
      const snap = await this.market.snapshot(pair, config.ctxCandles);
      this.snapshots.set(pair, snap);
      const verdict = await this.brain.decide(snap, this.brainOpts(agent, config));
      agent.pendingVerdict = verdict;
      agent.spentUsd += config.costPerDecision;
      this.totalSpentUsd += config.costPerDecision;
    })().catch(() => {
      agent.pendingVerdict = {
        action: "SKIP",
        sizeEth: 0,
        confidence: 0,
        holdTicks: 0,
        reason: "village: dispatch failed",
      };
    });
    this.pending.push(work);
  }

  private openPosition(agent: VillageAgent, verdict: Verdict, config: CompiledConfig): void {
    const pair = agent.lastPair;
    if (!pair) return;
    const snap = this.snapshots.get(pair);
    if (!snap) return;

    const sizeEth = Math.min(verdict.sizeEth, config.positionSizeEth);
    if (sizeEth <= 0) return;

    const entry = fillPrice(snap.asks, sizeEth, snap.last);
    const slipBps = snap.last > 0 ? ((entry - snap.last) / snap.last) * 10_000 : 0;
    if (slipBps > config.slippageBps) {
      /* GAS was not paid for. The fill is refused, not eaten. */
      this.pushNotification(agent, "SLIPPAGE", "info");
      return;
    }
    const fee = sizeEth * (config.feeBps / 10_000);
    agent.position = {
      pair,
      entryPrice: entry,
      sizeEth,
      tokens: sizeEth / entry,
      openedTick: this.tick,
      holdTicks: verdict.holdTicks,
      feePaidEth: fee,
      unrealizedEth: -fee,
    };
    this.pushTape({
      tick: this.tick,
      agentId: agent.id,
      agentName: agent.name,
      cls: agent.cls,
      pair,
      action: "BUY",
      price: entry,
      sizeEth,
      pnlEth: 0,
      reason: verdict.reason,
    });
  }

  private markToMarket(agent: VillageAgent): void {
    const pos = agent.position;
    if (!pos) return;
    const snap = this.snapshots.get(pos.pair);
    if (!snap) return;
    const value = pos.tokens * snap.last;
    pos.unrealizedEth = value - pos.sizeEth - pos.feePaidEth;
  }

  private closePosition(agent: VillageAgent): void {
    const pos = agent.position;
    if (!pos) return;
    const snap = this.snapshots.get(pos.pair);
    const config = this.configFor(agent);
    const exit = snap ? fillPrice(snap.bids, pos.sizeEth, snap.last) : pos.entryPrice;
    const proceeds = pos.tokens * exit;
    const exitFee = proceeds * (config.feeBps / 10_000);
    let pnl = proceeds - exitFee - pos.sizeEth - pos.feePaidEth;

    if (pnl > 0) {
      const cut = pnl * this.treasuryCutRate;
      this.treasury += cut * COIN_PER_ETH;
      pnl -= cut;
    }
    agent.realizedPnlEth += pnl;
    agent.position = null;

    this.pushTape({
      tick: this.tick,
      agentId: agent.id,
      agentName: agent.name,
      cls: agent.cls,
      pair: pos.pair,
      action: "SELL",
      price: exit,
      sizeEth: pos.sizeEth,
      pnlEth: pnl,
      reason: agent.verdict?.reason ?? "hold expired",
    });
  }

  private async refreshHeldPairs(): Promise<void> {
    const held = new Set<string>();
    for (const a of this.agents) if (a.position) held.add(a.position.pair);
    for (const pair of held) {
      const cfg = { ctx: 24 };
      const snap = await this.market.snapshot(pair, cfg.ctx);
      this.snapshots.set(pair, snap);
    }
  }

  /** One engine tick. Await it; in blocking mode it settles all decisions. */
  async step(): Promise<void> {
    await this.ensurePairs();
    this.tick += 1;
    if (this.onTick) await this.onTick(this.tick);

    for (const b of this.buildings.values()) {
      if (!b.job) continue;
      b.job.ticksLeft -= 1;
      if (b.job.ticksLeft <= 0) this.completeJob(b);
    }

    for (let i = this.boosts.length - 1; i >= 0; i--) {
      this.boosts[i].ticksLeft -= 1;
      if (this.boosts[i].ticksLeft <= 0) this.boosts.splice(i, 1);
    }

    this.treasury += this.passiveYieldPerTick;

    if (this.tick % this.markInterval === 0) await this.refreshHeldPairs();

    for (const agent of this.agents) {
      agent.step(this.ctxFor(agent));
    }

    /* In blocking mode every decision issued this tick is settled before the
       next tick begins. The agent consumes its verdict on the following step,
       so DECIDE lasts exactly one tick and the replay stays reproducible. */
    if (this.pending.length > 0 && (this.blockingDecisions || this.pending.length > 64)) {
      const batch = this.pending;
      this.pending = [];
      await Promise.all(batch);
    }
  }

  async run(ticks: number): Promise<void> {
    for (let i = 0; i < ticks; i++) await this.step();
  }

  /** Everything the UI needs for one frame. */
  view() {
    return {
      tick: this.tick,
      treasury: this.treasury,
      netPnlEth: this.netPnlEth,
      totalSpentUsd: this.totalSpentUsd,
      cutRate: this.treasuryCutRate,
      passiveYield: this.passiveYieldPerTick,
      buildings: [...this.buildings.values()].map((b) => ({ ...b })),
      boosts: this.boosts.map((b) => ({ ...b })),
      agents: this.agents.map((a) => ({
        ...a.toJSON(),
        gx: a.gx,
        gy: a.gy,
        hop: a.hop,
        verdict: a.verdict,
        position: a.position,
        config: this.configFor(a),
      })),
      notifications: this.notifications.slice(-12),
      tape: this.tape.slice(-40),
      snapshots: [...this.snapshots.entries()].map(([pair, s]) => ({ pair, snap: s })),
    };
  }
}

export type VillageView = ReturnType<Village["view"]>;
export { STAT_LABEL };
