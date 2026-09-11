import React from "react";
import { flyMotion } from "./motion.js";
import { FLY_PROVIDER } from "../../core/fly.js";
import { chartData, finite, signed, windowMove, CHANNEL_TICKS, type AgentView, type CoinView } from "./state.js";

export function FlyChart({ coin, agent, tick = 0, compact = false, station = 0 }: {
  coin?: CoinView; agent?: AgentView; tick?: number; compact?: boolean; station?: number;
}) {
  const pose = flyMotion(tick, agent, station);
  const entry = agent?.position?.pair === coin?.pair ? agent?.position?.entryPrice : undefined;
  const chart = chartData(coin?.snap, entry);
  const move = coin ? windowMove(coin.snap) * 100 : 0;
  const phase = Math.max(0, finite(tick)) % CHANNEL_TICKS;
  const source = coin?.snap.provenance?.price;
  const changeColor = move >= 0 ? "#CCFF00" : "#f87171";
  return <div style={{ display: "flex", flexDirection: "column", background: "#101507", height: "100%", containerType: "inline-size", padding: compact ? 7 : 13, boxSizing: "border-box", overflow: "hidden", position: "relative", color: "#d9ddb4" }}>
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", color: "#CCFF00", borderBottom: "1px solid #CCFF0033", paddingBottom: compact ? 3 : 8, marginBottom: compact ? 3 : 10, fontSize: compact ? "clamp(4px,3.9cqw,7px)" : "clamp(6px,2.7cqw,11px)", letterSpacing: "0.08em", flexShrink: 0 }}>
      <span>↗ ROBINHOOD CHAIN</span><span style={{ color: "#8f9963" }}>4663</span>
    </div>
    <div style={{ display: "flex", justifyContent: "space-between", gap: 6, fontSize: compact ? "clamp(6px,6cqw,10px)" : "clamp(8px,3.4cqw,13px)", alignItems: "baseline" }}>
      <strong style={{ color: "#f2f4de", fontSize: compact ? "clamp(7px,8cqw,12px)" : "clamp(10px,5cqw,19px)", transform: `translateX(${!agent?.position && phase < 8 ? (8 - phase) * 2 : 0}px)` }}>{coin?.pair ?? agent?.position?.pair ?? "AWAITING FEED"}</strong>
      <span style={{ color: changeColor }}>{coin ? signed(move) + "%" : "—"}</span>
    </div>
    <div style={{ color: "#929967", fontSize: compact ? "clamp(5px,4cqw,7px)" : "clamp(6px,2.4cqw,9px)", marginTop: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
      {coin ? `${chart.price.toPrecision(5)} ETH · VS WINDOW OPEN` : "NO MARKET SNAPSHOT YET"}
    </div>
    <svg viewBox="0 0 380 185" role="img" aria-label={`Candlestick chart: ${coin?.pair ?? "waiting for market"}`} style={{ width: "100%", display: "block", flex: compact ? "1 1 0px" : undefined, minHeight: 0 }}>
      {[25, 60, 95, 130, 165].map((y) => <path key={y} d={`M0 ${y} H380`} stroke="#3c4521" strokeWidth="0.7" strokeDasharray="3 5" />)}
      {chart.candles.map((c, i) => {
        const width = 340 / Math.max(chart.candles.length, 1), x = 9 + i * width;
        const up = c.c >= c.o, color = up ? "#CCFF00" : "#f87171";
        return <g key={`${c.t}-${i}`}><path d={`M${x + width / 2} ${chart.y(c.h)} V${chart.y(c.l)}`} stroke={color} strokeWidth="1" />
          <rect x={x + width * 0.18} y={Math.min(chart.y(c.o), chart.y(c.c))} width={width * 0.64}
            height={Math.max(1, Math.abs(chart.y(c.o) - chart.y(c.c)))} fill={up ? color : "#101507"} stroke={color} strokeWidth="1" /></g>;
      })}
      {coin && <path d={`M0 ${chart.y(chart.price)} H380`} stroke={changeColor} strokeWidth="0.7" strokeDasharray="2 4" />}
      {entry !== undefined && <g><path d={`M0 ${chart.y(entry)} H380`} stroke={FLY_PROVIDER.color} strokeDasharray="5 3" />
        <rect x="4" y={chart.y(entry) - 14} width="115" height="14" fill="#374515" />
        <text x="7" y={chart.y(entry) - 4} fill={FLY_PROVIDER.color} fontSize="9">FLY BUY · {entry.toPrecision(3)}</text></g>}
      {!chart.candles.length && <text x="190" y="98" textAnchor="middle" fill="#929967" fontSize="10">{coin ? "WAITING FOR CANDLES" : "SCANNING MARKET FEED"}</text>}
      <g aria-hidden="true" data-fly-cursor="true" transform={`translate(${pose.cursorX.toFixed(2)} ${pose.cursorY.toFixed(2)})`}>
        <path d="M0 0 L0 13 4 9 7 16 10 14 7 8 13 8Z" fill="#e9f7bc" stroke="#151b08" strokeWidth="1" />
        {pose.click && <circle r="12" fill="none" stroke="#CCFF00" strokeWidth="1" opacity="0.6" />}
      </g>
    </svg>
    {!compact && <div style={{ display: "flex", gap: 7, alignItems: "center", marginBottom: 9, fontSize: "clamp(6px,2.3cqw,10px)" }}>
      <span style={{ background: agent?.position ? "#CCFF00" : "#303c14", color: agent?.position ? "#152000" : "#c8d399", padding: "5px 8px" }}>{agent?.position ? "POSITION OPEN" : "WATCHING MARKET"}</span>
      <span style={{ color: "#9da779" }}>{agent ? `${agent.trades} CLOSED · ${agent.name}` : "VIRTUAL TRADING"}</span>
    </div>}
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: compact ? "clamp(5px,4cqw,7px)" : "clamp(6px,2.4cqw,9px)", color: source === "sim" ? "#fbbf24" : "#CCFF00" }}>
      <span>{source === "chain" ? "CHAIN PRICES" : source === "exchange" ? "EXCHANGE QUOTES" : coin ? "SIMULATED PRICES" : "FEED PENDING"}</span>
      <span>{agent?.position ? "POSITION LOCK" : "AUTO SCAN"}</span>
    </div>
    {!agent?.position && phase < 12 && <div aria-hidden="true" style={{ position: "absolute", left: 0, right: 0, top: `${phase / 12 * 100}%`, height: 11, background: "linear-gradient(transparent,#CCFF0055,transparent)", pointerEvents: "none" }} />}
  </div>;
}
