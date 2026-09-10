import type { AgentClass, Provider, StrategyParams } from "./types.js";
import { normalizeProvider, normalizeStats, type BoostKind, type Stats } from "./config.js";
import type { GridPos } from "./agent.js";
import { CLASS_STRATEGY } from "./brain.js";
import { BUILDING_DEFS, MAX_BUILDING_LEVEL, type ActiveBoost, type BuildingId, type BuildingState } from "./economy.js";

/**
 * Save format version. Bump it when a field changes meaning; a save from a
 * different version is refused, not guessed at, and the player starts fresh.
 */
export const SAVE_VERSION = 1;
export interface AgentSave {
  id: string;
  name: string;
  cls: AgentClass;
  custom: boolean;
  provider: Provider;
  stats: Stats;
  targetStats: Stats | null;
  strategy: StrategyParams;
  systemSuffix: string;
  home: GridPos;
  level: number;
  xp: number;
  realizedPnlEth: number;
  trades: number;
  wins: number;
  decisions: number;
  skips: number;
  spentUsd: number;
}

export interface VillageSave {
  version: number;
  tick: number;
  treasury: number;
  totalSpentUsd: number;
  buildings: { id: BuildingId; level: number; job: BuildingState["job"] }[];
  boosts: ActiveBoost[];
  agents: AgentSave[];
}

function num(v: unknown, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function nonNeg(v: unknown): number {
  return Math.max(0, num(v));
}

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

const CLASS_SET = new Set<AgentClass>(["SCOUT", "SNIPER", "WHALE", "ARB", "CUSTOM"]);
const BOOST_SET = new Set<BoostKind>(["overclock", "alphaFeed", "leverage", "zeroGas"]);
const BUILDING_SET = new Set<BuildingId>(BUILDING_DEFS.map((d) => d.id));

function parseGrid(v: unknown, fallback: GridPos): GridPos {
  const o = v as Partial<GridPos> | undefined;
  if (!o || typeof o !== "object") return { ...fallback };
  return { gx: num(o.gx, fallback.gx), gy: num(o.gy, fallback.gy) };
}

function parseStrategy(v: unknown, cls: AgentClass): StrategyParams {
  const base = CLASS_STRATEGY[cls] ?? CLASS_STRATEGY.CUSTOM;
  const o = (v ?? {}) as Partial<StrategyParams>;
  const holdMin = Math.max(1, num(o.holdMin, base.holdMin));
  return {
    entryThreshold: num(o.entryThreshold, base.entryThreshold),
    maxCurve: num(o.maxCurve, base.maxCurve),
    holdMin,
    holdMax: Math.max(holdMin, num(o.holdMax, base.holdMax)),
    sizeMult: Math.max(0, num(o.sizeMult, base.sizeMult)),
    requireBookAlign:
      typeof o.requireBookAlign === "boolean" ? o.requireBookAlign : base.requireBookAlign,
  };
}

/**
 * Validates an unknown blob into a VillageSave, or returns null.
 *
 * Every number is coerced and clamped and every id is checked against the set
 * the engine knows. A save is data from disk, which means it is data from
 * anywhere: it gets the same distrust as a model's verdict.
 */
export function parseSave(input: unknown): VillageSave | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Record<string, unknown>;
  if (raw.version !== SAVE_VERSION) return null;
  if (!Array.isArray(raw.agents) || !Array.isArray(raw.buildings)) return null;

  const buildings: VillageSave["buildings"] = [];
  for (const entry of raw.buildings as Record<string, unknown>[]) {
    const id = entry?.id as BuildingId;
    if (!BUILDING_SET.has(id)) continue;
    const level = Math.max(0, Math.min(MAX_BUILDING_LEVEL, Math.floor(nonNeg(entry.level))));
    const jobRaw = entry.job as Record<string, unknown> | null | undefined;
    const job =
      jobRaw && (jobRaw.kind === "build" || jobRaw.kind === "upgrade")
        ? {
            kind: jobRaw.kind as "build" | "upgrade",
            toLevel: Math.max(1, Math.min(MAX_BUILDING_LEVEL, Math.floor(nonNeg(jobRaw.toLevel)))),
            ticksLeft: Math.floor(nonNeg(jobRaw.ticksLeft)),
            totalTicks: Math.max(1, Math.floor(nonNeg(jobRaw.totalTicks))),
          }
        : null;
    buildings.push({ id, level, job });
  }

  const boosts: ActiveBoost[] = [];
  for (const entry of (Array.isArray(raw.boosts) ? raw.boosts : []) as Record<string, unknown>[]) {
    const kind = entry?.kind as BoostKind;
    if (!BOOST_SET.has(kind)) continue;
    const ticksLeft = Math.floor(nonNeg(entry.ticksLeft));
    if (ticksLeft <= 0) continue;
    boosts.push({
      kind,
      ticksLeft,
      totalTicks: Math.max(ticksLeft, Math.floor(nonNeg(entry.totalTicks))),
    });
  }

  const agents: AgentSave[] = [];
  for (const entry of raw.agents as Record<string, unknown>[]) {
    if (!entry || typeof entry !== "object") continue;
    const id = str(entry.id);
    if (!id) continue;
    const cls = CLASS_SET.has(entry.cls as AgentClass) ? (entry.cls as AgentClass) : "CUSTOM";
    agents.push({
      id,
      name: str(entry.name, id).slice(0, 24),
      cls,
      custom: entry.custom === true,
      provider: normalizeProvider(entry.provider),
      stats: normalizeStats((entry.stats ?? {}) as Partial<Stats>),
      targetStats: entry.targetStats
        ? normalizeStats(entry.targetStats as Partial<Stats>)
        : null,
      strategy: parseStrategy(entry.strategy, cls),
      systemSuffix: str(entry.systemSuffix),
      home: parseGrid(entry.home, { gx: 6, gy: 6 }),
      level: Math.floor(nonNeg(entry.level)),
      xp: nonNeg(entry.xp),
      realizedPnlEth: num(entry.realizedPnlEth),
      trades: Math.floor(nonNeg(entry.trades)),
      wins: Math.floor(nonNeg(entry.wins)),
      decisions: Math.floor(nonNeg(entry.decisions)),
      skips: Math.floor(nonNeg(entry.skips)),
      spentUsd: nonNeg(entry.spentUsd),
    });
  }
  if (agents.length === 0) return null;

  return {
    version: SAVE_VERSION,
    tick: Math.floor(nonNeg(raw.tick)),
    treasury: nonNeg(raw.treasury),
    totalSpentUsd: nonNeg(raw.totalSpentUsd),
    buildings,
    boosts,
    agents,
  };
}
