# 14 — Public paper alpha

## Requirements

Real quotes and book depth, virtual ETH only; no signing or paid inference.
The first adapter uses Coinbase SOL-ETH, LINK-ETH and ADA-ETH, preserving native
ETH accounting without a synthetic FX conversion. SIM and CHAIN remain separate.
The PAPER session starts with 10 virtual ETH and is ephemeral: balances, positions
and P&L reset together. No paper scores enter the unverified village board.

## Owners and design

- `src/paper/coinbase.ts`: public REST reads, ETH depth conversion, real candles,
  cache, request coalescing, timeout/backoff and freshness; never invent prices.
- `src/core/paper.ts`: virtual cash ledger, strict depth fills and freshness gate.
- `src/core/village.ts`: broker injection and resilient quote refresh.
- `src/ui/useMarketSession.ts`: session creation and feed status.
- `src/ui/App.tsx`, `src/run.ts`: browser/CLI entry points.

## Acceptance

- Stale, crossed, empty, auction or malformed books cannot produce a fill.
- Book size is base quantity multiplied by ETH price, not order count.
- Buy walks asks by quote budget; sell walks bids by token quantity. No invented
  depth, no negative cash; fees apply to both sides and slippage to both sides.
- Feed failure leaves positions pending; recovery permits settlement exactly once.
- Historical candles are sorted; no duplicated fake history or RNG in this feed.
- Polling follows wall time, coalesces concurrent reads and backs off after errors.
- UI discloses heuristic decisions, virtual cash, assumed fees and feed state.

## Remaining production work

Shared server feed, durable event ledger, accounts, server-verified leaderboard,
replay export, observability, quotas, exchange usage/redistribution review and
24-hour soak. REST sampled depth does not model queue priority, matching-engine
latency or liquidity consumed by other users. No claims of executable returns.

## Release checks added on 2026-09-11

`?mode=PAPER` selects a shareable session without depending on localStorage.
The main paper P&L excludes hypothetical inference charges; the inspector labels
its separate estimate. Displayed paper fees match the account fee, and unsupported
speed/zero-fee controls are disabled. `npm run paper:check` reads live data and
reconciles cash, locked principal/fees and realized P&L every tick; its duration is
configurable with `PAPER_CHECK_SECONDS` (default 180). This is not a 24-hour soak.
