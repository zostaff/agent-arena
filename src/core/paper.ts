/** Virtual ETH ledger. Pure arithmetic; the wall clock is injected by the caller. */
import type { BookLevel, Snapshot } from "./types.js";

export interface PaperFill { price: number; tokens: number; quote: number; fee: number }

export class PaperAccount {
  cashEth: number;
  constructor(
    readonly initialEth = 10,
    readonly feeBps = 60,
    private readonly now: () => number = Date.now,
  ) {
    if (!Number.isFinite(initialEth) || initialEth <= 0 || !Number.isFinite(feeBps) || feeBps < 0 || feeBps > 1000) {
      throw new Error("Invalid paper account configuration");
    }
    this.cashEth = initialEth;
  }

  fresh(snap: Snapshot): boolean {
    return Number.isFinite(snap.validUntil) && this.now() < snap.validUntil! &&
      Number.isFinite(snap.last) && snap.last > 0;
  }

  private fill(snap: Snapshot, amount: number, buying: boolean, slippageBps: number): PaperFill | null {
    if (!this.fresh(snap) || !Number.isFinite(amount) || amount <= 0 ||
      !Number.isFinite(slippageBps) || slippageBps < 0) return null;
    const levels: BookLevel[] = buying ? snap.asks : snap.bids;
    let remaining = amount, quote = 0, tokens = 0;
    for (const level of levels) {
      if (!Number.isFinite(level.price) || level.price <= 0 || !Number.isFinite(level.size) || level.size <= 0) return null;
      const take = Math.min(remaining, buying ? level.size : level.size / level.price);
      quote += buying ? take : take * level.price;
      tokens += buying ? take / level.price : take;
      remaining -= take;
      if (remaining <= amount * 1e-12) break;
    }
    if (remaining > amount * 1e-12 || tokens <= 0) return null;
    const price = quote / tokens;
    const slip = (buying ? price / snap.last - 1 : 1 - price / snap.last) * 10000;
    if (slip > slippageBps) return null;
    return { price, tokens, quote, fee: quote * this.feeBps / 10000 };
  }

  buy(snap: Snapshot, sizeEth: number, slippageBps: number): PaperFill | null {
    const fill = this.fill(snap, sizeEth, true, slippageBps);
    if (!fill || fill.quote + fill.fee > this.cashEth) return null;
    this.cashEth -= fill.quote + fill.fee;
    return fill;
  }

  /** Caller owns positions and passes only its held token quantity. */
  sell(snap: Snapshot, tokens: number, slippageBps: number): PaperFill | null {
    const fill = this.fill(snap, tokens, false, slippageBps);
    if (fill) this.cashEth += fill.quote - fill.fee;
    return fill;
  }
}
