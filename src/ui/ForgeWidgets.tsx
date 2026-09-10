import React from "react";
import { CLASS_COLOR, PALETTE } from "./theme.js";
import { MODEL_LADDERS, PROVIDERS, PROVIDER_META, modelForPtn } from "../core/config.js";
import type { Provider } from "../core/types.js";

/**
 * The house picker. Every button states what it actually buys: the model id at
 * the agent's current PTN, and the frontier rung PTN 12 unlocks.
 */
export function HousePicker({
  value,
  ptn,
  onChange,
}: {
  value: Provider;
  ptn: number;
  onChange(p: Provider): void;
}): React.ReactElement {
  const meta = PROVIDER_META[value];
  return (
    <div className="dv-house">
      <div className="dv-house-row">
        {PROVIDERS.map((p) => {
          const m = PROVIDER_META[p];
          const on = p === value;
          return (
            <button
              key={p}
              className={`dv-btn dv-house-btn${on ? " dv-house-on" : ""}`}
              style={on ? { borderColor: m.color, color: m.color } : undefined}
              onClick={() => onChange(p)}
            >
              {m.label}
            </button>
          );
        })}
      </div>
      <div className="dv-house-models">
        {MODEL_LADDERS[value].map((rung) => (
          <div className="dv-row" key={rung.id}>
            <span className="dv-row-k">
              PTN {rung.minPtn}
              {ptn >= rung.minPtn ? " · active" : " · locked"}
            </span>
            <span
              className="dv-row-v"
              style={{ color: modelForPtn(ptn, value) === rung.id ? meta.color : undefined }}
            >
              {rung.id}
            </span>
          </div>
        ))}
      </div>
      <div className="dv-house-note">{meta.note}</div>
    </div>
  );
}

export function PRow({ k, v, accent }: { k: string; v: string; accent?: boolean }): React.ReactElement {
  return (
    <div className="dv-row">
      <span className="dv-row-k">{k}</span>
      <span className="dv-row-v" style={accent ? { color: PALETTE.accent } : undefined}>
        {v}
      </span>
    </div>
  );
}

export function NumSlider({
  label,
  min,
  max,
  step,
  value,
  format,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  format(v: number): string;
  onChange(v: number): void;
}): React.ReactElement {
  return (
    <label className="dv-slider">
      <span className="dv-slider-label dv-slider-label-wide">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="dv-slider-value">{format(value)}</span>
    </label>
  );
}

export function BtCell({
  label,
  a,
  b,
  good,
}: {
  label: string;
  a: string;
  b: string;
  good: boolean;
}): React.ReactElement {
  return (
    <div className="dv-bt-cell">
      <div className="dv-bt-label">{label}</div>
      <div className="dv-bt-a" style={{ color: good ? PALETTE.up : PALETTE.down }}>
        {a}
      </div>
      <div className="dv-bt-b">vs {b}</div>
    </div>
  );
}

export function EquityCurve({
  build,
  baseline,
}: {
  build: readonly number[];
  baseline: readonly number[];
}): React.ReactElement {
  const w = 480;
  const h = 110;
  const all = [...build, ...baseline];
  const lo = Math.min(0, ...all);
  const hi = Math.max(0, ...all);
  const span = hi - lo || 1;

  const path = (series: readonly number[]): string =>
    series
      .map((v, i) => {
        const x = (i / Math.max(1, series.length - 1)) * (w - 8) + 4;
        const y = h - 6 - ((v - lo) / span) * (h - 14);
        return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(" ");

  const zeroY = h - 6 - ((0 - lo) / span) * (h - 14);

  return (
    <svg className="dv-equity" viewBox={`0 0 ${w} ${h}`}>
      <line x1={4} x2={w - 4} y1={zeroY} y2={zeroY} stroke="rgba(204,255,0,0.2)" strokeDasharray="4 4" />
      <path d={path(baseline)} fill="none" stroke={CLASS_COLOR.SNIPER} strokeWidth={1.2} opacity={0.6} />
      <path d={path(build)} fill="none" stroke={PALETTE.accent} strokeWidth={1.8} />
      <text x={6} y={12} className="dv-chart-axis">
        equity · build vs SNIPER preset
      </text>
    </svg>
  );
}
