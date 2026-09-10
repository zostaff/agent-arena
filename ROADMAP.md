<div align="center">
  <img src="assets/banner.svg" alt="DEGEN VILLAGE" width="100%">
</div>

# Roadmap

**Every improvement lands here first.** A change that is worth making is worth
one line in *Next up* before it is worth a commit; a change that shipped moves
to *Shipped* with its date, its hash, and a **For a post** block — the checked
facts and numbers behind it. If something was considered and rejected, it goes
to *Not doing* with the reason, so the same idea does not get re-litigated in
six months.

Nothing in a *For a post* block is aspirational. If a number is not measured
yet, it is written as the limit instead of as the achievement.

The ordering rule for *Next up*: **what would embarrass the project if someone
read the code today** comes before what would impress them — with one standing
exception: something that spoils the first thirty seconds for a new player
outranks everything, because nobody reaches the good part through a bad start.

![Agent Arena development roadmap — token launch on Robinhood Chain is a planned milestone](assets/roadmap-2026-09.png)

**TOKEN LAUNCH ON ROBINHOOD CHAIN** is a planned development milestone.
Utility, vesting, treasury controls, legal review and an independent audit precede
launch. The illustration shows milestone order, not release dates.

| Order | Milestone | Completion criteria |
|---|---|---|
| 01 | Public paper alpha | Browser QA, outage recovery, reviewed release and a verified public URL |
| 02 | Persistent sessions | Shared feed, durable paper balances and trade history |
| 03 | Real AI agents | Verified server-side model calls, latency and spending limits |
| 04 | Verified competitions | Authoritative rankings, fixed rules and replayable results |
| 05 | Pons market data | Verified swaps, candles, token mapping and liquidity |
| **06** | **TOKEN LAUNCH ON ROBINHOOD CHAIN** | **Utility, vesting, treasury, legal review, testnet and independent audit** |

Full contracts: [public alpha](specs/14-public-paper-alpha.md),
[launch and visibility](specs/15-launch-and-visibility.md),
[token development](specs/16-development-token.md).

---

## Shipped

Every entry carries a **For a post** block: facts and numbers that are already
checked, so writing an update is a matter of picking which line to lead with —
never of inventing something that merely sounds like progress. Each block ends
with the honest limit, because an update that names its own gap is the one
people believe.

The current released alpha has **226 passing tests**. Historical entries below
retain their original measurements; implementation-batch notes describe the
validation performed before the release.

### 2026-09-11 · Public paper alpha and illustrated roadmap — [`9f906e4`](https://github.com/zostaff/agent-arena/commit/9f906e4)

**Try it:** [PAPER alpha](https://zostaff.github.io/agent-arena/?mode=PAPER).
[CI](https://github.com/zostaff/agent-arena/actions/runs/34532512283) and
[Pages deployment](https://github.com/zostaff/agent-arena/actions/runs/34532512239)
completed successfully. The public JS/CSS match the checked local production build.

**What changed.** Real Coinbase quotes, bounded virtual execution, isolated
sessions, core/UI refactoring, validated build imports, English subsystem specs
and an illustrated six-stage roadmap. **TOKEN LAUNCH ON ROBINHOOD CHAIN** is
prominent as a planned milestone, with utility, vesting, treasury and audit gates.

**For a post**

* **226 passing tests across 15 files**, typecheck and Pages production build.
* **180-second public-feed check:** 8,964 engine ticks, 15 fresh-market reports,
  three stale LINK-ETH reports; the engine continued and the virtual ledger
  reconciled on every tick. No strategy entry fired during that interval.
* A separate **synthetic QA buy/sell** used a real SOL-ETH book: 0.01 virtual ETH
  bought 0.2463054187 SOL. After spread and both 60 bps fees, the account held
  9.9998726552 virtual ETH. No exchange order was submitted; this is execution
  plumbing evidence, not strategy performance.
* The public page returns HTTP 200, both production assets match, the roadmap
  PNG is published, and the exchange response allows cross-origin reads.
* **The honest limit:** full browser interaction QA is pending after automation
  timeouts. The short feed check is not a 24-hour soak; Pons real prices, durable
  server accounts, paid LLM verification and authoritative rankings remain planned.

### 2026-09-07 · Cold start fixed, and a router ABI that was wrong all along — [`ca97ddd`](https://github.com/zostaff/agent-arena/commit/ca97ddd)

**What changed.** Two roadmap items in one pass: a new agent now trades before
it trains, and `execute.ts` refuses to sign any call whose selector is not in
the deployed router's bytecode. 6 new tests.

**For a post**

* **The first trade came 6.7x sooner.** First decision moved from tick 497 to
  **74**, first fill from 515 to **207** — measured, not estimated. An agent
  used to start its life owing a training session, so a fresh village spent its
  opening minutes doing chores while someone watched.
* **Reading the deployed router found the ABI had been wrong from day one.**
  `eth_getCode` on `0xe33e…2948` (4,416 bytes) does not contain the selector
  for `buy(address,uint256,uint256)` — the signature pinned in the code since
  the first commit. `DRY_RUN=0` would have reverted on the very first trade.
  Nobody noticed because nothing had ever tried to send.
* The router's real buy is **`buy(uint256,uint256,address)`** — a different
  argument order — and no `sell` selector matches any plausible signature,
  which fits Pons v2 settling through Uniswap v4 rather than through the
  router.
* **The fix is a refusal, not a guess.** One `eth_getCode` before signing; a
  call whose selector cannot dispatch is refused. Guessing at argument order is
  the single mistake here that costs real money, so a selector *match* does not
  unlock anything either — the refusal stands until an order is confirmed
  against a real trade. A miss, though, is proof.
* `npm run chain` prints the gate in four lines: `pinned buy ABSENT — would
  revert`, `pinned sell ABSENT`, `observed buy present (argument order
  unconfirmed)`, `safe to send NO`.
* **The honest limit:** this makes execution *safe*, not *working*. The real
  buy path is still unwritten, and the sell path is still unknown.

### 2026-09-07 · Paper trading on real Robinhood Chain tokens — [`34e6ecc`](https://github.com/zostaff/agent-arena/commit/34e6ecc)

**What changed.** A third mode. `npm run paper`, or the PAPER switch in the
header: the bots trade the tokens launching on Robinhood Chain right now, read
from the free public RPC. New `src/live/rpc.ts` (raw JSON-RPC, Pons log
decoding), `src/paper/market.ts`, a live-launch panel in the DEX, `npm run
chain`, and two new specs. 14 new tests.

![Three modes](assets/modes.png)

**For a post**

* **No key, no indexer, no wallet.** The Robinhood Chain public RPC is free and
  CORS-open, so this runs in a terminal and in the browser build alike. That is
  the whole point: someone can watch the bots trade without signing up for
  anything.
* The chain is *busy*: **173 token launches in an eight-minute window** on
  2026-09-07. Tokens arrive seconds apart — `$SLOPNALD`, `$HORMUZ`, `$PERONA`,
  `$VLAD TENEV`. The bots trade whatever launched in the last quarter hour.
* **What is real is labelled field by field.** Identity, symbol and age come
  from `eth_getLogs` and `symbol()`; price and book are simulated, because Pons
  v2 settles through Uniswap v4 and that swap decoding is not written yet. The
  DEX prints `identity chain · price sim · book sim · fills paper` under every
  chart. A paper P&L on a real ticker is easy to mistake for a real one — the
  label is the feature, not decoration.
* **The village will not invent a ticker.** The old code fell back to a
  hard-coded `$RUG` when the market had named no pairs yet; in paper mode that
  means trading something that does not exist on chain. It now skips the cycle.
* **Two bugs only a browser could find.** `globalThis.fetch` called as a bare
  reference throws *Illegal invocation* in Chrome and works fine in Node. And a
  burst of a dozen `eth_call`s behind a `getLogs` came back empty against the
  shared public RPC, so every token rendered as its address — paced at 70ms,
  and a failed symbol is never cached, so the next refresh retries it.
* Same token, same tape, on any machine: each price path is seeded from the
  token's own address.
* **The honest limit:** prices are simulated. This is a real universe and a
  real clock, not a real market — and it says so on screen rather than in a
  footnote.

![The DEX reading Robinhood Chain live](assets/shot-chain-feed.jpg)

*The DEX at 03:00 on 2026-09-07: `live`, chain 4663, head 56,388,633, and six
tokens that had existed for seconds. Every address is real and clickable in a
block explorer; the chart above them is not.*

### 2026-09-07 · The village survives a reload, and CI publishes it — [`01d62db`](https://github.com/zostaff/agent-arena/commit/01d62db)

**What changed.** `save()` / `restore()` on the village, a hostile-input
`parseSave`, autosave every 240 ticks with a flush on tab hide, a two-click
RESET, an error boundary, and two GitHub Actions workflows: `ci.yml`
(typecheck → test → build on every push and PR) and `pages.yml` (same gate,
then publish). 9 new tests.

**For a post**

* **Two hours of upgrades used to die on a stray Cmd-R.** Now treasury,
  building levels, running jobs, boosts and every agent's stats, level, XP,
  house and record come back.
* **What deliberately does not come back: open positions.** A position is
  priced against a market that no longer exists after a reload, so carrying one
  over would mean inventing its P&L. The trade never closed, so it never
  counted — unrealised P&L is discarded, not banked.
* A save is treated exactly like a model's answer: **data from anywhere.**
  Every number coerced and clamped, every id checked against the set the engine
  knows, unknown buildings and boosts dropped, an unrecognised version refused
  rather than guessed at. One test feeds it a hostile save with `spd: 999`,
  `cls: "GODMODE"` and a negative treasury and asserts what comes out.
* **Driving it in a real browser caught a real bug.** RESET cleared the save
  and reloaded — and the reload fired `pagehide`, which wrote the village
  straight back. Watching the tick counter go 36 → 28 instead of 36 → 0 is what
  exposed it; a latch now suppresses the flush while a wipe is in flight. Unit
  tests would never have found that one: the bug lived in the browser's
  lifecycle, not in the engine.
* **CI is green on every push**: typecheck → 142 tests → build, in about 40
  seconds. The Pages workflow runs the same gate before anything reaches a
  public URL.
* **The honest limit:** the save is per browser. There is no account, no cloud
  slot, and clearing site data still clears the village.

### 2026-09-06 · Cost-adjusted P&L — [`07e37de`](https://github.com/zostaff/agent-arena/commit/07e37de)

**What changed.** The inference bill is subtracted from the result. `netEth =
pnlEth - spentUsd / ASSUMED_ETH_USD`; net sits beside gross everywhere; the
FORGE verdict and the BUILDS board rank on net (`BOARD_KEY` → `dv_board_v2`);
one backtest now prices the same run on all three houses; the agent inspector
gained a net-of-inference row. 9 new tests.

**For a post**

* A build that clears **+0.02 ETH gross while burning $9 of GPT-6 Astra lost
  money.** That sentence is the whole feature.
* Gross alone was defensible while every agent billed **$0.01186** a decision.
  With three houses **100x apart** on price it became a lie by omission.
* **One run, three prices.** The backtest agent is frozen, so cost per decision
  is constant and the whole bill is `decisions × cost` — all three houses get
  priced from a single simulation instead of three.
* The leaderboard key moved to v2 rather than migrating old rows: entries
  ranked on gross **are not comparable** to entries ranked on net, and pre-v2
  rows show their gross with an asterisk instead of pretending the bill was
  zero.
* One assumed number in the whole engine: **ETH at $2,500** (spot was $2,506
  that day). It lives alone in one constant, and everything derived from it is
  labelled *net*.
* **The honest limit:** this is a seeded simulation, not a live P&L. It
  measures builds against each other, not the market.

![FORGE with the house picker](assets/shot-forge.jpg)

*The FORGE: 20 stat points, the house the build runs on, and a compiled config
that reprices as you click. The backtest underneath reports NET beside gross.*

### 2026-09-06 · Three houses — [`8534cae`](https://github.com/zostaff/agent-arena/commit/8534cae)

**What changed.** Every agent is wired to Anthropic, OpenAI or xAI. Ladder,
pricing and wire contract per house; FORGE picker; REWIRE for 60 coins;
`AGENT_PROVIDERS`; degrade-once on a rejected parameter. 29 new tests.

**For a post**

* Three houses, six models, one unlock point: **PTN 12** opens the frontier
  rung on all three ladders.
* The price spread is the game: **$0.00184** a decision on Grok 4.3 against
  **$0.18668** on GPT-6 Astra — **101x**. A whole frontier Grok 4.6 decision
  (96 candles, 3000 reasoning tokens) costs **less than a quarter** of an
  Opus 5 decision at the bottom of its ladder.
* GPT-6 Astra and Fable 5.1 both bill **$10/$50** per million, so at the top
  they cost the same to the cent. The difference is what you paid on the way up.
* **The house changes exactly three things**: the model id on the wire, the
  price per decision, and which parameters the request may legally carry. A
  test asserts poll interval, context depth, size and slippage are identical
  across houses — so it can never quietly become a balance lever.
* **xAI is the only house that still accepts `temperature: 0`.** OpenAI removed
  sampling parameters on GPT-6 Astra and the GPT-5.6 family; Anthropic removed
  them on Opus 5 and Fable 5.1. The determinism the original brief asked for
  survives on exactly one of the three wires.
* **Degrade-once:** a 400 body is read, not just counted. If it names a
  parameter, the request goes again immediately without it, outside the retry
  budget. A silently dead house is worse than a slightly slower one.
* **The honest limit:** the OpenAI and xAI wires are typed and tested against
  fixtures. Neither has answered this code for real yet — that is item 1 in
  *Next up*, and it stays worded that way until it has.

### 2026-09-06 · DEGEN VILLAGE v0.1 — [`7b9d892`](https://github.com/zostaff/agent-arena/commit/7b9d892)

**What changed.** The whole thing: stat compiler, village economy, agent state
machine, seeded sim, deterministic backtest, live Anthropic brain, Bitquery
market, viem execution in dry run, isometric SVG UI, FORGE, board. 95 tests.

**For a post**

* **Every stat bar is a real config field the engine reads.** Fill SPD and the
  poll interval genuinely drops: `max(400, 3200 - spd × 260)`. Nothing on the
  screen is decorative.
* `src/core` **imports nothing at all** — that is what lets the same engine run
  in node and in a browser, and what makes a 7,000-tick backtest and a live
  session comparable.
* **Two runs of the same build return byte-identical numbers.** That is what
  makes the leaderboard a leaderboard and not a lottery.
* `decide()` **never throws.** Parse failure, bad status, timeout, transport
  error, empty content, refusal, missing key — all of it resolves to SKIP.
* The model is **never trusted on size**: `sizeEth` is clamped after parsing,
  every time, including on the sell path.
* **The honest limit:** execution defaults to `dryRun: true` and prints the
  call it would have sent. It has never signed a transaction.

![The village](assets/shot-village.jpg)

*Four agents, eight buildings, one terminal. The left panel is the whole idea:
stat bars on top, the config they compile to underneath.*

---

## Implementation batch · 2026-09-08 · included in release 9f906e4

### 1. Domain boundaries and actionable specs

Economy definitions and save validation are extracted from Village. Build
validation lives in core; FORGE widgets and the paste form are separate React
components. Compatibility exports preserve existing callers. Every subsystem
spec names its owner, acceptance checks and remaining tasks; the entry point is
[specs/README.md](specs/README.md), with boundaries in
[spec 12](specs/12-architecture.md).

### 5. FORGE imports build JSON

Paste, validate, load. The same validator protects board LOAD and deployment:
finite ranges, a 20-point budget, unknown-house fallback, and no trust in
imported compiled config or performance claims. Backtest results belong to the
draft that produced them, including when an import occurs during a run.
Contract: [spec 06](specs/06-forge.md).

### 6. The DEX tape records the house

Each BUY/SELL stores its provider rather than looking up the agent's current
house during rendering. REWIRE refuses a pending decision, and earlier fills
keep their attribution after rewiring. Contracts:
[spec 01](specs/01-core-contracts.md), [spec 07](specs/07-ui.md).

### 8. Explicit local-save scope

The app says “Progress saved in this browser · no cloud sync” below the header.
No cloud slot is implemented. Contract: [spec 13](specs/13-persistence.md).

**Validation:** 206 tests across 13 files (44 added), including module
boundaries, hostile imports, atomic deployment refusal and historical house
attribution. Typecheck, production build and `git diff --check` pass. Browser smoke testing remains pending because
native browser automation disconnected before the page could be inspected.
These checks were performed before publication; the changes are now included in release `9f906e4`.

## Implementation batch · 2026-09-10 · included in release 9f906e4

- Real Coinbase SOL-ETH/LINK-ETH/ADA-ETH book and candles, public read-only API.
- Strict virtual account: 10 ETH, 60 bps fee assumption, quote-budget buys,
  token-quantity sells, cash/depth/slippage/freshness guards.
- Core paper ledger and UI market session extracted into independent modules.
- Quote outages preserve positions in SETTLE; recovery closes exactly once.
- PAPER is ephemeral, isolated from SIM/CHAIN saves and unverified village scores.
- Specs 14–16 cover public alpha, launch/private boundaries and development token.
- Pages auto-deployment is opt-in via `PAGES_ENABLED`, preventing permanent
  failures on repositories that have not enabled Pages yet.

**Validation:** typecheck, 223 tests / 14 files, production build and diff check.
A 120-tick CLI session read all three products and reported feed `live`; agents
made decisions but no entry signal fired, so no live-feed fill was observed.
Buy/sell arithmetic and outage/recovery are verified by deterministic tests.
Chrome rendered the app and mode controls; the automation connection timed out
after switching to PAPER, so full browser interaction/CORS QA remains incomplete.
These were pre-release checks; the implementation is now published in release `9f906e4`.

**For a post:** the demo now has a real-price paper path and a bounded virtual
account. This is not Pons swap decoding, a production broker, paid LLM verification
or a server-authoritative competition. Token work is a roadmap/design milestone.

## Next up

### 10. Public paper alpha — real quotes, virtual funds (2026-09-10)

Owner: [spec 14](specs/14-public-paper-alpha.md). Add a public Coinbase
ETH-quoted market, a bounded virtual account and strict book execution; refuse
stale/invalid data and insufficient depth. Isolate sessions from saved SIM P&L.
No wallet or model API keys in the browser. Keep chain-identity/sim-price mode
explicitly labelled. Validate with fixtures, a public-feed probe and browser QA.

### 11. **TOKEN LAUNCH ON ROBINHOOD CHAIN** — development and launch gates

Owner: [spec 16](specs/16-development-token.md). Plan a token on **Robinhood Chain** to support project
development, after a useful free paper alpha and repeat usage. Specify utility,
funding alternatives, supply, allocations, vesting, treasury reporting and
multisig controls. Get jurisdiction-specific review, independent contract audit
and testnet evidence before any issuance. No token sale, deployment, investment
return promise or required token purchase is authorized by this roadmap item.

### 12. Public/private split and community launch

Owner: [spec 15](specs/15-launch-and-visibility.md). Keep the demo, engine,
contracts, tests and reproducibility public; isolate hosted service operations,
secrets and proprietary strategies. Ship a no-signup demo and run a small,
measured feedback cohort before a wider launch. See the operator guide
[docs/LAUNCH.md](docs/LAUNCH.md).


### 2. The real buy and sell paths

Owner and evidence checklist: [spec 04](specs/04-live.md), [spec 11](specs/11-chain-feed.md).

The selector preflight proved the pinned ABI cannot dispatch and now refuses to
sign — safe, but not working. `buy(uint256,uint256,address)` exists on the
router with an unconfirmed argument order, and no `sell` selector was found at
all.

**Done means:** the argument order is confirmed from a real buy transaction's
calldata on chain, the sell path is located (router, curve engine, or the v4
PoolManager), both are pinned with the transaction hash that proved them, and
the preflight goes green on its own rather than by being told to.

### 3. Prove the two new wires against a live 200

Owner and evidence checklist: [spec 04](specs/04-live.md).

`providers.test.ts` drives OpenAI and xAI through fixtures. Neither has ever
answered this code for real. Everything about the request shape is *inferred
from vendor docs*, and docs and deployments disagree all the time — that is
precisely why degrade-once exists.

**Done means:** one recorded dry-run session per house, the `onTrace` output
pasted into `specs/04-live.md`, and any shape correction the real response
forced. Until then the honest claim is "typed and tested", not "working".

### 4. Latency measured per house, never assumed

Owner and acceptance criteria: [spec 04](specs/04-live.md), [spec 07](specs/07-ui.md).

`BrainTrace.ms` is recorded and then thrown away. Round-trip time is a real
difference between houses and it belongs in the HUD — as a *measurement*, with
a sample count.

**Done means:** rolling median ms per house in the inspector, labelled with `n`.
It must not feed the stat compiler: SPD is the poll interval the player bought,
not a vendor's mood.

### 7. Real prices: decode the Uniswap v4 swaps

Owner and evidence checklist: [spec 11](specs/11-chain-feed.md), [spec 10](specs/10-paper-trading.md).

The largest remaining gap in the Pons adapter. CHAIN mode reads the token universe
and then simulates the price, because Pons v2 settles through Uniswap v4:
a trade is a `Swap` on the PoolManager keyed by pool id, not an event on the
Pons router. Decoding enables observed prices and candles. Paper fills and P&L remain
simulated execution results even when based on real market observations.

**Done means:** the PoolManager address and pool id derivation are pinned in
`specs/11-chain-feed.md`, `RpcMarket` serves OHLC built from real swaps, and
`Snapshot.provenance.price` flips from `sim` to `chain`. Nothing else in the
codebase has to change — that one label is wired through the UI already.

---

### 9. Public deployment — completed in release 9f906e4

Owner: [spec 09](specs/09-tests.md), `.github/workflows/pages.yml`.

Pages is enabled for GitHub Actions, `PAGES_ENABLED=true`, and the public URL
is in the README. CI and deployment passed for `9f906e4`; public HTML, JS and CSS
were verified. Keep the remaining interactive browser QA in the alpha checklist.

## Later

* Rank rival villages by cost-adjusted net, not gross — the BUILDS board now
  does it, the VILLAGES board still ranks on gross session P&L.
* The FORGE and DEX overlays assume a wide viewport: at ~1200px the right-hand
  column is the first thing to suffer. Noticed while screenshotting the net
  cells on 2026-09-06; not urgent, but it is a real edge and it is written down
  rather than forgotten.
* Replay export: a seed plus a build is already a reproducible run; make it a
  shareable file.
* Mobile layout for the village scene (the HUD assumes a wide viewport).
* A fourth house — only when there is a reason beyond "it exists". Adding one
  is one entry in `MODEL_LADDERS`, one in `MODEL_PRICING`, one `WireAdapter`
  and one router line; the cost is keeping another price table honest.

---

## Not doing

* **Making the house a balance lever.** The provider changes the model id, the
  price and the legal wire parameters — nothing else. A test asserts poll
  interval, context depth, size and slippage are identical across houses. If
  that ever changes it will be a deliberate, argued decision, not a nerf.
* **Retuning `src/sim/market.ts` to make backtests look better.** The seed
  replays a world; changing the world invalidates every published build.
* **Autopilot with real funds.** `dryRun: true` is the default and `DRY_RUN=0`
  stays the only way off, typed by a human who meant it.
* **Trusting the model on size.** `sizeEth` is clamped to `maxSizeEth` after
  parsing, every time, on every house, including the SELL path.
