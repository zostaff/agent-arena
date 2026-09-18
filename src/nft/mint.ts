import { createPublicClient, http, encodeFunctionData, getAddress, isAddress, isHex, parseEventLogs, toHex, zeroAddress, keccak256, type Address, type Hex } from "viem";
import compiled from "./compiled.json";
import { NFT_CHAINS, RESIDENTS_ABI, type Deployment } from "./config.js";

export interface BrowserWallet {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on?(event: string, callback: (...args: unknown[]) => void): void;
  removeListener?(event: string, callback: (...args: unknown[]) => void): void;
}
export function nftClient(config: Deployment) {
  return createPublicClient({ chain: NFT_CHAINS[config.chainId], transport: http(undefined, { timeout: 12_000, retryCount: 1 }), pollingInterval: 2500 });
}
export type NftClient = Pick<ReturnType<typeof nftClient>, "getChainId" | "getCode" | "readContract" | "simulateContract" | "waitForTransactionReceipt">;
export interface MintState { supply: number; claimed: boolean }
export async function readMintState(client: NftClient, config: Deployment, account?: Address): Promise<MintState> {
  const [chain, code] = await Promise.all([client.getChainId(), client.getCode({ address: config.address })]);
  if (chain !== config.chainId) throw new Error("The RPC returned a different network. Mint is unavailable.");
  if (!code || code === "0x" || keccak256(code) !== compiled.runtimeHash) throw new Error("The collection contract could not be verified. Mint is unavailable.");
  const [supply, max, claimed] = await Promise.all([
    client.readContract({ address: config.address, abi: RESIDENTS_ABI, functionName: "totalSupply" }),
    client.readContract({ address: config.address, abi: RESIDENTS_ABI, functionName: "MAX_SUPPLY" }),
    account ? client.readContract({ address: config.address, abi: RESIDENTS_ABI, functionName: "hasMinted", args: [account] }) : false,
  ]);
  if (max !== 30n || typeof supply !== "bigint" || supply < 0n || supply > 30n || typeof claimed !== "boolean") throw new Error("Unexpected collection state. Mint is unavailable.");
  return { supply: Number(supply), claimed };
}
export async function walletAccount(wallet: BrowserWallet, request = false): Promise<Address> {
  const accounts = await wallet.request({ method: request ? "eth_requestAccounts" : "eth_accounts" });
  if (!Array.isArray(accounts) || typeof accounts[0] !== "string" || !isAddress(accounts[0])) throw new Error("Connect an account in your wallet.");
  return getAddress(accounts[0]);
}
export async function walletChain(wallet: BrowserWallet): Promise<number> {
  const id = await wallet.request({ method: "eth_chainId" });
  if (typeof id !== "string" || !/^0x[0-9a-f]+$/i.test(id) || !Number.isSafeInteger(Number(id))) throw new Error("Your wallet returned an invalid network.");
  return Number(id);
}
export async function switchNftChain(wallet: BrowserWallet, config: Deployment) {
  const chain = NFT_CHAINS[config.chainId], chainId = toHex(chain.id);
  try { await wallet.request({ method: "wallet_switchEthereumChain", params: [{ chainId }] }); }
  catch (error) {
    if ((error as { code?: number })?.code !== 4902) throw error;
    await wallet.request({ method: "wallet_addEthereumChain", params: [{ chainId, chainName: chain.name,
      nativeCurrency: chain.nativeCurrency, rpcUrls: chain.rpcUrls.default.http, blockExplorerUrls: [chain.blockExplorers.default.url] }] });
    // Adding a network does not necessarily select it.
    await wallet.request({ method: "wallet_switchEthereumChain", params: [{ chainId }] });
  }
  if (await walletChain(wallet) !== config.chainId) throw new Error(`Select ${chain.name} in your wallet.`);
}
export async function submitMint(client: NftClient, wallet: BrowserWallet, config: Deployment, account: Address): Promise<Hex> {
  const verifyWallet = async () => {
    const [current, chain] = await Promise.all([walletAccount(wallet), walletChain(wallet)]);
    if (current !== getAddress(account)) throw new Error("Wallet account changed. Reconnect before minting.");
    if (chain !== config.chainId) throw new Error(`Switch to ${NFT_CHAINS[config.chainId].name} before minting.`);
  };
  await verifyWallet();
  const state = await readMintState(client, config, account);
  if (state.claimed) throw new Error("This address has already minted its resident.");
  if (state.supply >= 30) throw new Error("All 30 residents have been minted.");
  await client.simulateContract({ address: config.address, abi: RESIDENTS_ABI, functionName: "mint", account });
  await verifyWallet();
  const hash = await wallet.request({ method: "eth_sendTransaction", params: [{ from: account, to: config.address,
    chainId: toHex(config.chainId), value: "0x0", data: encodeFunctionData({ abi: RESIDENTS_ABI, functionName: "mint" }) }] });
  if (typeof hash !== "string" || !isHex(hash) || hash.length !== 66) throw new Error("Wallet did not return a transaction hash. Check wallet activity before trying again.");
  return hash;
}
export class SettledMintError extends Error {}
export async function confirmMint(client: NftClient, config: Deployment, hash: Hex, account: Address) {
  if (await client.getChainId() !== config.chainId) throw new Error("The RPC returned a different network. Confirmation is unavailable.");
  const receipt = await client.waitForTransactionReceipt({ hash, confirmations: 1, timeout: 120_000 });
  if (receipt.status !== "success") throw new SettledMintError("The mint transaction reverted. Network gas may still have been spent.");
  const event = parseEventLogs({ abi: RESIDENTS_ABI, logs: receipt.logs, eventName: "Transfer" }).find(log =>
    log.address.toLowerCase() === config.address.toLowerCase() && log.args.from === zeroAddress && log.args.to.toLowerCase() === account.toLowerCase());
  if (!event || event.args.tokenId < 1n || event.args.tokenId > 30n) throw new SettledMintError("The confirmed transaction contains no matching resident mint. It may have been cancelled or replaced. Check the explorer.");
  return { id: Number(event.args.tokenId), hash: receipt.transactionHash };
}
export function mintError(error: unknown) {
  if ((error as { code?: number })?.code === 4001) return "Request declined in your wallet. No new mint was submitted by this request.";
  const message = (error as { shortMessage?: string; message?: string })?.shortMessage ?? (error as Error)?.message;
  return typeof message === "string" ? message.slice(0, 300) : "Unable to reach the wallet or network. Try again.";
}

export interface PendingMint extends Deployment { hash: Hex; account: Address }
const PENDING_KEY = "dv_resident_pending_v1";
export function pendingMint(config: Deployment): PendingMint | null {
  try {
    const pending = JSON.parse(sessionStorage.getItem(PENDING_KEY) ?? "null");
    return pending && pending.chainId === config.chainId && pending.address === config.address &&
      isAddress(pending.account) && isHex(pending.hash) && pending.hash.length === 66 ? pending : null;
  } catch { return null; }
}
export function savePending(pending: PendingMint | null) {
  try { if (pending) sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending)); else sessionStorage.removeItem(PENDING_KEY); }
  catch { /* Wallet history retains the transaction if browser storage is unavailable. */ }
}
