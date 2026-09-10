# 15 — Launch and repository boundaries

## Requirements

A newcomer can run the demo with no deposit, wallet or API key. A public claim
must distinguish heuristic decisions from paid model inference, exchange data
from simulation, and local scores from a verified competition.

## Public surface

Keep `agent-arena` public: frontend, core engine, SIM/PAPER adapters, API/build
schemas, fixtures, tests, methodology, roadmap and self-host instructions.
The public repo currently uses MIT. New private services should be separate
repos with separate access lists and licensing; previously distributed MIT
copies cannot be recalled by toggling visibility.

## Private surface

`agent-arena-cloud` (proposed, not created): deployment configuration, operations,
account backend internals and anti-abuse controls. Proprietary prompts/strategies
may live here or in `agent-arena-strategies`. API schemas stay public. Credentials
belong in a secret manager or deployment secrets, never even in a private Git
repo. User data and raw account logs belong in access-controlled storage.

## Tasks and acceptance

- [x] Ignore environment variants and key material; add reporting guidance.
- [ ] Publish the reviewed static build and verify its URL in a clean browser.
- [ ] Add a shared feed proxy and server-owned append-only paper ledger.
- [ ] Authenticate competitors; calculate rankings server-side, cap requests and
  paid inference per user; retain run id, engine version, inputs and timestamps.
- [ ] Test sustained operation, recovery, mobile onboarding and data-source terms.
- [ ] Invite 20–30 opt-in testers; collect activation, D1/D7 retention and failures.
- [ ] Publish a 30-second walkthrough, reproducible weekly challenge and honest
  changelog. Invite creators with relevant audiences; no fabricated performance,
  purchased engagement or unsolicited bulk outreach.

## Operator guide

[Launch, growth, token and visibility instructions](../docs/LAUNCH.md).
Changing repository visibility or publishing an announcement is not part of the
local implementation. The operator chooses the public/private boundary first.
