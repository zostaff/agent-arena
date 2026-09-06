# 02 — The stat compiler (`src/core/config.ts`)

Four stats, one function, every downstream number.

```ts
compileConfig(stats, level, boosts, options) -> CompiledConfig
```

## The formulas

| Field | Formula |
|---|---|
| `pollIntervalMs` | `max(400, 3200 - spd * 260)` |
| `ctxCandles` | `min(120, 24 + ptn * 6)` |
| `thinkingBudget` | `ptn >= 12 ? 3000 : ptn >= 8 ? 1500 : ptn >= 4 ? 512 : 0` |
| `positionSizeEth` | `base * (1 + rsk * 0.18) * (1 + level * 0.12)`, clamped to `base * 8` |
| `slippageBps` | `max(30, 160 - gas * 9)` |
| `feeBps` | `30`, or `0` under ZERO GAS |

`base` is `BASE_POSITION_ETH = 0.05`, multiplied by the FORGE `sizeMult` and by
`(1 + nexusLevel * 0.12)` when a NEXUS is standing. Stats are floored, clamped
to `[0, MAX_STAT = 15]`, and non-finite input becomes 0 — the compiler never
trusts its caller either.

## Three houses, three ladders

An agent is wired to one **provider** — Anthropic, OpenAI or xAI — and trains
inside that house's ladder. `MODEL_LADDERS` in `config.ts` is the only table
that has to change when a vendor re-prices or ships a new frontier model.

```ts
const MODEL_LADDERS = {
  anthropic: [{ minPtn: 0, id: "claude-opus-5"  }, { minPtn: 12, id: "claude-fable-5-1" }],
  openai:    [{ minPtn: 0, id: "gpt-5.6-terra"  }, { minPtn: 12, id: "gpt-6-astra"      }],
  xai:       [{ minPtn: 0, id: "grok-4.3"       }, { minPtn: 12, id: "grok-4.6"         }],
};
```

**PTN 12 is the unlock on all three.** Below it, PTN buys *context depth* and
*reasoning budget* on the house's working model; at 12 the frontier rung opens
and the bill jumps. The house is chosen in FORGE at build time and changed
later with REWIRE (`village.rewire`, 60 coins, refused while a position is
open — the verdict that opened it came from the old house).

The provider changes exactly three things: **the model id on the wire, the
price of every decision, and which parameters the request may legally carry**.
It does not touch poll interval, context depth, size or slippage — same stats,
same config, different bill. `tests/providers.test.ts` asserts that.

`normalizeProvider` turns anything unrecognised into `anthropic`, so a corrupt
save or a hand-edited build JSON compiles to a real ladder instead of an
undefined one.

## Pricing

Real vendor list prices, standard tier, verified 2026-09-06.

| House | Model | Input $/MTok | Output $/MTok |
|---|---|---|---|
| Anthropic | `claude-opus-5` | 5 | 25 |
| Anthropic | `claude-fable-5-1` | 10 | 50 |
| OpenAI | `gpt-5.6-terra` | 2 | 12 |
| OpenAI | `gpt-6-astra` | 10 | 50 |
| xAI | `grok-4.3` | 1.25 | 2.50 |
| xAI | `grok-4.6` | 2 | 6 |

```
inputTokens  = 320 + ctxCandles * 18 + 120      (system + candles + book)
outputTokens = 300 + thinkingBudget             (thinking bills as output)
costPerDecision = in/1e6 * inPrice + out/1e6 * outPrice
```

Worked, and asserted in `tests/cost.test.ts`:

* **PTN 0** — Opus 5, 24 candles, 0 reasoning
  `(320 + 432 + 120)/1e6 * 5 + 300/1e6 * 25 = 0.00436 + 0.0075 = $0.01186`
* **PTN 12** — Fable 5.1, 96 candles, 3000 reasoning
  `(320 + 1728 + 120)/1e6 * 10 + 3300/1e6 * 50 = 0.02168 + 0.165 = $0.18668`

PTN 12 costs **15.7x** PTN 0 per decision on Anthropic. That ratio is the whole
economic tension of the LAB.

The same two stats on the other two houses, same formula:

| House | PTN 0 $/decision | PTN 12 $/decision | ratio |
|---|---|---|---|
| xAI | 0.00184 | 0.02414 | 13.1x |
| OpenAI | 0.00534 | 0.18668 | 34.9x |
| Anthropic | 0.01186 | 0.18668 | 15.7x |

xAI is the cheap lane end to end — Grok 4.6 at the frontier still costs less
than a *quarter* of an Opus 5 decision at PTN 0. OpenAI is the widest jump:
Terra is cheap to run and Astra is not. Both frontier rungs bill $10/$50, so
Astra and Fable 5.1 cost the same per decision to the cent.

## Boosts — temporary config overrides

Applied after the base compile, then the cost is recomputed (ALPHA FEED
genuinely changes what a request costs).

| Boost | Override |
|---|---|
| `overclock` | `pollIntervalMs / 3` (floor still 400) |
| `alphaFeed` | `ctxCandles * 2`, `thinkingBudget * 2` |
| `leverage` | `positionSizeEth * 2` |
| `zeroGas` | `feeBps = 0` |

## Extra derived fields

* `maxTokens = 300 + thinkingBudget` — the 300-token verdict plus reasoning
  headroom, so a deep-thinking agent is not truncated mid-JSON.
* `effort` — `0 → low`, `512 → medium`, `1500 → high`, `3000 → xhigh`. This is
  how the reasoning budget is expressed on the wire; each house carries it in
  its own field (`output_config.effort`, `reasoning.effort`, `reasoning_effort`)
  and the four rung names are legal on all three. See `04-live.md`.
* `provider` — the house the config was compiled for. `village.brainOpts` hands
  it to the live router, which picks the wire adapter from it.

## Boundary table (asserted in `tests/config.test.ts`)

| stat | 0 | 7 | 12 | 15 |
|---|---|---|---|---|
| SPD → `pollIntervalMs` | 3200 | 1380 | 400 | 400 |
| PTN → `ctxCandles` | 24 | 66 | 96 | 114 |
| PTN → `thinkingBudget` | 0 | 512 | 3000 | 3000 |
| PTN → model | opus-5 | opus-5 | fable-5-1 | fable-5-1 |
| GAS → `slippageBps` | 160 | 97 | 52 | 30 |
