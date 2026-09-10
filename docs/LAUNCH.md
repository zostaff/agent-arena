# Agent Arena: launch, growth and repository boundaries

Date: September 10, 2026. This guide describes the current implementation and
planned work. A local alpha is not a published production service.

## Try the alpha

```bash
npm ci
npm run dev
# Open http://localhost:5173 and select PAPER.
npm run paper
# Run a bounded session:
TICKS=600 npm run paper
```

PAPER reads public Coinbase books and one-minute candles for SOL-ETH, LINK-ETH
and ADA-ETH. Each session starts with 10 virtual ETH. Prices are denominated in
ETH per token; the fee assumption is 0.60% on each side. Buys walk the asks and
sells walk the bids. Insufficient cash or depth, excessive slippage and stale
quotes prevent execution. No wallet, deposit, signature or exchange order is
involved.

Free sessions use a heuristic algorithm, not paid GPT, Claude or Grok calls.
The selected house supplies configuration and estimated model costs. The main PAPER P&L includes trading fees and excludes hypothetical inference
charges. The inspector shows a separate cost-adjusted estimate, not an API
invoice. Reconcile virtual trading results against cash and open positions.

SIM generates the entire market. CHAIN (`npm run paper:chain`) reads real
Robinhood Chain token identities but generates prices. Paper trading Pons tokens
at real prices still requires a verified Uniswap v4 decoder, pool-to-token
mapping, token decimals, swap history and liquidity estimates. Coinbase does
not provide that Pons feed.

PAPER cash, positions and results reset together on reload. SIM and CHAIN use
separate save slots. PAPER cannot publish to the village board because browser
results are user-controlled. Animation speed does not accelerate real quotes;
strategies may remain flat until an entry signal appears.

## Public access

1. **Publish the demo.** In GitHub, select Settings → Pages → Build and deployment
   → Source: GitHub Actions, then manually run the `pages` workflow. Set the
   repository variable `PAGES_ENABLED=true` to enable automatic deployments.
   The expected URL is `https://zostaff.github.io/agent-arena/`; verify a successful
   deployment before advertising it as a working link.
2. **Run a 20–30-person pilot.** Explain the three modes, display feed health,
   provide a short FORGE walkthrough and collect feedback. Check Coinbase access
   from target regions, browser CORS behavior and data usage/redistribution terms.
3. **Share the market feed.** A server should receive one upstream stream, cache
   it and distribute observations over WebSocket or SSE. Add reconnects, freshness
   checks, backoff and latency/error metrics. Direct REST polling per browser is
   suitable for a small trial, not a large competition.
4. **Verify competitions on the server.** Execute virtual orders and maintain an
   event ledger in a database. Calculate balances and P&L on the server. Store run
   ids, engine versions, input data, season rules and replay information.
5. **Add actual LLM workers.** Keep keys on the server. Enforce per-user daily
   spending limits, timeouts and SKIP on failures. Verify currently available
   models and prices; existing project tables are not deployment evidence.
   Keep the heuristic mode free.
6. **Validate sustained operation.** Run a 24-hour soak, interrupt and restore the
   network, reconcile balances, test concurrency limits, mobile onboarding and
   upstream errors. The current execution model does not simulate exchange queue
   priority, matching-engine latency or shared liquidity consumption by players.

## Growth plan

Product promise: build a trading agent, test it on real market observations with
virtual funds, and compare reproducible results.

- Week 1: a no-signup entry point, a 30-second walkthrough, three understandable
  starter builds and a small pilot. Find where users get stuck.
- Week 2: a weekly challenge with fixed markets, dates and budgets. Share result
  cards linked to build settings and replays. Until server verification exists,
  label results as local rather than presenting a global ranking.
- Week 3: explain successful and unsuccessful strategies, publish a concise
  changelog and answer participants. Arrange relevant creator collaborations.
- Week 4: repeat the acquisition channel that brought returning users and address
  reasons for leaving. Validate retention before scaling paid promotion.

Measure visitor-to-session conversion, first decision/trade, custom build
creation, D1/D7 retention, feed failure rate and cost per active session. Initial
targets are hypotheses, not promised user growth. Performance screenshots should
include the period, fees and evaluation conditions.

## Public and private assets

| Public: agent-arena | Private: separate repositories or systems |
|---|---|
| UI, core engine, SIM/PAPER, tests and specs | Hosted backend operations and infrastructure |
| Build format, API/SDK and evaluation methodology | Proprietary strategies and prompts |
| Examples, roadmap and reproducible results | Anti-abuse settings and internal runbooks |
| Future verifiable token contracts | User records in an access-controlled database |

Keep secrets out of both public and private Git. Use a secret manager, deployment
secrets or a local ignored environment file. Everything delivered to a browser
can be downloaded, including JavaScript and source maps; frontend code cannot
hide a proprietary algorithm.

GitHub cannot make an individual folder or branch of a public repository private.
Keep `agent-arena` public and create a separate private `agent-arena-cloud` for
future closed services. Preserve compatible public schemas.

To close the entire repository: Settings → General → Danger Zone → Change
repository visibility → Make private, then complete GitHub's confirmation.
Review collaborator access, Pages, plan restrictions and integrations first.
Changing visibility unpublishes Pages; subsequent availability depends on the
plan and configuration. Public forks, clones and already granted MIT rights do
not disappear. Visibility changes cannot recall distributed code.

If a credential entered Git, revoke or rotate it at the provider first. Then
follow GitHub's sensitive-data removal procedure and coordinate updates to
clones. `.gitignore` prevents new additions; it does not remove tracked content.
The local review of tracked env/key/secret filenames found only `.env.example`.
This is not a complete audit of the contents of Git history.

## Development token

The roadmap includes a separate [token specification](../specs/16-development-token.md).
First establish repeat product use, then define utility and compare a token with
subscriptions, grants and sponsorship. Next specify the budget, supply,
allocation, team vesting, multisig treasury, jurisdiction-specific legal review,
testnet validation and independent audit. Issuance or sale requires a separate
decision. Free paper onboarding must not require a token; existing game coins
are not blockchain tokens.

## Primary sources

- [Coinbase: order books, level sizes and auctions](https://docs.cdp.coinbase.com/api-reference/exchange-api/rest-api/products/get-product-book).
- [Coinbase: candles](https://docs.cdp.coinbase.com/api-reference/exchange-api/rest-api/products/get-product-candles).
- [GitHub: repository visibility and consequences](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/managing-repository-settings/setting-repository-visibility).
- [GitHub: removing sensitive data from history](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository).
