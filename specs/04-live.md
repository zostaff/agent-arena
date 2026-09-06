# 04 — Live mode (`src/live/`)

Real market data, real model, real chain. Read this whole file before touching
`brain.ts` — two things in it look wrong until you know why.

Three houses answer the same `Brain` interface:

| File | House | Endpoint |
|---|---|---|
| `brain.ts` | Anthropic | `POST https://api.anthropic.com/v1/messages` |
| `providers.ts` | OpenAI | `POST https://api.openai.com/v1/responses` |
| `providers.ts` | xAI | `POST https://api.x.ai/v1/chat/completions` |
| `router.ts` | — | picks one per decision from `opts.provider` |

One village runs agents on all three at once, so the injected Brain cannot be a
single vendor client. `liveBrain()` in `router.ts` *is* a Brain: it reads
`opts.provider`, which the village copies out of the compiled config, and
forwards. A missing or unknown provider falls back to Anthropic.

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

## `providers.ts` — OpenAI and xAI

One request loop, two adapters. The loop makes the same promises as
`brain.ts`; a `WireAdapter` supplies only what differs: URL, headers, body,
text extraction, refusal detection, usage fields, and a degrade rule.

### OpenAI — the Responses API

```
POST https://api.openai.com/v1/responses
authorization: Bearer $OPENAI_API_KEY

{ model, instructions, input: [{role:"user", content}],
  max_output_tokens: 300 + thinkingBudget,
  reasoning: { effort }, store: false }
```

* `instructions` carries the system prompt; there is no `system` message.
* **No sampling parameters.** `gpt-6-astra` and the GPT-5.6 family rejected
  `temperature` / `top_p` / `logprobs` on migration — the same deviation
  Anthropic forced, for the same reason, on a different vendor.
* Text lives in `output[]`: keep `type === "message"`, then the
  `output_text` parts. Reasoning blocks are skipped, not parsed.
* A `refusal` content part, or `status === "incomplete"` (typically
  `max_output_tokens`), is a 200 with no verdict → SKIP.
* `store: false` — a trading position does not need to persist on a vendor's
  server.

### xAI — OpenAI-compatible chat completions

```
POST https://api.x.ai/v1/chat/completions
authorization: Bearer $XAI_API_KEY

{ model, messages: [system, user],
  max_completion_tokens: 300 + thinkingBudget,
  reasoning_effort: effort, temperature: 0 }
```

* `max_tokens` is deprecated here; `max_completion_tokens` is the live field.
* **This is the one house where the brief's `temperature: 0` is still legal**,
  so it is still sent. The determinism the brief wanted survives on exactly one
  of the three wires.
* Text is `choices[0].message.content`; `message.refusal` or
  `finish_reason === "content_filter"` is a SKIP.

### Degrade-once

xAI documents `reasoning_effort` support as varying per model, and any
deployment can reject a parameter its docs allow. So a **400 is read, not just
counted**: `adapter.degrade(body, errorText)` returns the same request with the
named parameter stripped (`reasoning` / `reasoning_effort`, then `temperature`
/ `store`), and it is sent again immediately. A degrade does not consume the
retry budget — it is a smaller request, not a failed attempt — and at most two
happen per decision. A 400 nobody can fix (bad model id) still SKIPs.

A silently dead house is worse than a slightly slower one.

### The effort rung is the same number everywhere

PTN buys a thinking budget. `config.ts` maps it to `low` / `medium` / `high` /
`xhigh` — four names all three houses accept — and each adapter carries it in
its own field. The village prices and displays the *budget*, never the field.

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
