import { createVM } from "@ethereumjs/vm";
import { createAccount, createAddressFromString, hexToBytes, bytesToHex } from "@ethereumjs/util";
import { decodeFunctionResult, encodeFunctionData, type Abi, type Hex } from "viem";
import type { ContractArtifact } from "./compile.js";

export const addressFor = (n: number) => `0x${n.toString(16).padStart(40, "0")}` as Hex;
export async function localEvm(artifact: ContractArtifact) {
  const vm = await createVM();
  const deployer = createAddressFromString(addressFor(999));
  await vm.stateManager.putAccount(deployer, createAccount({ balance: 10n ** 25n }));
  const deployment = await vm.evm.runCall({ caller: deployer, data: hexToBytes(artifact.bytecode), gasLimit: 30_000_000n });
  if (deployment.execResult.exceptionError || !deployment.createdAddress) throw new Error(`Deployment failed: ${deployment.execResult.exceptionError}`);
  const address = deployment.createdAddress;
  const call = async (name: string, args: readonly unknown[] = [], from = addressFor(1), value = 0n, to = address, abi: Abi = artifact.abi) => {
    const caller = createAddressFromString(from);
    if (!(await vm.stateManager.getAccount(caller))) await vm.stateManager.putAccount(caller, createAccount({ balance: 10n ** 23n }));
    return vm.evm.runCall({ caller, to, data: hexToBytes(encodeFunctionData({ abi, functionName: name, args })), gasLimit: 30_000_000n, value });
  };
  const read = async (name: string, args: readonly unknown[] = []) => {
    const result = await call(name, args);
    if (result.execResult.exceptionError) throw new Error(`${name}: ${result.execResult.exceptionError}`);
    return decodeFunctionResult({ abi: artifact.abi, functionName: name, data: bytesToHex(result.execResult.returnValue) });
  };
  return { vm, address, call, read, deploymentGas: deployment.execResult.executionGasUsed };
}
