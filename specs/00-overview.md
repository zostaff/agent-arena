# 00 — Overview & repo map

**DEGEN VILLAGE** is an isometric village where AI agents train in buildings,
walk to a terminal, and trade memecoins on the Pons bonding-curve DEX
(Robinhood Chain). Every stat bar in the village is a real config field the
engine reads on the next tick.

> The village is a config editor with a progress bar in front of it.

## The one idea

`src/core/config.ts` compiles four stats — and the **house** the agent is wired
to — into a runtime config. Everything else consumes that config. Training raises a stat → the compiler emits a different
config → the agent polls faster / reads deeper / sizes bigger / slips less. No
stat is cosmetic and no cosmetic is a stat.

## Two entry points, one core

```
                    ┌───────────────────────────┐
                    │   src/core (zero deps)    │
                    │  config · agent · village │
                    │  market helpers · brain   │
                    └──────────┬────────────────┘
        Market + Brain injected│
              ┌────────────────┴────────────────┐
              ▼                                 ▼
   src/sim  SimMarket + heuristicBrain   src/live  PonsMarket + claudeBrain
   seeded, deterministic, free      Anthropic · OpenAI · xAI, routed per agent
              │                                 │
              └──────────► src/run.ts ◄─────────┘
                         MODE=sim | MODE=live
                                 │
                            src/ui (React, SVG, canvas-free)
```

`src/core` imports nothing. That is what makes the same engine run in node and
in the browser, and what makes a backtest and a live session comparable.

## File map

| Path | Responsibility |
|---|---|
| `src/core/types.ts` | `Market`, `Brain`, `Snapshot`, `Verdict`, `StrategyParams`, agent states |
| `src/core/config.ts` | **the stat compiler** — model ladder, thinking budget, pricing, boosts |
| `src/core/market.ts` | candle aggregation, momentum, book maths, prompt serialization |
| `src/core/brain.ts` | prompt assembly, class lenses, verdict parsing + hardening |
| `src/core/agent.ts` | agent state machine, pathing, training, XP and levels |
| `src/core/village.ts` | buildings, treasury, boosts, roster, fills, tick loop |
| `src/sim/rng.ts` | mulberry32 + gaussian |
| `src/sim/market.ts` | seeded momentum random walk, OHLC, synthetic book |
| `src/sim/brain.ts` | deterministic heuristic brain reading `StrategyParams` |
| `src/sim/backtest.ts` | seed 42 / 7000 ticks, baseline comparison |
| `src/live/providers.ts` | OpenAI Responses + xAI chat wires on one defensive loop |
| `src/live/router.ts` | `liveBrain()` — picks the house per decision from `opts.provider` |
| `src/live/pons.ts` | Bitquery GraphQL, `PonsLaunches` + `PonsOHLC`, 8s cache |
| `src/live/brain.ts` | Anthropic Messages API, never throws out of `decide()` |
| `src/live/execute.ts` | viem, chain 4663, Pons router, `dryRun: true` by default |
| `src/ui/*` | isometric SVG renderer, HUD, DEX overlay, FORGE, leaderboard |
| `src/run.ts` | node entry, `MODE` switches sim/live |

## Reading order for a new session

1. This file.
2. `02-stat-compiler.md` — the rules everything else obeys.
3. Whichever of `03-sim` / `04-live` / `05-village-economy` / `06-forge` /
   `07-ui` / `08-multiplayer` the task touches.
4. `09-tests.md` before changing a number.

## Quickstart

```bash
npm install
npm test          # 95 tests
npm run sim       # MODE=sim, 60fps, seeded
npm run dev       # the village in a browser
MODE=live npm run live   # needs BITQUERY_TOKEN + the key of each house in use
AGENT_PROVIDERS=xai,openai MODE=live npm run live   # wire the roster in order
```
