/**
 * DEGEN VILLAGE — the agent: state machine, pathing, training, XP.
 * Zero dependencies, isomorphic.
 *
 *   REST -> TRAIN -> SCAN -> DECIDE -> HOLD -> SETTLE -> REST
 *
 * REST   idle at home, picks the stat it wants and walks to that building
 * TRAIN  stands in the building, burns train ticks, earns the stat point
 * SCAN   walks to the terminal
 * DECIDE waits on market.snapshot + brain.decide
 * HOLD   position open, marked to market every tick
 * SETTLE closes the position, books P&L, pays the treasury cut
 */

import type { AgentClass, AgentState, Provider, Verdict } from "./types.js";
import type { CompiledConfig, StatKey, Stats } from "./config.js";
import {
  MAX_STAT,
  STAT_BUILDING,
  STAT_LABEL,
  normalizeProvider,
  normalizeStats,
} from "./config.js";
import type { StrategyParams } from "./types.js";
import { CLASS_STRATEGY } from "./brain.js";

export interface GridPos {
  gx: number;
  gy: number;
}

export interface OpenPosition {
  pair: string;
  entryPrice: number;
  sizeEth: number;
  /** Token units bought, used to mark the position to market. */
  tokens: number;
  openedTick: number;
  holdTicks: number;
  feePaidEth: number;
  unrealizedEth: number;
}

export type NotifyKind = "stat" | "pnl" | "level" | "info";

export interface AgentTickCtx {
  tick: number;
  config: CompiledConfig;
  /** Grid units per tick, RELAY-boosted. */
  walkSpeed: number;
  /** ACADEMY multiplier on XP earned. */
  xpMult: number;
  /** Level of the building that trains this stat, 1..5. */
  buildingLevel(stat: StatKey): number;
  /** Where that building stands. */
  buildingPos(stat: StatKey): GridPos;
  terminal: GridPos;
  /** Village asks the market and the brain; resolves asynchronously. */
  requestDecision(agent: VillageAgent): void;
  /** Village opens the position (fills, fees, size clamping). */
  openPosition(agent: VillageAgent, verdict: Verdict): void;
  /** Village re-prices the open position. */
  markToMarket(agent: VillageAgent): void;
  /** Village closes the position and books P&L. */
  closePosition(agent: VillageAgent): void;
  notify(agent: VillageAgent, text: string, kind: NotifyKind): void;
  rng(): number;
}

/** Base ticks to complete one training session at building level 1. */
export const BASE_TRAIN_TICKS = 260;
/** Ticks an agent loafs at home before choosing its next building. */
export const BASE_REST_TICKS = 45;
/** XP awarded for one completed training session. */
export const XP_PER_TRAIN = 18;
/** XP awarded for one settled trade, scaled by |P&L| in ETH. */
export const XP_PER_TRADE = 26;
/**
 * Decision cycles an agent runs between training sessions. Training is what
 * changes the config; scanning is what uses it. One-to-one would mean an agent
 * trades roughly twice an hour, so the village trains once and then works.
 */
export const TRAIN_EVERY_CYCLES = 3;

/** Rising cost per level: 60, 105, 150, ... */
export function xpToNext(level: number): number {
  return 60 + Math.max(0, level) * 45;
}

/** Which stat each class reaches for first. */
export const CLASS_PRIORITY: Readonly<Record<AgentClass, readonly StatKey[]>> =
  Object.freeze({
    SCOUT: ["spd", "ptn", "gas", "rsk"],
    SNIPER: ["ptn", "gas", "spd", "rsk"],
    WHALE: ["rsk", "ptn", "gas", "spd"],
    ARB: ["spd", "gas", "rsk", "ptn"],
    CUSTOM: ["ptn", "spd", "rsk", "gas"],
  });

export interface AgentInit {
  id: string;
  name: string;
  cls: AgentClass;
  stats: Partial<Stats>;
  home: GridPos;
  /** House the agent is wired to. Defaults to Anthropic. */
  provider?: Provider;
  strategy?: StrategyParams;
  systemSuffix?: string;
  /** FORGE builds render with a dashed ring and carry their author's target. */
  custom?: boolean;
  /** Target stat allocation a FORGE build trains toward. */
  targetStats?: Partial<Stats>;
  /**
   * Backtest mode: the agent never trains and never gains stat points, so the
   * numbers measure the build the player authored rather than what it grew into.
   */
  frozen?: boolean;
  /** Override the training cadence. */
  trainEvery?: number;
}

export class VillageAgent {
  readonly id: string;
  readonly name: string;
  readonly cls: AgentClass;
  readonly custom: boolean;
  readonly home: GridPos;
  readonly strategy: StrategyParams;
  readonly systemSuffix: string;
  readonly targetStats: Stats | null;
  readonly frozen: boolean;
  readonly trainEvery: number;

  stats: Stats;
  /** Mutable: REWIRE moves a live agent between houses mid-run. */
  provider: Provider;
  level = 0;
  xp = 0;

  state: AgentState = "REST";
  /** Ticks spent in the current state, for UI easing and stall detection. */
  stateTicks = 0;

  gx: number;
  gy: number;
  /** 0..1 hop phase; the ground shadow shrinks as this rises. */
  hop = 0;
  target: GridPos | null = null;

  trainingStat: StatKey = "spd";
  /** Decision cycles completed since the last training session. */
  cyclesSinceTrain = TRAIN_EVERY_CYCLES;
  trainTicksLeft = 0;
  restTicksLeft = 0;

  /** Ticks until the next poll is allowed, from pollIntervalMs. */
  scanCooldown = 0;
  decideBusy = false;
  verdict: Verdict | null = null;
  /** Set by the village when a decision resolves; consumed in DECIDE. */
  pendingVerdict: Verdict | null = null;

  position: OpenPosition | null = null;
  lastPair: string | null = null;

  realizedPnlEth = 0;
  trades = 0;
  wins = 0;
  decisions = 0;
  skips = 0;
  spentUsd = 0;

  constructor(init: AgentInit) {
    this.id = init.id;
    this.name = init.name;
    this.cls = init.cls;
    this.custom = init.custom ?? false;
    this.home = { ...init.home };
    this.strategy = init.strategy ?? { ...CLASS_STRATEGY[init.cls] };
    this.systemSuffix = init.systemSuffix ?? "";
    this.stats = normalizeStats(init.stats);
    this.provider = normalizeProvider(init.provider);
    this.targetStats = init.targetStats ? normalizeStats(init.targetStats) : null;
    this.frozen = init.frozen ?? false;
    this.trainEvery = init.trainEvery ?? TRAIN_EVERY_CYCLES;
    this.gx = init.home.gx;
    this.gy = init.home.gy;
  }

  get unrealizedPnlEth(): number {
    return this.position?.unrealizedEth ?? 0;
  }

  get netPnlEth(): number {
    return this.realizedPnlEth + this.unrealizedPnlEth;
  }

  get winRate(): number {
    return this.trades === 0 ? 0 : this.wins / this.trades;
  }

  /** Stat the agent walks to next: biggest gap from target, else class order. */
  chooseStat(): StatKey {
    if (this.targetStats) {
      let best: StatKey = "spd";
      let bestGap = -Infinity;
      for (const key of CLASS_PRIORITY[this.cls]) {
        const gap = this.targetStats[key] - this.stats[key];
        if (gap > bestGap) {
          bestGap = gap;
          best = key;
        }
      }
      if (bestGap > 0) return best;
    }
    for (const key of CLASS_PRIORITY[this.cls]) {
      if (this.stats[key] < MAX_STAT) return key;
    }
    return CLASS_PRIORITY[this.cls][0];
  }

  private enter(state: AgentState): void {
    this.state = state;
    this.stateTicks = 0;
  }

  /** Manhattan walk: x axis first, then y. Reads cleanly in isometric space. */
  private walkToward(dest: GridPos, speed: number): boolean {
    const dx = dest.gx - this.gx;
    const dy = dest.gy - this.gy;
    const dist = Math.abs(dx) + Math.abs(dy);
    if (dist <= speed) {
      this.gx = dest.gx;
      this.gy = dest.gy;
      this.hop = 0;
      return true;
    }
    let budget = speed;
    if (Math.abs(dx) > 1e-9) {
      const step = Math.min(budget, Math.abs(dx)) * Math.sign(dx);
      this.gx += step;
      budget -= Math.abs(step);
    }
    if (budget > 1e-9 && Math.abs(dy) > 1e-9) {
      const step = Math.min(budget, Math.abs(dy)) * Math.sign(dy);
      this.gy += step;
    }
    this.hop = Math.abs(Math.sin((this.gx + this.gy) * 3.1));
    return false;
  }

  private awardXp(amount: number, ctx: AgentTickCtx): void {
    this.xp += amount;
    while (this.xp >= xpToNext(this.level)) {
      this.xp -= xpToNext(this.level);
      this.level += 1;
      ctx.notify(this, `LEVEL ${this.level}`, "level");
      if (this.frozen) continue;
      const key = this.chooseStat();
      if (this.stats[key] < MAX_STAT) {
        this.stats = { ...this.stats, [key]: this.stats[key] + 1 };
        ctx.notify(this, `+1 ${STAT_LABEL[key]}`, "stat");
      }
    }
  }

  /** One engine tick. Returns the state the agent is in after stepping. */
  step(ctx: AgentTickCtx): AgentState {
    this.stateTicks += 1;
    if (this.scanCooldown > 0) this.scanCooldown -= 1;

    switch (this.state) {
      case "REST": {
        if (this.restTicksLeft > 0) {
          this.restTicksLeft -= 1;
          this.hop = 0;
          break;
        }
        if (this.frozen || this.cyclesSinceTrain < this.trainEvery) {
          this.target = ctx.terminal;
          this.enter("SCAN");
          break;
        }
        this.cyclesSinceTrain = 0;
        this.trainingStat = this.chooseStat();
        this.target = ctx.buildingPos(this.trainingStat);
        this.enter("TRAIN");
        const lvl = ctx.buildingLevel(this.trainingStat);
        this.trainTicksLeft = Math.max(
          40,
          Math.round(BASE_TRAIN_TICKS * (1 - (lvl - 1) * 0.12)),
        );
        break;
      }

      case "TRAIN": {
        const dest = this.target ?? ctx.buildingPos(this.trainingStat);
        const arrived = this.walkToward(dest, ctx.walkSpeed);
        if (!arrived) break;
        this.trainTicksLeft -= 1;
        if (this.trainTicksLeft > 0) break;
        const key = this.trainingStat;
        if (this.stats[key] < MAX_STAT) {
          this.stats = { ...this.stats, [key]: this.stats[key] + 1 };
          ctx.notify(this, `+1 ${STAT_LABEL[key]}`, "stat");
        }
        this.awardXp(XP_PER_TRAIN * ctx.xpMult, ctx);
        this.target = ctx.terminal;
        this.enter("SCAN");
        break;
      }

      case "SCAN": {
        const arrived = this.walkToward(ctx.terminal, ctx.walkSpeed);
        if (!arrived) break;
        if (this.scanCooldown > 0) break;
        this.enter("DECIDE");
        this.pendingVerdict = null;
        this.decideBusy = true;
        ctx.requestDecision(this);
        break;
      }

      case "DECIDE": {
        if (this.pendingVerdict === null) {
          /* Waiting on the network. A stalled call cannot wedge the agent. */
          if (this.stateTicks > 1200) {
            this.decideBusy = false;
            this.pendingVerdict = null;
            this.restTicksLeft = BASE_REST_TICKS;
            this.enter("REST");
          }
          break;
        }
        const verdict = this.pendingVerdict;
        this.pendingVerdict = null;
        this.decideBusy = false;
        this.verdict = verdict;
        this.decisions += 1;
        this.scanCooldown = Math.max(
          1,
          Math.round(ctx.config.pollIntervalMs / 16.6667),
        );
        if (verdict.action === "BUY" && verdict.sizeEth > 0) {
          ctx.openPosition(this, verdict);
          if (this.position) {
            this.enter("HOLD");
          } else {
            this.restTicksLeft = BASE_REST_TICKS;
            this.enter("REST");
          }
        } else if (verdict.action === "SELL" && this.position) {
          this.enter("SETTLE");
        } else {
          this.skips += 1;
          this.cyclesSinceTrain += 1;
          this.restTicksLeft = BASE_REST_TICKS;
          this.enter("REST");
        }
        break;
      }

      case "HOLD": {
        if (!this.position) {
          this.enter("SETTLE");
          break;
        }
        ctx.markToMarket(this);
        const held = ctx.tick - this.position.openedTick;
        if (held >= this.position.holdTicks) this.enter("SETTLE");
        break;
      }

      case "SETTLE": {
        const before = this.realizedPnlEth;
        ctx.closePosition(this);
        const delta = this.realizedPnlEth - before;
        if (delta !== 0) {
          this.trades += 1;
          if (delta > 0) this.wins += 1;
          const sign = delta >= 0 ? "+" : "";
          ctx.notify(this, `${sign}${delta.toFixed(2)} ETH`, "pnl");
          this.awardXp(
            (XP_PER_TRADE + Math.min(60, Math.abs(delta) * 240)) * ctx.xpMult,
            ctx,
          );
        }
        this.cyclesSinceTrain += 1;
        this.target = this.home;
        this.restTicksLeft = BASE_REST_TICKS;
        this.enter("REST");
        break;
      }
    }

    if (this.state === "REST" && this.restTicksLeft > 0) {
      this.walkToward(this.home, ctx.walkSpeed);
    }
    return this.state;
  }

  /** Serializable snapshot for the leaderboard and the HUD. */
  toJSON() {
    return {
      id: this.id,
      name: this.name,
      cls: this.cls,
      custom: this.custom,
      provider: this.provider,
      stats: this.stats,
      level: this.level,
      xp: this.xp,
      state: this.state,
      trades: this.trades,
      wins: this.wins,
      decisions: this.decisions,
      skips: this.skips,
      realizedPnlEth: this.realizedPnlEth,
      unrealizedPnlEth: this.unrealizedPnlEth,
      spentUsd: this.spentUsd,
      building: STAT_BUILDING[this.trainingStat],
    };
  }
}
