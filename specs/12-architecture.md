# 12 — Architecture and module boundaries

## Requirements

- The same core runs in Node and a browser without external runtime packages.
- The village orchestrates state transitions and injected Market/Brain calls.
  Economy definitions, save parsing and build validation have separate owners.
- JSON from the clipboard, board or disk crosses a validator before use.
- Refactoring preserves simulation formulas, seed, pricing and save version.
- Existing exports from `core/village.ts` and `ui/Forge.tsx` remain available
  while callers migrate to the owning module.

## Design

| Module | Responsibility | Dependencies |
|---|---|---|
| `core/types.ts` | Market, Brain, snapshot and verdict contracts | None |
| `core/config.ts` | Compile stats and price decisions | Core contracts |
| `core/agent.ts` | Movement, state machine, training, positions | Core contracts, compiler, strategy defaults |
| `core/economy.ts` | Building/boost definitions, costs, domain state types | Core types only |
| `core/save.ts` | Versioned save schema and hostile-input parser | Economy, compiler, strategy defaults |
| `core/build.ts` | Authored build schema, validation, strategy limits | Compiler, strategy defaults |
| `core/village.ts` | Tick orchestration, treasury mutations, roster and fills | Core modules, injected Market and Brain |
| `sim/*` | Deterministic market/brain and backtest | Core |
| `paper/market.ts` | Real token universe and simulated tape | Core, sim, RPC reader |
| `live/*` | Network and signing adapters | Core, fetch, viem |
| `ui/Forge.tsx` | Editor state and asynchronous backtests | Core build contract, backtest, UI components |
| `ui/ForgeWidgets.tsx` | House picker, sliders, metrics, equity chart | React, core config, theme |
| `ui/BuildImport.tsx` | Paste form and validation feedback | React, core build parser |
| `ui/storage.ts` | Host storage with local fallback | Browser/host storage |

`tests/architecture.test.ts` enforces relative imports within `core` and
prevents leaf modules from depending on `village.ts`. Type-only dependencies on
agent shapes do not load the state machine at runtime. This is dependency-free
with respect to external packages, not a claim that core files import nothing.

## Decisions

- Keep state mutations in Village: splitting treasury ownership between
  services would introduce synchronization requirements without a second caller.
- Keep pure definitions and validators separate so they can be reused without
  importing the orchestrator or React.
- Keep save parsing separate from authored build validation. A trained save
  can exceed the FORGE allocation budget; an imported authored build cannot.
- Preserve re-exports to avoid an unnecessary breaking API change.
- Bind a backtest result to the exact serialized draft used to launch it.
  A result completing after the draft changes is hidden and cannot be exported
  or published as the new draft's result.

## Acceptance and tasks

- [x] Extract economy definitions, save validation and build validation.
- [x] Extract stateless FORGE widgets and the JSON paste form.
- [x] Validate board loads and direct deployment through the build contract.
- [x] Preserve existing save and deterministic replay tests.
- [x] Enforce core import boundaries automatically.
- [ ] Browser QA: import during a running backtest; confirm old results cannot
  be published with the imported draft. Native browser automation disconnected
  during this pass, so this check remains explicit.
- [ ] Further app lifecycle decomposition should come with tests for mode
  switches, pending decisions and autosave ordering; it is not part of this pass.

## 2026-09-10 extension

`core/paper.ts` owns strict fill arithmetic and virtual cash. `paper/coinbase.ts`
owns all exchange I/O. `ui/useMarketSession.ts` creates the injected engine and
polls feeds by wall time. A failed refresh removes the village's executable
snapshot; SETTLE waits with the position intact until recovery. PAPER sessions
are ephemeral; SIM and CHAIN have distinct persistence keys. See spec 14.
