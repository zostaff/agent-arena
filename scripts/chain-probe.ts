/**
 * Reads the live chain and prints what it sees. No key, no indexer.
 *
 *   npm run chain
 *
 * This is the check that keeps src/live/rpc.ts honest: the unit tests run on
 * fixtures and stay offline, so this is the only thing that notices when the
 * chain stops matching the fixtures.
 */

import { PonsLaunchFeed, RH_CHAIN_ID } from "../src/live/rpc.js";

async function main(): Promise<void> {
  const feed = new PonsLaunchFeed();
  console.log(`endpoint  ${feed.endpoint}`);

  const { chainId, head, ok } = await feed.verify();
  console.log(`chainId   ${chainId} ${ok ? "(Robinhood Chain)" : `— expected ${RH_CHAIN_ID}`}`);
  console.log(`head      ${head.toLocaleString()}`);
  if (!ok) process.exitCode = 1;

  const started = Date.now();
  const tokens = await feed.recent(10);
  console.log(`launches  ${tokens.length} in the last window, ${Date.now() - started}ms\n`);

  for (const t of tokens) {
    console.log(
      `  ${t.symbol.padEnd(14)} ${t.address}  block ${t.blockNumber}  ~${t.ageSeconds}s old`,
    );
  }
  if (tokens.length === 0) {
    console.log("  no launches in the window — widen lookbackBlocks or check the factory address");
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
