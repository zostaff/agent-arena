/**
 * DEGEN VILLAGE — deterministic heuristic brain.
 *
 * This is the sim's stand-in for Claude. It reads exactly the strategy
 * parameters FORGE exposes, so a backtest measures the build the player
 * authored and nothing else. No randomness, no clock, no network.
 */

import type { Brain, BrainOpts, Snapshot, Verdict } from "../core/types.js";
import { bookImbalance, momentum, volatility } from "../core/market.js";

export interface HeuristicOptions {
  /** Candles of momentum the entry signal looks back over. */
  lookback?: number;
  /** Book imbalance that counts as "aligned" when requireBookAlign is on. */
  alignThreshold?: number;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function heuristicBrain(options: HeuristicOptions = {}): Brain {
  const lookback = options.lookback ?? 6;
  const alignThreshold = options.alignThreshold ?? 0.06;

  function evaluate(snap: Snapshot, opts: BrainOpts): Verdict {
    const s = opts.strategy;
    const mom = momentum(snap.candles, lookback);
    const vol = volatility(snap.candles, lookback);
    const imb = bookImbalance(snap);

    /* Holding: the exit is a function of the same signal that opened it. */
    if (opts.inPosition) {
      const exhausted = mom < -s.entryThreshold * 0.6;
      const bookTurned = s.requireBookAlign && imb < -alignThreshold;
      if (exhausted || bookTurned) {
        return {
          action: "SELL",
          sizeEth: opts.maxSizeEth,
          confidence: clamp(0.4 + Math.abs(mom) * 8, 0, 1),
          holdTicks: s.holdMin,
          reason: exhausted ? "momentum rolled over" : "book turned against position",
        };
      }
      return {
        action: "SKIP",
        sizeEth: 0,
        confidence: clamp(0.3 + mom * 6, 0, 1),
        holdTicks: 0,
        reason: "holding, thesis intact",
      };
    }

    if (snap.curveProgressPct > s.maxCurve) {
      return {
        action: "SKIP",
        sizeEth: 0,
        confidence: 0,
        holdTicks: 0,
        reason: `curve ${snap.curveProgressPct.toFixed(0)}% past ${s.maxCurve}%`,
      };
    }
    if (mom < s.entryThreshold) {
      return {
        action: "SKIP",
        sizeEth: 0,
        confidence: 0,
        holdTicks: 0,
        reason: `momentum ${(mom * 100).toFixed(2)}% under threshold`,
      };
    }
    if (s.requireBookAlign && imb < alignThreshold) {
      return {
        action: "SKIP",
        sizeEth: 0,
        confidence: 0,
        holdTicks: 0,
        reason: "book not aligned",
      };
    }

    /* Class lenses, expressed as numbers rather than sentences. */
    let edge = mom / Math.max(s.entryThreshold, 1e-6) - 1;
    if (opts.agentClass === "SCOUT" && snap.provenance?.identity !== "exchange" && snap.ageMinutes < 8) edge += 0.6;
    if (opts.agentClass === "WHALE" && snap.curveProgressPct > 40) edge += 0.5;
    if (opts.agentClass === "ARB") edge += imb * 1.2;
    if (opts.agentClass === "SNIPER") edge -= 0.35;
    edge += imb * 0.8;
    edge -= vol * 3;

    const confidence = clamp(edge / 3, 0, 1);
    if (confidence <= 0.08) {
      return {
        action: "SKIP",
        sizeEth: 0,
        confidence,
        holdTicks: 0,
        reason: "edge too thin",
      };
    }

    const sizeEth = clamp(opts.maxSizeEth * (0.35 + confidence * 0.65), 0, opts.maxSizeEth);
    const holdTicks = Math.round(s.holdMin + (s.holdMax - s.holdMin) * (1 - confidence));

    return {
      action: "BUY",
      sizeEth,
      confidence,
      holdTicks,
      reason: `mom ${(mom * 100).toFixed(2)}% imb ${imb.toFixed(2)} curve ${snap.curveProgressPct.toFixed(0)}%`,
    };
  }

  return {
    async decide(snap: Snapshot, opts: BrainOpts): Promise<Verdict> {
      try {
        const v = evaluate(snap, opts);
        /* Same hardening as the live path: never trust a size. */
        return { ...v, sizeEth: clamp(v.sizeEth, 0, opts.maxSizeEth) };
      } catch {
        return { action: "SKIP", sizeEth: 0, confidence: 0, holdTicks: 0, reason: "heuristic error" };
      }
    },
  };
}
