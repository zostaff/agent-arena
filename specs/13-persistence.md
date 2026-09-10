# 13 — Save schema and persistence

## Requirements

- Preserve purchased progress across reloads: treasury, buildings, jobs, boosts,
  agent stats, target allocations, strategy, provider, XP and settled records.
- Drop open positions and unrealized P&L on restore; a new market cannot price
  a position from the old session honestly.
- Refuse unknown versions or saves without usable agents before mutating state.
- Treat stored input as untrusted and keep validation independent of storage.
- Tell the player that progress is saved in this browser with no cloud sync.

## Design

`core/save.ts` owns `AgentSave`, `VillageSave`, `SAVE_VERSION = 1` and
`parseSave(unknown): VillageSave | null`. `Village.save()` serializes current
state and `Village.restore()` applies the parsed result. Compatibility exports
remain in `core/village.ts`.

| Survives | Does not survive |
|---|---|
| Tick, treasury, total spend | Open positions and unrealized P&L |
| Building levels and running jobs | Walking state and training timer |
| Active boosts and remaining ticks | Notifications, trade tape, snapshots |
| Agent house, strategy, stats, target stats, level, XP, record | In-flight model requests |

The parser checks known class/building/boost identifiers, clamps numeric fields,
normalizes stats and providers, drops expired boosts, and fills a missing
building with its default during restore. Save validation intentionally does
not apply the 20-point authored-build budget to trained agents.

`ui/storage.ts` stores `dv_village_v1` in unshared host storage when available,
otherwise localStorage. This adapter does not establish a cross-device owner
identity or guarantee cloud synchronization.

`ui/App.tsx` restores before the first tick, autosaves every 240 ticks and
flushes on `pagehide` / `visibilitychange`. RESET requires two clicks and sets
the existing wipe latch before clearing storage, so reload cannot immediately
save the village back. The app displays the local-save disclosure below the
header without widening the brand row.

## Acceptance and tasks

- [x] Round-trip buildings, jobs, boosts, agent progress and provider.
- [x] Keep save → restore → save stable for accepted saves.
- [x] Refuse unknown versions and hostile envelopes without mutation.
- [x] Drop positions without banking unrealized gains.
- [x] Extract parser without changing save version or storage key.
- [x] Implement roadmap 8 using the explicit local-save note.
- [ ] Verify reload, RESET and disclosure visually in a connected browser.

Automated acceptance: `tests/save.test.ts`. Browser lifecycle behavior is not
fully covered by these unit tests. Cloud saves remain unimplemented.
