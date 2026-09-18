import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import solc from "solc";
import { keccak256, type Abi, type Hex } from "viem";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export interface ContractArtifact { abi: Abi; bytecode: Hex; runtime: Hex; runtimeHash: Hex }
export function compileResidents(extra: Record<string, { content: string }> = {}) {
  const sources = Object.fromEntries(["FirstResidents", "ResidentArt"].map(name => [`contracts/${name}.sol`, { content: fs.readFileSync(path.join(ROOT, `contracts/${name}.sol`), "utf8") }]));
  const input = { language: "Solidity", sources: { ...sources, ...extra }, settings: {
    optimizer: { enabled: true, runs: 200 }, viaIR: true, evmVersion: "cancun",
    outputSelection: { "*": { "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object"] } },
  } };
  const output = JSON.parse(solc.compile(JSON.stringify(input), { import: (name: string) => {
    if (!name.startsWith("@openzeppelin/contracts/") || name.includes("..")) return { error: `Unsupported import: ${name}` };
    try {
      const contents = fs.readFileSync(path.join(ROOT, "node_modules", name), "utf8");
      input.sources[name] = { content: contents };
      return { contents };
    }
    catch { return { error: `Import not found: ${name}` }; }
  } }));
  const errors = (output.errors ?? []).filter((e: { severity: string }) => e.severity === "error");
  if (errors.length) throw new Error(errors.map((e: { formattedMessage: string }) => e.formattedMessage).join("\n"));
  const artifacts: Record<string, ContractArtifact> = {};
  for (const file of Object.values(output.contracts) as Record<string, any>[]) for (const [name, contract] of Object.entries(file)) {
    const runtime = `0x${contract.evm.deployedBytecode.object}` as Hex;
    artifacts[name] = { abi: contract.abi, bytecode: `0x${contract.evm.bytecode.object}`, runtime, runtimeHash: keccak256(runtime) };
  }
  return { artifacts, input, compiler: solc.version() as string };
}
