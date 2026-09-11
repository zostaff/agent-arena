<div align="center">
<img src="assets/banner.png" alt="DEGEN VILLAGE" width="100%">

**[Try paper alpha](https://zostaff.github.io/agent-arena/?mode=PAPER) · [Roadmap](ROADMAP.md) · [Specs](specs/README.md) · [Architecture](specs/12-architecture.md) · [Launch guide](docs/LAUNCH.md)**

[![ci](https://github.com/zostaff/agent-arena/actions/workflows/ci.yml/badge.svg)](https://github.com/zostaff/agent-arena/actions/workflows/ci.yml)

</div>

# DEGEN VILLAGE

> ## **TOKEN LAUNCH ON ROBINHOOD CHAIN**
>
> **A community-initiated memecoin launch is planned for DEGEN VILLAGE.**
> Creator fees are intended to go to the project founder.
>
> Follow the [token launch roadmap](ROADMAP.md#token-launch-on-robinhood-chain).
> The token address and launch details will be added when confirmed.

Build a trading agent in an isometric village, tune its strategy in FORGE,
and watch it trade with virtual funds. Stats compile into actual engine
parameters: polling cadence, context depth, size, slippage and model budget.

## Try locally

Node.js 20+ (CI uses 22):

```bash
npm ci
npm run dev       # open http://localhost:5173
npm test
npm run build
npm run paper     # real Coinbase quotes, virtual ETH, no keys
TICKS=600 npm run paper  # bounded CLI session
npm run paper:check      # 3-minute feed and virtual-ledger reconciliation
npm run sim       # seeded offline market
npm run paper:chain     # chain identities with simulated prices
npm run chain     # read-only Robinhood Chain diagnostic
```

The UI has three explicit modes:

| Mode | Identity / prices / book | Execution and decisions |
|---|---|---|
| SIM | Generated, seeded | Simulated fills; free heuristic |
| PAPER | Coinbase SOL-ETH, LINK-ETH, ADA-ETH; real book and minute candles | 10 virtual ETH; free heuristic |
| CHAIN | Robinhood Chain token identities; generated prices and book | Simulated fills; free heuristic |

**PAPER uses real market observations, never real money.** There is no wallet,
signing or exchange order submission. Historical trade candles and sampled book
midpoints are labelled separately. ETH-quoted products preserve native ETH units.

PAPER buys from asks and sells into bids, respects visible depth, cash and
slippage, and assumes a **0.60% fee on each side**. Books expire after 15 seconds;
invalid/empty/crossed/auction books are rejected. A failed refresh leaves an open
position waiting for recovery instead of fabricating a closing price.

This is a local alpha, not a verified trading competition. REST polling does not
model matching-engine latency, queue priority or liquidity consumed by other
players. Direct feed access depends on the user's network and region. Data
errors are visible; there is no fallback to invented prices in PAPER.

## What the bots do

The free browser and paper CLI use a deterministic heuristic that reads the
same strategy fields authored in FORGE. **They do not call GPT, Claude or Grok.**
A house selects configuration and an estimated inference bill. Model ids, prices
and API assertions in historical specs/config are provisional until revalidated;
fixture tests are not evidence that a vendor currently serves a model.

FORGE supports 20 stat points, strategy parameters, provider selection,
backtesting, JSON export/import and deployment of custom agents. Imports and
board LOAD share `core/build.ts`: finite ranges and budgets are enforced, unknown
houses default to Anthropic, and imported performance claims are discarded.
Publishing an imported build requires a fresh backtest.

REWIRE is refused while a position or decision is pending. The tape records the
house at fill time, so later rewiring cannot rewrite attribution.

The simulated comparison reports gross and net of **estimated** model costs.
That estimate uses a fixed ETH/USD assumption, not a real API bill. In PAPER,
the primary P&L excludes hypothetical inference charges and cash is shown separately; game treasury coins are not
trading collateral or blockchain tokens. The fixed paper fee overrides the
village's simulated fee discounts.

## Persistence and scores

SIM and CHAIN progress save in separate browser slots. The validated save
restores upgrades, jobs, roster and records; open positions are not restored.
PAPER is a fresh, ephemeral session: cash, positions and P&L reset together on
reload. Its results cannot be published to the village board.

The current board is localStorage in a normal browser; an optional host-provided
`window.storage` can share it. Neither path provides server-verified rankings.
Production competitions need an authoritative server and event ledger.

## Architecture and specifications

```text
src/core   contracts, stat compiler, agents, village orchestration
           economy, save/build validation, strict virtual account
src/sim    seeded market, heuristic decisions, reproducible backtests
src/paper  Coinbase public data; legacy chain-identity simulated market
src/live   provider adapters, chain RPC, Bitquery and guarded execution
src/ui     React village, FORGE, DEX, storage, market session lifecycle
src/run.ts CLI composition: sim / paper / chain-demo / live
```

Core imports only other core modules, enforced by an architecture test.
`economy.ts`, `save.ts`, `build.ts` and `paper.ts` own separate domain contracts;
`Village` orchestrates them. FORGE widgets/import and market-session lifecycle
are separate UI modules. The [spec index](specs/README.md) assigns ownership,
requirements, acceptance checks and remaining tasks to each subsystem.

Typecheck, **226 tests across 15 files**, and production build pass locally on
2026-09-11. Tests cover deterministic runs, hostile input, provider fixtures,
virtual balance/depth/freshness, outage recovery and historical fill attribution.
Published CI/deployment status is separate from these local checks.

## Hosted demo and production work

The [public paper alpha](https://zostaff.github.io/agent-arena/?mode=PAPER) was
deployed on 2026-09-11. CI and Pages passed for release `9f906e4`; the public
HTML, JavaScript and CSS were checked against the local production build.
Full interactive browser QA remains pending because browser automation timed out.


GitHub Pages workflow builds the static UI. First select **Settings → Pages →
Source: GitHub Actions**, then run `pages` manually. Set repository Actions
variable `PAGES_ENABLED=true` to deploy automatically on pushes to main. Without
that opt-in, pushes run CI without a permanently failing Pages deployment.

For public scale: shared market-data service, durable virtual accounts,
server-verified scores, quotas, monitoring and a recovery/24-hour soak test.
For real LLM decisions: server-only keys, actual vendor response checks and
per-user inference budgets. See [spec 14](specs/14-public-paper-alpha.md) and the
[launch guide](docs/LAUNCH.md).

Real Pons prices require a verified Uniswap v4 swap decoder and pool mapping;
the Coinbase adapter does not claim to provide that data. Funded execution also
remains unfinished. `MODE=live` composes market/model adapters; it must not be
presented as a working production order-routing system.

## Environment and secrets

`.env.example` documents server-side inputs. Export variables in your shell;
CLI commands do not automatically load `.env`. SIM and PAPER need none.

| Variables | Purpose |
|---|---|
| `MODE`, `SEED`, `TICKS` | CLI mode and simulation/session controls |
| `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `XAI_API_KEY` | Server-side provider adapters |
| `AGENT_PROVIDERS` | Live roster house order, e.g. `xai,openai` |
| `BITQUERY_TOKEN` | Legacy live market adapter |
| `RH_RPC_URL`, `RH_PRIVATE_KEY`, `PONS_ROUTER`, `DRY_RUN` | Standalone execution adapter |
| `PAPER_PAIRS`, `PAPER_REFRESH_TICKS` | Legacy chain-demo universe/refresh |

Never put secrets in Git (public or private) or browser/Vite environment
variables. The execution adapter defaults to dry run and its deployed-selector
preflight refuses unsupported calls. This guard is not proof of a valid buy/sell
integration. See [SECURITY.md](SECURITY.md).

## Development and token roadmap

Keep the demo, core, contracts and tests public. Separate hosted operations and
proprietary strategies into private repositories; credentials belong in a secret
store. Visibility decisions and migration instructions are in
[spec 15](specs/15-launch-and-visibility.md).

A **development token** is now a roadmap item: product demand, utility and funding
alternatives, economics, jurisdiction-specific review, testnet and independent
audit precede a separate launch decision. No token is issued and the free paper
demo does not require one. See [spec 16](specs/16-development-token.md).

## License

MIT. Making a repository private does not retract already distributed copies.
