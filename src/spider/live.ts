import { RH_CHAIN_ID, RH_PUBLIC_RPC } from "../live/rpc.js";
import { addressPattern, type WatchWallet, type WebEvent } from "./engine.js";
export const TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const hash = /^0x[0-9a-fA-F]{64}$/;
const quantity = /^0x[0-9a-fA-F]+$/;
const zero = `0x${"0".repeat(40)}`;
export interface Log { address: string; topics: string[]; data: string; transactionHash: string; blockHash: string; blockNumber: string; logIndex: string; removed?: boolean }
interface Header { number: string; hash: string; timestamp: string }
interface Receipt { transactionHash: string; blockHash: string; status: string; logs: Log[] }
export interface ReadRpc { call<T>(method: string, params: unknown[]): Promise<T> }
const num = (value: string) => {
  if (!quantity.test(value)) throw new Error("Invalid RPC quantity");
  const n = Number(BigInt(value)); if (!Number.isSafeInteger(n)) throw new Error("RPC quantity outside safe range"); return n;
};
const hex = (n: number) => `0x${n.toString(16)}`;
const topic = (address: string) => `0x${address.slice(2).padStart(64, "0")}`;
function topicAddress(value: string) { return /^0x0{24}[0-9a-fA-F]{40}$/.test(value) ? `0x${value.slice(-40)}`.toLowerCase() : null; }
export function transferEvents(log: Log, wallets: readonly WatchWallet[], at: number): WebEvent[] {
  if (!addressPattern.test(log.address) || log.removed || log.topics.length !== 3 || log.topics[0].toLowerCase() !== TRANSFER ||
    !hash.test(log.data) || !hash.test(log.transactionHash) || !hash.test(log.blockHash) || !quantity.test(log.blockNumber) || !quantity.test(log.logIndex)) return [];
  const from = topicAddress(log.topics[1]), to = topicAddress(log.topics[2]);
  if (!from || !to || from === to || from === zero || to === zero || BigInt(log.data) === 0n) return [];
  const block = num(log.blockNumber);
  return wallets.filter(w => w.address === from || w.address === to).map(w => ({
    id: `${RH_CHAIN_ID}:${log.blockHash.toLowerCase()}:${log.transactionHash.toLowerCase()}:${num(log.logIndex)}:${w.address}`,
    wallet: w.address, token: log.address.toLowerCase(), peer: w.address === from ? to : from,
    kind: w.address === from ? "out" : "in", amount: `${BigInt(log.data)} raw units`, source: "live", at,
    block, tx: log.transactionHash.toLowerCase(),
  }));
}
export function publicRpc(signal: AbortSignal): ReadRpc {
  let id = 0;
  return { async call<T>(method: string, params: unknown[]): Promise<T> {
    if (signal.aborted) throw new Error("Monitor stopped");
    const timeout = new AbortController(), stop = () => timeout.abort();
    signal.addEventListener("abort", stop, { once: true });
    const timer = setTimeout(stop, 10_000);
    try {
      const res = await fetch(RH_PUBLIC_RPC, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }), signal: timeout.signal });
      if (!res.ok) throw new Error(`Public RPC HTTP ${res.status}. Retrying with backoff.`);
      const body = await res.json();
      if (body.error || body.result === undefined) throw new Error(body.error?.message ?? "RPC result missing");
      return body.result as T;
    } finally { clearTimeout(timer); signal.removeEventListener("abort", stop); }
  } };
}
export class WalletReader {
  private cursor: number | null = null;
  private cursorHash: string | null = null;
  constructor(private rpc: ReadRpc, private wallets: readonly WatchWallet[]) {
    if (!wallets.length || wallets.length > 12 || wallets.some(w => !addressPattern.test(w.address))) throw new Error("Add 1–12 valid public wallets first.");
  }
  async poll(now = Date.now()) {
    if (num(await this.rpc.call<string>("eth_chainId", [])) !== RH_CHAIN_ID) throw new Error("Wrong chain. Expected Robinhood Chain 4663.");
    const head = num(await this.rpc.call<string>("eth_blockNumber", [])), target = Math.max(0, head - 2);
    const header = async (n: number) => {
      const b = await this.rpc.call<Header | null>("eth_getBlockByNumber", [hex(n), false]);
      if (!b || num(b.number) !== n || !hash.test(b.hash) || num(b.timestamp) * 1000 > now + 5000) throw new Error("Canonical block header unavailable");
      return b;
    };
    if (this.cursor !== null) {
      if (target < this.cursor || (await header(this.cursor)).hash.toLowerCase() !== this.cursorHash) {
        this.cursor = null; this.cursorHash = null;
        return { events: [] as WebEvent[], head, scanned: null, backlog: 0, reorg: true };
      }
      if (target === this.cursor) return { events: [] as WebEvent[], head, scanned: this.cursor, backlog: 0, reorg: false };
    }
    const from = this.cursor === null ? Math.max(0, target - 20) : this.cursor + 1;
    const to = Math.min(target, from + 99), addresses = this.wallets.map(w => topic(w.address));
    const filter = { fromBlock: hex(from), toBlock: hex(to) };
    const lists = await Promise.all([
      this.rpc.call<Log[]>("eth_getLogs", [{ ...filter, topics: [TRANSFER, addresses] }]),
      this.rpc.call<Log[]>("eth_getLogs", [{ ...filter, topics: [TRANSFER, null, addresses] }]),
    ]);
    if (lists.some(l => !Array.isArray(l) || l.length > 1000)) throw new Error("Transfer batch too large; narrow the watchlist.");
    const logs = [...new Map(lists.flat().filter(l => transferEvents(l, this.wallets, now).length).map(l => [`${l.transactionHash}:${l.logIndex}`, l])).values()];
    const txs = [...new Set(logs.map(l => l.transactionHash))];
    if (txs.length > 48) throw new Error("High activity: narrow the watchlist or use a dedicated indexer. Cursor retained.");
    const receipts = new Map<string, Receipt>();
    for (let i = 0; i < txs.length; i += 4) {
      await Promise.all(txs.slice(i, i + 4).map(async tx => {
        const r = await this.rpc.call<Receipt | null>("eth_getTransactionReceipt", [tx]);
        if (!r || r.transactionHash?.toLowerCase() !== tx.toLowerCase()) throw new Error("Receipt unavailable; batch will retry.");
        receipts.set(tx, r);
      }));
    }
    const headers = new Map<number, Header>();
    for (const n of [...new Set([...logs.map(l => num(l.blockNumber)), to])]) {
      if (n < from || n > to) throw new Error("Log outside requested block range");
      headers.set(n, await header(n));
    }
    const events: WebEvent[] = [];
    for (const l of logs) {
      const r = receipts.get(l.transactionHash)!, b = headers.get(num(l.blockNumber))!;
      if (r.status !== "0x1") continue;
      if (r.blockHash?.toLowerCase() !== b.hash.toLowerCase() || l.blockHash.toLowerCase() !== b.hash.toLowerCase()) throw new Error("Block changed during read; batch will retry.");
      if (!Array.isArray(r.logs) || !r.logs.some(other => other.logIndex === l.logIndex && other.address?.toLowerCase() === l.address.toLowerCase() &&
        other.transactionHash?.toLowerCase() === l.transactionHash.toLowerCase() && other.blockHash?.toLowerCase() === l.blockHash.toLowerCase() && !other.removed &&
        other.data?.toLowerCase() === l.data.toLowerCase() && JSON.stringify(other.topics?.map(t => t.toLowerCase())) === JSON.stringify(l.topics.map(t => t.toLowerCase())))) throw new Error("Receipt/log mismatch; batch will retry.");
      events.push(...transferEvents(l, this.wallets, num(b.timestamp) * 1000));
    }
    // Recheck the batch boundary after receipts to avoid publishing a mixed branch.
    const end = headers.get(to)!;
    if ((await header(to)).hash.toLowerCase() !== end.hash.toLowerCase()) throw new Error("Chain changed during read; retrying.");
    this.cursor = to; this.cursorHash = end.hash.toLowerCase();
    events.sort((a, b) => a.block! - b.block! || a.id.localeCompare(b.id));
    return { events, head, scanned: to, backlog: target - to, reorg: false };
  }
}
