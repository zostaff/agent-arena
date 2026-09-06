# 11 — The chain feed (`src/live/rpc.ts`)

Raw JSON-RPC against Robinhood Chain. **No indexer, no API key, no SDK.**

```
chain id   4663
rpc        https://rpc.mainnet.chain.robinhood.com   (free, rate limited, CORS *)
explorer   Blockscout
```

`npm run chain` prints exactly what the endpoint returns — it is the only
thing in the repo that touches the network on purpose, and the check that keeps
this file honest while the unit tests run on fixtures.

## What is read

| Thing | How |
|---|---|
| head, chain id | `eth_blockNumber`, `eth_chainId` — the chain id is verified before anything trusts the endpoint |
| token births | `eth_getLogs` on the Pons launch factory, topic0 `0x8d4aad49…` = `TokenLaunched(address,address,address,address,uint256,uint256)`; `topics[1]` is the token |
| symbol | ERC-20 `symbol()` (`0x95d89b41`) by `eth_call`, decoded from ABI-string *or* bytes32 |
| age | block gap at ~10 blocks/second |

Pinned addresses:

```
launch factory  0x7ed598bcef8bd9edd8c97a195c6d13f40801ec7e
router          0xe33e9e479df8802cb0866d5d05258bec4cf62948
```

Both verified against live logs on 2026-09-07: 357 events in a 5,000-block
window, 173 of them `TokenLaunched`.

## What is NOT read, and is therefore not claimed

**Prices.** Pons v2 settles through Uniswap v4, so a trade is a `Swap` on the
PoolManager keyed by pool id, not an event on the router. That decoding is not
written. Until it is, `PaperMarket` labels price as `sim` — see
`10-paper-trading.md`. This is the difference between a project that reads
chains and a project that says it does.

## Rules this file follows

* **Nothing is invented to fill a column.** A token whose `symbol()` cannot be
  read keeps its shortened address as its name.
* **Ten blocks a second.** A "recent" window is tens of thousands of blocks;
  40 blocks is four seconds and will look empty.
* **The public RPC is shared and rate limited**, so `symbol()` calls are capped
  per refresh (12 by default) and cached forever — a symbol does not change.
* **`RpcError` is thrown, never swallowed** — but every caller in the UI turns
  it into a visible state (`connecting` / `live` / `error`), because a terminal
  that silently shows nothing when its feed is down is worse than no terminal.
