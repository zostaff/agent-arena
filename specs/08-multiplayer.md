# 08 — Multiplayer (`src/ui/storage.ts`, `src/ui/Board.tsx`)

## Storage

`window.storage` key-value, `{ shared: true }` for the board and unshared for
personal state. When the host does not provide it — plain `vite dev`, a
`file://` open — everything degrades to `localStorage` and the board is simply
local to that browser. `isShared()` reports which, and the board says so.

| Key | Shared | Contents |
|---|---|---|
| `dv_board_v2` | yes | `{ builds: BuildEntry[], villages: VillageEntry[] }` |
| `dv_me` | no | `{ owner, lastBuildId }` |
| `dv_village_v1` | no | the player's own village — see `05-village-economy.md` |

`owner` is generated once as `degen-xxxxx` and persisted.

## Two rankings

* **BUILDS** — deterministic backtest **net of inference** on seed 42. A skill
  score: same build, same number, on anyone's machine. Gross is shown beside it
  in a dim column, because the gap between the two is the interesting part.
  Entries published before v2 carry no net; they fall back to their gross with
  an asterisk rather than being silently ranked as if the bill were zero.
* **VILLAGES** — live session net P&L (realised + unrealised across the whole
  roster). An economy score: it rewards buildings, boosts and treasury play.

Both lists are sorted descending and capped at 50 entries.

**`BOARD_KEY` moved `dv_board_v1` → `dv_board_v2`** when net ranking landed:
v1 entries were ranked on gross and are not comparable, so they are left behind
rather than migrated.

## Loading a rival's build

Tapping **LOAD** on any BUILDS row writes that entry's stats, strategy, system
prompt suffix and house through `core/build.ts::parseBuild` before replacing
the FORGE draft. Unknown houses default to Anthropic; invalid stats or strategy
show an error and leave the draft unchanged. Copy a build, tweak one
slider, re-run the backtest, publish under your own name.

## Races

Publishing is read-modify-write on a single key: two players publishing in the
same instant is last-writer-wins. Entries are keyed by
`build-<owner>-<name>` and `village-<owner>`, so a player overwrites their own
row rather than accumulating duplicates.

## Acceptance and tasks

Owner: `ui/storage.ts` is the I/O adapter; `ui/Board.tsx` renders the board;
`core/build.ts` validates an entry before it becomes an authored build.

- [x] Imported board builds cannot bypass provider normalization or the budget.
- [x] Build net accounting: `net.test.ts`; build validation: `build.test.ts`.
- [ ] Validate every stored leaderboard envelope/row before rendering. Build
  LOAD validation does not yet harden the entire storage adapter.
- [ ] Move VILLAGES ranking to cost-adjusted net with an explicit key/version
  decision. Its existing `netPnlEth` name currently means realized + unrealized,
  before the inference bill, as described above.
- [ ] Concurrent publishing still needs server-side atomicity if a shared
  backend is introduced; the current adapter remains last-writer-wins.
