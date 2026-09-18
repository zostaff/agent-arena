import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import type { VillageView } from "../../core/village.js";
import type { MarketMode } from "../useMarketSession.js";
import { attachFrogShortcut } from "../../frog/shortcut.js";
import { contactPoint, scanRadar, WATCHERS, type Contact, type Pattern } from "../../frog/radar.js";
import { FrogModel } from "./FrogModel.js";
import "./frog.css";

type Props = { ui?: Partial<VillageView> | null; mode?: MarketMode };
const STATIONS = [{ x: 154, y: 379 }, { x: 360, y: 441 }, { x: 566, y: 379 }];
const EMPTY_COINS: VillageView["snapshots"] = [];

function Pond({ contacts, tick, selected }: { contacts: Contact[]; tick: number; selected: Pattern | "all" }) {
  const id = useId().replace(/:/g, "");
  const visible = contacts.filter(c => selected === "all" || c.pattern === selected).slice(0, 24);
  return <svg className="frog-pond" viewBox="0 0 720 530" role="img" aria-label="Three frogs watching current pattern contacts on a radar pond">
    <defs>
      <radialGradient id={`${id}-water`}><stop stopColor="#34422a" /><stop offset="1" stopColor="#16241b" /></radialGradient>
      <linearGradient id={`${id}-beam`} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#ccff00" stopOpacity=".25" /><stop offset="1" stopColor="#ccff00" stopOpacity="0" /></linearGradient>
    </defs>
    <ellipse cx="360" cy="269" rx="285" ry="222" fill="#101a13" stroke="#3e4927" />
    <ellipse cx="360" cy="265" rx="270" ry="208" fill="none" stroke="#5a6233" strokeDasharray="2 12" />
    <circle cx="360" cy="240" r="192" fill={`url(#${id}-water)`} stroke="#879953" strokeOpacity=".5" />
    {[48, 96, 144, 190].map(r => <circle key={r} cx="360" cy="240" r={r} fill="none" stroke="#a1bb70" strokeOpacity=".18" />)}
    <path d="M170 240H550 M360 50V430 M226 106L494 374 M226 374L494 106" stroke="#a1bb70" strokeOpacity=".14" />
    <g className="frog-motion" data-frog-sweep transform={`rotate(${(tick * 1.2) % 360} 360 240)`}>
      <path d="M360 240L360 50A190 190 0 0 1 525 145Z" fill={`url(#${id}-beam)`} />
      <path d="M360 240V50" stroke="#ccff00" strokeOpacity=".65" />
    </g>
    <circle cx="360" cy="240" r="4" fill="#caff77" />
    {[0, 1, 2, 3].map(i => <text key={i} x={[360, 567, 360, 153][i]} y={[36, 245, 451, 245][i]} textAnchor="middle" fill="#909e71" fontSize="10">{["N / OBSERVE", "E", "S", "W"][i]}</text>)}
    {[0, 1, 2, 3, 4, 5].map(i => <g key={i} transform={`translate(${[97, 615, 82, 631, 228, 490][i]} ${[230, 252, 308, 328, 465, 459][i]})`} fill="none" stroke="#687e3e" strokeWidth="2">
      <path d="M0 15Q-12-3-7-21 M0 15Q9-7 14-14 M0 15V-30" /><path d="M0-29V-39" stroke="#a6a165" strokeWidth="5" strokeLinecap="round" />
    </g>)}
    {visible.map(c => {
      const p = contactPoint(c.id), color = WATCHERS.find(w => w.id === c.pattern)!.color;
      return <g key={c.id} data-frog-contact={c.id} transform={`translate(${p.x.toFixed(2)} ${p.y.toFixed(2)})`}>
        <circle r="13" fill={color} opacity=".08" /><circle r="7" fill="none" stroke={color} opacity=".65" />
        <circle r="3" fill={color} /><text y="-18" textAnchor="middle" fill={color} fontSize="10">{c.pair.slice(0, 16)}</text>
      </g>;
    })}
    {WATCHERS.map((w, station) => {
      const pos = STATIONS[station], contact = visible.find(c => c.pattern === w.id);
      const point = contact && contactPoint(contact.id), catching = point && (Math.floor(tick / 12) + station * 3) % 12 < 4;
      return <g key={w.id} opacity={selected === "all" || selected === w.id ? 1 : 0.4}>
        {catching && <path className="frog-motion" data-frog-tongue={w.id}
          d={`M${pos.x} ${pos.y + 10}Q${pos.x} ${point.y + 35} ${point.x} ${point.y}`}
          stroke="#e4a5a1" strokeWidth="4" fill="none" strokeLinecap="round" />}
        <g transform={`translate(${pos.x} ${pos.y})`}><FrogModel tick={tick} station={station} active={Boolean(contact)} color={w.color} /></g>
        <text x={pos.x} y={pos.y + 79} fill={w.color} textAnchor="middle" fontSize="11" letterSpacing="3">{w.name}</text>
      </g>;
    })}
    {!visible.length && <text x="360" y="207" fill="#a7b994" fontSize="11" textAnchor="middle" letterSpacing="2">LISTENING FOR A MATCH</text>}
  </svg>;
}

export function FrogRadar({ ui, mode = "SIM", onClose }: Props & { onClose: () => void }) {
  const [selected, setSelected] = useState<Pattern | "all">("all");
  const [reducedMotion, setReducedMotion] = useState(false);
  const root = useRef<HTMLElement>(null), close = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const tick = Number.isFinite(ui?.tick) ? Math.max(0, ui!.tick!) : 0;
  const coins = ui?.snapshots ?? EMPTY_COINS;
  // App publishes a view on paused frames too, so expired exchange data clears.
  const now = Date.now();
  const scan = useMemo(() => scanRadar(coins, now), [coins, now]);
  const contacts = scan.contacts.filter(c => selected === "all" || c.pattern === selected);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    close.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); onClose(); }
      if (e.key === "Tab") {
        const buttons = [...(root.current?.querySelectorAll<HTMLButtonElement>('button:not([disabled])') ?? [])];
        const first = buttons[0], last = buttons.at(-1), active = document.activeElement;
        if (e.shiftKey && (active === first || !root.current?.contains(active))) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && (active === last || !root.current?.contains(active))) { e.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener("keydown", key, true);
    return () => { document.removeEventListener("keydown", key, true); if (previous?.isConnected) previous.focus(); };
  }, [onClose]);
  return <section ref={root} className="frog-room" role="dialog" aria-modal="true" aria-labelledby={titleId}>
    <div className="frog-shell">
      <header className="frog-header">
        <div className="frog-wordmark"><span className="frog-logo">◉</span><div><h1 id={titleId}>FROG RADAR</h1><span>DEGEN VILLAGE · HIDDEN FIELD STATION 02</span></div></div>
        <button ref={close} className="frog-close" onClick={onClose} aria-label="Close frog radar">ESC <span>×</span></button>
      </header>
      <div className="frog-status"><span><i /> {mode} OBSERVATIONS</span><span>{scan.pairs} PAIRS IN VIEW</span><span>{scan.contacts.length} CURRENT MATCHES</span><span>TICK {tick.toLocaleString("en-US")}</span></div>
      <div className="frog-layout">
        <div className="frog-left">
          <div className="frog-intro"><span className="frog-eyebrow">SMALL FROGS. SHARP EYES.</span><h2>The pond is listening<span>.</span></h2><p>Ripples in volume. Leaps in price. Weight in the book.<br />Three patient watchers, one shared market.</p></div>
          <Pond contacts={scan.contacts} tick={reducedMotion ? 0 : tick} selected={selected} />
          <div className="frog-legend">● CURRENT THRESHOLD MATCH <span>Position on radar is decorative</span></div>
        </div>
        <aside className="frog-signals" aria-label="Current pattern matches">
          <div className="frog-signal-heading"><div><span className="frog-eyebrow">WHAT THEY CAUGHT</span><h2>Current contacts <span>{contacts.length.toString().padStart(2, "0")}</span></h2></div></div>
          <div className="frog-filters" aria-label="Filter patterns">
            <button aria-pressed={selected === "all"} onClick={() => setSelected("all")}>ALL</button>
            {WATCHERS.map(w => <button key={w.id} aria-pressed={selected === w.id} onClick={() => setSelected(w.id)}>{w.name}</button>)}
          </div>
          <div className="frog-contact-list">
            {contacts.length ? contacts.map(c => {
              const watcher = WATCHERS.find(w => w.id === c.pattern)!;
              return <article className="frog-contact" key={c.id} style={{ "--frog-color": watcher.color } as React.CSSProperties}>
                <div className="frog-contact-top"><span>{watcher.name} / {watcher.label.toUpperCase()}</span><b>{c.direction === "up" ? "↑" : c.direction === "down" ? "↓" : "◎"}</b></div>
                <div className="frog-contact-value"><strong>{c.pair}</strong><b>{c.metric}</b></div>
                <p>{c.reason}</p><span className="frog-source">{c.pattern === "book" ? "BOOK" : "PRICE / CANDLES"} · {c.provenance === "sim" ? "SIMULATED" : c.provenance.toUpperCase()}</span>
              </article>;
            }) : <div className="frog-empty"><span>≈</span><h3>{scan.pairs ? "Quiet water." : "The pond is warming up."}</h3><p>{scan.pairs ? "No current matches for this watcher. A frog only strikes when its threshold is met." : "Waiting for the village to observe its first market snapshots."}</p></div>}
          </div>
          <div className="frog-field-note"><span>FIELD NOTE / 001</span><p>These are current observations, not buy or sell commands. Contacts clear when conditions change.</p>{scan.stale > 0 && <p className="frog-stale">{scan.stale} stale or undated exchange snapshot(s) excluded.</p>}</div>
        </aside>
      </div>
      <div className="frog-watchers">
        {WATCHERS.map((w, i) => {
          const count = scan.contacts.filter(c => c.pattern === w.id).length;
          return <button className="frog-watcher" key={w.id} aria-pressed={selected === w.id}
            onClick={() => setSelected(selected === w.id ? "all" : w.id)} style={{ "--frog-color": w.color } as React.CSSProperties}>
            <span className="frog-watcher-index">0{i + 1}</span><span className="frog-watcher-copy"><strong>{w.name}<small>{w.label}</small></strong><span>{w.rule}</span><em>{scan.ready[w.id]} / {scan.pairs} pairs have usable data</em></span><span className="frog-watcher-state">{count ? `${count} CAUGHT` : "LISTENING"}</span>
          </button>;
        })}
      </div>
      <footer className="frog-footer"><span>{mode === "CHAIN" ? "CHAIN · real Pons identities / simulated prices & books" : mode === "PAPER" ? "PAPER · Coinbase observations / virtual funds" : "SIM · generated identities, prices & books"}</span><span>OBSERVE ONLY · NO MODEL CALLS</span></footer>
    </div>
  </section>;
}

/** A self-contained mount keeps the terminal and app overlay state independent. */
export function FrogEasterEgg(props: Props) {
  const [open, setOpen] = useState(false), buffer = useRef("");
  const close = React.useCallback(() => setOpen(false), []);
  useEffect(() => attachFrogShortcut(window, buffer, () => setOpen(true)), []);
  return <>
    <button className="frog-entry" onClick={() => setOpen(true)} aria-label="Open frog radar" title="Something stirs in the pond… (type frog)">
      <svg viewBox="0 0 40 40" aria-hidden="true"><path d="M21 6C2 3 0 30 18 34C37 38 44 13 26 7L20 21Z" fill="currentColor" /><path d="M9 26L20 21L15 12M20 21L29 29" stroke="#27321b" strokeWidth="1.3" /></svg>
    </button>
    {open && <FrogRadar {...props} onClose={close} />}
  </>;
}
