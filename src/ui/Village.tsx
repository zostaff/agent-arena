/**
 * The scene. Ground tiles, then every object depth-sorted by gx + gy so the
 * painter's algorithm holds, then the floating notifications on top.
 */

import React, { useMemo } from "react";
import { GRID, TILE_H, TILE_W, gridViewBox, iso, sortByDepth, tileDiamond } from "./iso.js";
import { PALETTE } from "./theme.js";
import { Building, BuildingGradients } from "./Building.jsx";
import { Terminal, TerminalGradients } from "./Terminal.jsx";
import { AgentSprite } from "./AgentSprite.jsx";
import { BUILDING_DEFS, TERMINAL_POS, type BuildingId } from "../core/economy.js";
import type { VillageView } from "../core/village.js";

export interface VillageSceneProps {
  view: VillageView;
  selectedAgent: string | null;
  selectedBuilding: BuildingId | null;
  onSelectAgent(id: string): void;
  onSelectBuilding(id: BuildingId): void;
}

type Renderable =
  | { kind: "building"; gx: number; gy: number; key: string; node: React.ReactElement }
  | { kind: "terminal"; gx: number; gy: number; key: string; node: React.ReactElement }
  | { kind: "agent"; gx: number; gy: number; key: string; node: React.ReactElement };

export function VillageScene(props: VillageSceneProps): React.ReactElement {
  const { view } = props;

  const ground = useMemo(() => {
    const tiles: React.ReactElement[] = [];
    for (let gx = 0; gx < GRID; gx++) {
      for (let gy = 0; gy < GRID; gy++) {
        tiles.push(
          <polygon
            key={`t-${gx}-${gy}`}
            points={tileDiamond(gx, gy)}
            fill={(gx + gy) % 2 === 0 ? PALETTE.ground : PALETTE.groundAlt}
            stroke="rgba(204,255,0,0.045)"
            strokeWidth={0.6}
          />,
        );
      }
    }
    return tiles;
  }, []);

  const trainingAt = new Set<string>();
  for (const a of view.agents) {
    if (a.state === "TRAIN") trainingAt.add(a.building);
  }
  const busyTerminal = view.agents.filter(
    (a) => a.state === "DECIDE" || a.state === "SCAN" || a.state === "HOLD",
  ).length;

  const items: Renderable[] = [];

  for (const b of view.buildings) {
    items.push({
      kind: "building",
      gx: b.pos.gx,
      gy: b.pos.gy,
      key: `b-${b.id}`,
      node: (
        <Building
          key={`b-${b.id}`}
          building={b}
          training={trainingAt.has(b.id)}
          selected={props.selectedBuilding === b.id}
          onSelect={props.onSelectBuilding}
        />
      ),
    });
  }

  items.push({
    kind: "terminal",
    gx: TERMINAL_POS.gx,
    gy: TERMINAL_POS.gy,
    key: "terminal",
    node: <Terminal key="terminal" pos={TERMINAL_POS} busy={busyTerminal} />,
  });

  for (const a of view.agents) {
    items.push({
      kind: "agent",
      gx: a.gx,
      gy: a.gy,
      key: `a-${a.id}`,
      node: (
        <AgentSprite
          key={`a-${a.id}`}
          id={a.id}
          name={a.name}
          cls={a.cls}
          custom={a.custom}
          gx={a.gx}
          gy={a.gy}
          hop={a.hop}
          state={a.state}
          level={a.level}
          verdict={a.verdict}
          inPosition={a.position !== null}
          selected={props.selectedAgent === a.id}
          onSelect={props.onSelectAgent}
        />
      ),
    });
  }

  const ordered = sortByDepth(items);

  return (
    <svg
      className="dv-scene"
      viewBox={gridViewBox(GRID, 110)}
      preserveAspectRatio="xMidYMid meet"
      aria-label="DEGEN VILLAGE"
    >
      <defs>
        <BuildingGradients ids={BUILDING_DEFS.map((d) => d.id)} />
        <TerminalGradients />
        <radialGradient id="dv-vignette" cx="50%" cy="45%" r="72%">
          <stop offset="0%" stopColor="#000" stopOpacity="0" />
          <stop offset="100%" stopColor="#000" stopOpacity="0.55" />
        </radialGradient>
      </defs>

      <g className="dv-ground">{ground}</g>
      <g className="dv-objects">{ordered.map((o) => o.node)}</g>

      <g className="dv-notifications">
        {view.notifications.map((n) => {
          const { x, y } = iso(n.gx, n.gy);
          const cls =
            n.kind === "pnl"
              ? n.text.startsWith("-")
                ? "dv-float dv-float-down"
                : "dv-float dv-float-up-pnl"
              : n.kind === "level"
                ? "dv-float dv-float-level"
                : "dv-float";
          return (
            <text key={n.id} style={n.text === "CONNECTOME ONLINE" ? { fill: "#5eead4" } : undefined} className={cls} x={x} y={y - 34} textAnchor="middle">
              {n.text}
            </text>
          );
        })}
      </g>

      <rect
        x={-GRID * TILE_W - 110}
        y={-110 - 70}
        width={2 * (GRID * TILE_W + 110)}
        height={2 * (GRID * TILE_H + 110) + 70}
        fill="url(#dv-vignette)"
        pointerEvents="none"
      />
    </svg>
  );
}
