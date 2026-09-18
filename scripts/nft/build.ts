import fs from "node:fs";
import path from "node:path";
import { compileResidents, ROOT } from "./compile.js";
import { localEvm, addressFor } from "./evm.js";

const { artifacts, input, compiler } = compileResidents();
const artifact = artifacts.FirstResidents;
const runtimeBytes = (artifact.runtime.length - 2) / 2;
if (runtimeBytes > 24_576) throw new Error(`Runtime exceeds EIP-170: ${runtimeBytes} bytes`);
const evm = await localEvm(artifact);
const gallery = [];
fs.mkdirSync(path.join(ROOT, "public/nft"), { recursive: true });
fs.mkdirSync(path.join(ROOT, "public/nft/pfp"), { recursive: true });
fs.mkdirSync(path.join(ROOT, "src/nft"), { recursive: true });
fs.mkdirSync(path.join(ROOT, "artifacts/nft"), { recursive: true });
for (let id = 1; id <= 30; id++) {
  const mint = await evm.call("mint", [], addressFor(id));
  if (mint.execResult.exceptionError) throw new Error(`Mint ${id} failed`);
  const uri = await evm.read("tokenURI", [BigInt(id)]) as string;
  const metadata = JSON.parse(Buffer.from(uri.split(",")[1], "base64").toString());
  const svg = Buffer.from(metadata.image.split(",")[1], "base64").toString();
  fs.writeFileSync(path.join(ROOT, `public/nft/${id}.svg`), svg + "\n");
  fs.writeFileSync(path.join(ROOT, `public/nft/pfp/${id}.svg`), svg.replace('height="800" viewBox="0 0 640 800"', 'height="640" viewBox="60 120 520 520"') + "\n");
  const { image: _image, ...details } = metadata;
  gallery.push({ id, ...details });
}
fs.writeFileSync(path.join(ROOT, "src/nft/collection.json"), JSON.stringify(gallery, null, 2) + "\n");
fs.writeFileSync(path.join(ROOT, "src/nft/compiled.json"), JSON.stringify({ compiler, runtimeHash: artifact.runtimeHash, runtimeBytes }, null, 2) + "\n");
fs.writeFileSync(path.join(ROOT, "tests/fixtures/residents-runtime.json"), JSON.stringify({ runtime: artifact.runtime }, null, 2) + "\n");
fs.writeFileSync(path.join(ROOT, "artifacts/nft/FirstResidents.json"), JSON.stringify({ ...artifact, compiler }, null, 2) + "\n");
fs.writeFileSync(path.join(ROOT, "artifacts/nft/standard-input.json"), JSON.stringify(input, null, 2) + "\n");
console.log(`Generated 30 on-chain SVG previews. Runtime ${runtimeBytes} bytes; deployment execution ${evm.deploymentGas} gas. ${compiler}`);
