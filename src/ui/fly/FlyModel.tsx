import React, { useId } from "react";
import { polyBody, type BodyOptions } from "./mesh.js";
import { finite } from "./state.js";

function Body(props: BodyOptions) {
  return <g>{polyBody(props).map((f, i) => <polygon key={i} points={f.points} fill={f.fill}
    stroke="#16353c" strokeOpacity="0.28" strokeWidth="0.65" strokeLinejoin="round" />)}</g>;
}
function Leg({ d }: { d: string }) {
  return <g fill="none" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} stroke="#071117" strokeWidth="12" />
    <path d={d} stroke="#657a80" strokeWidth="6" />
    <path d={d} stroke="#5eead4" strokeOpacity="0.6" strokeWidth="1.4" transform="translate(0,-2)" />
  </g>;
}
function Wing({ id, angle, upper }: { id: string; angle: number; upper?: boolean }) {
  return <g transform={`rotate(${angle.toFixed(2)} 421 238)`} opacity={upper ? 0.63 : 0.38}>
    <path d="M425 238 C332 173 168 86 59 139 C7 172 262 236 425 238Z" fill={`url(#${id}-wing)`} stroke="#abdcd9" strokeWidth="1.2" />
    <g fill="none" stroke="#bde9e5" strokeWidth="0.9" opacity="0.65">
      <path d="M421 237 Q213 166 61 150 M421 237 Q221 202 94 165 M346 212 L278 153 M285 193 L207 134 M229 177 L153 129 M333 218 L256 208 M249 193 L169 189" />
    </g>
  </g>;
}

export function FlyModel({ tick = 0, compact = false }: { tick?: number; compact?: boolean }) {
  const id = `fly${useId().replace(/:/g, "")}`;
  const t = finite(tick);
  const bob = Math.sin(t * 0.071) * 3.2;
  const yaw = 0.45 + Math.sin(t * 0.014) * 0.16;
  const detail = compact ? { seg: 12, rings: 7 } : { seg: 19, rings: 11 };
  return <svg viewBox="0 0 760 440" role="img" aria-label="Faceted fly operating a trading keyboard" style={{ width: "100%", height: "100%", overflow: "visible" }}>
    <defs>
      <radialGradient id={`${id}-glow`}><stop stopColor="#5eead4" stopOpacity="0.24" /><stop offset="1" stopColor="#5eead4" stopOpacity="0" /></radialGradient>
      <linearGradient id={`${id}-wing`} x2="1" y2="1"><stop stopColor="#e6f4f3" stopOpacity="0.76" /><stop offset="0.65" stopColor="#99cbd0" stopOpacity="0.36" /><stop offset="1" stopColor="#5eead4" stopOpacity="0.06" /></linearGradient>
      <radialGradient id={`${id}-spec`} cx="30%" cy="22%" r="70%"><stop stopColor="#fff4eb" stopOpacity="0.8" /><stop offset="0.14" stopColor="#ffc1c7" stopOpacity="0.4" /><stop offset="0.6" stopColor="#ff6277" stopOpacity="0" /></radialGradient>
      <pattern id={`${id}-dots`} width="6" height="6" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="0.8" fill="#2d0717" opacity="0.48" /></pattern>
    </defs>
    <ellipse cx="409" cy="275" rx="263" ry="135" fill={`url(#${id}-glow)`} />
    <ellipse cx="396" cy="370" rx="202" ry="19" fill="#000" opacity="0.37" />
    <g transform={`translate(0 ${bob.toFixed(2)})`}>
      <Leg d="M413 275 L373 316 L345 372 L315 379" />
      <Wing id={id} angle={-14 + Math.sin(t * 0.73 + 1.8) * 13} />
      <g transform="rotate(13 309 274)">
        <Body {...detail} cx={309} cy={274} rx={119} ry={48} base={[67, 85, 103]} yaw={1.07} light={[-0.4, -0.7, 1]} />
        {[245, 274, 306, 339, 368].map((x) => <path key={x} d={`M${x} 235 Q${x - 16} 274 ${x} 314`} fill="none" stroke="#11252d" strokeWidth="2.6" opacity="0.55" />)}
      </g>
      <Body {...detail} cx={420} cy={252} rx={75} ry={68} base={[126, 150, 158]} yaw={0.9} light={[-0.8, -0.9, 1]} />
      <Wing id={id} upper angle={8 + Math.sin(t * 0.69) * 9} />
      <g stroke="#aac5c7" strokeWidth="1.2" opacity="0.75">
        {Array.from({ length: 13 }, (_, i) => <path key={i} d={`M${370 + i * 6} ${204 - Math.sin(i / 12 * Math.PI) * 17} l${-13 + i} -19`} />)}
      </g>
      <Leg d="M398 294 L404 330 L390 383 L368 391" />
      <g transform={`rotate(${(Math.sin(t * 0.014) * 2).toFixed(2)} 501 246)`}>
        <Body {...detail} cx={507} cy={244} rx={61} ry={58} base={[199, 217, 219]} yaw={yaw} amb={0.38} gain={0.72} light={[-0.9, -1, 0.65]} />
        <Body {...detail} cx={506} cy={209} rx={20} ry={27} base={[204, 64, 80]} yaw={-0.4} light={[-1, -0.8, 1]} />
        <ellipse cx="506" cy="209" rx="20" ry="27" fill={`url(#${id}-dots)`} />
        <ellipse cx="506" cy="209" rx="20" ry="27" fill={`url(#${id}-spec)`} />
        <Body {...detail} cx={548} cy={240} rx={33} ry={42} base={[212, 66, 83]} yaw={-0.7} amb={0.29} light={[-0.7, -1, 1]} />
        <ellipse cx="548" cy="240" rx="33" ry="42" fill={`url(#${id}-dots)`} />
        <ellipse cx="548" cy="240" rx="33" ry="42" fill={`url(#${id}-spec)`} />
        <path d="M548 202 Q576 172 596 175 M520 200 Q540 166 561 159" fill="none" stroke="#90afb5" strokeWidth="2.7" />
        <circle cx="596" cy="175" r="4" fill="#b0d2d0" /><circle cx="561" cy="159" r="3" fill="#b0d2d0" />
        <path d="M557 275 Q585 313 564 347 L587 355" fill="none" stroke="#58727b" strokeWidth="6" strokeLinecap="round" />
        <path d="M557 275 Q585 313 564 347" fill="none" stroke="#8adacc" strokeWidth="1.2" />
      </g>
      <Leg d="M464 288 L522 325 L571 363 L611 367" />
    </g>
  </svg>;
}
