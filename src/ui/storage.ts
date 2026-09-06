/**
 * Shared leaderboard storage.
 *
 * The board lives in `window.storage` with `shared: true` so every player
 * writes into the same key. Personal state stays unshared. When the host does
 * not provide window.storage — a plain `vite dev`, a file:// open — everything
 * degrades to localStorage and the board is simply local to that browser.
 */

import type { Stats } from "../core/config.js";
import type { StrategyParams, Provider } from "../core/types.js";

/* v2: builds carry net-of-inference. v1 entries ranked on gross and are not
   comparable, so they are left behind rather than migrated. */
export const BOARD_KEY = "dv_board_v2";
export const ME_KEY = "dv_me";
/** The player's own village. Unshared: nobody else's browser needs it. */
export const VILLAGE_KEY = "dv_village_v1";

interface HostStorage {
  get(key: string, options?: { shared?: boolean }): Promise<unknown>;
  set(key: string, value: unknown, options?: { shared?: boolean }): Promise<unknown>;
}

declare global {
  interface Window {
    storage?: HostStorage;
  }
}

function host(): HostStorage | null {
  if (typeof window === "undefined") return null;
  const s = window.storage;
  if (!s || typeof s.get !== "function" || typeof s.set !== "function") return null;
  return s;
}

async function readKey<T>(key: string, shared: boolean, fallback: T): Promise<T> {
  const h = host();
  if (h) {
    try {
      const value = await h.get(key, { shared });
      if (value === null || value === undefined) return fallback;
      return (typeof value === "string" ? JSON.parse(value) : value) as T;
    } catch {
      /* fall through to localStorage */
    }
  }
  try {
    const raw = globalThis.localStorage?.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

async function writeKey(key: string, value: unknown, shared: boolean): Promise<void> {
  const h = host();
  if (h) {
    try {
      await h.set(key, value, { shared });
      return;
    } catch {
      /* fall through to localStorage */
    }
  }
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify(value));
  } catch {
    /* storage disabled; the board is simply not persisted this session */
  }
}

export interface BuildEntry {
  kind: "BUILD";
  id: string;
  name: string;
  owner: string;
  at: number;
  /** Gross backtest P&L on seed 42. Deterministic, therefore comparable. */
  pnlEth: number;
  /** P&L after the inference bill on this build's house. The ranked number. */
  netEth?: number;
  /** What the run cost in inference, USD. */
  spentUsd?: number;
  winRate: number;
  maxDrawdownEth: number;
  trades: number;
  stats: Stats;
  strategy: StrategyParams;
  systemSuffix: string;
  /** Optional: entries published before houses existed have no provider. */
  provider?: Provider;
}

export interface VillageEntry {
  kind: "VILLAGE";
  id: string;
  name: string;
  owner: string;
  at: number;
  /** Live session net P&L. */
  netPnlEth: number;
  treasury: number;
  ticks: number;
  roster: number;
}

export interface Board {
  builds: BuildEntry[];
  villages: VillageEntry[];
}

export interface Me {
  owner: string;
  lastBuildId: string | null;
}

const EMPTY_BOARD: Board = { builds: [], villages: [] };

export async function loadBoard(): Promise<Board> {
  const board = await readKey<Board>(BOARD_KEY, true, EMPTY_BOARD);
  return {
    builds: Array.isArray(board.builds) ? board.builds : [],
    villages: Array.isArray(board.villages) ? board.villages : [],
  };
}

export async function loadMe(): Promise<Me> {
  const me = await readKey<Me>(ME_KEY, false, { owner: "", lastBuildId: null });
  if (!me.owner) {
    me.owner = `degen-${Math.random().toString(36).slice(2, 7)}`;
    await writeKey(ME_KEY, me, false);
  }
  return me;
}

/**
 * The village survives a reload. Reading returns whatever is on disk; the
 * engine's `parseSave` decides whether it is usable, because validation
 * belongs next to the invariants and not next to the storage adapter.
 */
export async function loadVillageSave(): Promise<unknown> {
  return readKey<unknown>(VILLAGE_KEY, false, null);
}

export async function saveVillage(save: unknown): Promise<void> {
  await writeKey(VILLAGE_KEY, save, false);
}

export async function clearVillageSave(): Promise<void> {
  await writeKey(VILLAGE_KEY, null, false);
}

export async function saveMe(me: Me): Promise<void> {
  await writeKey(ME_KEY, me, false);
}

/** Read-modify-write. Two players publishing at once is a last-writer-wins race. */
export async function publishBuild(entry: BuildEntry): Promise<Board> {
  const board = await loadBoard();
  const builds = board.builds.filter((b) => b.id !== entry.id);
  builds.push(entry);
  /* Ranked on net. An entry from before v2 falls back to its gross figure,
     which is the most favourable reading of it — and it says so in the table. */
  builds.sort((a, b) => (b.netEth ?? b.pnlEth) - (a.netEth ?? a.pnlEth));
  const next: Board = { ...board, builds: builds.slice(0, 50) };
  await writeKey(BOARD_KEY, next, true);
  return next;
}

export async function publishVillage(entry: VillageEntry): Promise<Board> {
  const board = await loadBoard();
  const villages = board.villages.filter((v) => v.id !== entry.id);
  villages.push(entry);
  villages.sort((a, b) => b.netPnlEth - a.netPnlEth);
  const next: Board = { ...board, villages: villages.slice(0, 50) };
  await writeKey(BOARD_KEY, next, true);
  return next;
}

export function isShared(): boolean {
  return host() !== null;
}
