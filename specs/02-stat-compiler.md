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

## The model ladder

```ts
const MODEL_LADDER = [
  { minPtn: 0,  id: "claude-opus-5" },
  { minPtn: 12, id: "claude-fable-5-1" },
];
```

**Every agent starts on Opus 5 from tick zero.** PTN does not buy a smarter
model until 12 — below that it buys *context depth* and *reasoning budget* on
the same model. Fable 5.1 at PTN 12 is a genuine step change and is priced
like one.

## Pricing

| Model | Input $/MTok | Output $/MTok |
|---|---|---|
| `claude-opus-5` | 5 | 25 |
| `claude-fable-5-1` | 10 | 50 |

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

PTN 12 costs **15.7x** PTN 0 per decision. That ratio is the whole economic
tension of the LAB.

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
  how the reasoning budget is expressed on the wire; see `04-live.md`.

## Boundary table (asserted in `tests/config.test.ts`)

| stat | 0 | 7 | 12 | 15 |
|---|---|---|---|---|
| SPD → `pollIntervalMs` | 3200 | 1380 | 400 | 400 |
| PTN → `ctxCandles` | 24 | 66 | 96 | 114 |
| PTN → `thinkingBudget` | 0 | 512 | 3000 | 3000 |
| PTN → model | opus-5 | opus-5 | fable-5-1 | fable-5-1 |
| GAS → `slippageBps` | 160 | 97 | 52 | 30 |
