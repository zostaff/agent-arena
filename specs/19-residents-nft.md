# 19 — First Residents NFT collection

## Product

DEGEN VILLAGE: First Residents is a promotional collection with exactly 30
possible ERC-721 tokens, numbered 1–30: alternating flies and frogs (15 each).
Each has a distinct name, expression and accessory. Artwork and metadata use only
original DEGEN VILLAGE identity. This release is separate from the fungible
development token in spec 16. Owned residents can be equipped as cosmetic bot
profile avatars (spec 20). No financial return or trading advantage is promised.
The game stays freely accessible.

The user confirmed a free mint: only network gas is paid. One lifetime public
mint per address is the initial distribution rule; transfers do not reset it.
This is an address limit, not proof of one person. Sequential assignment is
public and deterministic, not a randomized rarity claim.

## Contract

- OpenZeppelin ERC-721 with a constant maximum supply of 30 and nonpayable mint.
- No owner, upgrade, sale-price setter, reserve mint, supply setter or royalty.
- Update the lifetime claim flag and supply before receiver callbacks; refuse
  reentrant minting. Standard ERC-721 transfers and interface support remain.
- Token IDs start at 1. Reject metadata requests for nonexistent tokens.
- Original SVG artwork and JSON metadata are generated on-chain, with data URIs.
  No mutable server/IPFS prerequisite or later metadata replacement.
- Compiler and dependency versions are pinned. Compile for the Cancun EVM target required by OpenZeppelin 5.6. Actual EVM tests cover cap, duplicate mint, transfer, payment
  rejection, receiver/reentrancy behavior and decoding all 30 unique artworks.

## Browser mint

The MINT entry opens a standalone gallery. The existing terminal is not
changed. Read deployed state using a public RPC; never turn an RPC error into a
zero minted count. With no configured contract, show preview / mint not live.

Wallet access begins only after a user's Connect click. Require the configured
chain, offer an explicit switch/add action, recheck account and chain before
simulating and submitting a zero-value mint. Do not request token allowances,
sign login messages, or request keys. Await a successful transaction receipt
before reporting a mint. Show pending hash, failures, sold out and already
minted states; protect against repeated submission and account/network changes.

Only reviewed public configuration identifies deployed contracts. No address
from URL parameters or localStorage can redirect the mint. Verify deployed code
against the compiled runtime hash before enabling a write. Mainnet activation
requires a real deployment receipt/address; tests cannot substitute for it.

## Network evidence · 2026-09-12

Official [network configuration](https://docs.robinhood.com/chain/connecting/)
lists mainnet ID **4663**, testnet **46630**, and native **ETH**. Public RPCs:
`https://rpc.mainnet.chain.robinhood.com` and
`https://rpc.testnet.chain.robinhood.com`. Explorer addresses and deployment
instructions are in the official [deployment guide](https://docs.robinhood.com/chain/deploy-smart-contracts/).
Public RPCs are rate-limited; failures must remain visible in the mint UI.

Use original artwork, names and metadata: [network terms section 5.9](https://docs.robinhood.com/chain/terms-of-service/)
exclude Robinhood marks from NFT artwork, metadata and contract attributes.
The webpage may factually identify its target network. ERC-721 uses the
[OpenZeppelin implementation](https://docs.openzeppelin.com/contracts/5.x/erc721).

## Acceptance and release evidence

- [x] 30 reproducible unique SVGs and valid JSON metadata.
- [x] Contract compilation and actual EVM mint/transfer/receiver tests.
- [x] Wallet rejection, wrong chain, stale account, receipt failure and RPC
      errors have safe, actionable states; no writes before an explicit click.
- [x] Browser gallery, keyboard/mobile access and mint flow with a local wallet
      fixture; testnet/mainnet evidence remains separate.
- [x] Typecheck, complete tests, production build and diff check.
- [ ] Deployment receipt, verified runtime and source verification.
- [ ] Public mint configuration and published URL verified after deployment.

Until the last two items have actual evidence, the collection is a local
implementation and preview. No real contract has been deployed by these notes.

## Local evidence · 2026-09-12

287 tests across 20 files pass, including four actual-EVM contract tests,
11 mint/UI boundary tests and nine bot-skin tests. Typecheck includes the NFT
operator scripts. Production build passes; the wallet client is loaded on demand
for collection access or equipped-skin verification.

Chrome at 1440×1050 and 390×844 verified all 30 preview cards, 15/15 filters,
featured artwork, full-viewport overlay and mobile scrolling. An isolated wallet
and RPC fixture verified no account requests before Connect, network switching,
zero-value mint payload, pending status before confirmation, receipt-confirmed
ownership, duplicate-claim lockout, connection rejection and recovery after a
reverted receipt. No browser runtime errors occurred. No fixture transaction was
sent to a real network. Public wallet mint availability remains unverified until
an actual contract is deployed and the production configuration is published.

Mainnet read-only creation estimate: approximately 0.000294689401864 ETH on
2026-09-12 at 13:46:04 UTC. Exact compiler settings, network evidence and operator
steps are in [the release guide](../docs/nft/LAUNCH.md).

## Shared visual identity · 2026-09-12

Use the main game's warm black/olive surfaces, lime accents, cream text and
monospace typography. Collection and wardrobe UI inherit shared CSS tokens;
NFT emblems use black/lime, five expressions and three accessories per species. On-chain artwork,
gallery previews and PFP crops are regenerated together. Radar colors stay in
the same family. Desktop/mobile browser checks cover the revised presentation.
