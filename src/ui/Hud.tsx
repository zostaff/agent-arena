/**
 * HUD. Glassmorphism cards over the scene.
 *
 * The inspector is the point of the whole game: every bar it shows is a field
 * the engine reads, and the compiled config underneath updates as the bar fills.
 */

import React from "react";
import { CLASS_COLOR, PALETTE, fmtEth, fmtUsd } from "./theme.js";
import {
  STAT_KEYS,
  STAT_LABEL,
  MAX_STAT,
  PROVIDERS,
  PROVIDER_META,
  modelForPtn,
  type BoostKind,
} from "../core/config.js";
import {
  BOOST_DEFS,
  MAX_BUILDING_LEVEL,
  MAX_CUSTOM_AGENTS,
  CUSTOM_DEPLOY_COST,
  REWIRE_COST,
  type BuildingId,
  type VillageView,
} from "../core/village.js";
import type { Provider } from "../core/types.js";
import type { VillageEntry } from "./storage.js";

export interface StatCardsProps {
  view: VillageView;
  rank: number | null;
}

export function StatCards({ view, rank }: StatCardsProps): React.ReactElement {
  const net = view.netPnlEth;
  return (
    <div className="dv-cards">
      <div className="dv-card">
        <div className="dv-card-label">TREASURY</div>
        <div className="dv-card-value">{Math.floor(view.treasury).toLocaleString()}</div>
        <div className="dv-card-sub">+{view.passiveYield.toFixed(3)}/tick · cut {(view.cutRate * 100).toFixed(0)}%</div>
      </div>
      <div className="dv-card">
        <div className="dv-card-label">NET P&amp;L</div>
        <div className="dv-card-value" style={{ color: net >= 0 ? PALETTE.up : PALETTE.down }}>
          {fmtEth(net)} ETH
        </div>
        <div className="dv-card-sub">burned {fmtUsd(view.totalSpentUsd)} on inference</div>
      </div>
      <div className="dv-card">
        <div className="dv-card-label">ROSTER</div>
        <div className="dv-card-value">{view.agents.length}</div>
        <div className="dv-card-sub">
          {view.agents.filter((a) => a.custom).length}/{MAX_CUSTOM_AGENTS} custom · tick {view.tick}
        </div>
      </div>
      <div className="dv-card">
        <div className="dv-card-label">RANK</div>
        <div className="dv-card-value">{rank === null ? "—" : `#${rank}`}</div>
        <div className="dv-card-sub">VILLAGES board</div>
      </div>
    </div>
  );
}

export function BoostTimers({
  view,
  onBuy,
}: {
  view: VillageView;
  onBuy(kind: BoostKind): void;
}): React.ReactElement {
  return (
    <div className="dv-boosts">
      {view.boosts.map((b) => {
        const def = BOOST_DEFS.find((d) => d.kind === b.kind)!;
        const pct = b.ticksLeft / b.totalTicks;
        return (
          <div key={b.kind} className="dv-boost-timer">
            <div className="dv-boost-name">{def.label}</div>
            <div className="dv-boost-bar">
              <span style={{ width: `${pct * 100}%` }} />
            </div>
            <div className="dv-boost-left">{b.ticksLeft}t</div>
          </div>
        );
      })}
      <div className="dv-boost-shop">
        {BOOST_DEFS.map((d) => (
          <button
            key={d.kind}
            className="dv-btn dv-btn-boost"
            disabled={view.treasury < d.cost}
            title={d.effect}
            onClick={() => onBuy(d.kind)}
          >
            {d.label} <span>{d.cost}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function RivalStandings({
  entries,
  meId,
}: {
  entries: VillageEntry[];
  meId: string;
}): React.ReactElement {
  const top = entries.slice(0, 3);
  return (
    <div className="dv-rivals">
      <div className="dv-rivals-title">RIVAL VILLAGES</div>
      {top.length === 0 && <div className="dv-rivals-empty">no villages published yet</div>}
      {top.map((v, i) => (
        <div key={v.id} className={`dv-rival${v.id === meId ? " dv-rival-me" : ""}`}>
          <span className="dv-rival-rank">{i + 1}</span>
          <span className="dv-rival-name">{v.name}</span>
          <span
            className="dv-rival-pnl"
            style={{ color: v.netPnlEth >= 0 ? PALETTE.up : PALETTE.down }}
          >
            {fmtEth(v.netPnlEth)}
          </span>
        </div>
      ))}
    </div>
  );
}

export function SpeedControls({
  speed,
  paused,
  onSpeed,
  onPause,
}: {
  speed: number;
  paused: boolean;
  onSpeed(v: number): void;
  onPause(): void;
}): React.ReactElement {
  return (
    <div className="dv-speed">
      <button className={`dv-btn${paused ? " dv-btn-on" : ""}`} onClick={onPause}>
        {paused ? "RESUME" : "PAUSE"}
      </button>
      {[1, 2, 4, 8].map((s) => (
        <button
          key={s}
          className={`dv-btn${speed === s && !paused ? " dv-btn-on" : ""}`}
          onClick={() => onSpeed(s)}
        >
          {s}x
        </button>
      ))}
    </div>
  );
}

export function StatBar({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}): React.ReactElement {
  return (
    <div className="dv-statbar">
      <span className="dv-statbar-label">{label}</span>
      <span className="dv-statbar-track">
        <span
          className="dv-statbar-fill"
          style={{ width: `${(value / MAX_STAT) * 100}%`, background: color }}
        />
      </span>
      <span className="dv-statbar-value">{value}</span>
    </div>
  );
}

export function AgentInspector({
  view,
  agentId,
  onRewire,
}: {
  view: VillageView;
  agentId: string | null;
  onRewire?(agentId: string, provider: Provider): void;
}): React.ReactElement | null {
  const agent = view.agents.find((a) => a.id === agentId);
  if (!agent) return null;
  const cfg = agent.config;
  const color = CLASS_COLOR[agent.cls];
  const house = PROVIDER_META[cfg.provider];
  /* An agent holding a position keeps the house that opened it. */
  const canRewire = agent.position === null && view.treasury >= REWIRE_COST;

  return (
    <div className="dv-panel dv-inspector">
      <div className="dv-panel-head">
        <span style={{ color }}>{agent.name}</span>
        <span className="dv-panel-sub">
          {agent.cls}
          {agent.custom ? " · CUSTOM" : ""} · L{agent.level} · {agent.state}
        </span>
      </div>

      <div className="dv-stats">
        {STAT_KEYS.map((k) => (
          <StatBar key={k} label={STAT_LABEL[k]} value={agent.stats[k]} color={color} />
        ))}
      </div>

      <div className="dv-compiled">
        <div className="dv-compiled-title">COMPILED CONFIG</div>
        <Row k="provider" v={house.label} />
        <Row k="model" v={cfg.model} accent />
        <Row k="pollIntervalMs" v={String(cfg.pollIntervalMs)} />
        <Row k="ctxCandles" v={String(cfg.ctxCandles)} />
        <Row k="thinkingBudget" v={`${cfg.thinkingBudget} (effort ${cfg.effort})`} />
        <Row k="positionSizeEth" v={cfg.positionSizeEth.toFixed(4)} />
        <Row k="slippageBps" v={String(cfg.slippageBps)} />
        <Row k="feeBps" v={String(cfg.feeBps)} />
        <Row k="costPerDecision" v={fmtUsd(cfg.costPerDecision)} />
      </div>

      {onRewire && (
        <div className="dv-compiled">
          <div className="dv-compiled-title">REWIRE · {REWIRE_COST} coins</div>
          <div className="dv-house-row">
            {PROVIDERS.map((p) => {
              const m = PROVIDER_META[p];
              const on = p === cfg.provider;
              return (
                <button
                  key={p}
                  className={`dv-btn dv-house-btn${on ? " dv-house-on" : ""}`}
                  style={on ? { borderColor: m.color, color: m.color } : undefined}
                  disabled={on || !canRewire}
                  title={m.note}
                  onClick={() => onRewire(agent.id, p)}
                >
                  {m.label}
                </button>
              );
            })}
          </div>
          <div className="dv-house-note">
            {agent.position
              ? "holding a position — rewire after it settles"
              : `${modelForPtn(agent.stats.ptn, cfg.provider)} at PTN ${agent.stats.ptn}`}
          </div>
        </div>
      )}

      <div className="dv-compiled">
        <div className="dv-compiled-title">RECORD</div>
        <Row k="realized" v={`${fmtEth(agent.realizedPnlEth)} ETH`} />
        <Row k="unrealized" v={`${fmtEth(agent.unrealizedPnlEth)} ETH`} />
        <Row k="trades / wins" v={`${agent.trades} / ${agent.wins}`} />
        <Row k="decisions / skips" v={`${agent.decisions} / ${agent.skips}`} />
        <Row k="inference spend" v={fmtUsd(agent.spentUsd)} />
      </div>

      {agent.verdict && (
        <div className="dv-verdict">
          <span className={`dv-tag dv-tag-${agent.verdict.action.toLowerCase()}`}>
            {agent.verdict.action}
          </span>
          <span className="dv-verdict-reason">{agent.verdict.reason}</span>
        </div>
      )}
    </div>
  );
}

function Row({ k, v, accent }: { k: string; v: string; accent?: boolean }): React.ReactElement {
  return (
    <div className="dv-row">
      <span className="dv-row-k">{k}</span>
      <span className="dv-row-v" style={accent ? { color: PALETTE.accent } : undefined}>
        {v}
      </span>
    </div>
  );
}

export function BuildingPanel({
  view,
  buildingId,
  onBuild,
  onUpgrade,
  onRush,
  rushCost,
  nextCost,
}: {
  view: VillageView;
  buildingId: BuildingId | null;
  onBuild(id: BuildingId): void;
  onUpgrade(id: BuildingId): void;
  onRush(id: BuildingId): void;
  rushCost: number;
  nextCost: { cost: number; ticks: number; toLevel: number } | null;
}): React.ReactElement | null {
  const b = view.buildings.find((x) => x.id === buildingId);
  if (!b) return null;
  const built = b.level > 0;

  return (
    <div className="dv-panel dv-building-panel">
      <div className="dv-panel-head">
        <span style={{ color: PALETTE.accent }}>{b.id}</span>
        <span className="dv-panel-sub">
          {built ? `LEVEL ${b.level} / ${MAX_BUILDING_LEVEL}` : "NOT BUILT"}
          {b.trains ? ` · trains ${STAT_LABEL[b.trains]}` : ""}
        </span>
      </div>

      {b.job ? (
        <>
          <div className="dv-row">
            <span className="dv-row-k">{b.job.kind === "build" ? "constructing" : `upgrading to L${b.job.toLevel}`}</span>
            <span className="dv-row-v">{b.job.ticksLeft}t left</span>
          </div>
          <button
            className="dv-btn dv-btn-wide"
            disabled={view.treasury < rushCost}
            onClick={() => onRush(b.id)}
          >
            RUSH · {rushCost} coins
          </button>
        </>
      ) : nextCost ? (
        <button
          className="dv-btn dv-btn-wide"
          disabled={view.treasury < nextCost.cost}
          onClick={() => (built ? onUpgrade(b.id) : onBuild(b.id))}
        >
          {built ? `UPGRADE TO L${nextCost.toLevel}` : "BUILD"} · {nextCost.cost} coins · {nextCost.ticks}t
        </button>
      ) : (
        <div className="dv-row">
          <span className="dv-row-k">status</span>
          <span className="dv-row-v">max level</span>
        </div>
      )}
    </div>
  );
}

export { CUSTOM_DEPLOY_COST };
