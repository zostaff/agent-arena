import { getAddress, type Address } from "viem";
import { NFT_DEPLOYMENT, RESIDENTS_ABI, type Deployment } from "./config.js";
import { nftClient, readMintState, walletAccount, type BrowserWallet, type NftClient } from "./mint.js";
import type { BotSkin } from "./skinStore.js";

/** Future mined collections must register their reviewed runtime and artwork here. */
export function supportedSkin(skin: BotSkin, config: Deployment | null = NFT_DEPLOYMENT) {
  return !!config && skin.collection === "first-residents" && skin.chainId === config.chainId && skin.contract.toLowerCase() === config.address.toLowerCase();
}
export async function ownedResidents(client: NftClient, config: Deployment, account: Address): Promise<number[]> {
  const { supply } = await readMintState(client, config, account);
  const owned: number[] = [];
  // Bounded public-RPC reads, only when the player opens/refreshes their wardrobe.
  for (let start = 1; start <= supply; start += 4) {
    const ids = Array.from({ length: Math.min(4, supply - start + 1) }, (_, i) => start + i);
    const owners = await Promise.all(ids.map(id => client.readContract({ address: config.address, abi: RESIDENTS_ABI, functionName: "ownerOf", args: [BigInt(id)] })));
    ids.forEach((id, i) => { if (typeof owners[i] === "string" && owners[i].toLowerCase() === account.toLowerCase()) owned.push(id); });
  }
  return owned;
}
export async function equipResident(client: NftClient, config: Deployment, wallet: BrowserWallet, account: Address, tokenId: number): Promise<BotSkin> {
  if (!Number.isInteger(tokenId) || tokenId < 1 || tokenId > 30) throw new Error("Invalid resident ID");
  if (await walletAccount(wallet) !== getAddress(account)) throw new Error("Wallet account changed. Connect again.");
  const state = await readMintState(client, config, account);
  if (tokenId > state.supply) throw new Error("This resident has not been minted.");
  const owner = await client.readContract({ address: config.address, abi: RESIDENTS_ABI, functionName: "ownerOf", args: [BigInt(tokenId)] });
  if (typeof owner !== "string" || owner.toLowerCase() !== account.toLowerCase()) throw new Error("This wallet no longer owns that resident. Refresh your skins.");
  if (await walletAccount(wallet) !== getAddress(account)) throw new Error("Wallet account changed. Connect again.");
  return { version: 1, collection: "first-residents", chainId: config.chainId, contract: config.address.toLowerCase(), tokenId, owner: account.toLowerCase() };
}
export async function verifyStoredSkin(skin: BotSkin): Promise<boolean> {
  if (!supportedSkin(skin) || !NFT_DEPLOYMENT) return false;
  const client = nftClient(NFT_DEPLOYMENT);
  const state = await readMintState(client, NFT_DEPLOYMENT);
  if (skin.tokenId > state.supply) return false;
  const owner = await client.readContract({ address: NFT_DEPLOYMENT.address, abi: RESIDENTS_ABI, functionName: "ownerOf", args: [BigInt(skin.tokenId)] });
  return typeof owner === "string" && owner.toLowerCase() === skin.owner.toLowerCase();
}
