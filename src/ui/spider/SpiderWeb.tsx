import React, { memo, useEffect, useMemo, useRef, useState } from "react";
import { polyBody } from "../fly/mesh.js";
import { short, type WatchWallet, type WebEvent } from "../../spider/engine.js";
export interface Node { id: string; x: number; y: number; label: string; wallet: boolean; smart?: boolean }
const center = { x: 420, y: 345 };
export function webNodes(wallets: readonly WatchWallet[], events: readonly WebEvent[]): Node[] {
  const w = wallets.map((wallet, i) => {
    const angle = i * Math.PI * 2 / Math.max(wallets.length, 6) - Math.PI / 2;
    return { id: wallet.address, x: center.x + Math.cos(angle) * 307, y: center.y + Math.sin(angle) * 250, label: wallet.label, wallet: true, smart: wallet.smart };
  });
  const tokens = [...new Map(events.map(e => [e.token, e.symbol ?? short(e.token)])).entries()].slice(0, 6).map(([id, label], i, all) => {
    const angle = i * Math.PI * 2 / all.length - Math.PI / 3;
    return { id, label, x: center.x + Math.cos(angle) * 140, y: center.y + Math.sin(angle) * 114, wallet: false };
  });
  return [...w, ...tokens];
}
const abdomen = polyBody({ cx: 0, cy: 20, rx: 23, ry: 31, base: [104, 112, 34], seg: 16, rings: 10, yaw: .4, gain: 1.2 });
const head = polyBody({ cx: 0, cy: -16, rx: 17, ry: 19, base: [57, 65, 24], seg: 14, rings: 8, yaw: -.2, gain: 1.5 });
function Spider({ phase }: { phase: number }) {
  return <g data-spider-model="projected-3d" aria-label="Eight-legged spider">
    <ellipse cx="4" cy="23" rx="49" ry="35" fill="#000" opacity=".45" />
    {[-1, 1].flatMap(side => [0, 1, 2, 3].map(leg => {
      const gait = Math.sin(phase * 10 + leg * Math.PI * .7 + (side === 1 ? Math.PI : 0));
      // Articulated 3D joints projected onto the tilted web plane; knee lift changes depth.
      const z = Math.max(0, gait) * 9, hipY = -21 + leg * 12;
      const kneeX = side * (39 + (leg % 2) * 6), kneeY = -51 + leg * 31 - z * .7;
      const footX = side * (57 + (leg % 2) * 9 + gait * 4), footY = -70 + leg * 46 + gait * 10;
      const path = `M${side * 12} ${hipY}L${kneeX} ${kneeY}L${footX} ${footY}`;
      return <g key={`${side}:${leg}`} data-spider-leg={leg + (side > 0 ? 4 : 0)}>
        <path d={path} transform="translate(3 5)" fill="none" stroke="#000" strokeWidth="9" opacity=".45" strokeLinecap="round" />
        <path d={path} fill="none" stroke="#31391a" strokeWidth="8" strokeLinejoin="round" strokeLinecap="round" />
        <path d={path} fill="none" stroke={leg % 2 ? "#879447" : "#b0bd63"} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={kneeX} cy={kneeY} r="4" fill="#ccff00" opacity=".7" />
        <path d={`M${footX} ${footY}l${side * 4} -5`} stroke="#ccff00" strokeWidth="2" />
      </g>;
    }))}
    {[...abdomen, ...head].map((f, i) => <polygon key={i} points={f.points} fill={f.fill} />)}
    <path d="M-10 5L0 13L10 5L7 22L0 31L-7 22Z" fill="#ccff00" />
    <path d="M0 35V43" stroke="#ccff00" strokeWidth="3" />
    {[-1, 1].flatMap(side => [0, 1, 2, 3].map(i => <g key={`${side}:${i}`}><circle cx={side * (4 + i * 3.1)} cy={-29 + i * 3} r={i < 2 ? 3.3 : 2} fill="#080b03" /><circle cx={side * (4 + i * 3.1)} cy={-30 + i * 3} r={i < 2 ? 2 : 1.1} fill="#e3ff71" /></g>))}
    <path d="M-7-32L-9-42L-4-46M7-32L9-42L4-46" fill="none" stroke="#abb85e" strokeWidth="3" strokeLinecap="round" />
  </g>;
}
export const SpiderWeb = memo(function SpiderWeb({ wallets, events, selected, onSelect, paused }: {
  wallets: readonly WatchWallet[]; events: readonly WebEvent[]; selected: string | null; onSelect(id: string): void; paused: boolean;
}) {
  const nodes = useMemo(() => webNodes(wallets, events), [wallets, events]);
  const latest = events[0], target = nodes.find(n => n.id === (selected ?? latest?.wallet));
  const motion = useRef({ x: center.x, y: center.y, angle: 0, phase: 0, returning: false, tx: center.x, ty: center.y });
  const [pose, setPose] = useState({ ...motion.current });
  useEffect(() => {
    const m = motion.current; m.tx = target?.x ?? center.x; m.ty = target?.y ?? center.y; m.returning = Math.hypot(m.x - center.x, m.y - center.y) > 5;
  }, [target?.id, target?.x, target?.y]);
  useEffect(() => {
    let frame = 0, last = 0, rendered = 0;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const step = (now: number) => {
      const delta = last ? Math.min((now - last) / 1000, .05) : 0; last = now;
      const m = motion.current;
      if (!paused && !document.hidden && !reduced.matches) {
        const tx = m.returning ? center.x : m.tx, ty = m.returning ? center.y : m.ty;
        const dx = tx - m.x, dy = ty - m.y, dist = Math.hypot(dx, dy), travel = Math.min(dist, delta * 310);
        if (dist > 1) { m.x += dx / dist * travel; m.y += dy / dist * travel; m.angle = Math.atan2(dy, dx) * 180 / Math.PI + 90; m.phase += travel / 45; }
        else if (m.returning) m.returning = false;
      }
      if (now - rendered > 40) { setPose({ ...m }); rendered = now; }
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step); return () => cancelAnimationFrame(frame);
  }, [paused]);
  const links = [...new Map(events.slice(0, 50).map(e => [`${e.wallet}:${e.token}`, e])).values()];
  return <svg className="spider-web" viewBox="0 0 840 690" role="group" aria-label="Wallet intelligence web">
    <defs><radialGradient id="spider-web-glow"><stop stopColor="#505827" stopOpacity=".3" /><stop offset="1" stopColor="#121006" stopOpacity="0" /></radialGradient></defs>
    <ellipse cx="420" cy="357" rx="395" ry="308" fill="url(#spider-web-glow)" />
    <g fill="none" stroke="#9caa55" strokeOpacity=".22">
      {[1, 2, 3, 4, 5, 6].map(r => <path key={r} d={Array.from({ length: 25 }, (_, i) => {
        const angle = i * Math.PI / 12, x = center.x + Math.cos(angle) * r * 53, y = center.y + Math.sin(angle) * r * 43;
        return `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
      }).join(" ")} />)}
      {Array.from({ length: 24 }, (_, i) => { const a = i * Math.PI / 12; return <path key={i} d={`M420 345L${420 + Math.cos(a) * 376} ${345 + Math.sin(a) * 304}`} />; })}
    </g>
    {links.map(e => { const a = nodes.find(n => n.id === e.wallet), b = nodes.find(n => n.id === e.token); return a && b ? <path key={`${a.id}:${b.id}`} d={`M${a.x} ${a.y}Q420 345 ${b.x} ${b.y}`} fill="none" stroke="#ccff00" strokeWidth={e.id === latest?.id ? 2 : 1} opacity={e.id === latest?.id ? .75 : .18} /> : null; })}
    <circle cx="420" cy="345" r="8" fill="#ccff00" opacity=".5" />
    {nodes.map(n => <g key={n.id} className="spider-node" role="button" tabIndex={0} aria-label={`Inspect ${n.label}`} aria-pressed={selected === n.id} onClick={() => onSelect(n.id)} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(n.id); } }}>
      <circle cx={n.x} cy={n.y} r={n.wallet ? 23 : 19} fill="#1c180d" stroke={n.id === latest?.wallet || selected === n.id ? "#ccff00" : "#69733b"} strokeWidth={selected === n.id ? 2 : 1} />
      <circle cx={n.x} cy={n.y} r={n.wallet ? 8 : 5} fill={n.smart ? "#ccff00" : "#9a9578"} />
      {n.smart && <circle cx={n.x} cy={n.y} r="15" fill="none" stroke="#ccff00" strokeDasharray="2 4" />}
      <text x={n.x} y={n.y + 40} textAnchor="middle" fill={n.smart ? "#ccff00" : "#b2ad8b"} fontSize="10" letterSpacing="1">{n.label.slice(0, 18)}</text>
      <text x={n.x} y={n.y + 53} textAnchor="middle" fill="#9a9578" fontSize="7">{n.wallet ? n.smart ? "COPY TARGET" : "WATCHED WALLET" : "TOKEN FLOW"}</text>
    </g>)}
    <g transform={`translate(${pose.x.toFixed(2)} ${pose.y.toFixed(2)}) rotate(${pose.angle.toFixed(2)}) scale(.76)`} data-spider-pose={`${pose.x.toFixed(2)},${pose.y.toFixed(2)}`} style={{ pointerEvents: "none" }}><Spider phase={pose.phase} /></g>
    <text x="28" y="650" fill="#9a9578" fontSize="9" letterSpacing="2">OBSERVE / CONNECT / FOLLOW</text>
    <text x="812" y="650" textAnchor="end" fill="#69733b" fontSize="8">LINKS SHOW SHARED FLOWS</text>
  </svg>;
});
