import React, { memo, useId } from "react";
import { polyBody, type BodyOptions } from "./mesh.js";
import { flyMotion, keyPosition } from "./motion.js";
import type { AgentView } from "./state.js";

const Body = memo(function Body(props: BodyOptions) {
  return <g>{polyBody(props).map((f, i) => <polygon key={i} points={f.points} fill={f.fill}
    stroke="#222716" strokeOpacity="0.22" strokeWidth="0.55" strokeLinejoin="round" />)}</g>;
}, (a, b) => {
  // Lighting and topology are fixed while limbs move. Reuse their SVG facets.
  const keys = Object.keys(a) as Array<keyof BodyOptions>;
  return keys.length === Object.keys(b).length && keys.every((key) => {
    const left = a[key], right = b[key];
    return left === right || (Array.isArray(left) && Array.isArray(right) &&
      left.length === right.length && left.every((v, i) => v === right[i]));
  });
});
function Leg({ points, far = false }: { points: number[][]; far?: boolean }) {
  const d = points.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(2)} ${y.toFixed(2)}`).join(" ");
  const [x, y] = points[points.length - 1];
  return <g fill="none" strokeLinecap="round" strokeLinejoin="round" opacity={far ? 0.65 : 1}>
    <path d={d} stroke="#101307" strokeWidth={far ? 7 : 9} />
    <path d={d} stroke={far ? "#62684a" : "#8b9270"} strokeWidth={far ? 3.5 : 4.8} />
    <path d={d} stroke="#d3e995" strokeWidth="1" transform="translate(-1,-1)" />
    {points.slice(1, -1).map(([jx, jy], i) => <g key={i}><circle cx={jx} cy={jy} r={far ? 3 : 4.2} fill="#424c2b" stroke="#a3ad79" strokeWidth="1" />
      <path d={`M${jx - 3} ${jy - 5} l-4 -6 M${jx + 2} ${jy - 3} l4 -7`} stroke="#9caa76" strokeWidth="0.8" /></g>)}
    <path d={`M${x} ${y} l8 2 -2 4 M${x} ${y} l-2 6 5 1`} stroke="#c0c89c" strokeWidth="1.8" />
  </g>;
}
function Wing({ id, angle, far }: { id: string; angle: number; far?: boolean }) {
  return <g transform={`rotate(${angle.toFixed(2)} 417 245)`} opacity={far ? 0.36 : 0.65}>
    <path d="M420 244 C321 166 142 98 69 146 C18 187 258 253 420 244Z" fill={`url(#${id}-wing)`} stroke="#d2d8b5" strokeWidth="1.2" />
    <g fill="none" stroke="#b7bc92" strokeWidth="0.9" opacity="0.85">
      <path d="M417 243 Q216 166 70 154 M417 243 Q237 209 96 174 M415 244 Q259 241 151 202 M352 221 L286 159 M292 201 L227 141 M230 178 L168 133 M343 229 L295 236 M263 209 L229 222 M198 191 L170 206 M285 159 Q277 185 263 209 M227 141 Q227 167 198 191" />
      {Array.from({ length: 20 }, (_, i) => <path key={i} opacity="0.35" d={`M${110 + i * 12} ${164 + i * 2.5} l-8 16`} />)}
    </g>
  </g>;
}
function Bristles({ compact }: { compact: boolean }) {
  return <g fill="none" stroke="#a6ad7e" strokeWidth="0.8" opacity="0.65">
    {Array.from({ length: compact ? 25 : 70 }, (_, i) => {
      const a = (i * 2.39996) % (2 * Math.PI), r = Math.sqrt((i + 1) / (compact ? 25 : 70));
      const x = 420 + Math.cos(a) * r * 62, y = 246 + Math.sin(a) * r * 48;
      return <path key={i} d={`M${x} ${y} q${Math.cos(a) * 3} -4 ${Math.cos(a) * 6} ${-7 - i % 6}`} />;
    })}
  </g>;
}

export function FlyModel({ tick = 0, compact = false, agent, station = 0 }: {
  tick?: number; compact?: boolean; agent?: AgentView; station?: number;
}) {
  const id = `fly${useId().replace(/:/g, "")}`;
  const p = flyMotion(tick, agent, station);
  const detail = compact ? { seg: 14, rings: 8 } : { seg: 22, rings: 13 };
  const b = p.bob;
  return <svg viewBox="0 0 820 470" role="img" aria-label="Faceted fly operating a trading keyboard" style={{ width: "100%", height: "100%", overflow: "visible" }}>
    <defs>
      <radialGradient id={`${id}-glow`}><stop stopColor="#CCFF00" stopOpacity="0.16" /><stop offset="1" stopColor="#CCFF00" stopOpacity="0" /></radialGradient>
      <linearGradient id={`${id}-wing`} x2="1" y2="1"><stop stopColor="#eeeac9" stopOpacity="0.7" /><stop offset="0.65" stopColor="#b5bd8b" stopOpacity="0.3" /><stop offset="1" stopColor="#CCFF00" stopOpacity="0.07" /></linearGradient>
      <radialGradient id={`${id}-spec`} cx="30%" cy="22%" r="70%"><stop stopColor="#fff0d2" stopOpacity="0.8" /><stop offset="0.14" stopColor="#ffc89c" stopOpacity="0.35" /><stop offset="0.7" stopColor="#ee5039" stopOpacity="0" /></radialGradient>
      <pattern id={`${id}-dots`} width="5" height="5" patternUnits="userSpaceOnUse"><path d="M2.5 0 L5 1.3 V3.7 L2.5 5 0 3.7 V1.3Z" fill="none" stroke="#490c0a" strokeWidth="0.55" opacity="0.6" /></pattern>
      <linearGradient id={`${id}-mouse`}><stop stopColor="#74784d" /><stop offset="0.45" stopColor="#343b1c" /><stop offset="1" stopColor="#101308" /></linearGradient>
    </defs>
    <ellipse cx="405" cy="304" rx="290" ry="135" fill={`url(#${id}-glow)`} />
    <ellipse cx="391" cy="413" rx="194" ry="20" fill="#000" opacity="0.4" />
    {/* Peripherals share SVG coordinates with the feet, so contact cannot drift on resize. */}
    <g data-fly-keyboard="true">
      <path d="M473 352 L702 352 686 410 457 410Z" fill="#090c05" stroke="#76764b" strokeWidth="2" />
      <path d="M457 410 L686 410 686 416 457 416Z" fill="#373d1b" />
      {Array.from({ length: 48 }, (_, i) => {
        const k = keyPosition(i), down = p.pressed && p.key === i;
        return <g key={i} transform={`translate(${k.x} ${k.y + (down ? 2 : 0)})`}>
          <path d="M-7 -7 H6 L4 1 H-9Z" fill={down ? "#CCFF00" : "#353b22"} stroke={down ? "#e8ff93" : "#697044"} strokeWidth="0.7" />
          {!compact && <text x="-2" y="-1.5" fontSize="4" textAnchor="middle" fill={down ? "#171a09" : "#b3b987"}>{"1234567890-=QWERTYUIOP[]ASDFGHJKL;'ZXCVBNM,./!?"[i]}</text>}
        </g>;
      })}
      <path d="M476 405 H666" stroke="#CCFF00" strokeWidth="1.2" opacity="0.7" />
    </g>
    <path d="M700 375 L786 377 774 451 683 446Z" fill="#1e2410" stroke="#697633" strokeWidth="0.8" />
    <text x="719" y="441" fill="#77814d" fontSize="5" letterSpacing="1">DEGEN VILLAGE</text>
    <path d={`M${p.mouseX} ${p.mouseY - 19} C750 343 756 346 794 350`} fill="none" stroke="#545b37" strokeWidth="2" />
    <g data-fly-mouse="true" transform={`translate(${p.mouseX.toFixed(2)} ${p.mouseY.toFixed(2)}) rotate(-12)`}>
      <ellipse cy="5" rx="20" ry="26" fill="#000" opacity="0.5" />
      <path d="M-17 15 C-22 0 -15 -23 0 -24 C20 -24 25 3 16 20 Q0 29 -17 15Z" fill={`url(#${id}-mouse)`} stroke="#a5b669" strokeWidth="1.2" />
      <path d="M0 -22 V-3 M-17 -4 Q0 2 19 -3" fill="none" stroke="#0e1406" strokeWidth="1.5" />
      <rect x="-2" y="-18" width="4" height="8" rx="2" fill={p.click ? "#efffae" : "#CCFF00"} />
      <path d="M-11 17 Q0 23 12 17" stroke="#CCFF00" fill="none" strokeWidth={p.click ? 3 : 1.4} />
    </g>
    <Leg far points={[[375, 273 + b], [312, 322], [276, 383], [251, 400]]} />
    <Leg far points={[[420, 276 + b], [451, 328], [442, 378], [427, 391]]} />
    <g transform={`translate(0 ${b.toFixed(2)})`}>
      <Wing id={id} far angle={-9 + Math.sin(p.t * 0.43 + 1.6) * (p.engaged ? 12 : 6)} />
      <g transform="rotate(12 314 280)">
        <Body {...detail} cx={308} cy={280} rx={117} ry={47} base={[88, 94, 71]} yaw={0.97} jitter={0.08} />
        {[235, 263, 294, 325, 355].map((x) => <path key={x} d={`M${x} 242 Q${x - 15} 280 ${x} 319`} fill="none" stroke="#252e17" strokeWidth="3" opacity="0.65" />)}
        <path d="M227 268 Q308 244 386 272" stroke="#bdc784" strokeOpacity="0.3" fill="none" strokeWidth="2" />
      </g>
      <path d="M374 285 Q350 295 349 312" stroke="#9ba36c" fill="none" strokeWidth="2" />
      <ellipse cx="349" cy="313" rx="4" ry="7" fill="#bec58e" />
      <Body {...detail} cx={420} cy={251} rx={70} ry={67} base={[132, 139, 108]} yaw={0.65} jitter={0.07} />
      <path d="M392 195 Q381 226 387 249 M415 188 Q405 218 411 243 M438 193 Q432 217 436 235" fill="none" stroke="#343e20" strokeWidth="5" opacity="0.7" />
      <Wing id={id} angle={10 + Math.sin(p.t * 0.39) * (p.engaged ? 9 : 4)} />
      <Bristles compact={compact} />
      <g transform={`rotate(${p.head.toFixed(2)} 493 247)`}>
        <Body {...detail} cx={499} cy={245} rx={55} ry={54} base={[205, 202, 164]} yaw={0.45 + Math.sin(p.t * 0.018) * 0.12} jitter={0.06} />
        <Body {...detail} cx={497} cy={214} rx={21} ry={29} base={[207, 68, 38]} yaw={-0.5} />
        <ellipse cx="497" cy="214" rx="21" ry="29" fill={`url(#${id}-dots)`} /><ellipse cx="497" cy="214" rx="21" ry="29" fill={`url(#${id}-spec)`} />
        <Body {...detail} cx={538} cy={245} rx={34} ry={42} base={[225, 70, 40]} yaw={-0.7} />
        <ellipse cx="538" cy="245" rx="34" ry="42" fill={`url(#${id}-dots)`} /><ellipse cx="538" cy="245" rx="34" ry="42" fill={`url(#${id}-spec)`} />
        <g transform={`rotate(${p.antenna.toFixed(2)} 521 206)`} stroke="#c2c792" fill="none" strokeWidth="2">
          <path d="M521 206 Q548 175 571 173 M526 207 Q564 190 588 196" />
          <path d="M547 183 l-5 -11 m11 8 0 -12 m9 8 4 -10 M564 192 l3 -9 m8 10 4 -8" strokeWidth="0.7" />
          <circle cx="571" cy="173" r="3" fill="#d1d2a2" /><circle cx="588" cy="196" r="3.5" fill="#b8c079" />
        </g>
        <path d="M527 276 Q543 302 520 324" fill="none" stroke="#555d32" strokeWidth="5" strokeLinecap="round" />
        <ellipse cx="519" cy="326" rx="5" ry="3" fill="#bac280" />
        {Array.from({ length: compact ? 6 : 15 }, (_, i) => <path key={i} d={`M${472 + i * 2} ${268 + Math.sin(i) * 6} l-4 9`} stroke="#bbbc8c" strokeWidth="0.7" />)}
      </g>
    </g>
    <Leg points={[[375, 287 + b], [328, 343], [312, 411], [291, 422]]} />
    <Leg points={[[418, 294 + b], [406, 346], [413, 414], [400, 426]]} />
    <g data-fly-typing="true" data-pressed={p.pressed}>
      <Leg points={[[456, 281 + b], [500, 320 + b], [p.hand.x - 20, p.hand.y - 18], [p.hand.x, p.hand.y]]} />
    </g>
    <Leg points={[[470, 286 + b], [572, 325 + b], [p.mouseX - 30, p.mouseY - 35], [p.mouseX - 1, p.mouseY - 11 + (p.click ? 2 : 0)]]} />
  </svg>;
}
