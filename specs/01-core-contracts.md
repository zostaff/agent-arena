# 01 — Core contracts

Defined in `src/core/types.ts`. Everything in `src/sim` and `src/live` is an
implementation of one of these two interfaces.

```ts
interface Market {
  listPairs(): Promise<string[]>;
  snapshot(pair: string, ctxCandles: number): Promise<Snapshot>;
}

interface Snapshot {
  pair: string;
  last: number;
  candles: Candle[];        // { t, o, h, l, c, v }, oldest first
  bids: BookLevel[];        // { price, size } in ETH
  asks: BookLevel[];
  ageMinutes: number;
  uniqueBuyers: number;
  curveProgressPct: number; // 0..100
  reserveEth: number;
}

interface Brain {
  decide(snap: Snapshot, opts: BrainOpts): Promise<Verdict>;
}

interface Verdict {
  action: "BUY" | "SELL" | "SKIP";
  sizeEth: number;
  confidence: number;   // 0..1
  holdTicks: number;
  reason: string;       // <= 90 chars
}
```

`BrainOpts` carries `maxSizeEth`, `model`, `thinkingBudget`, `agentClass`,
`strategy`, and — live only — `systemSuffix` and `lens`.

## Hard rules

1. **`decide()` never throws.** Every failure path resolves to
   `{ action: "SKIP", sizeEth: 0, holdTicks: 0 }`. Enforced in
   `guardDecide()` and independently in both brain implementations.
2. **`sizeEth` is clamped to `opts.maxSizeEth` after parsing**, never before,
   never on trust. A model that asks for 99999 ETH gets the ceiling.
3. `SELL` is downgraded to `SKIP` when the agent holds nothing.
4. `holdTicks` is clamped into `[strategy.holdMin, strategy.holdMax]`.
5. `confidence` is clamped into `[0, 1]`.

## Agent states

```
REST ──▶ TRAIN ──▶ SCAN ──▶ DECIDE ──▶ HOLD ──▶ SETTLE ──▶ REST
  │                  ▲          │                            ▲
  └── (not due to ───┘          └────── SKIP ────────────────┘
       train yet)
```

* `REST` — idle at home; picks the next stat, or heads straight to the terminal
  if training is not due (`TRAIN_EVERY_CYCLES = 3`).
* `TRAIN` — walks to the building, burns train ticks, earns +1 stat and XP.
* `SCAN` — walks to the terminal; waits out `pollIntervalMs` as a tick cooldown.
* `DECIDE` — snapshot + `brain.decide()`. One tick in blocking (sim) mode; as
  long as the network takes in live mode, with a 1200-tick watchdog.
* `HOLD` — position open, marked to market every `MARK_INTERVAL` ticks.
* `SETTLE` — closes, books P&L, pays the treasury cut, awards XP.

## Class lenses (live prompts)

| Class | Lens sentence |
|---|---|
| SCOUT | You favour early entries. Age under 8 minutes interests you. |
| SNIPER | You favour precision. Skip more than you trade. |
| WHALE | You favour size on high conviction only. Curve above 40% is your zone. |
| ARB | You favour short holds and small edges. Exit fast. |

`CUSTOM` builds get "You follow the operator's brief below and nothing else."
plus the FORGE system prompt suffix. In sim mode the same lenses exist as
numeric adjustments inside `src/sim/brain.ts` — the sentences do nothing when
there is no model reading them.

## Trade attribution

`TradeEvent.provider` is captured when a fill is recorded. BUY copies the house
associated with the decision into the open position; SELL retains that house.
Rewiring an agent later cannot rewrite historical fills. `BrainOpts` is
captured before awaiting a snapshot so a request uses its compiled provider.
REWIRE is refused during DECIDE or while a verdict is waiting to be consumed.

## Acceptance and tasks

Owner: `core/types.ts`, `core/agent.ts`, `core/brain.ts`; Village coordinates
these contracts, and adapters implement them without changing their meaning.

- [x] Never-throw and size/hold/confidence guards: `brain.test.ts`, `providers.test.ts`.
- [x] State traversal and cold start: `village.test.ts`.
- [x] Historical house attribution and pending-decision REWIRE refusal: `tape.test.ts`.
- [ ] Any new adapter must satisfy the same failure and clamping tests.
