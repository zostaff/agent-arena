# 09 — Tests (`tests/`, vitest)

`npm test` — 95 tests, ~1s.

| File | Covers |
|---|---|
| `config.test.ts` | stat compiler boundaries (0 / 7 / 12 / 15 per stat), model ladder, thinking budget rungs, effort mapping, clamping, all four boosts |
| `cost.test.ts` | `costPerDecision` against the manual calculation at PTN 0 and PTN 12, monotonicity, ALPHA FEED repricing, `maxTokens` |
| `brain.test.ts` | verdict clamping after parse, fence stripping, SELL→SKIP with no position, SKIP on parse failure / bad status / timeout / transport error / empty content / refusal / missing key, 429 retry, pinned headers and endpoint, `system` kept out of `messages`, no `temperature` on Opus 5 and Fable 5.1, no `budget_tokens` |
| `determinism.test.ts` | 10 000-tick sim on seed 42 identical across two runs, divergence on a different seed, identical candles, identical FORGE backtest |
| `village.test.ts` | upgrade costs and times, construction, RUSH pricing, treasury refusals, boost prices and expiry, passive yield, MINT cut, custom deploy cap, full state-machine traversal, XP curve |
| `market.test.ts` | mulberry32, candle aggregation, momentum / volatility / imbalance / spread, `fillPrice` book walking, sim market shape and long-run sanity, isometric projection and depth sort |

## The load-bearing assertions

* **Deterministic replay.** Two 10 000-tick runs on seed 42 are compared by
  full JSON digest — agents, tape, treasury, prices. Any accidental
  `Math.random`, `Date.now`, or map-iteration-order dependency in a seeded path
  fails this.
* **Cost calculation.** Spelled out longhand in the test rather than imported,
  so the test fails if the formula changes shape rather than silently agreeing
  with itself.
* **Never-throw.** Every failure mode of the live brain is enumerated. If a new
  code path can throw out of `decide()`, add it here first.

## Changing a number

Retuning `src/sim/market.ts` invalidates every published backtest on the BUILDS
board — the seed still replays, but it replays a different world. Bump
`BOARD_KEY` (`dv_board_v1` → `dv_board_v2`) when that happens.
