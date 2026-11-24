// @ts-nocheck -- Bun's test globals are executed by Bun and are not in the app tsconfig.
import { describe, expect, it } from "bun:test";

import {
  getRoundAbi,
  getRoundsContracts,
  resolveRoundsContracts,
} from "./contracts";
import { LifecycleState } from "./types";
import {
  getFinalizationCursor,
  normalizeLifecycleState,
  normalizeSubmissionsClose,
} from "./rpc";

describe("Rounds contract-version compatibility", () => {
  it("uses resumable finalization only for 0.1.0 rounds", () => {
    expect(getRoundAbi(8).some((item) => item.name === "finalizeBatch")).toBe(
      true,
    );
    expect(
      getRoundAbi(8).some((item) => item.name === "finalizationCursor"),
    ).toBe(true);
    expect(getRoundAbi(7).some((item) => item.name === "finalizeBatch")).toBe(
      false,
    );
    expect(getRoundAbi(7).some((item) => item.name === "finalize")).toBe(true);
  });

  it("reads finalization progress only for 0.1.0 rounds", async () => {
    const calls: string[] = [];
    const client = {
      readContract: async ({ functionName }) => {
        calls.push(functionName);
        return 50n;
      },
    } as never;
    const address = "0x1111111111111111111111111111111111111111";

    expect(await getFinalizationCursor(client, address, 7)).toBeUndefined();
    expect(await getFinalizationCursor(client, address, 8)).toBe(50n);
    expect(calls).toEqual(["finalizationCursor"]);
  });
  it("inserts moderation pending into v1 lifecycle values", () => {
    expect(normalizeLifecycleState(0, 1)).toBe(LifecycleState.Upcoming);
    expect(normalizeLifecycleState(1, 1)).toBe(LifecycleState.SubmissionsOpen);
    expect(normalizeLifecycleState(2, 1)).toBe(LifecycleState.VotingOpen);
    expect(normalizeLifecycleState(3, 1)).toBe(LifecycleState.Ended);
    expect(normalizeLifecycleState(4, 1)).toBe(LifecycleState.Finalized);
    expect(normalizeLifecycleState(5, 1)).toBe(LifecycleState.Archived);
  });

  it("preserves v2 lifecycle values", () => {
    expect(normalizeLifecycleState(2, 2)).toBe(
      LifecycleState.ModerationPending,
    );
    expect(normalizeLifecycleState(3, 2)).toBe(LifecycleState.VotingOpen);
  });

  it("synthesizes a v1 submissions close at voting start", () => {
    expect(normalizeSubmissionsClose(1, undefined, 1_234)).toBe(1_234);
    expect(normalizeSubmissionsClose(2, 1_100, 1_234)).toBe(1_100);
  });

  it("selects the 0.1.0 factory while preserving V7, V6, and V5 rounds", () => {
    const contracts = getRoundsContracts(11_155_111);

    expect(contracts.factory).toBe(
      "0xCa648c6b3e53b126Ad6bC00b248a7Ac236C3aaF6",
    );
    expect(contracts.factoryGeneration).toBe(8);
    expect(contracts.legacyFactories).toEqual([
      {
        address: "0x4c05EF874bA1AF1D97C0708075CD531a38283454",
        generation: 7,
      },
      {
        address: "0xC7e45B337975f1EC07cac943d0CeC6609E544377",
        generation: 6,
      },
      {
        address: "0xd4cB8549980AdD2feA586FD13a47613118B0B5b4",
        generation: 5,
      },
    ]);
  });

  it("does not override the configured 0.1.0 factory with an invalid or legacy address", () => {
    const v7 = "0x4c05EF874bA1AF1D97C0708075CD531a38283454";
    const contracts = getRoundsContracts(11_155_111, v7);

    expect(contracts.factory).toBe(
      "0xCa648c6b3e53b126Ad6bC00b248a7Ac236C3aaF6",
    );
    expect(contracts.factoryGeneration).toBe(8);
    expect(contracts.legacyFactories).toEqual([
      { address: v7, generation: 7 },
      {
        address: "0xC7e45B337975f1EC07cac943d0CeC6609E544377",
        generation: 6,
      },
      {
        address: "0xd4cB8549980AdD2feA586FD13a47613118B0B5b4",
        generation: 5,
      },
    ]);
    expect(
      getRoundsContracts(11_155_111, "not-an-address").factoryGeneration,
    ).toBe(8);
    expect(
      getRoundsContracts(
        11_155_111,
        "0xC7e45B337975f1EC07cac943d0CeC6609E544377",
      ).factoryGeneration,
    ).toBe(8);
    expect(getRoundsContracts(1, v7).factoryGeneration).toBeUndefined();
  });

  it("keeps 0.1.0 active and V7 historical when a stale V7 environment override remains", () => {
    const currentFactory = "0x8888888888888888888888888888888888888888";
    const v7 = "0x7777777777777777777777777777777777777777";
    const contracts = resolveRoundsContracts(
      11_155_111,
      {
        roundsFactory: currentFactory,
        roundsFactoryGeneration: 8,
        roundsLegacyFactories: [{ address: v7, generation: 7 }],
      },
      v7,
    );

    expect(contracts.factory).toBe(currentFactory);
    expect(contracts.factoryGeneration).toBe(8);
    expect(contracts.legacyFactories).toEqual([{ address: v7, generation: 7 }]);
  });
});
