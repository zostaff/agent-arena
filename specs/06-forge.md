# 06 — FORGE (`src/ui/Forge.tsx`)

The custom agent builder. Everything in it is a real engine input.

## Stat budget

20 points across SPD / RSK / PTN / GAS, each capped at `MAX_STAT = 15`. The
sliders refuse a move that would overspend rather than silently rebalancing.

## Strategy parameters

Read directly by `heuristicBrain` in sim, and folded into the system prompt in
live.

| Parameter | Range | Meaning |
|---|---|---|
| `entryThreshold` | 0.001 – 0.06 | momentum required before an entry |
| `maxCurve` | 5 – 100 | skip pairs past this curve progress |
| `holdMin` | 10 – 600 | floor on `holdTicks` |
| `holdMax` | 20 – 1200 | ceiling on `holdTicks` |
| `sizeMult` | 0.2 – 3.0 | multiplier on the compiled base position |
| `requireBookAlign` | bool | require book depth to agree with direction |

## System prompt suffix

Free text, **live mode only**. Appended to the Claude system prompt under an
`Operator brief:` heading. The sim brain and the backtest ignore it entirely —
which is stated on the field, because a build that scores well on a prompt the
backtest never read would be a lie.

## Compiled config preview

Recomputed on every slider move through the same `compileConfig` the engine
calls. Shows model, poll interval, context depth, thinking budget with its
effort rung, position size, slippage, fees, cost per decision, and max tokens.

## Backtest

Seed 42, 7000 ticks, deterministic (`specs/03-sim.md`). Reports P&L, win rate,
max drawdown and trade count against the **SNIPER preset** baseline
(`SPD 4 / RSK 5 / PTN 7 / GAS 4`), plus an equity curve drawn over the
baseline's.

## Actions

* **EXPORT JSON** — copies name, stats, strategy, suffix, compiled config and
  backtest summary to the clipboard. Falls back to a `prompt()` when the
  clipboard is blocked (insecure context, denied permission).
* **PUBLISH TO BOARD** — requires a completed backtest; writes a `BuildEntry`
  to the shared board.
* **DEPLOY** — 150 coins, max 4 custom agents. The deployed agent starts at
  zero stats with the authored allocation as its *target*, so it trains toward
  the build rather than being handed it.
