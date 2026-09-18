import { PaperAccount, type PaperFill } from "../core/paper.js";
import type { Snapshot } from "../core/types.js";

export type Source = "demo" | "live";
export interface WatchWallet { address: string; label: string; smart: boolean }
export interface WebEvent {
  id: string; wallet: string; token: string; peer: string; at: number;
  kind: "buy" | "sell" | "in" | "out"; source: Source; amount: string;
  tx?: string; block?: number; symbol?: string; snap?: Snapshot;
}
export const addressPattern = /^0x[0-9a-fA-F]{40}$/;
export const short = (s: string) => s.length > 15 ? `${s.slice(0, 6)}…${s.slice(-4)}` : s;
export function parseWatchlist(value: string): WatchWallet[] {
  const lines = value.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
  if (lines.length > 12) throw new Error("Watch at most 12 wallets at once.");
  const seen = new Set<string>();
  return lines.map((line, i) => {
    const [raw, ...name] = line.split(/\s+/), address = raw.toLowerCase();
    if (!addressPattern.test(address) || /^0x0{40}$/.test(address)) throw new Error(`Invalid wallet on line ${i + 1}.`);
    if (seen.has(address)) throw new Error(`Duplicate wallet on line ${i + 1}.`);
    seen.add(address);
    return { address, label: name.join(" ").slice(0, 32) || short(address), smart: false };
  });
}
export function clusters(events: readonly WebEvent[], now: number) {
  const map = new Map<string, { token: string; symbol: string; wallets: Set<string>; events: number }>();
  const seen = new Set<string>();
  for (const e of events) {
    if (seen.has(e.id) || !Number.isFinite(e.at) || e.at > now || now - e.at > 60_000 || !["in", "buy"].includes(e.kind)) continue;
    seen.add(e.id);
    const key = `${e.source}:${e.token}`;
    const group = map.get(key) ?? { token: e.token, symbol: e.symbol ?? short(e.token), wallets: new Set<string>(), events: 0 };
    group.wallets.add(e.wallet); group.events++; map.set(key, group);
  }
  return [...map.values()].filter(g => g.wallets.size >= 2).sort((a, b) => b.wallets.size - a.wallets.size || a.token.localeCompare(b.token));
}
export interface CopyPosition { wallet: string; token: string; symbol: string; tokens: number; cost: number; at: number }
export interface CopyResult { id: string; status: "entered" | "exited" | "skipped"; reason: string; symbol: string; fill?: PaperFill }
export class CopyLedger {
  readonly account: PaperAccount;
  readonly positions = new Map<string, CopyPosition>();
  private seen = new Set<string>();
  readonly results: CopyResult[] = [];
  realized = 0;
  constructor(private now: () => number = Date.now) { this.account = new PaperAccount(1, 60, now); }
  get exposure() { return [...this.positions.values()].reduce((sum, p) => sum + p.cost, 0); }
  handle(e: WebEvent, watched: readonly WatchWallet[]): CopyResult {
    const done = (status: CopyResult["status"], reason: string, fill?: PaperFill) => {
      const result = { id: e.id, status, reason, fill, symbol: e.symbol ?? short(e.token) };
      this.results.unshift(result); this.results.splice(40); return result;
    };
    if (this.seen.has(e.id)) return { id: e.id, status: "skipped", reason: "Already processed", symbol: e.symbol ?? e.token };
    this.seen.add(e.id);
    if (this.seen.size > 5000) this.seen.delete(this.seen.values().next().value!);
    if (e.source !== "demo" || !["buy", "sell"].includes(e.kind)) return done("skipped", "Transfer evidence cannot authorize a trade");
    if (!Number.isFinite(e.at) || e.at > this.now() || this.now() - e.at > 5000 || !e.snap) return done("skipped", "Signal expired or quote unavailable");
    const key = `${e.wallet}:${e.token}`, existing = this.positions.get(key);
    if (e.kind === "sell") {
      if (!existing) return done("skipped", "No copied position to exit");
      const fill = this.account.sell(e.snap, existing.tokens, 50);
      if (!fill) return done("skipped", "Exit quote expired or depth insufficient");
      this.positions.delete(key); this.realized += fill.quote - fill.fee - existing.cost;
      return done("exited", "Source exit copied into virtual bids", fill);
    }
    if (!watched.some(w => w.address === e.wallet && w.smart)) return done("skipped", "Wallet is not a selected copy target");
    if (existing) return done("skipped", "This wallet/token is already held");
    if (this.exposure + 0.01006 > 0.05) return done("skipped", "0.05 ETH exposure limit");
    const fill = this.account.buy(e.snap, 0.01, 50);
    if (!fill) return done("skipped", "Quote expired, depth insufficient or cash exhausted");
    this.positions.set(key, { wallet: e.wallet, token: e.token, symbol: e.symbol ?? short(e.token), tokens: fill.tokens, cost: fill.quote + fill.fee, at: this.now() });
    return done("entered", "Source buy copied into virtual asks", fill);
  }
}
