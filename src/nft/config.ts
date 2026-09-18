import { defineChain, parseAbi, type Address } from "viem";

export const RESIDENTS_ABI = parseAbi([
  "function mint() returns (uint256)", "function totalSupply() view returns (uint256)",
  "function MAX_SUPPLY() view returns (uint256)", "function hasMinted(address) view returns (bool)",
  "function tokenURI(uint256) view returns (string)", "function ownerOf(uint256) view returns (address)",
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
  "error SoldOut()", "error AlreadyMinted()", "error MintInProgress()",
]);
export const NFT_CHAINS = {
  4663: defineChain({ id: 4663, name: "Robinhood Chain", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: ["https://rpc.mainnet.chain.robinhood.com"] } },
    blockExplorers: { default: { name: "Blockscout", url: "https://robinhoodchain.blockscout.com" } } }),
  46630: defineChain({ id: 46630, name: "Robinhood Chain Testnet", nativeCurrency: { name: "Test Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: ["https://rpc.testnet.chain.robinhood.com"] } },
    blockExplorers: { default: { name: "Blockscout", url: "https://explorer.testnet.chain.robinhood.com" } }, testnet: true }),
} as const;
export interface Deployment { chainId: keyof typeof NFT_CHAINS; address: Address }
/** Set only after a successful deployment and bytecode/source verification. */
export const NFT_DEPLOYMENT: Deployment | null = null;
