import fs from "node:fs";
import path from "node:path";
import { createServer } from "node:http";
import { ROOT } from "./compile.js";
import { NFT_CHAINS } from "../../src/nft/config.js";

const chain = NFT_CHAINS[process.argv.includes("--testnet") ? 46630 : 4663];
const page = fs.readFileSync(path.join(ROOT, "scripts/nft/deploy.html"));
const server = createServer((req, res) => {
  if (req.method !== "GET" || req.headers.host !== "127.0.0.1:5181" || !["/", "/artifact"].includes(req.url ?? "")) {
    res.writeHead(404); res.end(); return;
  }
  res.writeHead(200, { "Content-Type": req.url === "/" ? "text/html; charset=utf-8" : "application/json", "Cache-Control": "no-store", "X-Frame-Options": "DENY", "Referrer-Policy": "no-referrer" });
  if (req.url === "/") { res.end(page); return; }
  const artifact = JSON.parse(fs.readFileSync(path.join(ROOT, "artifacts/nft/FirstResidents.json"), "utf8"));
  res.end(JSON.stringify({ chain, bytecode: artifact.bytecode, runtimeHash: artifact.runtimeHash }));
});
server.listen(5181, "127.0.0.1", () => console.log(`Local wallet deployment tool: http://127.0.0.1:5181/ (${chain.name}). Nothing is signed or sent until you confirm in your wallet.`));
