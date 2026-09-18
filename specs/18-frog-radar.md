# 18 — Frog radar

## Contract

FROG RADAR is a hidden observation room, entered by typing `frog` outside input,
textarea, select and editable elements, or tapping a small lily-pad button.
Three frogs sit beside a radar pond in the village's warm olive/lime palette.
Their tongues point at actual matching contacts, never fabricated signals.

- **RIPPLE / volume:** the latest closed candle has at least 2x the mean ETH
  volume of the preceding eight closed candles. The baseline must be positive.
- **LEAP / breakout:** the latest observed price exceeds the high or low of
  eight preceding closed candles by at least 0.2%. The latest closed candle is
  excluded from the range, so a completed breakout remains visible.
- **DEPTH / book:** the top five levels on each side contain at least 65% of
  visible ETH depth on one side. Require three valid levels per side and an
  uncrossed book. This is displayed depth, not executed order flow.

SIM and CHAIN candle arrays include a forming candle; exclude it. Coinbase
arrays contain only closed candles; retain their last candle. Exchange candles
older than three minutes cannot trigger candle-based patterns. Expired or
undated exchange quotes cannot trigger any pattern. Missing/invalid inputs show
waiting status, never a zero-filled substitute. Check finite, chronological,
valid OHLCV history without silently skipping malformed candles.

Display current threshold matches, not historical alerts, trade advice or
probabilities. A contact disappears when its condition clears. Stable pair and
pattern IDs keep radar markers in place. Each contact shows its measured value,
threshold and field provenance. CHAIN identity is real but its price/book are
simulated; PAPER observations are exchange data with virtual execution.

## Boundaries

`src/frog/radar.ts` owns pure detectors and thresholds; `src/frog/shortcut.ts`
owns keyboard recognition. `src/ui/frog/` owns the self-contained entry point,
dialog, SVG artwork and scoped stylesheet. App only mounts the entry point with
the current view and mode. No changes to engine, feed, storage or terminal.
Scanning and decorative frog motion follow village ticks, including pause;
exchange freshness uses the current wall clock passed into the pure detector.
The scanner runs only while the room is open.

The dialog supports Escape, focus containment/restoration, reduced motion and
mobile scrolling. Pattern buttons filter contacts and select the watching frog.

## Acceptance

- [x] Threshold boundaries, both directions, insufficient and malformed input,
      closed/forming candles, exchange freshness and deterministic marker layout.
- [x] SSR at empty and populated states; no non-finite SVG coordinates.
- [x] Browser: typed entry, editing exclusion, mobile entry, filters, focus,
      Escape, pause, active contacts and no horizontal overflow/runtime errors.
- [x] Existing engine regression, typecheck, full tests and production build.

## Local validation · 2026-09-12

263 tests across 17 files pass, including 16 frog detector/entry/SSR checks.
Typecheck and production build pass. Isolated Chrome at 1440×1050 and 390×844
verified current SIM contacts, typed and touch entry, input exclusion, filtering,
focus trapping/restoration, Escape, stacking above FLY SWARM, pause and reduced
motion. Mobile signals and watcher controls are reachable without horizontal
overflow. No page errors occurred. These checks do not measure trading accuracy
or constitute a published deployment.

## Limits

Only pairs already observed by the village are scanned. The radar adds no feed
requests or model calls. Threshold matches do not establish predictive accuracy,
profitability, a real neural model or verified Pons market prices.

## Shared visual identity · 2026-09-12

Use the main game's warm black/olive surfaces, lime accents, cream text and
monospace typography. Collection and wardrobe UI inherit shared CSS tokens;
NFT emblems use black/lime, five expressions and three accessories per species. On-chain artwork,
gallery previews and PFP crops are regenerated together. Radar colors stay in
the same family. Desktop/mobile browser checks cover the revised presentation.
