# agent-arena — DEGEN VILLAGE

An isometric village where AI agents train in buildings, walk to a terminal,
and trade memecoins on the Pons bonding-curve DEX (Robinhood Chain).

**Every stat bar is a real config field the engine reads.** Fill the SPD bar and
the agent's poll interval genuinely drops. Fill PTN and it genuinely reads more
candles, thinks with a bigger budget, and at 12 switches models. The village is
a config editor with a progress bar in front of it.

```
npm install
npm test        # 95 tests
npm run sim     # MODE=sim — seeded, deterministic, free
npm run dev     # the village in a browser
```

## Architecture

```
                    ┌───────────────────────────┐
                    │   src/core  (zero deps)   │
                    │  config · agent · village │
                    │  market helpers · brain   │
                    └──────────┬────────────────┘
        Market + Brain injected│
              ┌────────────────┴────────────────┐
              ▼                                 ▼
   src/sim   SimMarket + heuristicBrain  src/live  PonsMarket + claudeBrain
   seeded · deterministic · free         Bitquery · Anthropic · viem
              │                                 │
              └──────────► src/run.ts ◄─────────┘
                         MODE=sim | MODE=live
                                 │
                            src/ui  React · SVG · canvas-free
```

`src/core` imports nothing at all. That is what lets the same engine run in
node and in the browser, and what makes a 7000-tick backtest and a live session
comparable.

## The stat compiler

```
pollIntervalMs  = max(400, 3200 - spd * 260)
ctxCandles      = min(120, 24 + ptn * 6)
thinkingBudget  = ptn >= 12 ? 3000 : ptn >= 8 ? 1500 : ptn >= 4 ? 512 : 0
positionSizeEth = base * (1 + rsk * 0.18) * (1 + level * 0.12)   clamp base * 8
slippageBps     = max(30, 160 - gas * 9)
```

Every agent starts on **Opus 5** from tick zero. PTN buys context depth and
reasoning budget, **not** a better model — until PTN 12, which unlocks
**Fable 5.1** at 15.7x the cost per decision. That trade-off is the LAB.

| | model | ctx | reasoning | $/decision |
|---|---|---|---|---|
| PTN 0 | `claude-opus-5` | 24 | 0 | $0.01186 |
| PTN 12 | `claude-fable-5-1` | 96 | 3000 | $0.18668 |

## Specs

Written so a future session can pick up any part without re-reading the code.

| Spec | Contents |
|---|---|
| [00 — Overview](specs/00-overview.md) | architecture, file map, reading order |
| [01 — Core contracts](specs/01-core-contracts.md) | `Market`, `Brain`, `Snapshot`, `Verdict`, agent states, class lenses |
| [02 — Stat compiler](specs/02-stat-compiler.md) | every formula, the model ladder, pricing, boosts, boundary table |
| [03 — Sim](specs/03-sim.md) | mulberry32, the random walk and its tuning, heuristic brain, backtest |
| [04 — Live](specs/04-live.md) | Anthropic wire contract **and its two forced deviations**, Bitquery queries, viem execution |
| [05 — Village economy](specs/05-village-economy.md) | buildings, costs, times, RUSH, boosts, treasury, fills |
| [06 — FORGE](specs/06-forge.md) | stat budget, strategy params, prompt suffix, backtest, deploy |
| [07 — UI](specs/07-ui.md) | projection, SVG anatomy, HUD, DEX overlay, palette |
| [08 — Multiplayer](specs/08-multiplayer.md) | `window.storage`, the two rankings, load-a-rival's-build |
| [09 — Tests](specs/09-tests.md) | what each file covers and which assertions are load-bearing |

## Two deviations from the original brief

Both forced by the current Anthropic API — sending the brief's version returns
a `400`. Full reasoning in [specs/04-live.md](specs/04-live.md).

1. **`temperature: 0` is not sent** to `claude-opus-5` or `claude-fable-5-1`.
   Sampling parameters were removed on that model family. It is still sent for
   models that accept it. Determinism here comes from `src/sim`, which never
   calls the live brain.
2. **`thinking.budget_tokens` is not sent.** Also rejected on both models. The
   reasoning budget PTN buys is encoded as `output_config.effort`
   (`0 → low`, `512 → medium`, `1500 → high`, `3000 → xhigh`) and still rides
   on `max_tokens` as headroom. The number the village displays and prices is
   unchanged.

Everything else in the brief is implemented as written.

## Safety rails

* `decide()` **never throws**. Parse failure, bad status, timeout, transport
  error, empty content, refusal, missing key — all resolve to `SKIP`.
* `sizeEth` is clamped to `maxSizeEth` **after** parsing, every time. The model
  is never trusted on size.
* `execute.ts` defaults to `dryRun: true` and prints the exact call it would
  have sent. `DRY_RUN=0` is the only way off.
* A fill whose realised slippage exceeds the agent's `slippageBps` is refused,
  not eaten.

## Environment

```bash
cp .env.example .env
```

| Variable | Used by |
|---|---|
| `ANTHROPIC_API_KEY` | `src/live/brain.ts` |
| `BITQUERY_TOKEN` | `src/live/pons.ts` |
| `RH_RPC_URL`, `RH_PRIVATE_KEY`, `PONS_ROUTER` | `src/live/execute.ts` |
| `DRY_RUN` | `src/live/execute.ts` — anything but `0` keeps it dry |
| `MODE`, `SEED`, `TICKS` | `src/run.ts` |

## Licence

MIT.
