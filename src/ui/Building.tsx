/**
 * A building, drawn as three SVG faces with their own gradients.
 * Canvas-free by design: every wall, window and pip is a real DOM node, which
 * is what lets the whole thing be inspected, styled and clicked.
 */

import React from "react";
import { TILE_H, TILE_W, iso } from "./iso.js";
import { PALETTE, shade } from "./theme.js";
import type { BuildingState } from "../core/village.js";
import { MAX_BUILDING_LEVEL } from "../core/village.js";

export interface BuildingProps {
  building: BuildingState;
  /** True while any agent is training inside; the window strips glow. */
  training: boolean;
  selected: boolean;
  onSelect(id: BuildingState["id"]): void;
}

const ROOF_COLOR: Record<string, string> = {
  BARRACKS: "#22d3ee",
  LAB: "#a3e635",
  VAULT: "#fbbf24",
  REFINERY: "#e879f9",
  ACADEMY: "#7dd3fc",
  MINT: "#CCFF00",
  RELAY: "#f472b6",
  NEXUS: "#c084fc",
};

export function Building({ building, training, selected, onSelect }: BuildingProps): React.ReactElement {
  const { x, y } = iso(building.pos.gx, building.pos.gy);
  const level = Math.max(1, building.level);
  const built = building.level > 0;
  const H = 24 + level * 8;
  const w = TILE_W - 4;
  const h = TILE_H - 2;
  const id = building.id;
  const roof = ROOF_COLOR[id] ?? PALETTE.accent;

  const topPts = `0,${-h - H} ${w},${-H} 0,${h - H} ${-w},${-H}`;
  const leftPts = `${-w},${-H} 0,${h - H} 0,${h} ${-w},0`;
  const rightPts = `${w},${-H} 0,${h - H} 0,${h} ${w},0`;

  const windowRows = Math.min(3, level);
  const strips: React.ReactElement[] = [];
  for (let r = 0; r < windowRows; r++) {
    const wy = -H + 12 + r * 11;
    for (let c = 0; c < 2; c++) {
      const t = 0.28 + c * 0.34;
      /* Left wall runs from (-w,-H+..) to (0, h-H+..); parametrise along it. */
      const lx = -w + w * t;
      const ly = wy + h * t;
      const rx = w - w * t;
      const ry = wy + h * t;
      strips.push(
        <g key={`s-${r}-${c}`} className={training ? "dv-window dv-window-on" : "dv-window"}>
          <polygon
            points={`${lx},${ly} ${lx + 7},${ly + 3.5} ${lx + 7},${ly + 11} ${lx},${ly + 7.5}`}
            fill={training ? roof : shade(roof, 0.32)}
          />
          <polygon
            points={`${rx},${ry} ${rx - 7},${ry + 3.5} ${rx - 7},${ry + 11} ${rx},${ry + 7.5}`}
            fill={training ? roof : shade(roof, 0.24)}
          />
        </g>,
      );
    }
  }

  const pips: React.ReactElement[] = [];
  for (let i = 0; i < MAX_BUILDING_LEVEL; i++) {
    const px = -18 + i * 9;
    const on = i < building.level;
    pips.push(
      <polygon
        key={`p-${i}`}
        points={`${px},${h + 7} ${px + 3.2},${h + 10} ${px},${h + 13} ${px - 3.2},${h + 10}`}
        fill={on ? PALETTE.accent : "rgba(204,255,0,0.16)"}
      />,
    );
  }

  const job = building.job;

  return (
    <g
      transform={`translate(${x} ${y})`}
      className={`dv-building${built ? "" : " dv-building-ghost"}`}
      onClick={() => onSelect(id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onSelect(id);
      }}
    >
      <ellipse cx={0} cy={h + 2} rx={w + 6} ry={h * 0.72} fill="rgba(0,0,0,0.42)" />

      {selected && (
        <polygon
          points={`0,${-h - 4} ${w + 8},${2} 0,${h + 8} ${-w - 8},${2}`}
          fill="none"
          stroke={PALETTE.accent}
          strokeWidth={1.4}
          strokeDasharray="6 5"
          className="dv-spin-slow"
        />
      )}

      <polygon points={rightPts} fill={`url(#bg-right-${id})`} />
      <polygon points={leftPts} fill={`url(#bg-left-${id})`} />
      <polygon points={topPts} fill={`url(#bg-top-${id})`} stroke={shade(roof, 0.5)} strokeWidth={0.8} />

      {strips}

      {/* Diamond roof element */}
      <polygon
        points={`0,${-h - H - 12} ${w * 0.4},${-H - 8} 0,${-h - H + 8} ${-w * 0.4},${-H - 8}`}
        fill={roof}
        opacity={built ? 0.92 : 0.35}
      />

      {/* Antenna with blinking ring */}
      <line
        x1={0}
        y1={-h - H - 12}
        x2={0}
        y2={-h - H - 30}
        stroke={roof}
        strokeWidth={1.2}
        opacity={0.85}
      />
      <circle cx={0} cy={-h - H - 32} r={2.4} fill={roof} className="dv-blink" />
      <circle
        cx={0}
        cy={-h - H - 32}
        r={7}
        fill="none"
        stroke={roof}
        strokeWidth={0.9}
        className="dv-pulse-ring"
      />

      {pips}

      <text className="dv-building-label" x={0} y={h + 26} textAnchor="middle">
        {id}
      </text>

      {job && (
        <g className="dv-build-job">
          <rect x={-24} y={h + 30} width={48} height={5} rx={2.5} fill="rgba(0,0,0,0.55)" />
          <rect
            x={-24}
            y={h + 30}
            width={48 * (1 - job.ticksLeft / job.totalTicks)}
            height={5}
            rx={2.5}
            fill={PALETTE.accent}
          />
          <text className="dv-building-sub" x={0} y={h + 46} textAnchor="middle">
            {job.kind === "build" ? "BUILDING" : `L${job.toLevel}`} {job.ticksLeft}t
          </text>
        </g>
      )}
    </g>
  );
}

/** Per-building gradients. Rendered once into <defs>. */
export function BuildingGradients({ ids }: { ids: readonly string[] }): React.ReactElement {
  return (
    <>
      {ids.map((id) => {
        const roof = ROOF_COLOR[id] ?? PALETTE.accent;
        return (
          <React.Fragment key={id}>
            <linearGradient id={`bg-top-${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={shade(roof, 0.55)} />
              <stop offset="100%" stopColor={shade(roof, 0.3)} />
            </linearGradient>
            <linearGradient id={`bg-left-${id}`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor={shade(roof, 0.26)} />
              <stop offset="100%" stopColor={shade(roof, 0.12)} />
            </linearGradient>
            <linearGradient id={`bg-right-${id}`} x1="1" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={shade(roof, 0.4)} />
              <stop offset="100%" stopColor={shade(roof, 0.18)} />
            </linearGradient>
          </React.Fragment>
        );
      })}
    </>
  );
}
