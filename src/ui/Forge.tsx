/**
 * FORGE — the custom agent builder.
 *
 * 20 stat points, six strategy parameters the sim brain genuinely reads, and a
 * system prompt suffix that only matters in live mode. The compiled config
 * preview updates on every slider move, and the backtest is the same seeded,
 * deterministic 7000-tick run the leaderboard ranks.
 */

import React, { useMemo, useState } from "react";
import { PALETTE, fmtEth, fmtUsd } from "./theme.js";
import {
  FORGE_STAT_BUDGET,
  MAX_STAT,
  PROVIDER_META,
  STAT_KEYS,
  STAT_LABEL,
  compileConfig,
  type Stats,
} from "../core/config.js";
import type { StrategyParams } from "../core/types.js";
import {
  BACKTEST_SEED,
  BACKTEST_TICKS,
  backtestAgainstBaseline,
  type BacktestComparison,
} from "../sim/backtest.js";
import { CUSTOM_DEPLOY_COST, MAX_CUSTOM_AGENTS } from "../core/economy.js";

import { BUILD_VERSION, MAX_SYSTEM_SUFFIX_LENGTH, STRATEGY_LIMITS, statsSpent, type ForgeDraft } from "../core/build.js";
import { HousePicker, PRow, NumSlider, BtCell, EquityCurve } from "./ForgeWidgets.jsx";
import { BuildImport } from "./BuildImport.jsx";

export { EMPTY_DRAFT, statsSpent, type ForgeDraft } from "../core/build.js";
export { HousePicker, EquityCurve } from "./ForgeWidgets.jsx";

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
  const [completed, setCompleted] = useState<{ key: string; result: BacktestComparison } | null>(null);
  const draftKey = JSON.stringify(draft);
  const result = completed?.key === draftKey ? completed.result : null;
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const spent = statsSpent(draft.stats);
  const remaining = FORGE_STAT_BUDGET - spent;
  const config = useMemo(
    () =>
      compileConfig(draft.stats, 0, [], {
        basePositionEth: 0.05 * draft.strategy.sizeMult,
        provider: draft.provider,
      }),
    [draft.stats, draft.strategy.sizeMult, draft.provider],
  );

  function setStat(key: keyof Stats, value: number): void {
    const next = Math.max(0, Math.min(MAX_STAT, value));
    const others = STAT_KEYS.filter((k) => k !== key).reduce((a, k) => a + draft.stats[k], 0);
    if (others + next > FORGE_STAT_BUDGET) return;
    props.onDraft({ ...draft, stats: { ...draft.stats, [key]: next } });
    setCompleted(null);
  }

  function setStrategy<K extends keyof StrategyParams>(key: K, value: StrategyParams[K]): void {
    props.onDraft({ ...draft, strategy: { ...draft.strategy, [key]: value } });
    setCompleted(null);
  }

  async function runBacktest(): Promise<void> {
    setRunning(true);
    setError(null);
    try {
      /* The backtest is the seeded heuristic brain: it measures the BUILD, so
         it is identical across houses on purpose. The house shows up in the
         cost line above, not in the P&L below. */
      const cmp = await backtestAgainstBaseline({
        name: draft.name || "UNNAMED",
        stats: draft.stats,
        strategy: draft.strategy,
        systemSuffix: draft.systemSuffix,
        provider: draft.provider,
      });
      setCompleted({ key: draftKey, result: cmp });
    } catch {
      setError("Backtest failed. Try running it again.");
    } finally {
      setRunning(false);
    }
  }

  async function exportJson(): Promise<void> {
    const payload = {
      version: BUILD_VERSION,
      name: draft.name.trim() || "UNNAMED",
      provider: draft.provider,
      stats: draft.stats,
      strategy: draft.strategy,
      systemSuffix: draft.systemSuffix,
      compiled: config,
      backtest: result
        ? {
            seed: result.build.seed,
            ticks: result.build.ticks,
            pnlEth: result.build.pnlEth,
            spentUsd: result.build.spentUsd,
            netEth: result.build.netEth,
            winRate: result.build.winRate,
            maxDrawdownEth: result.build.maxDrawdownEth,
            trades: result.build.trades,
            houses: result.houses,
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

          <div className="dv-compiled-title">HOUSE · the model this build runs on</div>
          <HousePicker
            value={draft.provider}
            ptn={draft.stats.ptn}
            onChange={(pv) => {
              props.onDraft({ ...draft, provider: pv });
              setCompleted(null);
            }}
          />

          <div className="dv-compiled-title">STRATEGY</div>
          <NumSlider
            label="entryThreshold"
            {...STRATEGY_LIMITS.entryThreshold}
            step={0.001}
            value={draft.strategy.entryThreshold}
            format={(v) => `${(v * 100).toFixed(1)}%`}
            onChange={(v) => setStrategy("entryThreshold", v)}
          />
          <NumSlider
            label="maxCurve"
            {...STRATEGY_LIMITS.maxCurve}
            step={1}
            value={draft.strategy.maxCurve}
            format={(v) => `${v.toFixed(0)}%`}
            onChange={(v) => setStrategy("maxCurve", v)}
          />
          <NumSlider
            label="holdMin"
            {...STRATEGY_LIMITS.holdMin}
            step={5}
            value={draft.strategy.holdMin}
            format={(v) => `${v}t`}
            onChange={(v) => setStrategy("holdMin", Math.min(v, draft.strategy.holdMax))}
          />
          <NumSlider
            label="holdMax"
            {...STRATEGY_LIMITS.holdMax}
            step={10}
            value={draft.strategy.holdMax}
            format={(v) => `${v}t`}
            onChange={(v) => setStrategy("holdMax", Math.max(v, draft.strategy.holdMin))}
          />
          <NumSlider
            label="sizeMult"
            {...STRATEGY_LIMITS.sizeMult}
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
            maxLength={MAX_SYSTEM_SUFFIX_LENGTH}
            placeholder="Appended to the system prompt in MODE=live, whichever house. Ignored by the sim and by the backtest."
            value={draft.systemSuffix}
            onChange={(e) => props.onDraft({ ...draft, systemSuffix: e.target.value })}
          />
          <BuildImport onImport={(next) => {
            props.onDraft(next);
            setCompleted(null);
            setError(null);
          }} />
        </section>

        <section className="dv-forge-col">
          <div className="dv-compiled-title">COMPILED CONFIG · live preview</div>
          <div className="dv-compiled">
            <PRow k="provider" v={PROVIDER_META[config.provider].label} />
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
          {error && <div className="dv-empty" role="alert">{error}</div>}

          {result && (
            <>
              <div className="dv-bt-grid">
                <BtCell
                  label="NET · after inference"
                  a={fmtEth(result.build.netEth, 4)}
                  b={fmtEth(result.baseline.netEth, 4)}
                  good={result.netDelta >= 0}
                />
                <BtCell label="P&L gross" a={fmtEth(result.build.pnlEth, 4)} b={fmtEth(result.baseline.pnlEth, 4)} good={result.pnlDelta >= 0} />
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
                <BtCell
                  label="SPEND"
                  a={fmtUsd(result.build.spentUsd)}
                  b={fmtUsd(result.baseline.spentUsd)}
                  good={result.build.spentUsd <= result.baseline.spentUsd}
                />
                <BtCell
                  label="DECISIONS"
                  a={String(result.build.decisions)}
                  b={String(result.baseline.decisions)}
                  good
                />
              </div>

              <div className="dv-compiled-title">
                THE SAME RUN, PRICED ON EACH HOUSE
              </div>
              <div className="dv-compiled">
                {result.houses.map((h) => (
                  <div className="dv-row" key={h.provider}>
                    <span className="dv-row-k">
                      {PROVIDER_META[h.provider].label} · {h.model}
                    </span>
                    <span
                      className="dv-row-v"
                      style={{
                        color:
                          h.provider === draft.provider
                            ? PALETTE.accent
                            : h.netEth >= 0
                              ? PALETTE.up
                              : PALETTE.down,
                      }}
                    >
                      {fmtEth(h.netEth, 4)} net · {fmtUsd(h.spentUsd)}
                    </span>
                  </div>
                ))}
              </div>
              <EquityCurve build={result.build.equity} baseline={result.baseline.equity} />
              <div className={`dv-bt-verdict dv-bt-${result.verdict.toLowerCase()}`}>
                {result.verdict} THAN SNIPER PRESET · {fmtEth(result.netDelta, 4)} ETH NET
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
