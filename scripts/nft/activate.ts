import fs from "node:fs";
import path from "node:path";
import { createPublicClient, http, isHex, keccak256, type Hex } from "viem";
import { ROOT } from "./compile.js";
import { NFT_CHAINS } from "../../src/nft/config.js";
import compiled from "../../src/nft/compiled.json";

const hash = process.argv.find(arg => /^0x[0-9a-f]{64}$/i.test(arg));
if (!hash || !isHex(hash)) throw new Error("Usage: npm run nft:activate -- <deployment transaction hash> [--testnet]");
const chain = NFT_CHAINS[process.argv.includes("--testnet") ? 46630 : 4663];
const client = createPublicClient({ chain, transport: http(undefined, { timeout: 15_000, retryCount: 0 }) });
if (await client.getChainId() !== chain.id) throw new Error("RPC chain ID mismatch");
const receipt = await client.getTransactionReceipt({ hash });
if (receipt.status !== "success" || !receipt.contractAddress || receipt.to !== null) throw new Error("Not a successful contract deployment receipt");
const code = await client.getCode({ address: receipt.contractAddress });
if (!code || keccak256(code) !== compiled.runtimeHash) throw new Error("Runtime differs from the reviewed collection");
const artifact = JSON.parse(fs.readFileSync(path.join(ROOT, "artifacts/nft/FirstResidents.json"), "utf8"));
const transaction = await client.getTransaction({ hash: hash as Hex });
if (transaction.input !== artifact.bytecode || transaction.value !== 0n) throw new Error("Deployment input differs from the reviewed artifact");
const evidence = { chainId: chain.id, address: receipt.contractAddress, hash, blockNumber: receipt.blockNumber.toString(),
  gasUsed: receipt.gasUsed.toString(), runtimeHash: compiled.runtimeHash, verifiedAt: new Date().toISOString() };
const configPath = path.join(ROOT, "src/nft/config.ts");
const config = fs.readFileSync(configPath, "utf8");
const declaration = /export const NFT_DEPLOYMENT: Deployment \| null = [^;]*;/;
if (!declaration.test(config)) throw new Error("Deployment configuration declaration was not found");
fs.writeFileSync(configPath, config.replace(declaration,
  `export const NFT_DEPLOYMENT: Deployment | null = { chainId: ${chain.id}, address: "${receipt.contractAddress}" };`));
fs.mkdirSync(path.join(ROOT, "docs/nft"), { recursive: true });
fs.writeFileSync(path.join(ROOT, "docs/nft/deployment.json"), JSON.stringify(evidence, null, 2) + "\n");
console.log(evidence);
console.log("Local public configuration updated after on-chain verification. Verify source in Blockscout, run the completion gate, then publish the site.");
