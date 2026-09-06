/**
 * FORGE — the custom agent builder.
 *
 * 20 stat points, six strategy parameters the sim brain genuinely reads, and a
 * system prompt suffix that only matters in live mode. The compiled config
 * preview updates on every slider move, and the backtest is the same seeded,
 * deterministic 7000-tick run the leaderboard ranks.
 */

import React, { useMemo, useState } from "react";
import { CLASS_COLOR, PALETTE, fmtEth, fmtUsd } from "./theme.js";
import {
  FORGE_STAT_BUDGET,
  MAX_STAT,
  STAT_KEYS,
  STAT_LABEL,
  compileConfig,
  type Stats,
} from "../core/config.js";
import type { StrategyParams } from "../core/types.js";
import { DEFAULT_STRATEGY } from "../core/brain.js";
import {
  BACKTEST_SEED,
  BACKTEST_TICKS,
  backtestAgainstBaseline,
  type BacktestComparison,
} from "../sim/backtest.js";
import { CUSTOM_DEPLOY_COST, MAX_CUSTOM_AGENTS } from "../core/village.js";

export interface ForgeDraft {
  name: string;
  stats: Stats;
  strategy: StrategyParams;
  systemSuffix: string;
}

export const EMPTY_DRAFT: ForgeDraft = {
  name: "UNNAMED",
  stats: { spd: 5, rsk: 5, ptn: 5, gas: 5 },
  strategy: { ...DEFAULT_STRATEGY },
  systemSuffix: "",
};

export function statsSpent(stats: Stats): number {
  return STAT_KEYS.reduce((acc, k) => acc + stats[k], 0);
}

export interface ForgeProps {
  draft: ForgeDraft;
  onDraft(next: ForgeDraft): void;
  treasury: number;
  customCount: number;
  onDeploy(draft: ForgeDraft): void;
  onPublish(draft: ForgeDraft, result: BacktestComparison): void;
  onClose(): void;
}

export function Forge(props: ForgeProps): React.ReactElement {
  const { draft } = props;
  const [result, setResult] = useState<BacktestComparison | null>(null);
  const [running, setRunning] = useState(false);
  const [copied, setCopied] = useState(false);

  const spent = statsSpent(draft.stats);
  const remaining = FORGE_STAT_BUDGET - spent;
  const config = useMemo(
    () =>
      compileConfig(draft.stats, 0, [], {
        basePositionEth: 0.05 * draft.strategy.sizeMult,
      }),
    [draft.stats, draft.strategy.sizeMult],
  );

  function setStat(key: keyof Stats, value: number): void {
    const next = Math.max(0, Math.min(MAX_STAT, value));
    const others = STAT_KEYS.filter((k) => k !== key).reduce((a, k) => a + draft.stats[k], 0);
    if (others + next > FORGE_STAT_BUDGET) return;
    props.onDraft({ ...draft, stats: { ...draft.stats, [key]: next } });
    setResult(null);
  }

  function setStrategy<K extends keyof StrategyParams>(key: K, value: StrategyParams[K]): void {
    props.onDraft({ ...draft, strategy: { ...draft.strategy, [key]: value } });
    setResult(null);
  }

  async function runBacktest(): Promise<void> {
    setRunning(true);
    try {
      const cmp = await backtestAgainstBaseline({
        name: draft.name || "UNNAMED",
        stats: draft.stats,
        strategy: draft.strategy,
        systemSuffix: draft.systemSuffix,
      });
      setResult(cmp);
    } finally {
      setRunning(false);
    }
  }

  async function exportJson(): Promise<void> {
    const payload = {
      name: draft.name,
      stats: draft.stats,
      strategy: draft.strategy,
      systemSuffix: draft.systemSuffix,
      compiled: config,
      backtest: result
        ? {
            seed: result.build.seed,
            ticks: result.build.ticks,
            pnlEth: result.build.pnlEth,
            winRate: result.build.winRate,
            maxDrawdownEth: result.build.maxDrawdownEth,
            trades: result.build.trades,
          }
        : null,
    };
    const text = JSON.stringify(payload, null, 2);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* Clipboard blocked (insecure context, denied permission): show it instead. */
      window.prompt("Copy the build JSON:", text);
    }
  }

  const canDeploy =
    props.treasury >= CUSTOM_DEPLOY_COST &&
    props.customCount < MAX_CUSTOM_AGENTS &&
    remaining >= 0;

  return (
    <div className="dv-forge">
      <div className="dv-dex-head">
        <span className="dv-dex-title">FORGE</span>
        <input
          className="dv-input dv-input-name"
          value={draft.name}
          maxLength={16}
          onChange={(e) => props.onDraft({ ...draft, name: e.target.value.toUpperCase() })}
        />
        <button className="dv-btn dv-btn-tiny" onClick={props.onClose}>
          CLOSE
        </button>
      </div>

      <div className="dv-forge-body">
        <section className="dv-forge-col">
          <div className="dv-compiled-title">
            STATS · {spent}/{FORGE_STAT_BUDGET}
            <span className={remaining < 0 ? "dv-over" : "dv-remaining"}> {remaining} left</span>
          </div>
          {STAT_KEYS.map((k) => (
            <label className="dv-slider" key={k}>
              <span className="dv-slider-label">{STAT_LABEL[k]}</span>
              <input
                type="range"
                min={0}
                max={MAX_STAT}
                value={draft.stats[k]}
                onChange={(e) => setStat(k, Number(e.target.value))}
              />
              <span className="dv-slider-value">{draft.stats[k]}</span>
            </label>
          ))}

          <div className="dv-compiled-title">STRATEGY</div>
          <NumSlider
            label="entryThreshold"
            min={0.001}
            max={0.06}
            step={0.001}
            value={draft.strategy.entryThreshold}
            format={(v) => `${(v * 100).toFixed(1)}%`}
            onChange={(v) => setStrategy("entryThreshold", v)}
          />
          <NumSlider
            label="maxCurve"
            min={5}
            max={100}
            step={1}
            value={draft.strategy.maxCurve}
            format={(v) => `${v.toFixed(0)}%`}
            onChange={(v) => setStrategy("maxCurve", v)}
          />
          <NumSlider
            label="holdMin"
            min={10}
            max={600}
            step={5}
            value={draft.strategy.holdMin}
            format={(v) => `${v}t`}
            onChange={(v) => setStrategy("holdMin", Math.min(v, draft.strategy.holdMax))}
          />
          <NumSlider
            label="holdMax"
            min={20}
            max={1200}
            step={10}
            value={draft.strategy.holdMax}
            format={(v) => `${v}t`}
            onChange={(v) => setStrategy("holdMax", Math.max(v, draft.strategy.holdMin))}
          />
          <NumSlider
            label="sizeMult"
            min={0.2}
            max={3}
            step={0.05}
            value={draft.strategy.sizeMult}
            format={(v) => `${v.toFixed(2)}x`}
            onChange={(v) => setStrategy("sizeMult", v)}
          />
          <label className="dv-check">
            <input
              type="checkbox"
              checked={draft.strategy.requireBookAlign}
              onChange={(e) => setStrategy("requireBookAlign", e.target.checked)}
            />
            <span>requireBookAlign</span>
          </label>

          <div className="dv-compiled-title">SYSTEM PROMPT SUFFIX · live only</div>
          <textarea
            className="dv-input dv-textarea"
            rows={4}
            placeholder="Appended to the Claude system prompt in MODE=live. Ignored by the sim and by the backtest."
            value={draft.systemSuffix}
            onChange={(e) => props.onDraft({ ...draft, systemSuffix: e.target.value })}
          />
        </section>

        <section className="dv-forge-col">
          <div className="dv-compiled-title">COMPILED CONFIG · live preview</div>
          <div className="dv-compiled">
            <PRow k="model" v={config.model} accent />
            <PRow k="pollIntervalMs" v={String(config.pollIntervalMs)} />
            <PRow k="ctxCandles" v={String(config.ctxCandles)} />
            <PRow k="thinkingBudget" v={`${config.thinkingBudget} (effort ${config.effort})`} />
            <PRow k="positionSizeEth" v={config.positionSizeEth.toFixed(4)} />
            <PRow k="slippageBps" v={String(config.slippageBps)} />
            <PRow k="feeBps" v={String(config.feeBps)} />
            <PRow k="costPerDecision" v={fmtUsd(config.costPerDecision)} />
            <PRow k="maxTokens" v={String(config.maxTokens)} />
          </div>

          <div className="dv-compiled-title">
            BACKTEST · seed {BACKTEST_SEED} · {BACKTEST_TICKS} ticks
          </div>
          <button className="dv-btn dv-btn-wide" disabled={running} onClick={runBacktest}>
            {running ? "RUNNING…" : "RUN BACKTEST"}
          </button>

          {result && (
            <>
              <div className="dv-bt-grid">
                <BtCell label="P&L" a={fmtEth(result.build.pnlEth, 4)} b={fmtEth(result.baseline.pnlEth, 4)} good={result.pnlDelta >= 0} />
                <BtCell
                  label="WIN RATE"
                  a={`${(result.build.winRate * 100).toFixed(0)}%`}
                  b={`${(result.baseline.winRate * 100).toFixed(0)}%`}
                  good={result.winRateDelta >= 0}
                />
                <BtCell
                  label="MAX DD"
                  a={result.build.maxDrawdownEth.toFixed(4)}
                  b={result.baseline.maxDrawdownEth.toFixed(4)}
                  good={result.drawdownDelta <= 0}
                />
                <BtCell
                  label="TRADES"
                  a={String(result.build.trades)}
                  b={String(result.baseline.trades)}
                  good
                />
              </div>
              <EquityCurve build={result.build.equity} baseline={result.baseline.equity} />
              <div className={`dv-bt-verdict dv-bt-${result.verdict.toLowerCase()}`}>
                {result.verdict} THAN SNIPER PRESET · {fmtEth(result.pnlDelta, 4)} ETH
              </div>
            </>
          )}

          <div className="dv-forge-actions">
            <button className="dv-btn" onClick={exportJson}>
              {copied ? "COPIED" : "EXPORT JSON"}
            </button>
            <button
              className="dv-btn"
              disabled={!result}
              onClick={() => result && props.onPublish(draft, result)}
            >
              PUBLISH TO BOARD
            </button>
            <button
              className="dv-btn dv-btn-primary"
              disabled={!canDeploy}
              onClick={() => props.onDeploy(draft)}
              title={`${CUSTOM_DEPLOY_COST} coins · ${props.customCount}/${MAX_CUSTOM_AGENTS} deployed`}
            >
              DEPLOY · {CUSTOM_DEPLOY_COST}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

function PRow({ k, v, accent }: { k: string; v: string; accent?: boolean }): React.ReactElement {
  return (
    <div className="dv-row">
      <span className="dv-row-k">{k}</span>
      <span className="dv-row-v" style={accent ? { color: PALETTE.accent } : undefined}>
        {v}
      </span>
    </div>
  );
}

function NumSlider({
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

function BtCell({
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
