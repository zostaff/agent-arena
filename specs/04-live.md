# 04 — Live mode (`src/live/`)

Real market data, real model, real chain. Read this whole file before touching
`brain.ts` — two things in it look wrong until you know why.

## `brain.ts` — Anthropic Messages API

Raw `fetch`, no SDK: `src/core` is dependency-free and isomorphic, and this
file is the only thing between a JSON blob and a signed transaction.

```
POST https://api.anthropic.com/v1/messages
x-api-key: <key>
anthropic-version: 2023-06-01
content-type: application/json

{ model, max_tokens, system, messages: [{role:"user", content}], output_config }
```

* `system` is a separate top-level field, never a message.
* `max_tokens` is `300 + thinkingBudget` — 300 exactly when no reasoning was
  bought.
* Response handling: read `data.content`, keep blocks with `type === "text"`,
  join, strip markdown fences, `JSON.parse`, then harden through
  `parseVerdict()`.
* `stop_reason === "refusal"` is a 200 with no usable content. It is a SKIP,
  not a crash.
* Retries only on 429 and 5xx, with exponential backoff. A malformed body is
  the model's problem, not the transport's — it SKIPs immediately.

### Two deliberate deviations from the original brief

Both are forced by the current API. Sending the brief's version returns a 400.

1. **`temperature: 0` is not sent to `claude-opus-5` or `claude-fable-5-1`.**
   Sampling parameters were removed on that model family; `temperature`,
   `top_p` and `top_k` all return `400`. It is still sent for models that
   accept it (the `SAMPLING_SUPPORTED` set). Determinism in this project comes
   from `src/sim`, which never calls this file, so nothing is lost.

2. **`thinking: {type:"enabled", budget_tokens: N}` is not sent.**
   `budget_tokens` is also rejected with a `400` on both models. The reasoning
   budget the player buys with PTN is expressed as `output_config.effort`:

   | `thinkingBudget` | `effort` |
   |---|---|
   | 0 | `low` |
   | 512 | `medium` |
   | 1500 | `high` |
   | 3000 | `xhigh` |

   The budget number is still what the village displays, prices, and rides on
   `max_tokens` as headroom. Only the wire encoding changed.

Not enabled by default, but available: server-side refusal fallbacks
(`betas: ["server-side-fallback-2026-07-01"]` + `fallbacks: "default"`). Left
off because the brief pins the three request headers; refusals are already
handled as SKIP.

### The never-throw contract

`tests/brain.test.ts` covers every path: JSON parse failure, bad HTTP status,
timeout / abort, transport error, empty content, refusal, missing API key,
429-then-success. All of them produce `{ action: "SKIP", sizeEth: 0 }`.

## `pons.ts` — Bitquery streaming GraphQL

`https://streaming.bitquery.io/graphql`, bearer token from `BITQUERY_TOKEN`.

* **`PonsLaunches`** — recent pairs on the Pons router within
  `launchWindowMinutes`, ranked by unique buyer count; also yields token
  address, decimals, reserve, first-seen timestamp, last price.
* **`PonsOHLC`** — candle history for one token at `intervalMinutes`
  granularity, returned oldest-first.

**8-second snapshot cache.** An agent at SPD 15 polls every 400 ms; without the
cache it would bill Bitquery twenty times for the same candle. The cache
over-fetches (at least 120 candles) so a deeper `ctxCandles` can be served
without a refill.

A bonding curve has no central limit order book, so the book in the snapshot is
**derived from the curve** — eight constant-product steps either side of last,
sized `reserve / 40`. It is synthetic and says so; the number that matters, the
slippage on a real fill, is exactly right.

## `execute.ts` — viem on Robinhood Chain

* Chain id **4663**, Arbitrum Orbit L2, defined with `defineChain`.
* Router ABI as pinned: `buy(address token, uint256 minTokensOut, uint256 deadline) payable`,
  plus a mirroring `sell(token, tokensIn, minEthOut, deadline)` for the exit leg.
* `minTokensOut` / `minEthOut` come from the quoted price minus
  `slippageBps` — the GAS stat reaches all the way to the calldata.
* `simulateContract` before `writeContract`, then `waitForTransactionReceipt`.

**`dryRun` defaults to `true`** (`DRY_RUN=0` is the only way off). Every path
that would sign prints the exact call instead:

```
[DRY RUN] pons.buy(token=0x…, minTokensOut=…, deadline=…) value=0.0500 ETH pair=$DGEN slippage=52bps reason="mom 1.9% imb 0.31"
```
