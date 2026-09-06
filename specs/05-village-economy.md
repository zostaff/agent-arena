# 05 — Village economy (`src/core/village.ts`)

14x14 grid. Terminal at the centre `(6.5, 6.5)`.

## Buildings

**Trainers** (present from tick zero, level 1):

| Building | Trains | Position |
|---|---|---|
| BARRACKS | SPD | (2, 2) |
| LAB | PTN | (11, 2) |
| VAULT | RSK | (2, 11) |
| REFINERY | GAS | (11, 11) |

**Buildable** (level 0 until constructed, 800 ticks):

| Building | Effect per level | Position |
|---|---|---|
| ACADEMY | +25% XP | (6, 1) |
| MINT | +6% treasury cut | (1, 7) |
| RELAY | +12% walk speed | (12, 6) |
| NEXUS | +12% position size | (7, 12) |

## Costs and times

| To level | Coins | Ticks |
|---|---|---|
| 2 | 40 | 420 |
| 3 | 110 | 700 |
| 4 | 280 | 1100 |
| 5 | 650 | 1700 |

New construction costs 40 coins (the L2 price) and takes 800 ticks.
**RUSH** completes a job immediately for `ceil(remaining_ticks * 0.06)` coins.
Max building level is 5.

## Boosts

| Boost | Coins | Duration | Effect |
|---|---|---|---|
| OVERCLOCK | 60 | 900t | `pollIntervalMs / 3` |
| ALPHA FEED | 90 | 1200t | `ctxCandles * 2`, `thinkingBudget * 2` |
| LEVERAGE | 110 | 600t | `positionSizeEth * 2` |
| ZERO GAS | 70 | 1500t | `feeBps = 0` |

Buying an active boost extends it. Boosts are village-wide, not per agent.

## Treasury

* **Passive yield**: `sum(building.level) * 0.012` coins per tick.
* **Trade cut**: 35% of a *winning* trade's P&L, plus 6% per MINT level.
  Converted at `COIN_PER_ETH = 1000`. Losses are the agent's alone.
* Starting treasury: 200 coins.

## Agents

Default roster is one of each class with a seeded stat spread, all wired to
Anthropic. Custom FORGE builds cost **150 coins**, capped at **4**, and render
with a dashed ring.

**REWIRE** — `village.rewire(agentId, provider)` moves one agent to another
house for **60 coins** (`REWIRE_COST`). Refused when: the agent is unknown, it
is already on that house, it holds an open position (the verdict that opened it
came from the old house), or the treasury is short. Stats do not move with it —
PTN 12 on Anthropic is PTN 12 on xAI, it simply costs a different amount per
decision. See `02-stat-compiler.md` for the ladders and the bill.

Training: `BASE_TRAIN_TICKS = 260`, reduced 12% per building level above 1,
floored at 40. One completed session is +1 stat and `18 * xpMult` XP.
`TRAIN_EVERY_CYCLES = 3` — an agent trains once, then works three decision
cycles before training again. Without this the village trades roughly twice an
hour and the game has nothing to watch.

Levels: `xpToNext(level) = 60 + level * 45`. A level-up grants another stat
point, chosen by the class priority order (or by the largest gap from a FORGE
build's target allocation).

Walk speed: `0.055 * (1 + relayLevel * 0.12)` grid units per tick, on a
Manhattan path — x axis first, then y, which reads cleanly in isometric space.

## Save and restore

`village.save()` returns a `VillageSave`; `village.restore(unknown)` rebuilds
from one and **returns false without touching anything** if the blob is not a
save it recognises. `SAVE_VERSION` is refused rather than migrated.

| Survives | Does not survive |
|---|---|
| tick, treasury, total spend | open positions |
| building levels and running jobs | unrealised P&L |
| active boosts and their remaining ticks | walk position, current state, training timer |
| every agent: stats, level, XP, house, strategy, target stats, record | notifications, tape, cached snapshots |

**Open positions are dropped on purpose.** A position is priced against a
market that no longer exists after a reload, so carrying one over would mean
inventing its P&L. The trade never closed, so it never counted. Agents resume
at REST at home; that is cosmetic, since the config they compile on the next
tick is identical.

`parseSave` treats a save the way `parseVerdict` treats a model: as data from
anywhere. Every number is coerced and clamped, every id checked against the set
the engine knows, unknown buildings and boosts dropped, expired boosts dropped,
stats run through `normalizeStats`. A save with no usable agent is refused.

The UI autosaves every 240 ticks and flushes on `pagehide` and
`visibilitychange`. RESET is two clicks and sets a latch first — without it the
reload that follows the wipe fires `pagehide` and writes the village straight
back, which is exactly the bug the browser test caught on 2026-09-07.

## Fills

* Entry price walks the ask side via `fillPrice()`.
* If realised slippage exceeds `config.slippageBps` the fill is **refused**,
  not eaten — the agent gets a `SLIPPAGE` notification and goes back to REST.
* Fee is `sizeEth * feeBps / 10000` on both legs.
* Positions are marked to market every `MARK_INTERVAL = 15` ticks.

## Determinism

`VillageOptions.blockingDecisions` awaits every decision issued during a tick
before the next tick begins. Sim and backtest set it; live does not. The agent
consumes its verdict on the following step, so `DECIDE` lasts exactly one tick
and is visible in the UI.
