// @ts-nocheck -- Bun's test globals are executed by Bun and are not in the app tsconfig.
import { describe, expect, it } from "bun:test";

import { getFactoryView } from "./rpc";
import { votingLifecycleDescription } from "./RoundsInfoDialog";

const factory = "0x1111111111111111111111111111111111111111";
const adapter = "0x2222222222222222222222222222222222222222";
const implementation = "0x3333333333333333333333333333333333333333";
const vaultImplementation = "0x4444444444444444444444444444444444444444";
const votingToken = "0x5555555555555555555555555555555555555555";

function factoryClient(implementationResult: unknown) {
  return {
    readContract: async ({
      address,
      functionName,
    }: {
      address: string;
      functionName: string;
    }) => {
      if (address === adapter && functionName === "TOKEN") return votingToken;
      if (functionName === "creationFee") return 1n;
      if (functionName === "treasury")
        return "0x6666666666666666666666666666666666666666";
      if (functionName === "paused") return false;
      if (functionName === "testMode") return true;
      if (functionName === "activeImplementationVersion") return 4;
      if (functionName === "roundCount") return 2n;
      if (functionName === "votingPowerAdapter") return adapter;
      if (functionName === "implementations") return implementationResult;
      throw new Error(`Unexpected read: ${functionName}`);
    },
  };
}

describe("Rounds factory contract information", () => {
  it("explains V8 creation-time voting power and wallet-level limits accurately", () => {
    const text = votingLifecycleDescription(8);
    expect(text).toContain("round creation");
    expect(text).toContain("after creation");
    expect(text).toContain("owner wallet");
    expect(text).toContain("splitting");
    expect(text).toContain("batches");
  });
  it("reads one global admin from a V8 factory", async () => {
    const globalAdmin = "0x7777777777777777777777777777777777777777";
    const client = factoryClient([implementation, vaultImplementation]);
    const readContract = client.readContract;
    client.readContract = async (request) => {
      if (request.functionName === "globalAdmin") return globalAdmin;
      return readContract(request);
    };

    const view = await getFactoryView(client, factory, 8);

    expect(view.globalAdmins).toEqual([globalAdmin]);
  });
  it("reads the active round implementation and underlying token from a generation-3 factory", async () => {
    const view = await getFactoryView(
      factoryClient([implementation, vaultImplementation]),
      factory,
      3,
    );

    expect(view.activeImplementation).toBe(implementation);
    expect(view.activeVaultImplementation).toBe(vaultImplementation);
    expect(view.votingToken).toBe(votingToken);
  });

  it("reads the active implementation from a generation-2 factory", async () => {
    const view = await getFactoryView(
      factoryClient(implementation),
      factory,
      2,
    );

    expect(view.activeImplementation).toBe(implementation);
    expect(view.activeVaultImplementation).toBeUndefined();
    expect(view.votingToken).toBe(votingToken);
  });

  it("keeps the factory usable when optional implementation or token reads fail", async () => {
    const client = factoryClient(implementation);
    const readContract = client.readContract;
    client.readContract = async (request) => {
      if (
        request.functionName === "implementations" ||
        request.functionName === "TOKEN"
      ) {
        throw new Error("optional read unavailable");
      }
      return readContract(request);
    };

    const view = await getFactoryView(client, factory, 3);

    expect(view.roundCount).toBe(2n);
    expect(view.activeImplementation).toBeUndefined();
    expect(view.activeVaultImplementation).toBeUndefined();
    expect(view.votingToken).toBeUndefined();
  });
});
