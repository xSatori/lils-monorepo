// @ts-nocheck -- Bun's test globals are executed by Bun and are not in the app tsconfig.
import { describe, expect, it } from "bun:test";

import { getRoundFactoryAbi, ZERO_ADDRESS } from "./contracts";
import { normalizePrizeAllocationTuple } from "./rpc";
import {
  buildRecoveryCancellationTypedData,
  buildRecoveryTypedData,
  freezeRecoveryDraft,
  buildClaimTypedData,
  buildAllocationActionTypedData,
  buildSafetyActionTypedData,
  buildSafetyCancellationTypedData,
  encodePrizeAllocation,
  encodePrizePlacementAllocation,
  freezeAllocationAction,
  freezeSafetyAction,
  prizeAllocationHash,
  prizeFundingStatus,
  outstandingPrizeGroups,
} from "./prizes";
import { PrizeAssetType } from "./types";

const TOKEN = "0x1111111111111111111111111111111111111111";
const VAULT = "0x2222222222222222222222222222222222222222";
const ROUND = "0x3333333333333333333333333333333333333333";
const RECIPIENT = "0x4444444444444444444444444444444444444444";
const PLAN_HASH = `0x${"55".repeat(32)}`;

describe("Rounds v3 prizes", () => {
  it("maps human winner placement to the zero-based contract rank", () => {
    expect(
      encodePrizePlacementAllocation(
        {
          winnerRank: "1",
          assetType: "0",
          token: "",
          tokenId: "0",
          amount: "1",
        },
        3,
      ).winnerRank,
    ).toBe(0);
    expect(() =>
      encodePrizePlacementAllocation(
        {
          winnerRank: "4",
          assetType: "0",
          token: "",
          tokenId: "0",
          amount: "1",
        },
        3,
      ),
    ).toThrow("Prize placement is outside the configured winner count");
  });

  it("normalizes viem named allocation tuples and positional test tuples", () => {
    const expected = {
      winnerRank: 1,
      assetType: 3,
      token: TOKEN,
      tokenId: 42n,
      amount: 7n,
      claimed: true,
    };
    expect(normalizePrizeAllocationTuple(expected)).toEqual(expected);
    expect(normalizePrizeAllocationTuple([1, 3, TOKEN, 42n, 7n, true])).toEqual(
      expected,
    );
  });

  it("encodes exact native and NFT asset tuples", () => {
    expect(
      encodePrizeAllocation(
        {
          winnerRank: "0",
          assetType: "0",
          token: "",
          tokenId: "99",
          amount: "100",
        },
        2,
      ),
    ).toEqual({
      winnerRank: 0,
      assetType: 0,
      token: ZERO_ADDRESS,
      tokenId: 0n,
      amount: 100n,
    });
    expect(
      encodePrizeAllocation(
        {
          winnerRank: "1",
          assetType: "2",
          token: TOKEN,
          tokenId: "7",
          amount: "999",
        },
        2,
      ),
    ).toEqual({
      winnerRank: 1,
      assetType: 2,
      token: TOKEN,
      tokenId: 7n,
      amount: 1n,
    });
  });

  it("rejects invalid rank, token, and zero amount inputs", () => {
    expect(() =>
      encodePrizeAllocation(
        {
          winnerRank: "2",
          assetType: "0",
          token: "",
          tokenId: "0",
          amount: "1",
        },
        2,
      ),
    ).toThrow();
    expect(() =>
      encodePrizeAllocation(
        {
          winnerRank: "0",
          assetType: "1",
          token: "bad",
          tokenId: "0",
          amount: "1",
        },
        2,
      ),
    ).toThrow();
    expect(() =>
      encodePrizeAllocation(
        {
          winnerRank: "0",
          assetType: "0",
          token: "",
          tokenId: "0",
          amount: "0",
        },
        2,
      ),
    ).toThrow();
    expect(() =>
      encodePrizeAllocation(
        {
          winnerRank: "0",
          assetType: "2",
          token: TOKEN,
          tokenId: "",
          amount: "1",
        },
        1,
      ),
    ).toThrow("Token ID must be a whole number");
    expect(() =>
      encodePrizeAllocation(
        {
          winnerRank: "0",
          assetType: "1",
          token: ZERO_ADDRESS,
          tokenId: "0",
          amount: "1",
        },
        1,
      ),
    ).toThrow("valid non-zero contract address");
    expect(() =>
      encodePrizeAllocation(
        {
          winnerRank: "0",
          assetType: "3",
          token: TOKEN,
          tokenId: "7",
          amount: "-1",
        },
        1,
      ),
    ).toThrow("Prize amount must be a whole number");
  });

  it("derives funding, excess, and claimed projection states", () => {
    expect(prizeFundingStatus(10n, 0n)).toBe("unfunded");
    expect(prizeFundingStatus(10n, 4n)).toBe("partial");
    expect(prizeFundingStatus(10n, 10n)).toBe("funded");
    expect(prizeFundingStatus(10n, 12n)).toBe("excess");
    expect(prizeFundingStatus(10n, 10n, true)).toBe("claimed");
  });

  it("reports remaining funding by prize type and preserves token IDs", () => {
    const allocation = (assetType, id, tokenId, liability, funded) => ({
      assetType,
      id: BigInt(id),
      token: assetType === PrizeAssetType.Native ? ZERO_ADDRESS : TOKEN,
      tokenId: BigInt(tokenId),
      liability: BigInt(liability),
      funded: BigInt(funded),
    });
    const groups = outstandingPrizeGroups([
      allocation(PrizeAssetType.Native, 0, 0, 10, 4),
      allocation(PrizeAssetType.Native, 1, 0, 10, 4),
      allocation(PrizeAssetType.Erc20, 2, 0, 100, 40),
      allocation(PrizeAssetType.Erc20, 6, 0, 100, 40),
      allocation(PrizeAssetType.Erc721, 3, 7, 1, 0),
      allocation(PrizeAssetType.Erc721, 4, 8, 1, 1),
      allocation(PrizeAssetType.Erc1155, 5, 9, 12, 3),
    ]);
    expect(groups.map((group) => group.assetType)).toEqual([0, 1, 2, 3]);
    expect(groups[0].totalRemaining).toBe(6n);
    expect(groups[1].items[0].remaining).toBe(60n);
    expect(groups[1].totalRemaining).toBe(60n);
    expect(groups[2].totalRemaining).toBe(1n);
    expect(groups[2].items.map((item) => item.tokenId)).toEqual([7n, 8n]);
    expect(groups[2].items.map((item) => item.remaining)).toEqual([1n, 0n]);
    expect(groups[3].items[0].remaining).toBe(9n);
    expect(groups.every((group) => !group.complete)).toBe(true);
    expect(
      outstandingPrizeGroups([
        allocation(PrizeAssetType.Erc721, 6, 22, 1, 1),
      ])[0].complete,
    ).toBe(true);
  });

  it("selects the v3 create schema only for generation three", () => {
    const v2Create = getRoundFactoryAbi(2).find(
      (item) => item.type === "function" && item.name === "createRound",
    );
    const v3Create = getRoundFactoryAbi(3).find(
      (item) => item.type === "function" && item.name === "createRound",
    );
    expect(v2Create.inputs).toHaveLength(2);
    expect(v3Create.inputs).toHaveLength(3);
  });

  it("constructs chain, vault, round, plan, nonce, and deadline-bound recovery data", () => {
    const typed = buildRecoveryTypedData({
      chainId: 11155111,
      vault: VAULT,
      round: ROUND,
      prizePlanHash: PLAN_HASH,
      kind: 0,
      assetType: 1,
      token: TOKEN,
      tokenId: 0n,
      amount: 25n,
      recipient: RECIPIENT,
      allocationId: 0n,
      nonce: 3n,
      validAfter: 100,
      deadline: 1_000,
    });
    expect(typed.domain).toEqual({
      name: "LilNounsRoundPrizeVault",
      version: "1",
      chainId: 11155111,
      verifyingContract: VAULT,
    });
    expect(typed.message.round).toBe(ROUND);
    expect(typed.message.prizePlanHash).toBe(PLAN_HASH);
    expect(typed.message.nonce).toBe(3n);
    expect(typed.message.deadline).toBe(1_000);
  });

  it("binds winner redirect authorization to the exact prize asset", () => {
    const typed = buildClaimTypedData({
      chainId: 11155111,
      vault: VAULT,
      round: ROUND,
      prizePlanHash: PLAN_HASH,
      allocationId: 4n,
      assetType: 3,
      token: TOKEN,
      tokenId: 9n,
      amount: 2n,
      recipient: RECIPIENT,
      nonce: 7n,
      deadline: 2_000,
    });
    expect(typed.primaryType).toBe("ClaimAuthorization");
    expect(typed.message).toMatchObject({
      allocationId: 4n,
      assetType: 3,
      tokenId: 9n,
      amount: 2n,
      nonce: 7n,
    });
  });

  it("freezes one exact recovery payload for export, signatures, queue, and action id", () => {
    const input = {
      chainId: 11155111,
      vault: VAULT,
      round: ROUND,
      prizePlanHash: PLAN_HASH,
      kind: 0,
      assetType: 1,
      token: TOKEN,
      tokenId: 0n,
      amount: 25n,
      recipient: RECIPIENT,
      allocationId: 0n,
      nonce: 9n,
      validAfter: 500,
      deadline: 5_000,
    };
    const first = freezeRecoveryDraft(input);
    const second = freezeRecoveryDraft(input);
    expect(first).toEqual(second);
    expect(first.typedData.message.validAfter).toBe(500);
    expect(first.actionId).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("binds recovery cancellation to the queued action and cancellation nonce", () => {
    const typed = buildRecoveryCancellationTypedData({
      chainId: 11155111,
      vault: VAULT,
      round: ROUND,
      prizePlanHash: PLAN_HASH,
      actionId: `0x${"66".repeat(32)}`,
      nonce: 4n,
      deadline: 6_000,
    });
    expect(typed.primaryType).toBe("RecoveryCancellation");
    expect(typed.message.nonce).toBe(4n);
    expect(typed.message.actionId).toBe(`0x${"66".repeat(32)}`);
  });

  it("builds v4 allocation controls with the exact version-2 domain and asset hash", () => {
    const allocationHash = prizeAllocationHash({
      assetType: 1,
      token: TOKEN,
      tokenId: 0n,
      amount: 25n,
    });
    const typed = buildAllocationActionTypedData({
      chainId: 11155111,
      vault: VAULT,
      round: ROUND,
      prizePlanHash: PLAN_HASH,
      action: 0,
      allocationId: 2n,
      allocationHash,
      recoveryRecipient: RECIPIENT,
      recoveryDelay: 300,
      nonce: 4n,
      deadline: 10_000,
    });
    expect(typed.domain.version).toBe("2");
    expect(typed.primaryType).toBe("AllocationAction");
    expect(typed.message.allocationHash).toBe(allocationHash);
    expect(
      freezeAllocationAction({
        chainId: 11155111,
        vault: VAULT,
        round: ROUND,
        prizePlanHash: PLAN_HASH,
        action: 0,
        allocationId: 2n,
        recoveryRecipient: RECIPIENT,
        recoveryDelay: 300,
        nonce: 4n,
        deadline: 10_000,
        assetType: 1,
        token: TOKEN,
        tokenId: 0n,
        amount: 25n,
      }).digest,
    ).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("freezes v4 delayed excess recovery without allowing payload drift", () => {
    const input = {
      chainId: 11155111,
      vault: VAULT,
      round: ROUND,
      prizePlanHash: PLAN_HASH,
      kind: 0,
      assetType: 1,
      token: TOKEN,
      tokenId: 0n,
      amount: 5n,
      recipient: RECIPIENT,
      expectedRecoveryRecipient: RECIPIENT,
      nonce: 8n,
      deadline: 20_000,
    };
    const typed = buildSafetyActionTypedData(input);
    const frozen = freezeSafetyAction(input);
    expect(typed.domain.version).toBe("2");
    expect(typed.primaryType).toBe("SafetyAction");
    expect(frozen.action).toMatchObject({ amount: 5n, nonce: 8n });
    expect(frozen.actionId).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("uses the 0.1.0 EIP-712 domain for every typed prize safety action", () => {
    const shared = {
      chainId: 11155111,
      vault: VAULT,
      round: ROUND,
      prizePlanHash: PLAN_HASH,
      domainVersion: "3",
    } as const;
    expect(
      buildAllocationActionTypedData({
        ...shared,
        action: 0,
        allocationId: 0n,
        allocationHash: PLAN_HASH,
        recoveryRecipient: RECIPIENT,
        recoveryDelay: 300,
        nonce: 0n,
        deadline: 20_000,
      }).domain.version,
    ).toBe("3");
    expect(
      buildSafetyActionTypedData({
        ...shared,
        kind: 0,
        assetType: 1,
        token: TOKEN,
        tokenId: 0n,
        amount: 1n,
        recipient: RECIPIENT,
        expectedRecoveryRecipient: RECIPIENT,
        nonce: 0n,
        deadline: 20_000,
      }).domain.version,
    ).toBe("3");
    const cancellation = buildSafetyCancellationTypedData({
      ...shared,
      actionId: PLAN_HASH,
      deadline: 20_000,
    });
    expect(cancellation.domain.version).toBe("3");
    expect(cancellation.primaryType).toBe("CancelSafetyAction");
  });
});
