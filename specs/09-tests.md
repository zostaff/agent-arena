# 09 — Tests (`tests/`, vitest)

`npm test` — 206 tests, ~1s.

| File | Covers |
|---|---|
| `architecture.test.ts` | all core imports stay inside core; leaf domains never depend on the village orchestrator |
| `build.test.ts` | versioned/legacy imports, malformed JSON, finite ranges, total budget, unknown provider fallback, ignored claimed results, copied fields, deployment refusal without mutation |
| `tape.test.ts` | BUY/SELL house attribution survives REWIRE; REWIRE refuses a pending verdict |
| `config.test.ts` | stat compiler boundaries (0 / 7 / 12 / 15 per stat), model ladder, thinking budget rungs, effort mapping, clamping, all four boosts |
| `cost.test.ts` | `costPerDecision` against the manual calculation at PTN 0 and PTN 12, monotonicity, ALPHA FEED repricing, `maxTokens` |
| `brain.test.ts` | verdict clamping after parse, fence stripping, SELL→SKIP with no position, SKIP on parse failure / bad status / timeout / transport error / empty content / refusal / missing key, 429 retry, pinned headers and endpoint, `system` kept out of `messages`, no `temperature` on Opus 5 and Fable 5.1, no `budget_tokens` |
| `providers.test.ts` | the three ladders and their prices, PTN 12 unlock on each, cost spread across houses, config identical except model and price, OpenAI body (no sampling params, `reasoning.effort`, `store:false`) and xAI body (`temperature: 0`, `reasoning_effort`, `max_completion_tokens`), text extraction and refusal detection per house, degrade-once on a rejected parameter, every failure path to SKIP, router dispatch and fallback, REWIRE cost and refusals |
| `net.test.ts` | net = gross − spend at `ASSUMED_ETH_USD` exactly, the bill priced at the house's own rate, gross/trades/decisions/equity identical across houses, `netByHouse` from one run matching real runs on each house, baseline run on the same house, verdict reading off the net delta |
| `save.test.ts` | round trip of treasury, buildings, jobs, boosts, stats, level, XP, house and record; save→restore→save stability; open positions dropped and unrealised P&L not banked; version refusal; junk of every shape refused; a hostile save clamped field by field; a missing building refilled to its default |
| `chain.test.ts` | topic and ABI-string decoding on fixtures from the real chain, pinned addresses, the paper universe (newest first, duplicate symbols kept, provenance labelled, no pairs before the first read, address-seeded reproducibility), the village skipping rather than inventing a ticker when the market names none, and the selector gate (present vs absent, safe only when every selector dispatches, an empty account is unsafe) |
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
* **Never-throw.** Every failure mode of every live brain is enumerated, in
  `brain.test.ts` for Anthropic and `providers.test.ts` for the other two. If a
  new code path can throw out of `decide()`, add it here first.
* **Every rung has a price.** `providers.test.ts` walks all three ladders and
  asserts `MODEL_PRICING` covers each id. Without it, adding a model with no
  price makes `costPerDecision` return 0 and the village lies about its spend.
* **Gross is house-independent.** `net.test.ts` compares the entire equity
  array across two houses. If the sim brain ever starts reading the model id,
  every published backtest stops being comparable and this is what says so.
* **The house changes only three things.** Model id, cost, and legal wire
  parameters — asserted field by field against an identical build on another
  house. If a provider ever starts changing poll interval or context depth,
  that test is where the decision gets made deliberately.

## Changing a number

Retuning `src/sim/market.ts` invalidates every published backtest on the BUILDS
board — the seed still replays, but it replays a different world. Bump
`BOARD_KEY` (`dv_board_v1` → `dv_board_v2`) when that happens.

## Completion gate

Run from the repository root:

```bash
npm run typecheck
npm test
npm run build
```

No network or provider keys are needed. Start with the relevant test files;
run the full gate after changes settle. CI uses the same commands. A green
fixture suite does not verify live providers, on-chain execution or UI layout.

## Acceptance and tasks

- [x] Baseline before refactoring: 162 tests and typecheck passed.
- [x] After refactoring and roadmap additions: 206 tests across 13 files.
- [x] Typecheck, production build and `git diff --check` pass on 2026-09-08.
- [x] Architecture and hostile build input have dedicated regression coverage.
- [ ] Browser smoke test remains pending: the native automation connection
  closed before a page could be inspected. No screenshot was verified.
- [ ] Live acceptance evidence remains in specs 04 and 11, separate from CI.

## Paper alpha validation · 2026-09-10

223 tests across 14 files pass. `tests/paper.test.ts` covers external-data
validation, coalescing/backoff, freshness, native ETH depth, strict fill arithmetic,
fees/cash and outage recovery with exactly-once settlement. Core boundary tests
include `paper.ts`. Typecheck and production build pass.

Read-only CLI smoke: 120 ticks, all three Coinbase products fresh, feed `live`,
no entry signal and therefore no fills. Chrome loaded the app; detailed PAPER
browser QA was interrupted by the automation timeout and is still required.

## Published alpha evidence · 2026-09-11

Release `9f906e4`: 226 tests / 15 files, typecheck and production build; both
GitHub CI and Pages succeeded. A 180-second real-feed check completed 8,964 ticks
with ledger reconciliation: 15 healthy reports and three stale LINK-ETH reports.
No strategy trade fired. A separate synthetic QA round trip used a real SOL-ETH
book and reconciled both fees. Public HTML/JS/CSS and roadmap PNG were verified;
Coinbase returned `access-control-allow-origin: *`. Full browser interaction QA
and a 24-hour soak remain pending. `tests/mode.test.ts` covers direct mode links
and storage-unavailable fallback.
