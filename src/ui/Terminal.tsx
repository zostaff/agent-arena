/**
 * The terminal at the centre of the village: a raised platform, three
 * counter-rotating elliptical rings, and a beam of light going up.
 * Every trade in the game happens standing on this tile.
 */

import React from "react";
import { TILE_H, TILE_W, iso } from "./iso.js";
import { PALETTE } from "./theme.js";
import type { GridPos } from "../core/agent.js";

export interface TerminalProps {
  pos: GridPos;
  /** Number of agents currently standing on it; the beam brightens. */
  busy: number;
}

export function Terminal({ pos, busy }: TerminalProps): React.ReactElement {
  const { x, y } = iso(pos.gx, pos.gy);
  const w = TILE_W * 1.5;
  const h = TILE_H * 1.5;
  const lift = 14;
  const intensity = Math.min(1, 0.25 + busy * 0.28);

  return (
    <g transform={`translate(${x} ${y})`} className="dv-terminal">
      <ellipse cx={0} cy={6} rx={w + 10} ry={h * 0.8} fill="rgba(0,0,0,0.5)" />

      {/* Raised platform: base diamond, skirt, top diamond */}
      <polygon
        points={`${-w},0 0,${h} ${w},0 0,${-h}`}
        fill="url(#term-skirt)"
      />
      <polygon points={`${-w},${-lift} ${-w},0 0,${h} 0,${h - lift}`} fill="#151206" />
      <polygon points={`${w},${-lift} ${w},0 0,${h} 0,${h - lift}`} fill="#1d1908" />
      <polygon
        points={`${-w},${-lift} 0,${h - lift} ${w},${-lift} 0,${-h - lift}`}
        fill="url(#term-top)"
        stroke={PALETTE.accent}
        strokeWidth={1}
      />

      {/* Beam of light */}
      <polygon
        points={`${-9},${-lift} ${9},${-lift} ${22},${-190} ${-22},${-190}`}
        fill="url(#term-beam)"
        opacity={intensity}
      />

      {/* Three counter-rotating rings */}
      <g className="dv-ring-a">
        <ellipse cx={0} cy={-lift - 26} rx={w * 0.95} ry={h * 0.5} fill="none" stroke={PALETTE.accent} strokeWidth={1.3} strokeDasharray="10 7" opacity={0.85} />
      </g>
      <g className="dv-ring-b">
        <ellipse cx={0} cy={-lift - 44} rx={w * 0.72} ry={h * 0.38} fill="none" stroke="#22d3ee" strokeWidth={1.1} strokeDasharray="6 9" opacity={0.75} />
      </g>
      <g className="dv-ring-c">
        <ellipse cx={0} cy={-lift - 60} rx={w * 0.5} ry={h * 0.26} fill="none" stroke="#e879f9" strokeWidth={1} strokeDasharray="4 6" opacity={0.7} />
      </g>

      <text className="dv-terminal-label" x={0} y={h + 20} textAnchor="middle">
        TERMINAL
      </text>
      <text className="dv-terminal-sub" x={0} y={h + 33} textAnchor="middle">
        RH·CHAIN DEX
      </text>
    </g>
  );
}

export function TerminalGradients(): React.ReactElement {
  return (
    <>
      <linearGradient id="term-top" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#3a3416" />
        <stop offset="100%" stopColor="#211c0c" />
      </linearGradient>
      <linearGradient id="term-skirt" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#2a2410" />
        <stop offset="100%" stopColor="#141105" />
      </linearGradient>
      <linearGradient id="term-beam" x1="0" y1="1" x2="0" y2="0">
        <stop offset="0%" stopColor={PALETTE.accent} stopOpacity="0.55" />
        <stop offset="100%" stopColor={PALETTE.accent} stopOpacity="0" />
      </linearGradient>
    </>
  );
}
