/** Robinhood Chain brand palette. Nothing here is decorative-only. */

import type { AgentClass } from "../core/types.js";

export const PALETTE = {
  bg: "#1C180D",
  bgDeep: "#151206",
  panel: "rgba(38, 33, 16, 0.62)",
  panelEdge: "rgba(204, 255, 0, 0.18)",
  accent: "#CCFF00",
  accentDim: "#8fae00",
  ink: "#F2EFE0",
  inkDim: "#9a9578",
  ground: "#26210F",
  groundAlt: "#2d2712",
  up: "#a3e635",
  down: "#f87171",
} as const;

export const CLASS_COLOR: Record<AgentClass, string> = {
  SCOUT: "#22d3ee",
  SNIPER: "#a3e635",
  WHALE: "#fbbf24",
  ARB: "#e879f9",
  CUSTOM: "#CCFF00",
};

export const FONT = "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace";

/** Darkens a #rrggbb by a factor in 0..1. */
export function shade(hex: string, factor: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const r = Math.round(((n >> 16) & 255) * factor);
  const g = Math.round(((n >> 8) & 255) * factor);
  const b = Math.round((n & 255) * factor);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

export function fmtEth(n: number, dp = 3): string {
  return `${n >= 0 ? "+" : ""}${n.toFixed(dp)}`;
}

export function fmtUsd(n: number): string {
  return `$${n.toFixed(n < 1 ? 4 : 2)}`;
}
