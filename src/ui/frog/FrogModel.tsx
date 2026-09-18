import React from "react";

/** Code-native SVG illustration. No network assets or biological-model claims. */
export function FrogModel({ tick, station, active, color }: { tick: number; station: number; active: boolean; color: string }) {
  const phase = tick * 0.055 + station * 2.1;
  const breath = Math.sin(phase) * 1.3;
  const blink = Math.sin(tick * 0.031 + station * 2.4) > 0.987;
  return <g data-frog-pose={`${breath.toFixed(3)}:${blink}`}>
    <ellipse cy="47" rx="65" ry="16" fill="#0a1009" opacity=".7" />
    <path d="M-70 40 Q-72 13 -28 25 Q-11 9 0 21 Q35 8 70 38 L8 60Z" fill="#304e2e" stroke="#809745" strokeWidth="1.5" />
    <path d="M0 22 L8 59 M0 22 L-55 40 M0 22 L58 39" stroke="#91af51" opacity=".45" fill="none" />
    <g transform={`translate(0 ${breath.toFixed(3)})`}>
      <ellipse cx="-39" cy="22" rx="22" ry="19" fill="#486329" transform="rotate(-24 -39 22)" />
      <ellipse cx="39" cy="22" rx="22" ry="19" fill="#486329" transform="rotate(24 39 22)" />
      <path d="M-37 17 Q-42-21 0-29 Q42-21 37 17 Q27 43 0 43 Q-27 43-37 17" fill={color} />
      <path d="M-35 2 Q-18 13 0 5 Q21 13 36 1 L33 26 Q0 60-33 26Z" fill="#739339" />
      <ellipse cy="25" rx="23" ry="17" fill="#c6cf87" />
      <path d="M-30 13 Q-44 29-31 40 M30 13 Q44 29 31 40" fill="none" stroke={color} strokeWidth="9" strokeLinecap="round" />
      {[-1, 1].map(side => <g key={side} transform={`translate(${side * 29} 41)`} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round">
        <path d="M0-3 L-10 3 M0-3 L0 5 M0-3 L9 3" />
      </g>)}
      <ellipse cy="-5" rx="39" ry="24" fill={color} />
      {[-1, 1].map(side => <g key={side} transform={`translate(${side * 23} -23)`}>
        <circle r="16" fill="#4d6e2b" /><circle cy="-2" r="12" fill="#e6e3ad" />
        {blink ? <path d="M-9-2H9" stroke="#172015" strokeWidth="3" /> : <>
          <ellipse cx={active ? side * -2 : 0} cy="-2" rx="4.8" ry="9" fill="#101b12" />
          <circle cx="-3" cy="-6" r="2.4" fill="#fffef0" />
        </>}
      </g>)}
      <path d="M-22 5 Q0 20 22 5" fill="none" stroke="#314624" strokeWidth="2" strokeLinecap="round" />
      <circle cx="-7" cy="-1" r="1.6" fill="#46612b" /><circle cx="7" cy="-1" r="1.6" fill="#46612b" />
      <ellipse cx="-29" cy="5" rx="5" ry="2.5" fill="#ddbe7e" opacity=".55" />
      <ellipse cx="29" cy="5" rx="5" ry="2.5" fill="#ddbe7e" opacity=".55" />
      {[-1, 1].map(side => <g key={side} fill="#3c602a" opacity=".5">
        <circle cx={side * 33} cy="-8" r="2.4" /><circle cx={side * 31} cy="-14" r="1.5" />
      </g>)}
    </g>
    {station === 0 && <g fill="none" stroke="#d9efaa" strokeWidth="2"><circle cx="-23" cy="-25" r="18" /><circle cx="23" cy="-25" r="18" /><path d="M-5-26H5" /></g>}
    {station === 1 && <path d="M-40-14 Q0-26 40-14 L39-20 Q0-32-39-20Z" fill="#213c30" />}
    {station === 2 && <g fill="none" stroke="#2a331a" strokeWidth="7"><path d="M-43-9 Q-48-55 0-55 Q48-55 43-9" /><path d="M42-4 Q57 12 20 16" strokeWidth="3" /></g>}
  </g>;
}
