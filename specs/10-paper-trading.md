# 10 — Paper trading (`src/paper/`, `MODE=paper`)

**The mode to hand someone who just wants to watch the bots trade.** It needs
no API key of any kind: the Robinhood Chain public RPC is free and CORS-open,
so this works in a terminal and in the published browser build alike.

```bash
npm run paper                    # 6 live tokens, heuristic brains
PAPER_PAIRS=10 npm run paper     # a wider universe
TICKS=400 npm run paper          # bounded run
```

## The three modes, and what each one costs

| Mode | Market | Brain | Keys | Money |
|---|---|---|---|---|
| `sim` | seeded random walk | heuristic | none | none |
| **`paper`** | **real token universe, simulated prices** | heuristic | **none** | none |
| `live` | Bitquery OHLC | Anthropic / OpenAI / xAI | 2+ | dry run until `DRY_RUN=0` |

## What is real and what is not

This is the whole contract of the mode, and the UI prints it on every snapshot:

| Field | Source | Why |
|---|---|---|
| token address, symbol, age | **chain** | `eth_getLogs` on the Pons launch factory, `symbol()` by `eth_call`, age from the block gap |
| price, candles | **sim** | Pons v2 settles through Uniswap v4; the swap decoding is not written yet |
| order book, curve, buyers | **sim** | same reason |
| fills, P&L | **paper** | nothing is signed, no wallet exists, no transaction is sent |

`Snapshot.provenance` carries `{ identity, price, book }` and the DEX renders
it under the chart as `identity chain · price sim · book sim · fills paper`.

**A paper P&L on a real ticker is easy to mistake for a real one.** The
labelling is not decoration, it is the feature. When the swap decoding lands,
`price` flips to `chain` in exactly one place and the label changes with it.

## Reproducibility

Each token's price path is seeded from its own address
(`seedFromAddress`, FNV-1a over the hex string), so the same token behaves the
same way on every machine, and `pairConfigFor` is a pure function of the token.
Two people watching `$CHIPS` see the same tape.

## The universe refreshes

Robinhood Chain launches tokens every few seconds — 173 in an eight-minute
window on 2026-09-07. A paper session that reads once is trading a stale
universe, so `PaperMarket.refresh()` re-reads every `PAPER_REFRESH_TICKS`
(default 1800) in node and every 30 seconds in the browser.

Two live tokens really can share a symbol: `$CCAT` launched three times inside
one minute. They are disambiguated with a slice of the address
(`$CCAT·1a8e`) rather than dropped, because dropping one would hide a real
launch.

## Before the first read

`PaperMarket` starts with **no pairs at all**. It never shows an invented
ticker, not even for the second before the chain answers.
