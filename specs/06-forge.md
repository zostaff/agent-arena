# 06 — FORGE (`src/ui/Forge.tsx`)

The custom agent builder. Everything in it is a real engine input.

## Stat budget

20 points across SPD / RSK / PTN / GAS, each capped at `MAX_STAT = 15`. The
sliders refuse a move that would overspend rather than silently rebalancing.

## House

Three buttons above the strategy block: **ANTHROPIC · OPENAI · XAI**. The
picker states what it actually buys — the model id at the build's current PTN,
the frontier rung PTN 12 unlocks, and one line of fact about the house (which
sampling parameters it accepts). The compiled-config preview underneath
reprices instantly, which is the whole point: the same 20 stat points cost
`$0.00184` a decision on Grok 4.3 and `$0.18668` on GPT-6 Astra.

The backtest is deliberately **identical across houses** — it runs the seeded
heuristic brain, so it measures the build, not the vendor. The house shows up
in the cost line, never in the P&L. The provider travels with the build
through DEPLOY, EXPORT JSON and PUBLISH TO BOARD; an entry published before
houses existed loads as Anthropic.

## Strategy parameters

Read directly by `heuristicBrain` in sim, and folded into the system prompt in
live.

| Parameter | Range | Meaning |
|---|---|---|
| `entryThreshold` | 0.001 – 0.06 | momentum required before an entry |
| `maxCurve` | 5 – 100 | skip pairs past this curve progress |
| `holdMin` | 10 – 600 | floor on `holdTicks` |
| `holdMax` | 20 – 1200 | ceiling on `holdTicks` |
| `sizeMult` | 0.2 – 3.0 | multiplier on the compiled base position |
| `requireBookAlign` | bool | require book depth to agree with direction |

## System prompt suffix

Free text, **live mode only**. Appended to the system prompt of whichever house
the build is wired to, under an `Operator brief:` heading. The sim brain and the backtest ignore it entirely —
which is stated on the field, because a build that scores well on a prompt the
backtest never read would be a lie.

## Compiled config preview

Recomputed on every slider move through the same `compileConfig` the engine
calls. Shows provider, model, poll interval, context depth, thinking budget with its
effort rung, position size, slippage, fees, cost per decision, and max tokens.

## Backtest

Seed 42, 7000 ticks, deterministic (`specs/03-sim.md`). Six cells against the
**SNIPER preset** baseline (`SPD 4 / RSK 5 / PTN 7 / GAS 4`, run on the same
house): **NET after inference**, gross P&L, win rate, max drawdown, trades,
spend and decisions — plus an equity curve drawn over the baseline's.

Underneath, **THE SAME RUN, PRICED ON EACH HOUSE**: what this build would have
netted on Anthropic, OpenAI and xAI, with the build's own house highlighted.
One run, three prices — see `netByHouse` in `03-sim.md`.

The verdict line reads off the **net** delta. A build that wins gross and loses
after the bill does not get to say BETTER.

## Actions

* **EXPORT JSON** — copies name, stats, strategy, suffix, compiled config and
  backtest summary to the clipboard. Falls back to a `prompt()` when the
  clipboard is blocked (insecure context, denied permission).
* **PUBLISH TO BOARD** — requires a completed backtest; writes a `BuildEntry`
  to the shared board.
* **DEPLOY** — 150 coins, max 4 custom agents. The deployed agent starts at
  zero stats with the authored allocation as its *target*, so it trains toward
  the build rather than being handed it.

## Build contract and JSON import

`core/build.ts` owns `ForgeDraft`, `CustomAgentSpec`, `parseBuild`,
`parseBuildJson`, `statsSpent` and `STRATEGY_LIMITS`. React renders these
limits; it does not define a second schema. `ForgeWidgets.tsx` contains the
stateless controls/chart, and `BuildImport.tsx` owns the paste form.

EXPORT includes `version: 1`. IMPORT also accepts legacy exports without a
version. It validates the envelope, requires integer stats in 0–15 whose sum
is at most 20, validates strategy ranges and `holdMin <= holdMax`, and requires
a boolean book-alignment flag. Name length is 1–16; suffix length is at most
4000 characters; pasted JSON is at most 65,536 characters. Unknown providers
fall back to Anthropic. Errors are shown without replacing the current draft.

Only authored fields are copied. Imported `compiled` and `backtest` fields
are ignored. The config is recomputed and publishing requires a new backtest.
Results are keyed to the exact draft that launched them, so importing or editing
while a backtest runs cannot attach an old result to the new draft.

The same parser protects board LOAD and `Village.deployCustom`; invalid
builds cannot spend treasury or bypass the budget through another entry point.

## Acceptance and tasks

- [x] Roadmap 5: paste, validate and load an exported build.
- [x] Current/legacy exports, invalid inputs, unknown houses, ranges, budget,
  ignored performance claims and atomic deployment refusal: `build.test.ts`.
- [x] Existing deterministic backtests and cross-house pricing remain green.
- [ ] Browser QA: malformed paste preserves draft; valid paste changes preview;
  IMPORT while RUNNING cannot publish a stale result; EXPORT can be reimported.
