# First Residents release guide

The collection is implemented locally. No test result or gallery image means it
has been deployed. The tracked `NFT_DEPLOYMENT` stays null until a real successful
creation receipt and the exact runtime bytecode have been verified.

## What is being deployed

- `DEGEN VILLAGE: First Residents` / `DVFR`, ERC-721, 30 maximum, IDs 1–30.
- Alternating flies and frogs: 15 of each, five expressions, three accessories.
- Free, nonpayable mint; one lifetime mint per address, even after transfer.
- Public sequential assignment, no owner, upgrade, reserve, royalty or price setter.
- SVG artwork and JSON metadata are encoded on-chain. No asset hosting is required
  to resolve token metadata; local SVG files are exact gallery previews.
- Deploying this contract immediately opens its public mint function. Publishing
  the webpage is a separate step and is not an on-chain mint-start switch.

## Reproduce and review

```sh
npm ci
npm run nft:build
npm run typecheck
npm test
npm run build
```

`nft:build` compiles Solidity, deploys to an in-memory EVM, mints all 30 residents,
decodes their actual token metadata and writes the gallery previews. No RPC or
wallet is involved. Generated source-controlled outputs are `public/nft/*.svg`,
their square bot-avatar crops in `public/nft/pfp/*.svg`,
`src/nft/collection.json`, `src/nft/compiled.json` and the runtime test fixture.
Tests require these to agree with the compiled Solidity.

Ignored local output in `artifacts/nft/` includes creation/runtime bytecode,
the complete standard JSON compiler input (including dependencies) and, after
preparation, an unsigned creation request. Compiler: Solidity 0.8.37, optimizer
200 runs, via IR, Cancun. OpenZeppelin Contracts 5.6.1. Exact versions are locked.
The compiler's `tmp` dependency is overridden to patched 0.2.7. Existing Vitest
2 toolchain advisories remain separate maintenance work; no Vitest UI server is
used for these checks.

## Estimate deployment gas without sending

```sh
npm run nft:prepare -- --testnet
npm run nft:prepare
```

This checks the public RPC's chain ID, estimates contract-creation gas, reads the
current gas price and saves `artifacts/nft/deployment-request.json`. The estimate
is time-dependent; the final wallet confirmation must use current fees.

Observed mainnet on 2026-09-12 at 13:46:04 UTC: 3,222,692 estimated gas,
91,442,000 wei gas price, approximately **0.000294689401864 ETH** deployment fee.
This is the one-time creator deployment cost, not a mint fee paid to the project.
Runtime is 14,271 bytes (under EIP-170); local creation execution used 2,902,330
gas. These are different measurements: mainnet estimation includes network costs.

Read-only mainnet evidence: `eth_chainId` returned `0x1237` (4663). An `eth_call`
creation probe exercising `MCOPY` returned a 32-byte value of 1, confirming the
Cancun instruction required by OpenZeppelin. No transaction was submitted.

## Deploy with your browser wallet

Start with testnet. The command starts a local page only; it does not send a
transaction or access wallet keys.

```sh
npm run nft:deploy -- --testnet
```

Open `http://127.0.0.1:5181/` in the browser that holds your wallet extension.
Connect, review the network and fresh gas estimate, then explicitly click Deploy
and review/confirm the creation transaction in the wallet. Keep the returned
transaction hash. The page stops after deployment; it does not activate the
website or mint a resident. Stop the server before starting it for another network.

For the mainnet release, use `npm run nft:deploy` and review **Robinhood Chain,
4663** in both the page and wallet. This is a permanent, immediately mintable
contract. The wallet must hold enough native ETH on that network for deployment.
Never paste a private key or recovery phrase into the application or chat.

## Verify and activate

Verify the deployed source in Blockscout with the generated
`artifacts/nft/standard-input.json`, exact compiler build
`0.8.37+commit.f401782d`, contract `contracts/FirstResidents.sol:FirstResidents`,
and no constructor arguments. The standard input contains the compiler settings
and all imported sources.

Then activate local configuration using the deployment transaction hash:

```sh
npm run nft:activate -- 0xYOUR_DEPLOYMENT_TRANSACTION_HASH --testnet
# For a verified mainnet deployment, omit --testnet.
```

The script checks chain ID, successful creation receipt, creation input/value
and deployed runtime hash before changing `src/nft/config.ts`. It records public
receipt evidence in `docs/nft/deployment.json`. It never signs a transaction or
publishes the website. Explorer source verification is a separate explicit step.

Complete a testnet mint and inspect its owner, metadata and receipt. Run the
completion gate again, review the configured chain/address, then publish the
static site. Check the published MINT entry and a fresh read from the
configured contract. Do not announce mainnet mint availability while a testnet
address is configured. The UI labels testnet explicitly.

## Visitor behavior

The collection opens with read-only supply checks. It requests accounts only
after Connect, then offers an explicit network switch if needed. Each mint
revalidates network/account, exact runtime, supply and lifetime eligibility,
simulates the call and sends `mint()` with value zero. No token approval or
message signature is requested. The wallet estimates network gas.

Pending hashes are retained in sessionStorage where available. A reload shows
Check Confirmation for the existing transaction instead of immediately offering
another mint. A reverted/cancelled receipt clears pending state; RPC timeouts
retain the hash for retry. Storage-disabled browsers still have wallet activity.
Wallet connection is through EIP-6963 discovery or the injected Ethereum wallet;
mobile users need a wallet browser. WalletConnect is not integrated.

Supply errors remain errors; they are never displayed as a fresh zero count.
Only matching successful mint receipts produce a resident confirmation. The
gallery is not an ownership index: sequential token assignment and current
ownership can be checked in the explorer after deployment.
