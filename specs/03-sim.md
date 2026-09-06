# 03 — Sim mode (`src/sim/`)

Deterministic, seeded, free. Everything the leaderboard ranks runs here.

## `rng.ts`

`mulberry32(seed)` — 32-bit PRNG, identical on every platform. `gaussian()` is
Box–Muller on top of it. There is no `Math.random` anywhere in a seeded path.

## `market.ts` — `SimMarket`

Momentum random walk per pair, folded into OHLC candles by
`CandleAggregator` (30 ticks per candle), with a synthetic book drawn from the
same seeded stream.

```
shock     = gaussian() * vol
momentum  = momentum * momentumDecay + shock     (AR(1))
ret       = drift + momentum
price     = price * exp(ret)
volume    = reserve * (0.0006 + |ret| * 1.5) * (0.4 + rng())
reserve  += volume * (ret > 0 ? 0.514 : -0.486)  clamped to [0.05, 140]
```

Four default pairs, deliberately different animals:

| Pair | vol | decay | drift | start reserve | age |
|---|---|---|---|---|---|
| `$RUG` | 0.0021 | 0.86 | −0.000042 | 3.1 ETH | 2 min |
| `$MCAT` | 0.0011 | 0.74 | +0.000012 | 11.4 ETH | 14 min |
| `$DGEN` | 0.0015 | 0.81 | +0.000005 | 6.8 ETH | 6 min |
| `$WJK` | 0.0008 | 0.68 | +0.000018 | 22.9 ETH | 41 min |

`vol` is **per tick**, not per candle; the AR(1) term amplifies it by roughly
`1/(1 - decay)`. Over 7000 ticks this lands candle ranges around 3%, momentum
in ±8–11%, and curve progress spread across 3%–45%. Tuning any of these
numbers changes every published backtest — see `09-tests.md`.

The book is regenerated once per candle so repeated snapshots inside one candle
are stable. Spread widens as the curve thins:
`spreadUnit = max(0.0004, 0.035 / (1 + reserve * 0.9))`, level size
`max(0.03, reserve / 45)`. This is where GAS earns its keep — a young pair can
quote a fill outside an untrained agent's slippage tolerance and the fill is
refused rather than eaten.

`advance(ticks)` steps the clock. The village calls it through
`VillageOptions.onTick`, so market evolution is tied to the tick counter and
not to how many snapshots anyone happened to ask for.

## `brain.ts` — `heuristicBrain`

The sim's stand-in for Claude. No randomness, no clock, no network. Reads
exactly the six `StrategyParams` that FORGE exposes, so a backtest measures the
build the player authored and nothing else.

```
if inPosition:  SELL when momentum rolls over past -entryThreshold*0.6,
                or (requireBookAlign and the book turns against the position)
else:           SKIP if curve > maxCurve
                SKIP if momentum < entryThreshold
                SKIP if requireBookAlign and imbalance < 0.06
                edge = momentum/entryThreshold - 1
                     + class adjustment + imbalance*0.8 - volatility*3
                confidence = clamp(edge / 3, 0, 1); SKIP under 0.08
                sizeEth   = maxSizeEth * (0.35 + confidence * 0.65)
                holdTicks = holdMin + (holdMax - holdMin) * (1 - confidence)
```

Class adjustments are the numeric form of the live prompt lenses: SCOUT +0.6
under 8 minutes, WHALE +0.5 above 40% curve, ARB `+imbalance * 1.2`,
SNIPER −0.35 (it skips more than it trades).

## `backtest.ts`

Seed 42, 7000 ticks, one **frozen** agent (never trains, never gains stat
points — the numbers measure the authored build), blocking decisions.
Returns P&L, trades, win rate, max drawdown, a 120-point equity curve, skips,
decisions, and inference spend. `backtestAgainstBaseline` runs the same
protocol against `BASELINE_BUILD` — the SNIPER preset, `SPD 4 / RSK 5 / PTN 7 /
GAS 4` — and reports BETTER / WORSE / EVEN.

Two runs of the same build return byte-identical results. That is what makes
the BUILDS leaderboard a leaderboard and not a lottery.
