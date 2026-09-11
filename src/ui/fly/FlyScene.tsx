import React, { useEffect, useRef, useState, type CSSProperties } from "react";
import { FLY_PROVIDER } from "../../core/fly.js";
import { FONT } from "../theme.js";
import { SWARM_SIZE, flyId } from "../../fly/roster.js";
import { FlyModel } from "./FlyModel.js";
import { FlyChart } from "./FlyChart.js";
import { finite, flyConfig, flyNet, monitorCoin, neuralState, signed, type AgentView, type CoinView, type FlyView } from "./state.js";

const accent = FLY_PROVIDER.color;
const muted = "#999675";
const panel: CSSProperties = { background: "#17180ded", border: "1px solid #485027", padding: "16px 19px", boxShadow: "0 12px 50px #0007" };
const label: CSSProperties = { fontSize: 10, letterSpacing: 2, color: accent };
const button: CSSProperties = { fontFamily: FONT, cursor: "pointer", color: accent, border: "1px solid #CCFF005c", background: "#252b11", padding: "10px 14px", fontSize: 11 };

function City({ tick }: { tick: number }) {
  return <div aria-hidden="true" style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
    {Array.from({ length: 18 }, (_, i) => <div key={i} style={{ position: "absolute", top: `${-10 + (i % 4) * 7}%`, left: `${i * 6}%`, width: `${4 + i % 3}%`, height: "73%", background: i % 2 ? "#66602b22" : "#161a0ba0", borderLeft: `1px solid ${i % 4 === 0 ? "#CCFF0025" : "#afad6215"}`, transform: `skewY(${i % 2 ? 4 : -5}deg)` }} />)}
    {Array.from({ length: 105 }, (_, i) => <i key={i} style={{ position: "absolute", left: `${(i * 17.731) % 100}%`, top: `${(i * 11.372) % 66}%`, width: i % 7 === 0 ? 10 : 2, height: i % 3 === 0 ? 7 : 3, background: i % 3 ? "#CCFF00" : "#fbbf24", opacity: 0.08 + (1 + Math.sin(tick * 0.017 + i * 2.41)) * 0.18 }} />)}
    <div style={{ position: "absolute", inset: 0, background: "linear-gradient(0deg,#0a0d05 5%,transparent 80%)" }} />
  </div>;
}
function Station({ tick, index, agent, coins, compact = false }: {
  tick: number; index: number; agent?: AgentView; coins: readonly CoinView[]; compact?: boolean;
}) {
  const coin = monitorCoin(coins, tick, index, agent?.position?.pair);
  return <div style={{ position: "relative", width: "100%", height: "100%", perspective: 1000, transformStyle: "preserve-3d", overflow: "hidden" }}>
    <div aria-hidden="true" style={{ position: "absolute", left: "2%", right: "2%", height: "42%", bottom: "-3%", background: "linear-gradient(145deg,#4a452b,#2e2818 65%,#1c180d)", borderTop: "2px solid #9a9c60", borderBottom: `3px solid ${accent}`, transform: "rotateX(58deg) rotateZ(-4deg)", boxShadow: "0 22px 0 #101205, 0 25px 22px #CCFF0014", transformStyle: "preserve-3d" }} />
    <div style={{ position: "absolute", right: "6%", top: compact ? "7%" : "4%", width: compact ? "49%" : "44%", height: compact ? "72%" : undefined, border: `${compact ? 3 : 8}px solid #30371a`, borderBottomWidth: compact ? 6 : 17, borderRadius: 4, background: "#1c180d", transform: "rotateY(-13deg) rotateX(3deg) translateZ(-35px)", boxShadow: "8px 9px 0 #101406,0 0 28px #CCFF0015", zIndex: 2 }}>
      <FlyChart coin={coin} agent={agent} tick={tick} compact={compact} station={index} />
      <div aria-hidden="true" style={{ position: "absolute", width: "12%", height: compact ? 14 : 38, background: "linear-gradient(90deg,#424b23,#141909)", top: "100%", left: "44%" }} />
    </div>
    <div style={{ position: "absolute", left: compact ? "-8%" : "-3%", width: compact ? "96%" : "86%", bottom: "0%", height: "100%", zIndex: 4, pointerEvents: "none" }}>
      <FlyModel tick={tick} compact={compact} agent={agent} station={index} />
    </div>
    {!compact && <div aria-hidden="true" style={{ position: "absolute", right: "5%", bottom: "8%", width: 29, height: 38, border: "2px solid #79743f", borderRadius: "4px 4px 14px 14px", transform: "rotate(-9deg)", background: "linear-gradient(90deg,#4a4825,#252915)", zIndex: 4 }}><span style={{ position: "absolute", right: -15, top: 9, width: 16, height: 19, border: "3px solid #969351", borderRadius: "50%" }} /></div>}
    <div style={{ position: "absolute", left: "4%", bottom: 3, zIndex: 5, color: accent, fontSize: compact ? 8 : 10, letterSpacing: 1 }}>
      {`FLY-0${index}`} · {agent ? agent.position ? "IN POSITION" : agent.state : "AWAITING ROSTER"}
    </div>
  </div>;
}
function ScanningStrip({ coins, active, chain }: { coins: readonly CoinView[]; active?: string; chain: boolean }) {
  return <div style={{ display: "flex", gap: 7, alignItems: "center", overflowX: "auto", padding: "9px 0", whiteSpace: "nowrap", borderTop: "1px solid #414720", fontSize: 9 }}>
    <span style={{ color: muted, letterSpacing: 1 }}>{chain ? "SCANNING PONS" : "SCANNING SESSION"}</span>
    {!coins.length && <span style={{ color: muted }}>WAITING FOR MARKET SNAPSHOTS</span>}
    {coins.map((c) => <span key={c.pair} aria-current={c.pair === active ? "true" : undefined} style={{ color: c.pair === active ? "#121705" : muted, background: c.pair === active ? accent : "#242a14", padding: "4px 7px" }}>{c.pair}</span>)}
  </div>;
}
export function NeuralReplay({ agent, tick = 0 }: { agent?: AgentView; tick?: number }) {
  const neural = neuralState(agent, tick);
  const config = flyConfig(agent);
  return <section aria-label="Neural replay" style={{ ...panel, flex: "1 1 360px" }}>
    <div style={{ ...label, display: "flex", justifyContent: "space-between" }}><span>▏ NEURAL REPLAY</span><span style={{ color: muted }}>{agent?.name ?? "FLY-00"}</span></div>
    <div style={{ display: "flex", gap: 20, alignItems: "center", marginTop: 10 }}>
      <div><div style={{ fontSize: 9, color: muted }}>DOPAMINE · MODELLED</div><strong style={{ color: "#CCFF00", fontSize: 31, fontWeight: 500 }}>{neural.dopamine.toFixed(1)}<small style={{ fontSize: 12 }}> Hz</small></strong></div>
      <div style={{ fontSize: 10, color: muted, lineHeight: 1.9 }}>PAM CLUSTER <b style={{ color: accent }}>{FLY_PROVIDER.pam} MODELLED CELLS</b><br />INFERENCE BILL <b style={{ color: "#CCFF00" }}>${config.costPerDecision.toFixed(2)}</b> / DECISION</div>
    </div>
    <div style={{ display: "flex", gap: 12, alignItems: "center", margin: "8px 0" }}>
      <div style={{ minWidth: 83 }}><strong style={{ fontSize: 24, color: "#eeeace" }}>{(neural.spikes / 1e6).toFixed(2)}M</strong><div style={{ fontSize: 8, color: muted }}>EST. SPIKES / S</div></div>
      <svg viewBox="0 0 292 62" role="img" aria-label={`Modelled spike raster: ${neural.holding ? "dense, in position" : "sparse, scanning"}`} style={{ width: "100%", maxWidth: 440, height: 62, background: "#101507", borderTop: "2px solid #CCFF0066" }}>
        {neural.cells.filter((c) => c.on).map((c) => <rect key={`${c.cell}-${c.column}`} x={c.column * 5 + 1} y={c.cell * 4 + 1} width="1.6" height="2.2" fill={c.cell % 4 ? "#d4d69a" : "#CCFF00"} opacity={0.55 + c.cell % 3 * 0.2} />)}
      </svg>
    </div>
    <div style={{ color: muted, fontSize: 9 }}>P&amp;L-DRIVEN VISUALIZATION · NOT A NEURAL RECORDING</div>
    <div style={{ color: "#c7c89b", fontSize: 10, marginTop: 8 }}>not a language model, nobody bills for a fly</div>
  </section>;
}
export function MotorCommands({ agent, tick = 0, joined, onJoin }: {
  agent?: AgentView; tick?: number; joined: boolean; onJoin: () => void;
}) {
  const neural = neuralState(agent, tick);
  return <section aria-label="Descending motor commands" style={{ ...panel, flex: "1 1 300px" }}>
    <div style={label}>▏ DESCENDING MOTOR COMMANDS</div>
    <div style={{ marginTop: 13 }}>
      {Object.entries(neural.motors).map(([name, value], i) => <div key={name} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 9, fontSize: 10 }}>
        <span style={{ width: 38, color: muted }}>{name}</span>
        <div role="meter" aria-label={name} aria-valuemin={0} aria-valuemax={1} aria-valuenow={value} style={{ background: "#33391d", height: 8, flex: 1 }}>
          <div style={{ height: "100%", width: `${value * 100}%`, background: ["#CCFF00", "#f87171", accent][i], boxShadow: `0 0 9px ${["#CCFF0033", "#f8717133", "#CCFF0033"][i]}` }} />
        </div><span style={{ color: "#e7ecc0", width: 42, textAlign: "right" }}>{signed(value)}</span>
      </div>)}
    </div>
    <div style={{ fontSize: 9, color: muted, display: "flex", justifyContent: "space-between", margin: "13px 0" }}><span>CONTROL FLY BRAIN</span><span style={{ color: accent }}>MODE {neural.holding ? "IN POSITION" : "SCANNING"}</span></div>
    {joined ? <div role="status" style={{ color: flyNet(agent) >= 0 ? "#CCFF00" : "#f87171", padding: "12px 0", fontSize: 12 }}>{agent?.name ?? "FLY-00"} TRADING · NET {signed(flyNet(agent), 6)} ETH</div>
      : <button className="hb" onClick={onJoin} style={{ ...button, width: "100%", color: "#131705", background: accent, fontWeight: 700, letterSpacing: 1 }}>PUT THE SWARM ON THE ROSTER</button>}
    <div style={{ fontSize: 8, color: muted, marginTop: 7 }}>4 AGENTS · FREE TO JOIN · VIRTUAL TRADES · SPOT EXITS, NO SHORTS</div>
  </section>;
}

export function FlyScene({ ui, onClose, onJoin, mode = "SIM" }: {
  ui?: FlyView; onClose: () => void; onJoin: () => void; mode?: string;
}) {
  const [station, setStation] = useState(0);
  const dialog = useRef<HTMLDivElement>(null);
  const tick = Math.max(0, finite(ui?.tick));
  const agents = ui?.agents ?? [];
  const coins = ui?.snapshots ?? [];
  const agent = agents.find((a) => a.id === flyId(station));
  const joined = Array.from({ length: SWARM_SIZE }, (_, i) => flyId(i)).every((id) => agents.some((a) => a.id === id));
  const active = monitorCoin(coins, tick, station, agent?.position?.pair);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.focus();
    return () => previous?.focus();
  }, []);
  return <div ref={dialog} role="dialog" aria-modal="true" aria-label="Fly swarm trading room" tabIndex={-1}
    onKeyDown={(e) => {
      if (e.key === "Escape") { e.stopPropagation(); onClose(); }
      if (e.key === "Tab") {
        const buttons = dialog.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)");
        const first = buttons?.[0], last = buttons?.[buttons.length - 1];
        if (e.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    }}
    style={{ position: "fixed", inset: 0, zIndex: 1000, background: "radial-gradient(ellipse at 85% 5%,#393823 0%,#1C180D 45%,#0a0d05 95%)", overflow: "auto", fontFamily: FONT, color: "#e9e8c9", outline: "none" }}>
    <City tick={tick} />
    <div style={{ position: "relative", minHeight: 720, height: "100%", boxSizing: "border-box", padding: "22px clamp(12px,3vw,48px) 18px", display: "flex", flexDirection: "column" }}>
      <header style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start", flexShrink: 0 }}>
        <div><div style={{ fontSize: "clamp(24px,4vw,45px)", letterSpacing: "0.18em", color: accent, textShadow: "0 0 25px #CCFF0055", fontWeight: 500 }}>FLYTRADER<span style={{ fontSize: 10, letterSpacing: 2, marginLeft: 12 }}> / SWARM</span></div>
          <div style={{ color: muted, fontSize: "clamp(7px,1vw,10px)", letterSpacing: "0.09em", lineHeight: 1.9 }}>DROSOPHILA CNS LINK · ROBINHOOD CHAIN 4663<br />{FLY_PROVIDER.neurons.toLocaleString("en-US")} NEURONS // FLYWIRE 783 REFERENCE</div></div>
        <button className="hb" aria-label="Close fly swarm" style={button} onClick={onClose}>✕ CLOSE</button>
      </header>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, flex: "1 0 auto", minHeight: 330, marginTop: 10 }}>
        <div style={{ position: "relative", minWidth: 0, minHeight: 330, flex: "5 1 600px" }}><Station tick={tick} index={station} agent={agent} coins={coins} /></div>
        <div style={{ display: "grid", gridTemplateRows: "repeat(3,minmax(100px,1fr))", gap: 7, flex: "1 1 200px", minHeight: 330 }}>
          {Array.from({ length: SWARM_SIZE }, (_, i) => i).filter((i) => i !== station).map((i) => <button key={i} className="hb" aria-label={`View FLY-0${i} workstation`} onClick={() => setStation(i)}
            style={{ padding: 0, border: "1px solid #CCFF002b", background: "#1b230e99", cursor: "pointer", fontFamily: FONT, minWidth: 0, position: "relative" }}>
            <Station tick={tick} index={i} agent={agents.find((a) => a.id === flyId(i))} coins={coins} compact />
          </button>)}
        </div>
      </div>
      <ScanningStrip coins={coins} active={active?.pair} chain={mode === "CHAIN"} />
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", flexShrink: 0 }}>
        <NeuralReplay agent={agent} tick={tick} />
        <MotorCommands agent={agent} tick={tick} joined={joined} onJoin={onJoin} />
      </div>
      <footer style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 5, color: muted, fontSize: 8, lineHeight: 1.7, paddingTop: 9 }}>
        <span>DEGEN VILLAGE · FLYWIRE-INSPIRED HEURISTIC · 50M SYNAPSES IN REFERENCE · NEURAL SOLVER NOT LOADED</span>
        <span>{mode === "CHAIN" ? "PONS IDENTITIES · SIMULATED PRICES" : mode === "PAPER" ? "COINBASE QUOTES · VIRTUAL FUNDS" : "OFFLINE SIMULATION"} · TICK {tick}</span>
      </footer>
    </div>
  </div>;
}
