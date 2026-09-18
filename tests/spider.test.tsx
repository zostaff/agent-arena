import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { clusters, CopyLedger, parseWatchlist, type WebEvent } from "../src/spider/engine.js";
import { DEMO_WALLETS, demoEvent } from "../src/spider/demo.js";
import { WalletReader, TRANSFER, transferEvents, type Log, type ReadRpc } from "../src/spider/live.js";
import { spiderKey } from "../src/spider/shortcut.js";
import { SpiderWeb } from "../src/ui/spider/SpiderWeb.js";
import { SpiderEntry } from "../src/ui/spider/SpiderEntry.js";
const addr = (n: number) => `0x${n.toString(16).padStart(40, "0")}`;
const hash = (n: number) => `0x${n.toString(16).padStart(64, "0")}`;
const topic = (n: number) => hash(n);
const wallets = parseWatchlist(`${addr(1)} Alpha\n${addr(2)} Beta`);
const log: Log = { address: addr(99), topics: [TRANSFER, topic(3), topic(1)], data: hash(123), transactionHash: hash(7), blockHash: hash(90), blockNumber: "0x5a", logIndex: "0x0" };
function fixture() {
  let head = 100, branch = 0, fail = false, status = "0x1", mismatch = false;
  const calls: { method: string; params: unknown[] }[] = [];
  const rpc: ReadRpc = { async call<T>(method: string, params: unknown[]): Promise<T> {
    calls.push({ method, params });
    if (method === "eth_chainId") return "0x1237" as T;
    if (method === "eth_blockNumber") return `0x${head.toString(16)}` as T;
    if (method === "eth_getBlockByNumber") { const n = Number(BigInt(params[0] as string)); return { number: params[0], hash: hash(n + branch), timestamp: "0x5a" } as T; }
    if (method === "eth_getLogs") {
      if (fail) throw new Error("RPC down");
      const f = params[0] as { fromBlock: string; toBlock: string };
      return (Number(BigInt(f.fromBlock)) <= 90 && Number(BigInt(f.toBlock)) >= 90 ? [log] : []) as T;
    }
    if (method === "eth_getTransactionReceipt") return { transactionHash: log.transactionHash, blockHash: log.blockHash, status, logs: mismatch ? [] : [log] } as T;
    throw new Error(method);
  } };
  return { reader: new WalletReader(rpc, wallets), calls, rpc, setHead: (n: number) => { head = n; }, reorg: () => { branch = 1000; }, fail: (n: boolean) => { fail = n; }, revert: () => { status = "0x0"; }, mismatch: () => { mismatch = true; } };
}
describe("Spider watchlist and evidence", () => {
  it("validates bounded public wallets without inventing smart-money labels", () => {
    expect(wallets[0]).toEqual({ address: addr(1), label: "Alpha", smart: false });
    expect(() => parseWatchlist(`${addr(1)}\n${addr(1)}`)).toThrow("Duplicate");
    expect(() => parseWatchlist(addr(0))).toThrow("Invalid");
    expect(() => parseWatchlist("demo-wallet-0")).toThrow("Invalid");
    expect(() => parseWatchlist(Array.from({ length: 13 }, (_, i) => addr(i + 1)).join("\n"))).toThrow("12");
  });
  it("decodes incoming and outgoing evidence without claiming swaps", () => {
    const es = transferEvents({ ...log, topics: [TRANSFER, topic(1), topic(2)] }, wallets, 90_000);
    expect(es.map(e => e.kind)).toEqual(["out", "in"]);
    expect(es.every(e => e.source === "live" && !e.snap && e.amount === "123 raw units")).toBe(true);
    expect(es[0].id).not.toBe(es[1].id);
  });
  it("rejects NFT-shaped logs, removed logs, malformed topics, zero/self/mint/burn flows", () => {
    for (const change of [
      { topics: [...log.topics, hash(1)] }, { removed: true }, { data: "0x" },
      { topics: [TRANSFER, hash(0), topic(1)] }, { topics: [TRANSFER, topic(1), hash(0)] },
      { topics: [TRANSFER, topic(1), topic(1)] }, { topics: [TRANSFER, "0xabc", topic(1)] }, { data: hash(0) },
    ]) expect(transferEvents({ ...log, ...change }, wallets, 90_000)).toEqual([]);
  });
  it("requires separate wallets, deduplicates evidence, expires clusters and separates sources", () => {
    const a = demoEvent(0, 1000), b = demoEvent(1, 2000);
    expect(clusters([a, a], 2500)).toEqual([]);
    expect(clusters([a, b, a], 2500)[0].events).toBe(2);
    expect(clusters([a, { ...b, source: "live" }], 2500)).toEqual([]);
    expect(clusters([a, b], 63_000)).toEqual([]);
    expect(clusters([a, b], 500)).toEqual([]);
  });
  it("renders eight articulated legs with finite geometry and an explicit entry", () => {
    const html = renderToStaticMarkup(<SpiderWeb wallets={DEMO_WALLETS} events={[demoEvent(0, 0)]} selected={null} onSelect={() => {}} paused={false} />);
    expect(html.match(/data-spider-leg=/g)).toHaveLength(8);
    expect(html).toContain('data-spider-model="projected-3d"');
    expect(html).not.toMatch(/NaN|Infinity/);
    expect(renderToStaticMarkup(<SpiderEntry />)).toContain("SPIDER");
  });
  it("only opens the shortcut outside editing fields", () => {
    const buf = { current: "" }, event = { target: null, key: "", ctrlKey: false, metaKey: false, altKey: false, repeat: false, isComposing: false };
    expect([..."spider"].map(key => spiderKey(buf, { ...event, key }))).toEqual([false, false, false, false, false, true]);
    expect([..."spider"].some(key => spiderKey(buf, { ...event, key, target: { tagName: "TEXTAREA" } as unknown as EventTarget }))).toBe(false);
  });
});
describe("Spider bounded virtual copy desk", () => {
  it("copies a new demo buy and source exit against asks/bids with fees", () => {
    const ledger = new CopyLedger(() => 1000), buy = demoEvent(0, 1000);
    const entered = ledger.handle(buy, DEMO_WALLETS);
    expect(entered.status).toBe("entered");
    expect(ledger.account.cashEth).toBeCloseTo(.98994, 10);
    expect(ledger.exposure).toBeCloseTo(.01006, 10);
    const exited = ledger.handle({ ...buy, id: "exit", kind: "sell" }, []);
    expect(exited.status).toBe("exited");
    expect(ledger.positions.size).toBe(0);
    expect(ledger.account.cashEth - 1).toBeCloseTo(ledger.realized, 10);
    expect(ledger.realized).toBeLessThan(0);
  });
  it("never executes a live transfer or an unselected target", () => {
    const ledger = new CopyLedger(() => 1000), e = demoEvent(0, 1000);
    expect(ledger.handle({ ...e, source: "live" }, DEMO_WALLETS).status).toBe("skipped");
    expect(ledger.handle({ ...e, id: "unselected" }, []).status).toBe("skipped");
    expect(ledger.account.cashEth).toBe(1);
  });
  it("rejects replay, stale/future signals and repeated wallet/token exposure", () => {
    const ledger = new CopyLedger(() => 10_000), e = demoEvent(0, 10_000);
    expect(ledger.handle(e, DEMO_WALLETS).status).toBe("entered");
    expect(ledger.handle(e, DEMO_WALLETS).reason).toBe("Already processed");
    expect(ledger.handle({ ...e, id: "again" }, DEMO_WALLETS).reason).toContain("already held");
    for (const at of [1000, 10_001, NaN]) expect(ledger.handle({ ...e, id: String(at), at }, DEMO_WALLETS).status).toBe("skipped");
    expect(ledger.positions.size).toBe(1);
  });
  it("caps total exposure and refuses missing depth", () => {
    const ledger = new CopyLedger(() => 1000);
    for (let i = 0; i < 10; i++) ledger.handle({ ...demoEvent(i % 4, 1000), id: `buy-${i}`, token: `token-${i}` }, DEMO_WALLETS);
    expect(ledger.positions.size).toBe(4);
    expect(ledger.exposure).toBeLessThanOrEqual(.05);
    const empty = new CopyLedger(() => 1000), e = demoEvent(0, 1000);
    expect(empty.handle({ ...e, snap: { ...e.snap!, asks: [] } }, DEMO_WALLETS).status).toBe("skipped");
    expect(empty.account.cashEth).toBe(1);
  });
});
describe("Spider live reader", () => {
  it("reads canonical successful transfer receipts once, then advances contiguously", async () => {
    const f = fixture(), first = await f.reader.poll(100_000);
    expect(first.events).toHaveLength(1);
    expect(first.events[0].at).toBe(90_000);
    expect(first.scanned).toBe(98);
    expect(f.calls.filter(c => c.method === "eth_getTransactionReceipt")).toHaveLength(1);
    expect((await f.reader.poll(100_000)).events).toEqual([]);
    f.setHead(103); const next = await f.reader.poll(100_000);
    expect(next.scanned).toBe(101);
    const filters = f.calls.filter(c => c.method === "eth_getLogs");
    expect(filters.at(-1)?.params[0]).toMatchObject({ fromBlock: "0x63", toBlock: "0x65" });
    expect(f.calls.some(c => /send|sign|Accounts/.test(c.method))).toBe(false);
  });
  it("retains the cursor on RPC failures and reports bounded backlog", async () => {
    const f = fixture(); await f.reader.poll(100_000); f.setHead(400); f.fail(true);
    await expect(f.reader.poll(100_000)).rejects.toThrow("RPC down");
    f.fail(false); const result = await f.reader.poll(100_000);
    expect(result.scanned).toBe(198); expect(result.backlog).toBe(200);
  });
  it("signals a reorg and clears the cursor instead of retaining old evidence", async () => {
    const f = fixture(); await f.reader.poll(100_000); f.reorg();
    expect((await f.reader.poll(100_000)).reorg).toBe(true);
  });
  it("refuses the wrong chain before looking at activity", async () => {
    const rpc: ReadRpc = { async call<T>() { return "0x1" as T; } };
    await expect(new WalletReader(rpc, wallets).poll()).rejects.toThrow("Wrong chain");
  });
  it("ignores reverted receipts and refuses uncorroborated logs", async () => {
    const f = fixture(); f.revert(); expect((await f.reader.poll(100_000)).events).toEqual([]);
    const bad = fixture(); bad.mismatch(); await expect(bad.reader.poll(100_000)).rejects.toThrow("Receipt/log mismatch");
  });
});
