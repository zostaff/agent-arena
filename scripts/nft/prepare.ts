import fs from "node:fs";
import path from "node:path";
import { createPublicClient, http, formatEther, type Hex } from "viem";
import { ROOT } from "./compile.js";
import { NFT_CHAINS } from "../../src/nft/config.js";

const testnet = process.argv.includes("--testnet");
const chain = NFT_CHAINS[testnet ? 46630 : 4663];
const artifact = JSON.parse(fs.readFileSync(path.join(ROOT, "artifacts/nft/FirstResidents.json"), "utf8"));
const client = createPublicClient({ chain, transport: http(undefined, { timeout: 15_000, retryCount: 0 }) });
if (await client.getChainId() !== chain.id) throw new Error("RPC chain ID mismatch");
const [gas, gasPrice] = await Promise.all([client.estimateGas({ data: artifact.bytecode as Hex }), client.getGasPrice()]);
const request = { chainId: chain.id, chain: chain.name, value: "0x0", data: artifact.bytecode,
  expectedRuntimeHash: artifact.runtimeHash, estimatedGas: gas.toString(), gasPriceWei: gasPrice.toString(),
  estimatedFeeEth: formatEther(gas * gasPrice), estimateTime: new Date().toISOString() };
fs.writeFileSync(path.join(ROOT, "artifacts/nft/deployment-request.json"), JSON.stringify(request, null, 2) + "\n");
console.log(JSON.stringify({ ...request, data: `[${(artifact.bytecode.length - 2) / 2} bytes of creation code]` }, null, 2));
console.log("Unsigned deployment prepared. No transaction was sent. Wallet confirmation must use a fresh fee estimate.");
