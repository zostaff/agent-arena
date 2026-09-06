/**
 * An agent. A circle with a highlight and an eye slit, an elliptical ground
 * shadow that shrinks as it hops, a rotating selection ring, and a badge over
 * its head when it just traded. Custom FORGE builds get a dashed outer ring.
 */

import React from "react";
import { iso } from "./iso.js";
import { CLASS_COLOR, PALETTE, shade } from "./theme.js";
import type { AgentClass, Verdict } from "../core/types.js";
import type { AgentState } from "../core/types.js";

export interface AgentSpriteProps {
  id: string;
  name: string;
  cls: AgentClass;
  custom: boolean;
  gx: number;
  gy: number;
  hop: number;
  state: AgentState;
  level: number;
  verdict: Verdict | null;
  inPosition: boolean;
  selected: boolean;
  onSelect(id: string): void;
}

const R = 8.5;

export function AgentSprite(props: AgentSpriteProps): React.ReactElement {
  const { x, y } = iso(props.gx, props.gy);
  const color = CLASS_COLOR[props.cls];
  const lift = props.hop * 7;
  /* Shadow shrinks as the agent rises — the only cue that sells the hop. */
  const shadowScale = 1 - props.hop * 0.42;

  const badge =
    props.inPosition && props.verdict?.action === "BUY"
      ? "BUY"
      : props.verdict?.action === "SELL" && props.state === "SETTLE"
        ? "SELL"
        : null;

  return (
    <g
      transform={`translate(${x} ${y})`}
      className="dv-agent"
      onClick={() => props.onSelect(props.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") props.onSelect(props.id);
      }}
    >
      <ellipse
        cx={0}
        cy={3}
        rx={R * 1.15 * shadowScale}
        ry={R * 0.52 * shadowScale}
        fill="rgba(0,0,0,0.55)"
      />

      {props.selected && (
        <g className="dv-spin">
          <ellipse
            cx={0}
            cy={3}
            rx={R * 1.9}
            ry={R * 0.92}
            fill="none"
            stroke={PALETTE.accent}
            strokeWidth={1.4}
            strokeDasharray="7 5"
          />
        </g>
      )}

      <g transform={`translate(0 ${-lift})`}>
        {props.custom && (
          <circle
            cx={0}
            cy={-R}
            r={R + 3.4}
            fill="none"
            stroke={PALETTE.accent}
            strokeWidth={1.2}
            strokeDasharray="3 3"
            opacity={0.9}
          />
        )}
        <circle cx={0} cy={-R} r={R} fill={color} stroke={shade(color, 0.45)} strokeWidth={1.2} />
        {/* highlight */}
        <circle cx={-2.6} cy={-R - 3} r={2.9} fill="rgba(255,255,255,0.42)" />
        {/* eye slit */}
        <rect x={-4.6} y={-R - 1.4} width={9.2} height={2.6} rx={1.3} fill="rgba(12,10,4,0.82)" />

        <text className="dv-agent-name" x={0} y={-R * 2 - 8} textAnchor="middle" fill={color}>
          {props.name}
        </text>
        <text className="dv-agent-state" x={0} y={-R * 2 - 19} textAnchor="middle">
          {props.state} · L{props.level}
        </text>

        {badge && (
          <g transform={`translate(0 ${-R * 2 - 32})`}>
            <rect
              x={-15}
              y={-10}
              width={30}
              height={14}
              rx={3}
              fill={badge === "BUY" ? PALETTE.up : PALETTE.down}
            />
            <text className="dv-agent-badge" x={0} y={0} textAnchor="middle">
              {badge}
            </text>
          </g>
        )}
      </g>
    </g>
  );
}
