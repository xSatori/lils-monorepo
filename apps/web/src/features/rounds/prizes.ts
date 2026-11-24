import {
  encodeAbiParameters,
  hashTypedData,
  isAddress,
  keccak256,
  parseAbiParameters,
  type Address,
  type Hex,
} from "viem";

import { ZERO_ADDRESS, type PrizeAllocationInput } from "./contracts";
import { PrizeAssetType, type PrizeAllocation } from "./types";

export type PrizeAllocationDraft = {
  winnerRank: string;
  assetType: string;
  token: string;
  tokenId: string;
  amount: string;
};

const MAX_UINT256 = (1n << 256n) - 1n;

function parseUint(value: string, label: string) {
  const normalized = value.trim();
  if (!/^\d+$/.test(normalized))
    throw new Error(`${label} must be a whole number.`);
  const parsed = BigInt(normalized);
  if (parsed > MAX_UINT256) throw new Error(`${label} exceeds uint256.`);
  return parsed;
}

export function encodePrizeAllocation(
  draft: PrizeAllocationDraft,
  winnerCount: number,
): PrizeAllocationInput {
  const winnerRank = /^\d+$/.test(draft.winnerRank.trim())
    ? Number(draft.winnerRank)
    : Number.NaN;
  const assetType = Number(draft.assetType);
  if (
    !Number.isSafeInteger(winnerRank) ||
    winnerRank < 0 ||
    winnerRank >= winnerCount
  )
    throw new Error(
      "Prize winner rank is outside the configured winner count.",
    );
  if (!Number.isSafeInteger(assetType) || assetType < 0 || assetType > 3)
    throw new Error("Prize asset type is invalid.");
  const token =
    assetType === PrizeAssetType.Native ? ZERO_ADDRESS : draft.token;
  if (
    assetType !== PrizeAssetType.Native &&
    (!isAddress(token) || token.toLowerCase() === ZERO_ADDRESS.toLowerCase())
  )
    throw new Error("Token prizes require a valid non-zero contract address.");
  const tokenId =
    assetType < PrizeAssetType.Erc721
      ? 0n
      : parseUint(draft.tokenId, "Token ID");
  const amount =
    assetType === PrizeAssetType.Erc721
      ? 1n
      : parseUint(draft.amount, "Prize amount");
  if (amount <= 0n) throw new Error("Prize amount must be positive.");
  return { winnerRank, assetType, token: token as Address, tokenId, amount };
}

export function encodePrizePlacementAllocation(
  draft: PrizeAllocationDraft,
  winnerCount: number,
) {
  const placement = /^\d+$/.test(draft.winnerRank.trim())
    ? Number(draft.winnerRank)
    : Number.NaN;
  if (
    !Number.isSafeInteger(placement) ||
    placement < 1 ||
    placement > winnerCount
  )
    throw new Error("Prize placement is outside the configured winner count.");
  return encodePrizeAllocation(
    { ...draft, winnerRank: String(placement - 1) },
    winnerCount,
  );
}

export function prizeFundingStatus(
  planned: bigint,
  funded: bigint,
  claimed = false,
) {
  if (claimed) return "claimed" as const;
  if (funded === 0n) return "unfunded" as const;
  if (funded < planned) return "partial" as const;
  if (funded === planned) return "funded" as const;
  return "excess" as const;
}

export function outstandingPrizeGroups(
  allocations: Pick<
    PrizeAllocation,
    "assetType" | "token" | "tokenId" | "liability" | "funded"
  >[],
) {
  return [
    PrizeAssetType.Native,
    PrizeAssetType.Erc20,
    PrizeAssetType.Erc721,
    PrizeAssetType.Erc1155,
  ].flatMap((assetType) => {
    const assets = new Map<
      string,
      { token: Address; tokenId: bigint; remaining: bigint }
    >();
    for (const allocation of allocations) {
      if (allocation.assetType !== assetType) continue;
      const remaining =
        allocation.liability > allocation.funded
          ? allocation.liability - allocation.funded
          : 0n;
      const key = `${allocation.token.toLowerCase()}:${allocation.tokenId}`;
      const current = assets.get(key);
      // RPC exposes funded and liability totals by asset key on every allocation.
      // Keep one value per key so repeated ETH or token prizes are not double-counted.
      if (!current || remaining > current.remaining)
        assets.set(key, {
          token: allocation.token,
          tokenId: allocation.tokenId,
          remaining,
        });
    }
    if (!assets.size) return [];
    const items = [...assets.values()];
    const totalRemaining = items.reduce(
      (sum, item) => sum + item.remaining,
      0n,
    );
    return [
      {
        assetType,
        items,
        totalRemaining,
        complete: totalRemaining === 0n,
      },
    ];
  });
}

export function buildRecoveryTypedData(input: {
  chainId: number;
  vault: Address;
  round: Address;
  prizePlanHash: Hex;
  kind: number;
  assetType: number;
  token: Address;
  tokenId: bigint;
  amount: bigint;
  recipient: Address;
  allocationId: bigint;
  nonce: bigint;
  validAfter: number;
  deadline: number;
}) {
  return {
    domain: {
      name: "LilNounsRoundPrizeVault",
      version: "1",
      chainId: input.chainId,
      verifyingContract: input.vault,
    },
    primaryType: "RecoveryAction" as const,
    types: {
      RecoveryAction: [
        { name: "vault", type: "address" },
        { name: "round", type: "address" },
        { name: "prizePlanHash", type: "bytes32" },
        { name: "kind", type: "uint8" },
        { name: "assetType", type: "uint8" },
        { name: "token", type: "address" },
        { name: "tokenId", type: "uint256" },
        { name: "amount", type: "uint256" },
        { name: "recipient", type: "address" },
        { name: "allocationId", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "validAfter", type: "uint48" },
        { name: "deadline", type: "uint48" },
      ],
    },
    message: {
      vault: input.vault,
      round: input.round,
      prizePlanHash: input.prizePlanHash,
      kind: input.kind,
      assetType: input.assetType,
      token: input.token,
      tokenId: input.tokenId,
      amount: input.amount,
      recipient: input.recipient,
      allocationId: input.allocationId,
      nonce: input.nonce,
      validAfter: input.validAfter,
      deadline: input.deadline,
    },
  };
}

export function freezeRecoveryDraft(
  input: Parameters<typeof buildRecoveryTypedData>[0],
) {
  const typedData = buildRecoveryTypedData(input);
  return {
    action: {
      kind: input.kind,
      assetType: input.assetType,
      token: input.token,
      tokenId: input.tokenId,
      amount: input.amount,
      recipient: input.recipient,
      allocationId: input.allocationId,
      nonce: input.nonce,
      validAfter: input.validAfter,
      deadline: input.deadline,
    },
    typedData,
    actionId: hashTypedData(typedData),
  };
}

export function buildRecoveryCancellationTypedData(input: {
  chainId: number;
  vault: Address;
  round: Address;
  prizePlanHash: Hex;
  actionId: Hex;
  nonce: bigint;
  deadline: number;
}) {
  return {
    domain: {
      name: "LilNounsRoundPrizeVault",
      version: "1",
      chainId: input.chainId,
      verifyingContract: input.vault,
    },
    primaryType: "RecoveryCancellation" as const,
    types: {
      RecoveryCancellation: [
        { name: "vault", type: "address" },
        { name: "round", type: "address" },
        { name: "prizePlanHash", type: "bytes32" },
        { name: "actionId", type: "bytes32" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint48" },
      ],
    },
    message: {
      vault: input.vault,
      round: input.round,
      prizePlanHash: input.prizePlanHash,
      actionId: input.actionId,
      nonce: input.nonce,
      deadline: input.deadline,
    },
  };
}

export function buildClaimTypedData(input: {
  chainId: number;
  vault: Address;
  round: Address;
  prizePlanHash: Hex;
  allocationId: bigint;
  assetType: number;
  token: Address;
  tokenId: bigint;
  amount: bigint;
  recipient: Address;
  nonce: bigint;
  deadline: number;
  domainVersion?: "1" | "2" | "3";
}) {
  return {
    domain: {
      name: "LilNounsRoundPrizeVault",
      version: input.domainVersion ?? "1",
      chainId: input.chainId,
      verifyingContract: input.vault,
    },
    primaryType: "ClaimAuthorization" as const,
    types: {
      ClaimAuthorization: [
        { name: "vault", type: "address" },
        { name: "round", type: "address" },
        { name: "prizePlanHash", type: "bytes32" },
        { name: "allocationId", type: "uint256" },
        { name: "assetType", type: "uint8" },
        { name: "token", type: "address" },
        { name: "tokenId", type: "uint256" },
        { name: "amount", type: "uint256" },
        { name: "recipient", type: "address" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint48" },
      ],
    },
    message: {
      vault: input.vault,
      round: input.round,
      prizePlanHash: input.prizePlanHash,
      allocationId: input.allocationId,
      assetType: input.assetType,
      token: input.token,
      tokenId: input.tokenId,
      amount: input.amount,
      recipient: input.recipient,
      nonce: input.nonce,
      deadline: input.deadline,
    },
  };
}

export function prizeAllocationHash(input: {
  assetType: number;
  token: Address;
  tokenId: bigint;
  amount: bigint;
}) {
  return keccak256(
    encodeAbiParameters(
      parseAbiParameters(
        "uint8 assetType, address token, uint256 tokenId, uint256 amount",
      ),
      [input.assetType, input.token, input.tokenId, input.amount],
    ),
  );
}

export function buildAllocationActionTypedData(input: {
  chainId: number;
  vault: Address;
  round: Address;
  prizePlanHash: Hex;
  action: number;
  allocationId: bigint;
  allocationHash: Hex;
  recoveryRecipient: Address;
  recoveryDelay: number;
  nonce: bigint;
  deadline: number;
  domainVersion?: "2" | "3";
}) {
  return {
    domain: {
      name: "LilNounsRoundPrizeVault",
      version: input.domainVersion ?? "2",
      chainId: input.chainId,
      verifyingContract: input.vault,
    },
    primaryType: "AllocationAction" as const,
    types: {
      AllocationAction: [
        { name: "vault", type: "address" },
        { name: "round", type: "address" },
        { name: "prizePlanHash", type: "bytes32" },
        { name: "action", type: "uint8" },
        { name: "allocationId", type: "uint256" },
        { name: "allocationHash", type: "bytes32" },
        { name: "recoveryRecipient", type: "address" },
        { name: "recoveryDelay", type: "uint48" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint48" },
      ],
    },
    message: input,
  };
}

export function freezeAllocationAction(
  input: Omit<
    Parameters<typeof buildAllocationActionTypedData>[0],
    "allocationHash"
  > & {
    assetType: number;
    token: Address;
    tokenId: bigint;
    amount: bigint;
  },
) {
  const allocationHash = prizeAllocationHash(input);
  const typedData = buildAllocationActionTypedData({
    chainId: input.chainId,
    vault: input.vault,
    round: input.round,
    prizePlanHash: input.prizePlanHash,
    action: input.action,
    allocationId: input.allocationId,
    allocationHash,
    recoveryRecipient: input.recoveryRecipient,
    recoveryDelay: input.recoveryDelay,
    nonce: input.nonce,
    deadline: input.deadline,
    domainVersion: input.domainVersion,
  });
  return {
    typedData,
    digest: hashTypedData(typedData),
    deadline: input.deadline,
  };
}

export function buildSafetyActionTypedData(input: {
  chainId: number;
  vault: Address;
  round: Address;
  prizePlanHash: Hex;
  kind: number;
  assetType: number;
  token: Address;
  tokenId: bigint;
  amount: bigint;
  recipient: Address;
  expectedRecoveryRecipient: Address;
  nonce: bigint;
  deadline: number;
  domainVersion?: "2" | "3";
}) {
  return {
    domain: {
      name: "LilNounsRoundPrizeVault",
      version: input.domainVersion ?? "2",
      chainId: input.chainId,
      verifyingContract: input.vault,
    },
    primaryType: "SafetyAction" as const,
    types: {
      SafetyAction: [
        { name: "vault", type: "address" },
        { name: "round", type: "address" },
        { name: "prizePlanHash", type: "bytes32" },
        { name: "kind", type: "uint8" },
        { name: "assetType", type: "uint8" },
        { name: "token", type: "address" },
        { name: "tokenId", type: "uint256" },
        { name: "amount", type: "uint256" },
        { name: "recipient", type: "address" },
        { name: "expectedRecoveryRecipient", type: "address" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint48" },
      ],
    },
    message: {
      vault: input.vault,
      round: input.round,
      prizePlanHash: input.prizePlanHash,
      kind: input.kind,
      assetType: input.assetType,
      token: input.token,
      tokenId: input.tokenId,
      amount: input.amount,
      recipient: input.recipient,
      expectedRecoveryRecipient: input.expectedRecoveryRecipient,
      nonce: input.nonce,
      deadline: input.deadline,
    },
  };
}

export function freezeSafetyAction(
  input: Parameters<typeof buildSafetyActionTypedData>[0],
) {
  const typedData = buildSafetyActionTypedData(input);
  return {
    action: {
      kind: input.kind,
      assetType: input.assetType,
      token: input.token,
      tokenId: input.tokenId,
      amount: input.amount,
      recipient: input.recipient,
      expectedRecoveryRecipient: input.expectedRecoveryRecipient,
      nonce: input.nonce,
      deadline: input.deadline,
    },
    typedData,
    actionId: hashTypedData(typedData),
  };
}

export function buildSafetyCancellationTypedData(input: {
  chainId: number;
  vault: Address;
  round: Address;
  prizePlanHash: Hex;
  actionId: Hex;
  deadline: number;
  domainVersion: "3";
}) {
  return {
    domain: {
      name: "LilNounsRoundPrizeVault",
      version: input.domainVersion,
      chainId: input.chainId,
      verifyingContract: input.vault,
    },
    primaryType: "CancelSafetyAction" as const,
    types: {
      CancelSafetyAction: [
        { name: "vault", type: "address" },
        { name: "round", type: "address" },
        { name: "prizePlanHash", type: "bytes32" },
        { name: "actionId", type: "bytes32" },
        { name: "deadline", type: "uint48" },
      ],
    },
    message: {
      vault: input.vault,
      round: input.round,
      prizePlanHash: input.prizePlanHash,
      actionId: input.actionId,
      deadline: input.deadline,
    },
  };
}
