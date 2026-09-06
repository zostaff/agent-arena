# 08 — Multiplayer (`src/ui/storage.ts`, `src/ui/Board.tsx`)

## Storage

`window.storage` key-value, `{ shared: true }` for the board and unshared for
personal state. When the host does not provide it — plain `vite dev`, a
`file://` open — everything degrades to `localStorage` and the board is simply
local to that browser. `isShared()` reports which, and the board says so.

| Key | Shared | Contents |
|---|---|---|
| `dv_board_v1` | yes | `{ builds: BuildEntry[], villages: VillageEntry[] }` |
| `dv_me` | no | `{ owner, lastBuildId }` |

`owner` is generated once as `degen-xxxxx` and persisted.

## Two rankings

* **BUILDS** — deterministic backtest P&L on seed 42. A skill score: same
  build, same number, on anyone's machine.
* **VILLAGES** — live session net P&L (realised + unrealised across the whole
  roster). An economy score: it rewards buildings, boosts and treasury play.

Both lists are sorted descending and capped at 50 entries.

## Loading a rival's build

Tapping **LOAD** on any BUILDS row writes that entry's stats, strategy and
system prompt suffix straight into the FORGE draft. Copy a build, tweak one
slider, re-run the backtest, publish under your own name.

## Races

Publishing is read-modify-write on a single key: two players publishing in the
same instant is last-writer-wins. Entries are keyed by
`build-<owner>-<name>` and `village-<owner>`, so a player overwrites their own
row rather than accumulating duplicates.
