import React, { useEffect, useMemo, useRef, useState } from "react";
import { clusters, CopyLedger, parseWatchlist, short, type Source, type WatchWallet, type WebEvent } from "../../spider/engine.js";
import { DEMO_WALLETS, demoEvent } from "../../spider/demo.js";
import { publicRpc, WalletReader } from "../../spider/live.js";
import { SpiderWeb } from "./SpiderWeb.js";
import "./spider.css";
const watchKey = "dv_spider_watch_v1";
function savedWatch() { try { return localStorage.getItem(watchKey)?.slice(0, 6000) ?? ""; } catch { return ""; } }
export default function SpiderRoom({ onClose }: { onClose(): void }) {
  const [source, setSource] = useState<Source>("demo"), [running, setRunning] = useState(true);
  const [copy, setCopy] = useState(false), [watchText, setWatchText] = useState(savedWatch);
  const [liveWallets, setLiveWallets] = useState<WatchWallet[]>(() => { try { return parseWatchlist(savedWatch()); } catch { return []; } });
  const [demoWallets, setDemoWallets] = useState(DEMO_WALLETS), [events, setEvents] = useState<WebEvent[]>([]);
  const [selected, setSelected] = useState<string | null>(null), [error, setError] = useState("");
  const [status, setStatus] = useState("Synthetic wallet feed · virtual execution"), [head, setHead] = useState<number | null>(null);
  const [backlog, setBacklog] = useState(0), [latency, setLatency] = useState<number | null>(null), [now, setNow] = useState(Date.now);
  const [ledger, setLedger] = useState(() => new CopyLedger());
  const [, revision] = useState(0), [feedMs, setFeedMs] = useState<number | null>(null);
  const wallets = source === "demo" ? demoWallets : liveWallets;
  const current = useRef({ copy, ledger, wallets }); current.current = { copy, ledger, wallets };
  const step = useRef(0), root = useRef<HTMLElement>(null), close = useRef<HTMLButtonElement>(null);
  const watchAddresses = liveWallets.map(w => w.address).join(",");
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    close.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); onClose(); }
      if (e.key === "Tab") {
        const focusable = [...(root.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],textarea,input,[tabindex="0"]') ?? [])];
        const first = focusable[0], last = focusable.at(-1);
        if (e.shiftKey && (document.activeElement === first || !root.current?.contains(document.activeElement))) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && (document.activeElement === last || !root.current?.contains(document.activeElement))) { e.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener("keydown", key, true);
    return () => { document.removeEventListener("keydown", key, true); previous?.isConnected && previous.focus(); };
  }, [onClose]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!running) return;
    let alive = true, timer: ReturnType<typeof setTimeout>, failures = 0;
    const abort = new AbortController();
    const accept = (incoming: WebEvent[]) => {
      if (!alive) return;
      const started = performance.now(), context = current.current;
      if (context.copy && source === "demo") for (const e of incoming) context.ledger.handle(e, context.wallets);
      if (context.copy && incoming.length) { setLatency(performance.now() - started); revision(v => v + 1); }
      setEvents(old => {
        const merged = [...new Map([...old, ...incoming].map(e => [e.id, e])).values()];
        return merged.sort((a, b) => b.at - a.at || b.id.localeCompare(a.id)).slice(0, 160);
      });
      setNow(Date.now());
    };
    if (source === "demo") {
      const emit = () => { if (!alive) return; accept([demoEvent(step.current++, Date.now())]); timer = setTimeout(emit, 2000); };
      emit();
    } else {
      if (!liveWallets.length) { setRunning(false); return; }
      const reader = new WalletReader(publicRpc(abort.signal), liveWallets);
      const poll = async () => {
        const started = performance.now();
        try {
          const result = await reader.poll();
          if (!alive) return;
          setFeedMs(performance.now() - started); setHead(result.head); setBacklog(result.backlog);
          if (result.reorg) { setEvents([]); setSelected(null); setStatus("Chain reorganization · rebuilding evidence"); }
          else { accept(result.events); setStatus(`Read through block ${result.scanned ?? "—"} · 2-block lag · not final`); }
          setError(""); failures = 0;
        } catch (e) { if (!alive) return; failures++; setError(e instanceof Error ? e.message : String(e)); setStatus("Feed interrupted · cursor retained"); }
        if (alive) timer = setTimeout(() => void poll(), Math.min(30_000, 2000 * 2 ** failures));
      };
      void poll();
    }
    return () => { alive = false; clearTimeout(timer); abort.abort(); };
  // Target labels do not change which addresses the reader observes.
  }, [running, source, watchAddresses]);
  const groups = useMemo(() => clusters(events, now), [events, now]);
  const visible = selected ? events.filter(e => e.wallet === selected || e.token === selected) : events;
  const changeSource = (next: Source) => {
    if (next === source) return;
    setSource(next); setRunning(false); setCopy(false); setEvents([]); setSelected(null); setError(""); setHead(null); setBacklog(0); setFeedMs(null); setLatency(null);
    setLedger(new CopyLedger()); step.current = 0;
    setStatus(next === "demo" ? "Demo ready · press START WATCHING" : "Add public wallets, then start the live reader");
  };
  const apply = () => {
    try {
      const parsed = parseWatchlist(watchText); if (!parsed.length) throw new Error("Enter at least one wallet.");
      setRunning(false); setLiveWallets(parsed); setEvents([]); setSelected(null); setError(""); setHead(null); setBacklog(0);
      try { localStorage.setItem(watchKey, parsed.map(w => `${w.address} ${w.label}`).join("\n")); setStatus("Watchlist saved in this browser · press START WATCHING"); }
      catch { setStatus("Watchlist ready for this session · browser storage unavailable"); }
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };
  const toggleTarget = (address: string) => {
    const update = (ws: WatchWallet[]) => ws.map(w => w.address === address ? { ...w, smart: !w.smart } : w);
    source === "demo" ? setDemoWallets(update) : setLiveWallets(update);
  };
  return <section className="spider-room" role="dialog" aria-modal="true" aria-label="SPIDER wallet intelligence" ref={root}>
    <div className="spider-shell">
      <header className="spider-header"><div className="spider-brand"><span aria-hidden="true">✳</span><div><h1>SPIDER</h1><p>DEGEN VILLAGE / WALLET INTELLIGENCE</p></div></div><button ref={close} onClick={onClose} aria-label="Close spider room">ESC <b>×</b></button></header>
      <div className="spider-toolbar"><div className="spider-tabs">{(["demo", "live"] as const).map(mode => <button key={mode} aria-pressed={source === mode} onClick={() => changeSource(mode)}>{mode === "demo" ? "DEMO WEB" : "LIVE WALLETS"}</button>)}</div><span className="spider-provenance">{source === "demo" ? "SIMULATED WALLETS & FILLS" : "ROBINHOOD CHAIN / READ ONLY"}</span><button onClick={() => { setRunning(v => !v); setStatus(source === "demo" ? "Synthetic wallet feed · virtual execution" : "Connecting to public RPC…"); }} disabled={source === "live" && !liveWallets.length}>{running ? "PAUSE SPIDER" : "START WATCHING"}</button></div>
      <div className="spider-main"><div className="spider-stage"><div className="spider-stage-title"><span className="spider-kicker">FOLLOW THE THREAD.</span><h2>Every move<br />leaves a <em>signal.</em></h2><p>{source === "demo" ? "A synthetic wallet ecosystem. Watch the web react,\nthen try copying a target with virtual ETH." : "Public wallet transfers, connected as they arrive.\nShared flows are clues, not proof of shared ownership."}</p></div>
        <SpiderWeb wallets={wallets} events={events} selected={selected} onSelect={id => setSelected(old => old === id ? null : id)} paused={!running} />
        <div className="spider-web-caption"><span>{running ? "● WATCHING" : "○ PAUSED"} / {wallets.length} WALLETS</span><span>CLICK A NODE TO INSPECT</span></div>
      </div><aside className="spider-sidebar"><div className="spider-side-heading"><span className="spider-kicker">THE WEB IS LISTENING</span><h2>Wallet signals <b>{events.length.toString().padStart(2, "0")}</b></h2></div>
        <div className="spider-metrics"><div><strong>{groups.length.toString().padStart(2, "0")}</strong><span>FLOW CLUSTERS / 60s</span></div><div><strong>{wallets.filter(w => w.smart).length.toString().padStart(2, "0")}</strong><span>SELECTED TARGETS</span></div><div><strong>{source === "demo" ? "2s" : feedMs === null ? "—" : `${(feedMs / 1000).toFixed(1)}s`}</strong><span>{source === "demo" ? "DEMO EVENT INTERVAL" : "LAST RPC READ TIME"}</span></div></div>
        <div className="spider-stream-heading"><span>{selected ? "SELECTED NODE" : "LATEST ACTIVITY"}</span>{selected && <button onClick={() => setSelected(null)}>SHOW ALL</button>}</div>
        <div className="spider-stream">{!visible.length && <div className="spider-empty"><span>◎</span><h3>{source === "live" ? "Waiting for evidence" : "Listening for movement"}</h3><p>{source === "live" ? "Add wallets and start the reader. Observed token transfers appear here." : "The next synthetic signal will light up a thread."}</p></div>}{visible.slice(0, 20).map(e => <article className="spider-event" key={e.id}><div><b>{e.kind.toUpperCase()}</b><span>{Math.max(0, Math.floor((now - e.at) / 1000))}s ago</span></div><strong>{wallets.find(w => w.address === e.wallet)?.label ?? short(e.wallet)} <i>→</i> {e.symbol ?? short(e.token)}</strong><p>{e.amount}</p><small>{source === "demo" ? "SYNTHETIC SWAP" : "TRANSFER LOG / TRADE DIRECTION UNKNOWN"}</small>{e.tx && <a target="_blank" rel="noreferrer" href={`https://robinhoodchain.blockscout.com/tx/${e.tx}`}>VIEW TRANSACTION ↗</a>}</article>)}</div>
        <p className="spider-feed-state" role="status">{!running ? "Paused. " : ""}{status}{head !== null && ` · Head ${head}`}{backlog > 0 && ` · ${backlog} blocks behind`}</p>{error && <p className="spider-error" role="alert">{error}</p>}
      </aside></div>
      <div className="spider-lower"><section className="spider-panel"><span className="spider-kicker">01 / TARGETS</span><h2>Smart-wallet watchlist</h2><p className="spider-note">Select wallets to follow. Target tags are your choices; profitability is not ranked.</p>
        {source === "live" && <div className="spider-watch-input"><label htmlFor="spider-wallets">PUBLIC ADDRESSES · ONE PER LINE · OPTIONAL LABEL</label><textarea id="spider-wallets" value={watchText} onChange={e => setWatchText(e.target.value)} maxLength={6000} rows={3} spellCheck={false} placeholder="0x… wallet label" /><button onClick={apply}>APPLY WATCHLIST</button><p>ERC-20 transfers only · starts near the current head · no historical P&amp;L or native ETH transfers.</p></div>}
        <div className="spider-wallets">{wallets.map(w => <div key={w.address}><span><strong>{w.label}</strong><small>{source === "demo" ? "SYNTHETIC WALLET" : short(w.address)}</small></span><button aria-pressed={w.smart} aria-label={`Target ${w.label}`} onClick={() => toggleTarget(w.address)}>{w.smart ? "★ TARGET" : "+ WATCH"}</button></div>)}</div>
      </section><section className="spider-panel"><span className="spider-kicker">02 / CONNECTIONS</span><h2>Cluster evidence</h2><p className="spider-note">Two or more watched wallets receiving the same token within the observed minute.</p>{groups.length ? groups.slice(0, 5).map(g => <button className="spider-cluster" key={g.token} onClick={() => setSelected(g.token)}><span><strong>{g.symbol}</strong><small>{g.events} incoming events / 60s</small></span><b>{g.wallets.size} WALLETS ↗</b></button>) : <p className="spider-note">No shared incoming flow observed yet.</p>}<p className="spider-note">Transfers can be airdrops or distributions. A connection does not establish one owner or a coordinated buy.</p></section>
      <section className="spider-panel spider-copy"><span className="spider-kicker">03 / FOLLOW THE MOVE</span><h2>Copy desk <small>VIRTUAL ETH</small></h2><div className="spider-copy-values"><div><strong>{ledger.account.cashEth.toFixed(5)}</strong><span>CASH / ETH</span></div><div><strong>{ledger.exposure.toFixed(5)}</strong><span>EXPOSURE / ETH</span></div></div><button className="spider-primary" disabled={source !== "demo" || !running} aria-pressed={copy} onClick={() => setCopy(v => !v)}>{source !== "demo" ? "LIVE EXECUTION NOT CONNECTED" : copy ? "STOP DEMO COPY" : "START DEMO COPY"}</button><p className="spider-note">0.01 ETH / entry · 0.05 ETH exposure cap · 50 bps price limit · 60 bps assumed fee. New signals only.</p><p className="spider-note">{latency === null ? "Local decision timing appears after a copied signal." : `Last local decision: ${latency.toFixed(2)} ms. This is processing time, not chain inclusion.`}</p>
        {ledger.results.slice(0, 4).map(r => <div className="spider-copy-result" key={r.id}><b>{r.status.toUpperCase()} / {r.symbol}</b><span>{r.reason}</span></div>)}
        {!!ledger.positions.size && <div className="spider-holdings"><strong>OPEN DEMO POSITIONS</strong>{[...ledger.positions.entries()].map(([id, p]) => <span key={id}>{p.symbol} · {p.tokens.toFixed(2)} units · {short(p.wallet)}</span>)}</div>}
        <p className="spider-note">Real copy trading needs verified swaps, live quotes and configured execution limits. No wallet signature is requested here.</p>
      </section></div><footer className="spider-footer"><span>DEGEN VILLAGE / SPIDER INTELLIGENCE</span><span>{source === "demo" ? "DEMO DATA · VIRTUAL FILLS · NO NETWORK TRANSACTIONS" : "PUBLIC RPC · READ ONLY · NO VERIFIED SMART-MONEY RANKING"}</span></footer>
    </div>
  </section>;
}
