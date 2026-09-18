import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { bytesToHex, createAddressFromString, hexToBytes } from "@ethereumjs/util";
import { decodeFunctionResult, encodeFunctionData, getAddress } from "viem";
import { compileResidents, ROOT, type ContractArtifact } from "../scripts/nft/compile.js";
import { addressFor, localEvm } from "../scripts/nft/evm.js";
import compiled from "../src/nft/compiled.json";
import gallery from "../src/nft/collection.json";
import { runtime } from "./fixtures/residents-runtime.json";

let artifact: ContractArtifact, receiver: ContractArtifact;
beforeAll(() => {
  const result = compileResidents({ "contracts/TestReceiver.sol": { content: `// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;
interface IMint { function mint() external returns (uint256); }
contract TestReceiver {
  bool public blocked;
  bool public reject;
  function claim(address target, bool refuse) external { reject = refuse; IMint(target).mint(); }
  function onERC721Received(address,address,uint256,bytes calldata) external returns (bytes4) {
    if (reject) return bytes4(0);
    try IMint(msg.sender).mint() returns (uint256) { blocked = false; } catch { blocked = true; }
    return 0x150b7a02;
  }
}` } });
  artifact = result.artifacts.FirstResidents;
  receiver = result.artifacts.TestReceiver;
}, 30_000);

describe("First Residents on an actual local EVM", () => {
  it("pins the deployed runtime and stays below the EIP-170 size limit", () => {
    expect(artifact.runtimeHash).toBe(compiled.runtimeHash);
    expect(artifact.runtime).toBe(runtime);
    expect((artifact.runtime.length - 2) / 2).toBe(compiled.runtimeBytes);
    expect(compiled.runtimeBytes).toBeLessThan(24_576);
    const functions = artifact.abi.filter(item => item.type === "function").map(item => item.name);
    for (const forbidden of ["owner", "setPrice", "setBaseURI", "withdraw", "reserveMint", "upgradeTo", "setMaxSupply"]) expect(functions).not.toContain(forbidden);
    expect(artifact.abi.find(item => item.type === "function" && item.name === "mint")).toMatchObject({ stateMutability: "nonpayable" });
  });
  it("mints exactly 30 unique residents, matches every preview, and refuses mint 31", async () => {
    const evm = await localEvm(artifact), images = new Set<string>();
    expect(await evm.read("totalSupply")).toBe(0n);
    expect(await evm.read("MAX_SUPPLY")).toBe(30n);
    expect((await evm.call("tokenURI", [1n])).execResult.exceptionError).toBeDefined();
    for (let id = 1; id <= 30; id++) {
      const mint = await evm.call("mint", [], addressFor(id));
      expect(mint.execResult.exceptionError).toBeUndefined();
      expect(await evm.read("ownerOf", [BigInt(id)])).toBe(getAddress(addressFor(id)));
      expect(await evm.read("hasMinted", [addressFor(id)])).toBe(true);
      const uri = await evm.read("tokenURI", [BigInt(id)]) as string;
      expect(uri).toMatch(/^data:application\/json;base64,/);
      const metadata = JSON.parse(Buffer.from(uri.split(",")[1], "base64").toString());
      const svg = Buffer.from(metadata.image.split(",")[1], "base64").toString();
      expect(svg + "\n").toBe(fs.readFileSync(path.join(ROOT, `public/nft/${id}.svg`), "utf8"));
      expect(svg.replace('height="800" viewBox="0 0 640 800"', 'height="640" viewBox="60 120 520 520"') + "\n")
        .toBe(fs.readFileSync(path.join(ROOT, `public/nft/pfp/${id}.svg`), "utf8"));
      expect(metadata.description).toContain("bot PFP skin");
      expect({ id, ...metadata, image: undefined }).toEqual({ ...gallery[id - 1], image: undefined });
      expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
      expect(svg).not.toMatch(/<script|<foreignObject|href=|Robinhood|NaN|Infinity/);
      images.add(svg);
    }
    expect(images.size).toBe(30);
    expect(await evm.read("totalSupply")).toBe(30n);
    expect((await evm.call("mint", [], addressFor(31))).execResult.exceptionError).toBeDefined();
    expect(await evm.read("totalSupply")).toBe(30n);
    expect((await evm.call("tokenURI", [31n])).execResult.exceptionError).toBeDefined();
  }, 30_000);
  it("rejects ETH and repeat claims, including after transferring a resident away", async () => {
    const evm = await localEvm(artifact);
    expect((await evm.call("mint", [], addressFor(1), 1n)).execResult.exceptionError).toBeDefined();
    expect(await evm.read("totalSupply")).toBe(0n);
    expect((await evm.call("mint")).execResult.exceptionError).toBeUndefined();
    expect((await evm.call("transferFrom", [addressFor(1), addressFor(2), 1n])).execResult.exceptionError).toBeUndefined();
    expect(await evm.read("ownerOf", [1n])).toBe(addressFor(2));
    expect((await evm.call("mint")).execResult.exceptionError).toBeDefined();
    expect((await evm.call("mint", [], addressFor(2))).execResult.exceptionError).toBeUndefined();
    expect(await evm.read("balanceOf", [addressFor(2)])).toBe(2n);
    expect(await evm.read("supportsInterface", ["0x80ac58cd"])).toBe(true);
    expect(await evm.read("supportsInterface", ["0x5b5e139f"])).toBe(true);
  });
  it("blocks receiver reentry and rolls back supply and claim flags when a receiver rejects", async () => {
    const evm = await localEvm(artifact);
    const deployed = await evm.vm.evm.runCall({ caller: createAddressFromString(addressFor(999)), data: hexToBytes(receiver.bytecode), gasLimit: 10_000_000n });
    const target = deployed.createdAddress!;
    expect(deployed.execResult.exceptionError).toBeUndefined();
    const rejected = await evm.call("claim", [evm.address.toString(), true], addressFor(1), 0n, target, receiver.abi);
    expect(rejected.execResult.exceptionError).toBeDefined();
    expect(await evm.read("totalSupply")).toBe(0n);
    expect(await evm.read("hasMinted", [target.toString()])).toBe(false);
    const accepted = await evm.call("claim", [evm.address.toString(), false], addressFor(1), 0n, target, receiver.abi);
    expect(accepted.execResult.exceptionError).toBeUndefined();
    expect(await evm.read("totalSupply")).toBe(1n);
    const blocked = await evm.vm.evm.runCall({ caller: createAddressFromString(addressFor(1)), to: target,
      data: hexToBytes(encodeFunctionData({ abi: receiver.abi, functionName: "blocked" })), gasLimit: 1_000_000n });
    expect(decodeFunctionResult({ abi: receiver.abi, functionName: "blocked", data: bytesToHex(blocked.execResult.returnValue) })).toBe(true);
  });
});
