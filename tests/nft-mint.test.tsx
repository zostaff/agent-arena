import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { encodeEventTopics, type Hex, zeroAddress } from "viem";
import { RESIDENTS_ABI, type Deployment } from "../src/nft/config.js";
import { confirmMint, readMintState, submitMint, switchNftChain, mintError, walletAccount, type BrowserWallet, type NftClient } from "../src/nft/mint.js";
import Collection from "../src/ui/nft/Collection.js";
import gallery from "../src/nft/collection.json";
import { runtime } from "./fixtures/residents-runtime.json";

const account = "0x0000000000000000000000000000000000000001";
const config: Deployment = { chainId: 4663, address: "0x0000000000000000000000000000000000000030" };
const hash = `0x${"ab".repeat(32)}` as Hex;
function fixture() {
  const request = vi.fn(async ({ method }: { method: string }) => method === "eth_chainId" ? "0x1237" : method === "eth_sendTransaction" ? hash : [account]);
  const wallet: BrowserWallet = { request };
  const client = {
    getChainId: vi.fn(async () => 4663), getCode: vi.fn(async () => runtime),
    readContract: vi.fn(async ({ functionName }: { functionName: string }): Promise<bigint | boolean> => functionName === "MAX_SUPPLY" ? 30n : functionName === "totalSupply" ? 0n : false),
    simulateContract: vi.fn(async () => ({})),
    waitForTransactionReceipt: vi.fn(async () => ({ status: "success", transactionHash: hash, logs: [{ address: config.address,
      topics: encodeEventTopics({ abi: RESIDENTS_ABI, eventName: "Transfer", args: { from: zeroAddress, to: account, tokenId: 1n } }), data: "0x" }] })),
  };
  return { wallet, request, mocks: client, client: client as unknown as NftClient };
}
describe("collection mint boundaries", () => {
  it("keeps an undeployed collection in preview and has 15 unique residents of each species", () => {
    expect(gallery).toHaveLength(30);
    expect(gallery.filter(g => g.attributes[0].value === "Fly")).toHaveLength(15);
    expect(gallery.filter(g => g.attributes[0].value === "Frog")).toHaveLength(15);
    const html = renderToStaticMarkup(<Collection deployment={null} onClose={() => {}} />);
    expect(html).toContain("MINT OPENS AFTER CONTRACT DEPLOYMENT");
    expect(html).not.toContain("CONNECT WALLET");
    expect(html.match(/class="nft-card"/g)).toHaveLength(30);
    expect(new Set(gallery.map(g => g.name)).size).toBe(30);
  });
  it("verifies network and exact runtime before exposing supply", async () => {
    const { client, mocks } = fixture();
    expect(await readMintState(client, config, account)).toEqual({ supply: 0, claimed: false });
    mocks.getCode.mockResolvedValueOnce("0x");
    await expect(readMintState(client, config)).rejects.toThrow("could not be verified");
    mocks.getChainId.mockResolvedValueOnce(1);
    await expect(readMintState(client, config)).rejects.toThrow("different network");
    mocks.getCode.mockRejectedValueOnce(new Error("RPC offline"));
    await expect(readMintState(client, config)).rejects.toThrow("RPC offline");
  });
  it("simulates and rechecks wallet before sending exactly one zero-value mint", async () => {
    const { wallet, request, client, mocks } = fixture();
    expect(await submitMint(client, wallet, config, account)).toBe(hash);
    expect(mocks.simulateContract).toHaveBeenCalledOnce();
    const sent = request.mock.calls.filter(([arg]) => arg.method === "eth_sendTransaction");
    expect(sent).toHaveLength(1);
    expect(sent[0][0]).toMatchObject({ params: [{ from: account, to: config.address, value: "0x0", chainId: "0x1237", data: "0x1249c58b" }] });
    expect(request.mock.calls.filter(([arg]) => arg.method === "eth_accounts")).toHaveLength(2);
    expect(request.mock.calls.some(([arg]) => ["eth_requestAccounts", "personal_sign", "eth_signTypedData_v4"].includes(arg.method))).toBe(false);
  });
  it.each(["account", "chain", "claimed", "sold", "simulation"])("refuses a write after %s changes", async reason => {
    const { wallet, request, client, mocks } = fixture();
    if (reason === "account") mocks.simulateContract.mockImplementationOnce(async () => { request.mockImplementation(async ({ method }) => method === "eth_chainId" ? "0x1237" : [config.address]); return {}; });
    if (reason === "chain") request.mockImplementation(async ({ method }) => method === "eth_chainId" ? "0x1" : [account]);
    if (reason === "claimed") mocks.readContract.mockImplementation(async ({ functionName }) => functionName === "MAX_SUPPLY" ? 30n : functionName === "totalSupply" ? 0n : true);
    if (reason === "sold") mocks.readContract.mockImplementation(async ({ functionName }) => functionName === "hasMinted" ? false : 30n);
    if (reason === "simulation") mocks.simulateContract.mockRejectedValueOnce(new Error("revert"));
    await expect(submitMint(client, wallet, config, account)).rejects.toThrow();
    expect(request.mock.calls.some(([arg]) => arg.method === "eth_sendTransaction")).toBe(false);
  });
  it("treats a hash as pending and requires the matching successful Transfer receipt", async () => {
    const { client, mocks } = fixture();
    expect(await confirmMint(client, config, hash, account)).toEqual({ id: 1, hash });
    mocks.waitForTransactionReceipt.mockResolvedValueOnce({ status: "reverted", transactionHash: hash, logs: [] });
    await expect(confirmMint(client, config, hash, account)).rejects.toThrow("reverted");
    mocks.waitForTransactionReceipt.mockResolvedValueOnce({ status: "success", transactionHash: hash, logs: [] });
    await expect(confirmMint(client, config, hash, account)).rejects.toThrow("no matching");
    mocks.waitForTransactionReceipt.mockRejectedValueOnce(new Error("timeout"));
    await expect(confirmMint(client, config, hash, account)).rejects.toThrow("timeout");
  });
  it("adds only the configured chain after 4902 and switches again after adding", async () => {
    const { wallet, request } = fixture();
    request.mockRejectedValueOnce({ code: 4902 });
    await switchNftChain(wallet, config);
    expect(request.mock.calls.map(([arg]) => arg.method)).toEqual(["wallet_switchEthereumChain", "wallet_addEthereumChain", "wallet_switchEthereumChain", "eth_chainId"]);
    expect(request.mock.calls[1][0]).toMatchObject({ params: [{ chainId: "0x1237", chainName: "Robinhood Chain" }] });
  });
  it("handles declined connections and invalid accounts without signing", async () => {
    const { wallet, request } = fixture();
    request.mockRejectedValueOnce({ code: 4001 });
    await expect(walletAccount(wallet, true)).rejects.toEqual({ code: 4001 });
    expect(mintError({ code: 4001 })).toContain("declined");
    request.mockResolvedValueOnce([]);
    await expect(walletAccount(wallet)).rejects.toThrow("Connect an account");
  });
});
