/**
 * DEX overlay: candlestick chart, order book, open positions with live P&L,
 * and the trade tape. All SVG, no chart library.
 */

import React from "react";
import { PALETTE, CLASS_COLOR, fmtEth } from "./theme.js";
import type { Candle, Snapshot } from "../core/types.js";
import type { VillageView } from "../core/village.js";
import { PROVIDER_META } from "../core/config.js";

const W = 520;
const H = 210;
const PAD = 8;

export function Candlesticks({ candles }: { candles: readonly Candle[] }): React.ReactElement {
  const view = candles.slice(Math.max(0, candles.length - 60));
  if (view.length === 0) {
    return (
      <svg className="dv-chart" viewBox={`0 0 ${W} ${H}`}>
        <text x={W / 2} y={H / 2} textAnchor="middle" className="dv-chart-empty">
          no candles yet
        </text>
      </svg>
    );
  }

  let lo = Infinity;
  let hi = -Infinity;
  for (const c of view) {
    lo = Math.min(lo, c.l);
    hi = Math.max(hi, c.h);
  }
  const range = hi - lo || hi || 1;
  lo -= range * 0.08;
  hi += range * 0.08;

  const step = (W - PAD * 2) / view.length;
  const bw = Math.max(1.6, step * 0.62);
  const yOf = (p: number) => PAD + (1 - (p - lo) / (hi - lo)) * (H - PAD * 2);

  return (
    <svg className="dv-chart" viewBox={`0 0 ${W} ${H}`}>
      {[0.25, 0.5, 0.75].map((g) => (
        <line
          key={g}
          x1={PAD}
          x2={W - PAD}
          y1={PAD + g * (H - PAD * 2)}
          y2={PAD + g * (H - PAD * 2)}
          stroke="rgba(204,255,0,0.08)"
          strokeWidth={1}
        />
      ))}
      {view.map((c, i) => {
        const cx = PAD + i * step + step / 2;
        const up = c.c >= c.o;
        const color = up ? PALETTE.up : PALETTE.down;
        const top = yOf(Math.max(c.o, c.c));
        const bot = yOf(Math.min(c.o, c.c));
        return (
          <g key={`${c.t}-${i}`}>
            <line x1={cx} x2={cx} y1={yOf(c.h)} y2={yOf(c.l)} stroke={color} strokeWidth={1} />
            <rect
              x={cx - bw / 2}
              y={top}
              width={bw}
              height={Math.max(1, bot - top)}
              fill={color}
              opacity={0.92}
            />
          </g>
        );
      })}
      <text x={W - PAD} y={PAD + 10} textAnchor="end" className="dv-chart-axis">
        {hi.toPrecision(4)}
      </text>
      <text x={W - PAD} y={H - PAD} textAnchor="end" className="dv-chart-axis">
        {lo.toPrecision(4)}
      </text>
    </svg>
  );
}

export function OrderBook({ snap }: { snap: Snapshot }): React.ReactElement {
  const rows = 8;
  const bids = snap.bids.slice(0, rows);
  const asks = snap.asks.slice(0, rows);
  const max = Math.max(
    ...bids.map((b) => b.size),
    ...asks.map((a) => a.size),
    0.0001,
  );

  return (
    <div className="dv-book">
      <div className="dv-book-col">
        <div className="dv-book-head">BIDS</div>
        {bids.map((l, i) => (
          <div className="dv-book-row" key={`b${i}`}>
            <span className="dv-book-depth dv-book-depth-bid" style={{ width: `${(l.size / max) * 100}%` }} />
            <span className="dv-book-price dv-up">{l.price.toPrecision(5)}</span>
            <span className="dv-book-size">{l.size.toFixed(3)}</span>
          </div>
        ))}
      </div>
      <div className="dv-book-col">
        <div className="dv-book-head">ASKS</div>
        {asks.map((l, i) => (
          <div className="dv-book-row" key={`a${i}`}>
            <span className="dv-book-depth dv-book-depth-ask" style={{ width: `${(l.size / max) * 100}%` }} />
            <span className="dv-book-price dv-down">{l.price.toPrecision(5)}</span>
            <span className="dv-book-size">{l.size.toFixed(3)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * What the chain feed is doing. The DEX prints this verbatim: a terminal that
 * silently shows nothing when its feed is down is worse than no terminal.
 */
export interface ChainStatus {
  state: "off" | "connecting" | "live" | "wrong-chain" | "error";
  endpoint?: string;
  chainId?: number;
  head?: number;
  tokens?: Array<{ address: string; symbol: string; ageSeconds: number; blockNumber: number }>;
  readAt?: number;
  error?: string;
}

/**
 * The chain feed panel: raw `eth_getLogs` output, nothing added. Ages are
 * derived from the block gap at ten blocks a second, and say so.
 */
export function ChainFeed({ chain }: { chain: ChainStatus }): React.ReactElement {
  const rows = chain.tokens ?? [];
  return (
    <div className="dv-chain">
      <div className="dv-book-head">
        ROBINHOOD CHAIN · LIVE LAUNCHES
        <span className={`dv-chain-state dv-chain-${chain.state}`}>{chain.state}</span>
      </div>
      <div className="dv-chain-meta">
        {chain.endpoint}
        {chain.chainId !== undefined && ` · chain ${chain.chainId}`}
        {chain.head !== undefined && ` · head ${chain.head.toLocaleString()}`}
        {chain.readAt && ` · read ${new Date(chain.readAt).toLocaleTimeString()}`}
      </div>
      {chain.state === "error" && (
        <div className="dv-empty">feed unavailable — {chain.error}</div>
      )}
      {chain.state === "connecting" && <div className="dv-empty">reading logs…</div>}
      {rows.map((t) => (
        <div className="dv-chain-row" key={t.address}>
          <span className="dv-chain-sym">{t.symbol}</span>
          <span className="dv-chain-addr">{t.address}</span>
          <span className="dv-chain-age">~{t.ageSeconds}s</span>
        </div>
      ))}
      {chain.state === "live" && rows.length === 0 && (
        <div className="dv-empty">no launches in the window</div>
      )}
    </div>
  );
}

export interface DexOverlayProps {
  view: VillageView;
  pair: string | null;
  onPair(pair: string): void;
  chain?: ChainStatus;
  onClose(): void;
}

export function DexOverlay({ view, pair, onPair, chain, onClose }: DexOverlayProps): React.ReactElement {
  const entries = view.snapshots;
  const active = entries.find((e) => e.pair === pair) ?? entries[0] ?? null;
  const positions = view.agents.filter((a) => a.position);

  return (
    <div className="dv-dex">
      <div className="dv-dex-head">
        <span className="dv-dex-title">PAPER MARKET</span>
        <div className="dv-dex-pairs">
          {entries.map((e) => (
            <button
              key={e.pair}
              className={`dv-btn dv-btn-tiny${active?.pair === e.pair ? " dv-btn-on" : ""}`}
              onClick={() => onPair(e.pair)}
            >
              {e.pair}
            </button>
          ))}
        </div>
        <button className="dv-btn dv-btn-tiny" onClick={onClose}>
          CLOSE
        </button>
      </div>

      {active ? (
        <>
          <div className="dv-dex-meta">
            <span>last {active.snap.last.toPrecision(6)}</span>
            <span>{active.snap.provenance?.identity === "exchange" ? "ETH quotes · exchange metadata: age/buyers/curve/reserve N/A" : `age ${active.snap.ageMinutes.toFixed(0)}m`}</span>
            {active.snap.provenance?.identity !== "exchange" && <><span>buyers {active.snap.uniqueBuyers}</span>
            <span>curve {active.snap.curveProgressPct.toFixed(1)}%</span>
            <span>reserve {active.snap.reserveEth.toFixed(2)} ETH</span></>}
            {active.snap.tokenAddress && (
              <span className="dv-chain-tag" title={active.snap.tokenAddress}>
                {active.snap.tokenAddress.slice(0, 6)}…{active.snap.tokenAddress.slice(-4)}
              </span>
            )}
          </div>
          {active.snap.provenance && (
            <div className="dv-prov">
              identity <b>{active.snap.provenance.identity}</b> · price{" "}
              <b>{active.snap.provenance.price}</b> · book{" "}
              <b>{active.snap.provenance.book}</b> · fills <b>paper</b>
              {active.snap.validUntil && <span> · {Date.now() >= active.snap.validUntil ? "STALE — fills paused" : "fresh"} · book midpoint · 1-minute trade candles</span>}
            </div>
          )}
          <div className="dv-dex-body">
            <Candlesticks candles={active.snap.candles} />
            <OrderBook snap={active.snap} />
          </div>
        </>
      ) : (
        <div className="dv-dex-meta">waiting for the first snapshot…</div>
      )}

      {chain && chain.state !== "off" && <ChainFeed chain={chain} />}

      <div className="dv-dex-split">
        <div className="dv-dex-positions">
          <div className="dv-book-head">OPEN POSITIONS</div>
          {positions.length === 0 && <div className="dv-empty">flat</div>}
          {positions.map((a) => {
            const p = a.position!;
            return (
              <div className="dv-pos" key={a.id}>
                <span style={{ color: CLASS_COLOR[a.cls] }}>{a.name}</span>
                <span>{p.pair}</span>
                <span>{p.sizeEth.toFixed(3)} ETH</span>
                <span>@{p.entryPrice.toPrecision(5)}</span>
                <span style={{ color: p.unrealizedEth >= 0 ? PALETTE.up : PALETTE.down }}>
                  {fmtEth(p.unrealizedEth, 4)}
                </span>
              </div>
            );
          })}
        </div>

        <div className="dv-dex-tape">
          <div className="dv-book-head">TAPE</div>
          {view.tape.length === 0 && <div className="dv-empty">no fills yet</div>}
          {[...view.tape].reverse().map((t) => (
            <div className="dv-tape-row" key={t.id}>
              <span className={`dv-tag dv-tag-${t.action.toLowerCase()}`}>{t.action}</span>
              <span style={{ color: CLASS_COLOR[t.cls] }}>{t.agentName}</span>
              <span style={{ color: PROVIDER_META[t.provider].color }}>{PROVIDER_META[t.provider].label}</span>
              <span>{t.pair}</span>
              <span>{t.sizeEth.toFixed(3)}</span>
              <span style={{ color: t.pnlEth >= 0 ? PALETTE.up : PALETTE.down }}>
                {t.action === "SELL" ? fmtEth(t.pnlEth, 4) : "—"}
              </span>
              <span className="dv-tape-reason">{t.reason}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
