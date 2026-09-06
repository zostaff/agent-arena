/**
 * The shared leaderboard. Two rankings that measure different things:
 *
 *   BUILDS   deterministic backtest P&L on seed 42 — a skill score
 *   VILLAGES live session net P&L — an economy score
 *
 * Tapping a build loads its stats and strategy straight into FORGE.
 */

import React from "react";
import { PALETTE, fmtEth } from "./theme.js";
import { STAT_KEYS, STAT_LABEL } from "../core/config.js";
import type { Board, BuildEntry, VillageEntry } from "./storage.js";
import { isShared } from "./storage.js";

export interface BoardPanelProps {
  board: Board;
  meOwner: string;
  tab: "BUILDS" | "VILLAGES";
  onTab(tab: "BUILDS" | "VILLAGES"): void;
  onLoadBuild(entry: BuildEntry): void;
  onClose(): void;
}

export function BoardPanel(props: BoardPanelProps): React.ReactElement {
  return (
    <div className="dv-board">
      <div className="dv-dex-head">
        <span className="dv-dex-title">LEADERBOARD</span>
        <div className="dv-dex-pairs">
          {(["BUILDS", "VILLAGES"] as const).map((t) => (
            <button
              key={t}
              className={`dv-btn dv-btn-tiny${props.tab === t ? " dv-btn-on" : ""}`}
              onClick={() => props.onTab(t)}
            >
              {t}
            </button>
          ))}
        </div>
        <button className="dv-btn dv-btn-tiny" onClick={props.onClose}>
          CLOSE
        </button>
      </div>

      <div className="dv-board-note">
        {isShared()
          ? "shared board · window.storage"
          : "local board · window.storage unavailable, falling back to localStorage"}
      </div>

      {props.tab === "BUILDS" ? (
        <BuildsTable entries={props.board.builds} meOwner={props.meOwner} onLoad={props.onLoadBuild} />
      ) : (
        <VillagesTable entries={props.board.villages} meOwner={props.meOwner} />
      )}
    </div>
  );
}

function BuildsTable({
  entries,
  meOwner,
  onLoad,
}: {
  entries: BuildEntry[];
  meOwner: string;
  onLoad(e: BuildEntry): void;
}): React.ReactElement {
  if (entries.length === 0) return <div className="dv-empty">no builds published yet — run a backtest and publish</div>;
  return (
    <div className="dv-board-table">
      <div className="dv-board-row dv-board-head">
        <span>#</span>
        <span>BUILD</span>
        <span>OWNER</span>
        <span>STATS</span>
        <span>P&amp;L</span>
        <span>WR</span>
        <span>MAX DD</span>
        <span />
      </div>
      {entries.map((e, i) => (
        <div className={`dv-board-row${e.owner === meOwner ? " dv-board-me" : ""}`} key={e.id}>
          <span>{i + 1}</span>
          <span className="dv-board-name">{e.name}</span>
          <span className="dv-board-owner">{e.owner}</span>
          <span className="dv-board-stats">
            {STAT_KEYS.map((k) => `${STAT_LABEL[k]}${e.stats[k]}`).join(" ")}
          </span>
          <span style={{ color: e.pnlEth >= 0 ? PALETTE.up : PALETTE.down }}>{fmtEth(e.pnlEth, 4)}</span>
          <span>{(e.winRate * 100).toFixed(0)}%</span>
          <span>{e.maxDrawdownEth.toFixed(4)}</span>
          <span>
            <button className="dv-btn dv-btn-tiny" onClick={() => onLoad(e)}>
              LOAD
            </button>
          </span>
        </div>
      ))}
    </div>
  );
}

function VillagesTable({
  entries,
  meOwner,
}: {
  entries: VillageEntry[];
  meOwner: string;
}): React.ReactElement {
  if (entries.length === 0) return <div className="dv-empty">no villages published yet</div>;
  return (
    <div className="dv-board-table">
      <div className="dv-board-row dv-board-head dv-board-row-v">
        <span>#</span>
        <span>VILLAGE</span>
        <span>OWNER</span>
        <span>NET P&amp;L</span>
        <span>TREASURY</span>
        <span>ROSTER</span>
        <span>TICKS</span>
      </div>
      {entries.map((e, i) => (
        <div
          className={`dv-board-row dv-board-row-v${e.owner === meOwner ? " dv-board-me" : ""}`}
          key={e.id}
        >
          <span>{i + 1}</span>
          <span className="dv-board-name">{e.name}</span>
          <span className="dv-board-owner">{e.owner}</span>
          <span style={{ color: e.netPnlEth >= 0 ? PALETTE.up : PALETTE.down }}>
            {fmtEth(e.netPnlEth, 4)}
          </span>
          <span>{Math.floor(e.treasury)}</span>
          <span>{e.roster}</span>
          <span>{e.ticks}</span>
        </div>
      ))}
    </div>
  );
}
