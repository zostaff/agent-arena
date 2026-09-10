import type { BoostKind, StatKey } from "./config.js";
import type { GridPos } from "./agent.js";

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
