# 21 — SPIDER wallet intelligence

## Experience

SPIDER opens a standalone room from the game, also discoverable by typing
`spider`. Use the village's warm black/olive/lime palette and monospace type.
A shaded, eight-legged projected 3D spider walks along strands toward new
wallet activity. Wallet nodes surround token nodes; selection shows evidence.
Support keyboard, mobile scrolling, close/focus restoration, pause and reduced
motion. Opening the room never starts a real trade or connects a wallet.

## Sources and meaning

DEMO is a separate reproducible synthetic wallet feed with simulated prices,
depth and copy fills. It never borrows chain-looking evidence or labels a
synthetic wallet profitable. A smart-wallet tag means a user-selected target;
there is no independently verified profitability ranking yet.

LIVE reads ERC-20 Transfer logs involving up to 12 entered public addresses on
Robinhood Chain. Verify chain 4663, use bounded contiguous block batches, retain
a cursor, deduplicate logs and verify continuity. Clear evidence on reorg;
retain cursor on errors, expose backlog/errors, and stop polling when closed.
Each start/resume begins a new observation session near the current head;
paused intervals and historical positions are not backfilled.
Only successful, canonical receipt logs count; reject malformed/NFT/removed
logs. Label incoming/outgoing transfers accurately: a transfer is not a buy,
an acquired balance is not a known entry price, and a shared token is not proof
of common ownership. Link live evidence to the configured explorer only.

Clusters are groups of watched wallets with shared incoming token flows in the
observed window. State the evidence count and window; exclude self transfers,
zero values and mint/burn endpoints. Live events never enter the copy ledger
until a reviewed DEX decoder can prove a wallet's actual trade and executable
market depth is available. Manual watchlist tags never become a P&L score.

## Copy execution

An explicit COPY DEMO toggle consumes only fresh, unseen synthetic buy/sell
events from selected targets. Use a separate virtual ETH ledger: 1 ETH starting
balance, 0.01 ETH per entry, 0.05 ETH maximum exposure, no leverage, 50 bps maximum
price movement and 60 bps assumed fees. Buy from asks, exit owned tokens into
bids. Reject stale events, duplicate entries, insufficient liquidity, unsupported
sources and insufficient cash. Changing source resets demo execution; pausing
or closing stops it. Display decision latency as local processing time, never
network inclusion time or a speed guarantee. No signing code or keys in this room.

## Fast live execution follow-up

The [official connection guide](https://docs.robinhood.com/chain/connecting/)
lists provider WebSocket RPC endpoints and a separate sequencer feed. Public
HTTP RPC is rate-limited and not a production latency service. Do not treat
the sequencer feed as an eth_subscribe endpoint. A later backend needs verified
DEX deployments and receipt attribution, replay/reorg recovery, spend/slippage/
loss limits, quote simulation, nonce management and explicit signer activation.
The project currently lacks verified Pons swap decoding (specs 04 and 11).

## Acceptance

- [x] SPIDER entry and crawling eight-legged geometry, desktop/mobile QA.
- [x] Explicit demo/live provenance, watchlist validation and smart-target labels.
- [x] Bounded chain reader, errors, duplicates, canonical receipts and reorg handling.
- [x] Shared-flow clusters with evidence; no transfer-to-buy inference.
- [x] Bounded virtual copy entries/exits, fees, freshness and duplicate guards.
- [x] Typecheck, tests and production build.
- [ ] Verified real swap attribution, low-latency provider and live execution.

## Local evidence · 2026-09-12

302 tests in 21 files, typecheck and production build pass. Fifteen SPIDER tests
cover watchlist bounds, event validation, canonical receipts, cursor progression,
backlog, reorg, wrong-chain refusal, cluster windows and virtual copy accounting.
The lazy room adds about 10.4 kB gzip JavaScript and 2.2 kB gzip CSS when opened.

Chrome at 1440×1100 and 390×844 checks eight legs, walking, pause, reduced motion,
copy entries, node selection, watchlist validation, explicit reader startup,
transfer-only provenance, RPC outage and shutdown after closing. Live activity
in this browser check is an isolated RPC fixture. No real wallet transaction
was submitted, and neither smart-wallet profitability nor live trading is proven.

Read-only public-RPC compatibility probe: verified chain 4663, head 61,170,146,
scanned through 61,170,144 with zero backlog in 1,720 ms. Probe address `0x1`
had no matching transfers in the bounded interval. This demonstrates endpoint
compatibility, not discovery of a profitable wallet or a latency guarantee.
