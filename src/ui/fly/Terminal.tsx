import React from "react";
import { PROVIDER_META } from "../../core/config.js";
import { FONT } from "../theme.js";
import { finite, flyNet, signed, type FlyView } from "./state.js";

export function AgentTerminal({ ui, onClose }: { ui?: FlyView; onClose: () => void }) {
  const agents = [...(ui?.agents ?? [])].sort((a, b) => flyNet(b) - flyNet(a));
  return <div role="dialog" aria-label="Agent terminal leaderboard" aria-modal="true" style={{ position: "fixed", inset: 0, zIndex: 900, background: "#0a0d05f5", padding: "clamp(15px,5vw,80px)", overflow: "auto", fontFamily: FONT, color: "#eeeede" }}>
    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 30 }}><h2 style={{ color: "#CCFF00", margin: 0 }}>▣ TERMINAL</h2><button className="dv-btn hb" onClick={onClose}>✕ CLOSE</button></div>
    <p style={{ color: "#9a9578", fontSize: 12 }}>Live roster · net after inference estimates · ETH conversion assumption $2,500 · virtual trades</p>
    <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", textAlign: "right", minWidth: 630 }}>
      <thead><tr>{["RANK", "AGENT / HOUSE", "STATE", "TRADES", "INFERENCE BILL", "NET ETH"].map((s) => <th key={s} style={{ padding: "14px 9px", borderBottom: "1px solid #CCFF0033", color: "#9a9578", fontSize: 10 }}>{s}</th>)}</tr></thead>
      <tbody>{agents.map((a, i) => <tr key={a.id} style={{ color: PROVIDER_META[a.provider].color }}>
        <td style={{ padding: 16 }}>{i + 1}</td><td>{a.name}<small style={{ display: "block", color: "#9a9578", fontSize: 9 }}>{PROVIDER_META[a.provider].label}</small></td>
        <td style={{ fontSize: 11 }}>{a.state}</td><td>{a.trades}</td><td>${finite(a.spentUsd).toFixed(2)}</td><td style={{ color: flyNet(a) >= 0 ? "#CCFF00" : "#f87171" }}>{signed(flyNet(a), 5)}</td>
      </tr>)}</tbody>
    </table></div>
  </div>;
}
