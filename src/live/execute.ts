/**
 * DEGEN VILLAGE — execution against the Pons router on Robinhood Chain.
 *
 * dryRun defaults to TRUE. Every path that would sign prints the exact call it
 * would have made instead. Turning it off is a deliberate act, not a default.
 */

import {
  createPublicClient,
  createWalletClient,
  defineChain,
  formatEther,
  http,
  parseEther,
  type Address,
  type Hash,
  type PublicClient,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { Verdict } from "../core/types.js";
import { selectorPresent } from "./rpc.js";

/** Robinhood Chain — Arbitrum Orbit L2. */
export const ROBINHOOD_CHAIN_ID = 4663;

export const robinhoodChain = defineChain({
  id: ROBINHOOD_CHAIN_ID,
  name: "Robinhood Chain",
  network: "robinhood-chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.robinhood-chain.example"] },
    public: { http: ["https://rpc.robinhood-chain.example"] },
  },
  blockExplorers: {
    default: { name: "Explorer", url: "https://explorer.robinhood-chain.example" },
  },
  testnet: false,
});

/**
 * SELECTOR PREFLIGHT — added 2026-09-07, after reading the deployed router.
 *
 * `eth_getCode` on 0xe33e…2948 (4,416 bytes) does NOT contain the selector for
 * `buy(address,uint256,uint256)` — the signature this file had pinned since
 * day one. The router's real buy is `buy(uint256,uint256,address)`
 * (0x59a87bc1), a different argument order, and no `sell` selector matches any
 * plausible signature we tried: sells evidently route elsewhere.
 *
 * So the ABI below was wrong, and `DRY_RUN=0` would have reverted on the first
 * trade. Rather than guess at argument semantics — the one mistake here that
 * costs real money — the executor now REFUSES to send any call whose selector
 * is not present in the deployed bytecode, and dry runs print the check.
 *
 * A selector match is not proof that the arguments mean what we think, so the
 * refusal stays until the argument order is confirmed against a real trade.
 * A MISS, though, is proof: that call cannot dispatch. See specs/04-live.md.
 */
export const PINNED_BUY_SIGNATURE = "buy(address,uint256,uint256)";
export const PINNED_BUY_SELECTOR = "0xa59ac6dd";
export const PINNED_SELL_SIGNATURE = "sell(address,uint256,uint256,uint256)";
export const PINNED_SELL_SELECTOR = "0x92cdbac5";
/** Read off the deployed router on 2026-09-07. Argument meaning unconfirmed. */
export const OBSERVED_BUY_SELECTOR = "0x59a87bc1";
export const OBSERVED_BUY_SIGNATURE = "buy(uint256,uint256,address)";

export interface SelectorReport {
  router: string;
  codeBytes: number;
  buyPresent: boolean;
  sellPresent: boolean;
  observedBuyPresent: boolean;
  /** True only when every selector this file would send is dispatchable. */
  safeToSend: boolean;
}

/**
 * Reads the router's bytecode and reports which of the pinned selectors could
 * actually dispatch. Costs one `eth_getCode`.
 */
export async function verifyRouterSelectors(
  router: string,
  rpc: { getCode(address: string): Promise<string> },
): Promise<SelectorReport> {
  const code = await rpc.getCode(router);
  const buyPresent = selectorPresent(code, PINNED_BUY_SELECTOR);
  const sellPresent = selectorPresent(code, PINNED_SELL_SELECTOR);
  return {
    router,
    codeBytes: Math.max(0, (code.replace(/^0x/, "").length / 2) | 0),
    buyPresent,
    sellPresent,
    observedBuyPresent: selectorPresent(code, OBSERVED_BUY_SELECTOR),
    safeToSend: buyPresent && sellPresent,
  };
}

/** The pinned router surface. buy() is payable; ETH rides in msg.value. */
export const PONS_ROUTER_ABI = [
  {
    type: "function",
    name: "buy",
    stateMutability: "payable",
    inputs: [
      { name: "token", type: "address" },
      { name: "minTokensOut", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ],
    outputs: [{ name: "tokensOut", type: "uint256" }],
  },
  {
    type: "function",
    name: "sell",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "tokensIn", type: "uint256" },
      { name: "minEthOut", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ],
    outputs: [{ name: "ethOut", type: "uint256" }],
  },
] as const;

export interface ExecutorOptions {
  /** Leave this alone unless you mean it. */
  dryRun?: boolean;
  rpcUrl?: string;
  privateKey?: `0x${string}`;
  router?: Address;
  /** Seconds added to the block timestamp for the deadline argument. */
  deadlineSeconds?: number;
  /** Where the dry-run line goes. */
  log?: (line: string) => void;
  /** Wait for the receipt before resolving. */
  awaitReceipt?: boolean;
}

export interface BuyRequest {
  pair: string;
  token: Address;
  /** ETH to spend. Already clamped by the stat compiler. */
  sizeEth: number;
  /** Slippage tolerance from the GAS stat. */
  slippageBps: number;
  /** Quoted tokens per ETH, used to derive minTokensOut. */
  quotedTokensPerEth: number;
  verdict?: Verdict;
}

export interface SellRequest {
  pair: string;
  token: Address;
  /** Token units to sell, in wei-scale units of the token. */
  tokensIn: bigint;
  slippageBps: number;
  /** Quoted ETH per token, used to derive minEthOut. */
  quotedEthPerToken: number;
}

export interface ExecutionResult {
  dryRun: boolean;
  action: "BUY" | "SELL";
  pair: string;
  line: string;
  hash: Hash | null;
  status: "dry-run" | "submitted" | "confirmed" | "reverted" | "failed";
  error?: string;
}

function applySlippage(amount: bigint, slippageBps: number): bigint {
  const bps = BigInt(Math.max(0, Math.min(10_000, Math.round(slippageBps))));
  return (amount * (10_000n - bps)) / 10_000n;
}

export class PonsExecutor {
  readonly dryRun: boolean;
  private selectorReport: SelectorReport | null = null;
  private readonly router: Address;
  private readonly deadlineSeconds: number;
  private readonly log: (line: string) => void;
  private readonly awaitReceipt: boolean;
  private readonly rpcUrl: string;
  private readonly privateKey: `0x${string}` | null;

  private publicClient: PublicClient | null = null;
  private walletClient: WalletClient | null = null;

  constructor(options: ExecutorOptions = {}) {
    const env = typeof process !== "undefined" ? process.env : undefined;
    this.dryRun = options.dryRun ?? env?.DRY_RUN !== "0";
    this.rpcUrl = options.rpcUrl ?? env?.RH_RPC_URL ?? robinhoodChain.rpcUrls.default.http[0];
    this.privateKey = options.privateKey ?? (env?.RH_PRIVATE_KEY as `0x${string}` | undefined) ?? null;
    this.router = options.router ?? ((env?.PONS_ROUTER ?? "0x0000000000000000000000000000000000000000") as Address);
    this.deadlineSeconds = options.deadlineSeconds ?? 60;
    this.log = options.log ?? ((line) => console.log(line));
    this.awaitReceipt = options.awaitReceipt ?? true;
  }

  private clients(): { pub: PublicClient; wallet: WalletClient } {
    if (!this.privateKey) throw new Error("execute: RH_PRIVATE_KEY is not set");
    if (!this.publicClient) {
      this.publicClient = createPublicClient({
        chain: robinhoodChain,
        transport: http(this.rpcUrl),
      });
    }
    if (!this.walletClient) {
      this.walletClient = createWalletClient({
        account: privateKeyToAccount(this.privateKey),
        chain: robinhoodChain,
        transport: http(this.rpcUrl),
      });
    }
    return { pub: this.publicClient, wallet: this.walletClient };
  }

  private deadline(): bigint {
    return BigInt(Math.floor(Date.now() / 1000) + this.deadlineSeconds);
  }

  /**
   * One `eth_getCode`, cached for the process: are the selectors this file
   * would send actually dispatchable on the deployed router?
   */
  private async preflight(): Promise<SelectorReport> {
    if (!this.selectorReport) {
      const { pub } = this.clients();
      this.selectorReport = await verifyRouterSelectors(this.router, {
        getCode: async (address) =>
          (await pub.getBytecode({ address: address as Address })) ?? "0x",
      });
    }
    return this.selectorReport;
  }

  private async send(
    action: "BUY" | "SELL",
    pair: string,
    line: string,
    call: () => Promise<Hash>,
  ): Promise<ExecutionResult> {
    if (this.dryRun) {
      this.log(`[DRY RUN] ${line}`);
      return { dryRun: true, action, pair, line, hash: null, status: "dry-run" };
    }

    /* The selector check is the last gate before a signature. It refuses far
       more often than it should have to — which is the point: the pinned ABI
       was wrong for the entire life of this file and nobody noticed, because
       nothing ever tried to send. */
    try {
      const report = await this.preflight();
      if (!report.safeToSend) {
        const detail =
          `router ${report.router} (${report.codeBytes} bytes) does not expose ` +
          `${report.buyPresent ? "" : PINNED_BUY_SIGNATURE + " "}` +
          `${report.sellPresent ? "" : PINNED_SELL_SIGNATURE}`.trim() +
          (report.observedBuyPresent
            ? ` — it does expose ${OBSERVED_BUY_SIGNATURE}, whose argument order is unconfirmed`
            : "");
        this.log(`[REFUSED] ${line} :: ${detail}`);
        return {
          dryRun: false,
          action,
          pair,
          line,
          hash: null,
          status: "failed",
          error: `selector preflight refused: ${detail}`,
        };
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.log(`[REFUSED] ${line} :: preflight unavailable (${msg})`);
      return {
        dryRun: false,
        action,
        pair,
        line,
        hash: null,
        status: "failed",
        error: `selector preflight unavailable: ${msg}`,
      };
    }

    try {
      this.log(`[SEND] ${line}`);
      const hash = await call();
      if (!this.awaitReceipt) {
        return { dryRun: false, action, pair, line, hash, status: "submitted" };
      }
      const { pub } = this.clients();
      const receipt = await pub.waitForTransactionReceipt({ hash });
      return {
        dryRun: false,
        action,
        pair,
        line,
        hash,
        status: receipt.status === "success" ? "confirmed" : "reverted",
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.log(`[FAIL] ${line} :: ${msg}`);
      return { dryRun: false, action, pair, line, hash: null, status: "failed", error: msg };
    }
  }

  async buy(req: BuyRequest): Promise<ExecutionResult> {
    const value = parseEther(req.sizeEth.toFixed(18));
    const expectedTokens = parseEther(
      (req.sizeEth * req.quotedTokensPerEth).toFixed(18),
    );
    const minTokensOut = applySlippage(expectedTokens, req.slippageBps);
    const deadline = this.deadline();

    const line =
      `pons.buy(token=${req.token}, minTokensOut=${minTokensOut}, deadline=${deadline}) ` +
      `value=${formatEther(value)} ETH pair=${req.pair} slippage=${req.slippageBps}bps` +
      (req.verdict ? ` reason="${req.verdict.reason}"` : "");

    return this.send("BUY", req.pair, line, async () => {
      const { pub, wallet } = this.clients();
      const account = wallet.account;
      if (!account) throw new Error("execute: wallet has no account");
      const { request } = await pub.simulateContract({
        address: this.router,
        abi: PONS_ROUTER_ABI,
        functionName: "buy",
        args: [req.token, minTokensOut, deadline],
        value,
        account,
      });
      return wallet.writeContract(request);
    });
  }

  async sell(req: SellRequest): Promise<ExecutionResult> {
    const expectedEth = parseEther(
      (Number(req.tokensIn) / 1e18 * req.quotedEthPerToken).toFixed(18),
    );
    const minEthOut = applySlippage(expectedEth, req.slippageBps);
    const deadline = this.deadline();

    const line =
      `pons.sell(token=${req.token}, tokensIn=${req.tokensIn}, minEthOut=${minEthOut}, ` +
      `deadline=${deadline}) pair=${req.pair} slippage=${req.slippageBps}bps`;

    return this.send("SELL", req.pair, line, async () => {
      const { pub, wallet } = this.clients();
      const account = wallet.account;
      if (!account) throw new Error("execute: wallet has no account");
      const { request } = await pub.simulateContract({
        address: this.router,
        abi: PONS_ROUTER_ABI,
        functionName: "sell",
        args: [req.token, req.tokensIn, minEthOut, deadline],
        account,
      });
      return wallet.writeContract(request);
    });
  }
}

export function createExecutor(options: ExecutorOptions = {}): PonsExecutor {
  return new PonsExecutor(options);
}
