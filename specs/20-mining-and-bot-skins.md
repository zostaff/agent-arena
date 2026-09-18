# 20 — Mineable residents and bot PFP skins

## Shared cosmetic utility

First Residents (30 free direct-mint NFTs, spec 19) and a future mined collection
are wearable profile pictures for game bots. A player selects a bot, opens
CHANGE PFP, connects a wallet and chooses a currently owned supported NFT.
Equipping is a local profile preference: it requires no transaction, approval,
transfer or message signature. It never changes stats, strategy or P&L.

Store only versioned agent/collection/chain/contract/token/owner identifiers.
Load artwork from the reviewed collection registry, not an arbitrary user URL.
For First Residents, cropped SVG previews are derived from actual on-chain SVGs.
The profile displays the selected avatar and resident identity. RESET PFP
restores a neutral avatar without altering the NFT or the village save.

Before equipping, verify the configured chain, collection runtime and current
ERC-721 owner against the connected wallet. Recheck after reload and at bounded
intervals while the profile is visible. Proven transfers remove the old equipped
skin; a network error is shown as pending verification, not a false ownership
failure. Imported browser data never counts as fresh ownership evidence.

Profile selections are local to this browser. They are not authenticated public
identity records or server-enforced ownership. Wallet sale/transfers remain
external actions. The terminal is being edited independently and is not changed
by this work; the reusable avatar component can later be mounted in its rows.

## Future mined collection (planned, not implemented)

The user's reference is a screenshot of Hashcats' browser miner: character
preview, best hash, target difficulty, CPU/GPU choice and a row of candidates.
Use that interaction concept with original DEGEN VILLAGE characters and artwork.

- Separate contract and supply from the original 30; no change to their free mint.
- Explicit Start/Stop and resource settings; CPU work in a Web Worker, optional
  WebGPU after feature detection. No automatic mining on page open.
- Derive a challenge from chain, contract, wallet and issuance epoch; verify the
  nonce and target on-chain. Address-bind claims, consume proofs once, and
  specify front-running/replay protection before implementation.
- Decide supply, difficulty schedule, issuance rate, metadata derivation,
  uniqueness, per-wallet limits and claim gas before publishing specifications.
- Measure hash rate and best candidate honestly. Expected wait is probabilistic,
  never a countdown to a guaranteed reward. Handle pause, tab suspension and
  changed/exhausted challenges without claiming a stale result is mintable.
- Minted NFTs use the same ownership/equip registry as First Residents. Mining
  does not run a trading agent or provide a trading advantage.

## OpenSea resale

OpenSea [announced Robinhood Chain support on 2026-07-11](https://opensea.io/blog/articles/robinhood-chain-is-live-on-opensea),
including buying and selling NFTs. Its [supported-chain guide](https://support.opensea.io/en/articles/8867082-which-blockchains-are-compatible-with-opensea)
also describes Robinhood Chain. Standard ERC-721 transfers and resolvable
metadata make the collections suitable for marketplace integration; actual
indexing, artwork display and listing still require deployed-collection checks.

Do not auto-approve a marketplace or list an NFT from the game. A future
marketplace link leads users to review their listing on OpenSea themselves.
Tradability does not guarantee demand, liquidity or a particular sale price.

## Acceptance

- [x] Supported owned NFT can be equipped as the chosen bot's PFP.
- [x] Selection persists locally; malformed data and unsupported collections fail
      validation; resetting a PFP leaves NFT ownership and village state intact.
- [x] Ownership/account changes and RPC failures cannot equip an unowned token.
- [x] Browser profile, picker, reload/reset and narrow layout are checked.
- [x] First Residents contract metadata describes the implemented cosmetic use.
- [ ] Future mined-collection design, proof-verifying contract, miner and tests.
- [ ] Deployed collections indexed on OpenSea; artwork and listing flow verified.

## Local evidence · 2026-09-12

287 tests across 20 files, typecheck and production build pass. Nine skin tests
cover validation, storage, collection registration, ownership, changed accounts,
RPC failures, reset and unavailable storage. Contract tests compare all 30 PFP
crops with the actual on-chain artwork and check cosmetic metadata.

Chrome wallet/RPC fixtures verify owned-token selection in the bot inspector,
saved avatar, read-only verification after reload, mobile wardrobe, reset and
revocation following a transfer. No browser runtime errors or real transactions
occurred. First Residents remains undeployed; the prelaunch wardrobe truthfully
shows disabled previews. Terminal integration remains independent work.

## Shared visual identity · 2026-09-12

Use the main game's warm black/olive surfaces, lime accents, cream text and
monospace typography. Collection and wardrobe UI inherit shared CSS tokens;
NFT emblems use black/lime, five expressions and three accessories per species. On-chain artwork,
gallery previews and PFP crops are regenerated together. Radar colors stay in
the same family. Desktop/mobile browser checks cover the revised presentation.
