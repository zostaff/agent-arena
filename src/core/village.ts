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
  Verdict,
} from "./types.js";
import type { BoostKind, CompiledConfig, Stats } from "./config.js";
import {
  compileConfig,
  normalizeProvider,
  PROVIDER_META,
  STAT_LABEL,
} from "./config.js";
import { CLASS_LENS, CLASS_STRATEGY } from "./brain.js";
import { PaperAccount } from "./paper.js";
import { fillPrice } from "./market.js";
import { skipVerdict } from "./types.js";
import type { AgentInit, AgentTickCtx, GridPos, NotifyKind } from "./agent.js";
import { VillageAgent } from "./agent.js";
import { parseBuild, type CustomAgentSpec } from "./build.js";

import {
  COIN_PER_ETH,
  MARK_INTERVAL,
  BASE_TREASURY_CUT,
  MINT_CUT_PER_LEVEL,
  MAX_CUSTOM_AGENTS,
  CUSTOM_DEPLOY_COST,
  REWIRE_COST,
  BASE_WALK_SPEED,
  BUILDING_DEFS,
  TERMINAL_POS,
  UPGRADE_COST,
  UPGRADE_TICKS,
  CONSTRUCTION_TICKS,
  RUSH_RATE,
  MAX_BUILDING_LEVEL,
  BOOST_DEFS,
  type BuildingId,
  type BoostDef,
  type BuildingState,
  type ActiveBoost,
} from "./economy.js";
import { parseSave, SAVE_VERSION, type VillageSave } from "./save.js";

export type { CustomAgentSpec } from "./build.js";
export {
  GRID,
  COIN_PER_ETH,
  MARK_INTERVAL,
  BASE_TREASURY_CUT,
  MINT_CUT_PER_LEVEL,
  MAX_CUSTOM_AGENTS,
  CUSTOM_DEPLOY_COST,
  REWIRE_COST,
  BASE_WALK_SPEED,
  BUILDING_DEFS,
  TERMINAL_POS,
  UPGRADE_COST,
  UPGRADE_TICKS,
  CONSTRUCTION_TICKS,
  RUSH_RATE,
  MAX_BUILDING_LEVEL,
  BOOST_DEFS,
  type BuildingId,
  type BuildingDef,
  type BoostDef,
  type BuildingState,
  type ActiveBoost,
} from "./economy.js";
export { parseSave, SAVE_VERSION, type AgentSave, type VillageSave } from "./save.js";

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
  provider: Provider;
  cls: AgentClass;
  pair: string;
  action: "BUY" | "SELL";
  price: number;
  sizeEth: number;
  pnlEth: number;
  reason: string;
}

export interface VillageOptions {
  market: Market;
  brain: Brain;
  /** Deterministic RNG. Sim passes a seeded mulberry32; live may pass Math.random. */
  rng?: () => number;
  /** Await every decision inline. Required for deterministic replays. */
  blockingDecisions?: boolean;
  startingTreasury?: number;
  paperAccount?: PaperAccount;
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
    FLY: { spd: 9, rsk: 7, ptn: 2, gas: 8 },
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
  readonly paperAccount?: PaperAccount;
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
    this.paperAccount = opts.paperAccount;
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

  /* ------------------------------------------------------------------ save */

  /**
   * A serialisable village. What survives: progress the player paid for —
   * treasury, building levels and running jobs, active boosts, every agent's
   * stats, level, XP, house and record.
   *
   * What does NOT survive, deliberately: **open positions**. A position is
   * priced against a market that no longer exists after a reload, so carrying
   * one over would mean inventing its P&L. Unrealised P&L is discarded rather
   * than banked — the trade never closed, so it never counted.
   *
   * The walk, the current state and the training timer are not saved either:
   * agents resume at REST at home. That is cosmetic; the config they compile
   * to on the next tick is identical.
   */
  save(): VillageSave {
    return {
      version: SAVE_VERSION,
      tick: this.tick,
      treasury: this.treasury,
      totalSpentUsd: this.totalSpentUsd,
      buildings: [...this.buildings.values()].map((b) => ({
        id: b.id,
        level: b.level,
        job: b.job ? { ...b.job } : null,
      })),
      boosts: this.boosts.map((b) => ({ ...b })),
      agents: this.agents.map((a) => ({
        id: a.id,
        name: a.name,
        cls: a.cls,
        custom: a.custom,
        provider: a.provider,
        stats: { ...a.stats },
        targetStats: a.targetStats ? { ...a.targetStats } : null,
        strategy: { ...a.strategy },
        systemSuffix: a.systemSuffix,
        home: { ...a.home },
        level: a.level,
        xp: a.xp,
        realizedPnlEth: a.realizedPnlEth,
        trades: a.trades,
        wins: a.wins,
        decisions: a.decisions,
        skips: a.skips,
        spentUsd: a.spentUsd,
      })),
    };
  }

  /**
   * Rebuilds this village from a save. Returns false and changes NOTHING if
   * the save is from another version or is not shaped like a save — a corrupt
   * blob in someone's browser must not take the game down with it.
   */
  restore(save: unknown): boolean {
    const parsed = parseSave(save);
    if (!parsed) return false;

    this.tick = parsed.tick;
    this.treasury = parsed.treasury;
    this.totalSpentUsd = parsed.totalSpentUsd;

    for (const def of BUILDING_DEFS) {
      const saved = parsed.buildings.find((b) => b.id === def.id);
      this.buildings.set(def.id, {
        id: def.id,
        level: saved ? saved.level : def.prebuilt ? 1 : 0,
        pos: def.pos,
        trains: def.trains,
        job: saved?.job ?? null,
      });
    }

    this.boosts = parsed.boosts;

    this.agents = parsed.agents.map((a) => {
      const agent = new VillageAgent({
        id: a.id,
        name: a.name,
        cls: a.cls,
        stats: a.stats,
        targetStats: a.targetStats ?? undefined,
        home: a.home,
        strategy: a.strategy,
        systemSuffix: a.systemSuffix,
        custom: a.custom,
        provider: a.provider,
      });
      agent.level = a.level;
      agent.xp = a.xp;
      agent.realizedPnlEth = a.realizedPnlEth;
      agent.trades = a.trades;
      agent.wins = a.wins;
      agent.decisions = a.decisions;
      agent.skips = a.skips;
      agent.spentUsd = a.spentUsd;
      return agent;
    });

    this.notifications = [];
    this.tape = [];
    this.snapshots.clear();
    return true;
  }

  /* ---------------------------------------------------------------- roster */

  addAgent(init: AgentInit): VillageAgent {
    const agent = new VillageAgent(init);
    this.agents.push(agent);
    return agent;
  }

  get customCount(): number {
    return this.agents.filter((a) => a.custom && a.cls !== "FLY").length;
  }

  /** DEPLOY from FORGE. Costs 150 coins, capped at 4 custom agents. */
  deployCustom(spec: CustomAgentSpec): VillageAgent | null {
    const parsed = parseBuild(spec);
    if (!parsed.ok) return null;
    spec = parsed.draft;
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
    if (agent.state === "DECIDE" || agent.decideBusy || agent.pendingVerdict) return false;
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

  /**
   * A market that reads a live chain can be slow or briefly unreachable. That
   * is a reason to have no pairs this tick, never a reason to stop the village.
   */
  private async ensurePairs(): Promise<void> {
    if (this.pairs.length > 0) return;
    try {
      this.pairs = await this.market.listPairs();
    } catch {
      this.pairs = [];
    }
  }

  /**
   * Null when the market has not named a pair yet. It used to fall back to a
   * hard-coded "$RUG", which in paper mode meant an agent trading a ticker that
   * does not exist on chain — exactly the invention this project refuses.
   */
  private nextPair(): string | null {
    if (this.pairs.length === 0) return null;
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
    if (pair === null) {
      /* No universe yet: skip this cycle rather than invent something to trade.
         The agent tries again on its next poll, by which time the chain has
         usually answered. */
      agent.pendingVerdict = skipVerdict("no pairs yet");
      return;
    }
    agent.lastPair = pair;
    const opts = this.brainOpts(agent, config);
    const work = (async () => {
      const snap = await this.market.snapshot(pair, config.ctxCandles);
      this.snapshots.set(pair, snap);
      const verdict = await this.brain.decide(snap, opts);
      agent.verdictProvider = config.provider;
      agent.pendingVerdict = verdict;
      agent.spentUsd += config.costPerDecision;
      this.totalSpentUsd += config.costPerDecision;
    })().catch(() => {
      this.snapshots.delete(pair);
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
    if (!Number.isFinite(sizeEth) || sizeEth <= 0) return;

    const paperFill = this.paperAccount?.buy(snap, sizeEth, config.slippageBps);
    if (this.paperAccount && !paperFill) return;
    const entry = paperFill?.price ?? fillPrice(snap.asks, sizeEth, snap.last);
    const slipBps = snap.last > 0 ? ((entry - snap.last) / snap.last) * 10_000 : 0;
    if (!paperFill && slipBps > config.slippageBps) {
      /* GAS was not paid for. The fill is refused, not eaten. */
      this.pushNotification(agent, "SLIPPAGE", "info");
      return;
    }
    const fee = paperFill?.fee ?? sizeEth * (config.feeBps / 10_000);
    agent.position = {
      pair,
      provider: agent.verdictProvider ?? agent.provider,
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
      provider: agent.position.provider ?? agent.provider,
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
    if (!snap || (this.paperAccount && !this.paperAccount.fresh(snap))) return;
    const value = pos.tokens * snap.last;
    pos.unrealizedEth = value - pos.sizeEth - pos.feePaidEth;
  }

  private closePosition(agent: VillageAgent): void {
    const pos = agent.position;
    if (!pos) return;
    const snap = this.snapshots.get(pos.pair);
    const config = this.configFor(agent);
    const paperFill = snap ? this.paperAccount?.sell(snap, pos.tokens, config.slippageBps) : null;
    if (this.paperAccount && !paperFill) return;
    const exit = paperFill?.price ?? (snap ? fillPrice(snap.bids, pos.sizeEth, snap.last) : pos.entryPrice);
    const proceeds = pos.tokens * exit;
    const exitFee = paperFill?.fee ?? proceeds * (config.feeBps / 10_000);
    let pnl = proceeds - exitFee - pos.sizeEth - pos.feePaidEth;

    if (pnl > 0 && !this.paperAccount) {
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
      provider: pos.provider ?? agent.provider,
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
      try {
        const snap = await this.market.snapshot(pair, cfg.ctx);
        this.snapshots.set(pair, snap);
      } catch {
        // No quote is preferable to settling at an obsolete price.
        this.snapshots.delete(pair);
      }
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
      paperCashEth: this.paperAccount?.cashEth,
      paperFeeBps: this.paperAccount?.feeBps,
      paperPnlEth: this.paperAccount
        ? this.agents.reduce((sum, a) => sum + a.realizedPnlEth + a.unrealizedPnlEth, 0)
        : undefined,
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
