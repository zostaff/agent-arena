# 17 — Fly swarm easter egg

## Scope and implementation mapping

The product is DEGEN VILLAGE. The request described an older `AgentArena.jsx`
monolith; this checkout uses `src/ui/App.tsx`, `Village`, `VillageAgent`,
`compileConfig` and `Snapshot`. Integrate with these contracts instead of
introducing a second engine. The follow-up expands the single fly into four
workstations, **FLY-00 through FLY-03**, behind **🪰 FLY SWARM**.

## Requirements

- Open with the bottom control-bar button or typed `fly`. Recognize the code
  with a ref and a capture-phase window listener; ignore editable targets,
  modified keys and non-character keys. Remove the listener on unmount.
- Keep the game mounted and running under the fixed full-screen room. Escape
  and CLOSE dismiss it. Trap focus while open and restore it on close.
- Show four faceted SVG flies at separate perspective desks. Select a smaller
  workstation to inspect its monitor, position, P&L and telemetry at full size.
  Body bob, head yaw, wing beats, city lights, keys, scan sweep and raster depend
  only on the published village tick. No additional timers, animation loops,
  random-number consumption, dependencies or browser storage APIs.
- Register the local `connectome` provider only after its reference constant
  initializes. Its `flywire-783` price is zero for both input and output; the
  ordinary compiler must produce zero cost, 24 candles and zero thinking budget,
  including after training and boosts. Paid house pickers remain unchanged.
- Join four ordinary agents through `Village.addAgent`, free, with SPD 9,
  RSK 7, PTN 2, GAS 8, size multiplier 0.2 and hold range 10–22 ticks. Joining
  twice is idempotent. Emit CONNECTOME ONLINE at each home. Select FLY-00.
  The existing loop, strategy evaluator, fill path and ledger do the trading.
  Fly agents do not consume paid FORGE slots. Existing save/restore understands
  the new class; PAPER remains ephemeral under its existing policy.
- TERMINAL ranks the actual roster by realized plus unrealized ETH minus
  inference USD converted at the project's existing $2,500/ETH assumption.
  Report recorded inference spend, including zero for all four flies.
- Lock each monitor to its own position. When flat, alternate a guaranteed
  coverage slot in stable symbol order with the current strongest mover.
  Change channels every 240 engine ticks (about 2 seconds at default 2x,
  about 4 seconds at 1x, dependent on render speed). Coverage remains fair
  when mover rankings change. The strip highlights the selected channel.
- Chart actual snapshot candles, including their forming candle, and last price.
  Include the position entry in the range. Guard empty, constant, tiny-price
  and absent snapshots. Never substitute a generated chart for missing data.

## Explicit boundaries

**This is a FlyWire-inspired heuristic, not a functioning insect connectome.**
The requested provider coefficients are retained as reference metadata; the
existing heuristic uses the class strategy. No 139,255-neuron circuit has been
loaded or solved. Dopamine, estimated spikes and the 15 modelled PAM cells are
a P&L/position-driven visual representation, not recorded or simulated biology.
The interface states this. Connecting a real brain requires a specified neural
solver, licensed weights/connectivity, reproducible sensory/motor mappings and
validation. It cannot be inferred from neuron counts or an anatomical graph.

Reference facts: [FlyWire](https://home.flywire.ai/) reports **139,255 neurons**
and approximately **50 million synapses** in the adult whole-brain reconstruction.
The reference tier is [FlyWire v783](https://zenodo.org/records/10676866).
Fifteen PAM cells is the requested display model, not a claim that the biological
PAM population contains exactly fifteen cells.

**The existing CHAIN mode has Pons token identities and simulated prices.**
The scene preserves this provenance; SCANNING PONS is used in CHAIN only.
PAPER monitors Coinbase exchange quotes and uses virtual funds. SIM remains
offline. No mode switching, wallet connection or on-chain trading is triggered
by opening or joining. Real Pons swap-derived quotes remain the separate work in
[spec 11](11-chain-feed.md). Snapshot has no verified launch-price field, so
percentages are labelled **VS WINDOW OPEN**, not “since launch.”

The current engine is spot-only. BUY indicates an open long; SELL indicates
an actual exit/SETTLE command; HOLD is high while scanning. The scene does not
invent short positions or change execution to add them. In browser modes all
agents use the free heuristic; paid-house inference costs are estimates, not
actual API charges. Zero inference does not eliminate trading fees or losses.

## Files

| Module | Responsibility |
|---|---|
| `src/core/fly.ts` | Reference metadata and initial stats |
| `src/core/config.ts`, `brain.ts` | Zero pricing and small, short-hold strategy |
| `src/fly/roster.ts` | Idempotent four-agent deployment |
| `src/fly/shortcut.ts` | Capture listener and ref-based code recognizer |
| `src/ui/fly/state.ts` | Snapshot selection, chart range, net and telemetry |
| `src/ui/fly/mesh.ts`, `FlyModel.tsx` | Flat-shaded, culled and depth-sorted SVG facets |
| `src/ui/fly/FlyChart.tsx` | Candle monitor and provenance |
| `src/ui/fly/FlyScene.tsx` | Four workstations, neural and motor HUDs |
| `src/ui/fly/Terminal.tsx` | Cost-adjusted roster leaderboard |
| `src/ui/App.tsx` | Additive mounting, controls and deployment callback |

## Validation

`tests/fly.test.tsx` covers default-export server rendering (module evaluation,
not just bundling), absent/empty/flat/losing scenes at tick zero, finite chart
coordinates, automatic rotation and coverage, position locks, dense vs sparse
raster, motor direction, free idempotent deployment, zero bills after training,
real trades for all four flies, restore without duplication and keyboard guards.

The complete seed-42 `Village.view()` after 4,000 ticks was captured from
pre-feature commit `7e4bd8d`. On the reference Mac runtime, old and new output
matched byte-for-byte (SHA-256
`5ce3018fff91a1d20a10bc05a927767eda33f39abc2db6585ab5e3adc3c66f58`).
The committed fixture checks all keys, strings, actions and integer counters
exactly. Fractional numbers allow max(1e-14 absolute, 1e-12 relative) error so
V8 floating-point differences between macOS and Linux do not invalidate the
regression check. No decision, fill or tick implementation was changed.

Browser acceptance: button, typed code, input exclusion, four workstations,
automatic monitor change, join, station selection, terminal roster, close,
mobile reachability and absence of runtime errors. Validate in isolated SIM;
never claim this verifies an actual neural solver or live Pons pricing.

### Local evidence · 2026-09-11

- Production build and default-export SSR passed. The initial CI run exposed
  a platform-dependent byte-hash assertion; it was replaced with the original
  pre-feature fixture and the explicit numeric tolerance above.
- 244 tests passed across 16 files, including 17 fly integration/render checks.
- Isolated headless Chrome at 1440×1000: both entry points, automatic channels,
  station selection, free join and eight-row terminal passed with no page errors.
- FLY-00's browser P&L moved to −0.0001 virtual ETH. A held-position frame showed
  its entry line, POSITION LOCK, illuminated keys, dense raster and BUY command.
- At 390×844, workstations wrap vertically; HUD remains reachable by scrolling
  and the dialog has no horizontal overflow. This is functional layout QA,
  not a low-end hardware performance measurement.
- Preview: [actual SIM trading-room screenshot](../assets/fly-swarm.png).

## Remaining work

- [ ] Select and validate a real FlyWire neural runtime and sensory/motor mapping.
- [ ] Complete verified Pons price ingestion under spec 11.
- [ ] Measure performance on low-end/mobile hardware; visual density is intended
      primarily for the desktop trading room.

## Visual refinement · 2026-09-11

Six articulated legs use jointed segments and planted rear feet. One foreleg
presses the same key the keyboard illuminates; the other grips a moving mouse.
Mouse movement and monitor cursor share a pure tick/state-derived pose. Holding
or deciding increases typing cadence. Four stations have different motion phases.
The render adds tarsal claws, joint highlights, thorax/face bristles, segmented
abdomen, wing venation, halteres, eyes and moving antennae. The room, peripherals,
HUD and terminal use DEGEN VILLAGE warm black/olive/lime. Robinhood Chain branding
is visual identity; explicit SIM, exchange and Pons provenance labels remain.
No trading actions originate from these decorative input gestures.

Validation for this refinement: 247 tests (20 fly checks), production build and
SSR. Browser checks cover moving mouse/typing limbs, freeze on game pause,
four workstations, automatic charts, roster trades, terminal and narrow layout.
Static facet meshes are memoized; motion updates joint paths and transforms.
