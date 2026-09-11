# Specification index

Start here when changing the project. Each subsystem spec describes its
requirements, implementation and acceptance checks; its task list distinguishes
implemented behavior from remaining work. Historical vendor and chain readings
are evidence from their stated dates, not a claim of current verification.

| Spec | Owns | Acceptance / next work |
|---|---|---|
| [00 — Overview](00-overview.md) | Entry points, repository map | Keep paths and modes current |
| [01 — Core contracts](01-core-contracts.md) | Market, Brain, agent lifecycle, trade attribution | Failure guards; immutable historical house |
| [02 — Stat compiler](02-stat-compiler.md) | Stats, ladders, pricing, boosts | Boundary and house-independence tests |
| [03 — Simulation](03-sim.md) | Seeded market, heuristic brain, backtest | Determinism and net accounting |
| [04 — Live adapters](04-live.md) | Provider HTTP wires, Bitquery, execution gate | Roadmap 2: transaction evidence; 3: real provider responses; 4: latency |
| [05 — Economy](05-village-economy.md) | Buildings, treasury, roster, fills | Costs and lifecycle tests |
| [06 — Build authoring](06-forge.md) | Build schema, JSON import, FORGE | Roadmap 5 implemented locally; browser QA pending |
| [07 — Interface](07-ui.md) | Scene, inspector, DEX, app lifecycle | Roadmap 6 implemented locally; browser QA pending |
| [08 — Board](08-multiplayer.md) | Shared storage adapter and ranking | Validated build loading; future net village ranking |
| [09 — Validation](09-tests.md) | Test inventory and completion gate | Typecheck, unit/integration tests, production build |
| [10 — Paper market](10-paper-trading.md) | Chain identities with simulated prices | Provenance and reproducible address-seeded tapes |
| [11 — Chain feed](11-chain-feed.md) | RPC decoding and chain evidence | Roadmap 7: real swap prices |
| [12 — Architecture](12-architecture.md) | Dependency boundaries and refactoring decisions | Automated import boundary checks |
| [13 — Persistence](13-persistence.md) | Save schema, restore and browser storage | Roadmap 8 local-save disclosure implemented locally |

| [14 — Public paper alpha](14-public-paper-alpha.md) | Coinbase quotes, virtual ledger, feed lifecycle | Real data / virtual execution, outage recovery |
| [15 — Launch and visibility](15-launch-and-visibility.md) | Public demo, private service boundary, growth | Pilot and server-verified competitions |
| [16 — Development token](16-development-token.md) | Utility, economics, review and launch gates | Design only; no issuance |
| [17 — Fly swarm](17-fly-swarm.md) | Hidden four-agent room, SVG flies, tick-driven monitors and telemetry | Zero-cost roster, unchanged baseline; real neural solver and Pons quotes remain open |

## Working agreement

1. Record a change in [the roadmap](../ROADMAP.md) and identify its owning spec.
2. Update the requirements and acceptance criteria before changing behavior.
3. Implement in the owning module; keep I/O outside the core.
4. Run the relevant tests, then the completion gate in spec 09.
5. Record actual evidence and limitations. Local implementation is not a
   published release; only committed releases enter the historical shipped list.

Do not enable signing, invent transaction evidence, or mark a provider as
verified because fixture tests passed. Those acceptance criteria require the
external evidence listed in specs 04 and 11.
