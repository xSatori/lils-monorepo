import { getAddress, isAddress, type Address } from "viem";

import addresses from "./addresses.json";

export const ZERO_ADDRESS =
  "0x0000000000000000000000000000000000000000" as Address;

type RoundAddresses = {
  roundsFactory?: string;
  roundsFactoryGeneration?: number;
  roundsLegacyFactories?: { address: string; generation: number }[];
};

const chainAddresses = addresses as Record<string, RoundAddresses>;

export function getRoundsContracts(chainId: number, v7FactoryAddress?: string) {
  return resolveRoundsContracts(
    chainId,
    chainAddresses[String(chainId)],
    v7FactoryAddress,
  );
}

export function resolveRoundsContracts(
  chainId: number,
  configured: RoundAddresses | undefined,
  v7FactoryAddress?: string,
) {
  const configuredFactory = configured?.roundsFactory as Address | undefined;
  const availableFactory =
    configuredFactory && configuredFactory.toLowerCase() !== ZERO_ADDRESS
      ? configuredFactory
      : undefined;
  const v7Factory =
    chainId === 11_155_111 &&
    (configured?.roundsFactoryGeneration ?? 0) < 8 &&
    v7FactoryAddress &&
    isAddress(v7FactoryAddress) &&
    v7FactoryAddress.toLowerCase() !== ZERO_ADDRESS &&
    v7FactoryAddress.toLowerCase() !== availableFactory?.toLowerCase() &&
    !(configured?.roundsLegacyFactories ?? []).some(
      ({ address }) => address.toLowerCase() === v7FactoryAddress.toLowerCase(),
    )
      ? getAddress(v7FactoryAddress)
      : undefined;
  const factory = v7Factory ?? availableFactory;
  const legacyFactories = (
    v7Factory && availableFactory
      ? [
          {
            address: availableFactory,
            generation: configured?.roundsFactoryGeneration ?? 0,
          },
          ...(configured?.roundsLegacyFactories ?? []),
        ]
      : (configured?.roundsLegacyFactories ?? [])
  )
    .filter(
      ({ address, generation }) =>
        /^0x[0-9a-fA-F]{40}$/.test(address) &&
        address.toLowerCase() !== ZERO_ADDRESS &&
        address.toLowerCase() !== factory?.toLowerCase() &&
        Number.isInteger(generation) &&
        generation > 0,
    )
    .map(({ address, generation }) => ({
      address: address as Address,
      generation,
    }));
  return {
    factory,
    factoryGeneration: factory
      ? v7Factory
        ? 7
        : configured?.roundsFactoryGeneration
      : undefined,
    legacyFactories,
  };
}

const roundConfigComponents = [
  { name: "metadataURI", type: "string" },
  { name: "metadataHash", type: "bytes32" },
  { name: "roundStart", type: "uint40" },
  { name: "submissionsOpen", type: "uint40" },
  { name: "submissionsClose", type: "uint40" },
  { name: "votingStart", type: "uint40" },
  { name: "votingEnd", type: "uint40" },
  { name: "votingPowerAdapter", type: "address" },
  { name: "votingStrategy", type: "uint8" },
  { name: "snapshotMode", type: "uint8" },
  { name: "customSnapshotBlock", type: "uint64" },
  { name: "baseOrFixedVotes", type: "uint96" },
  { name: "maxVotesPerSubmission", type: "uint96" },
  { name: "maxSubmissionsPerWallet", type: "uint16" },
  { name: "maxSubmissions", type: "uint16" },
  { name: "winnerCount", type: "uint8" },
  { name: "minTitleLength", type: "uint32" },
  { name: "maxTitleLength", type: "uint32" },
  { name: "minDescriptionLength", type: "uint32" },
  { name: "maxDescriptionLength", type: "uint32" },
] as const;

const prizeAllocationComponents = [
  { name: "winnerRank", type: "uint8" },
  { name: "assetType", type: "uint8" },
  { name: "token", type: "address" },
  { name: "tokenId", type: "uint256" },
  { name: "amount", type: "uint256" },
] as const;

const vaultConfigComponents = [
  { name: "recoveryRecipient", type: "address" },
  { name: "claimPeriod", type: "uint48" },
  { name: "recoveryDelay", type: "uint48" },
  {
    name: "allocations",
    type: "tuple[]",
    components: prizeAllocationComponents,
  },
] as const;

export const roundFactoryAbi = [
  {
    type: "function",
    name: "creationFee",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "treasury",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "paused",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "testMode",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "votingPowerAdapter",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "activeImplementationVersion",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint32" }],
  },
  {
    type: "function",
    name: "globalAdmins",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address[2]" }],
  },
  {
    type: "function",
    name: "implementations",
    stateMutability: "view",
    inputs: [{ name: "version", type: "uint32" }],
    outputs: [{ name: "implementation", type: "address" }],
  },
  {
    type: "function",
    name: "roundCount",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "getRounds",
    stateMutability: "view",
    inputs: [
      { name: "offset", type: "uint256" },
      { name: "limit", type: "uint256" },
    ],
    outputs: [
      {
        name: "records",
        type: "tuple[]",
        components: [
          { name: "round", type: "address" },
          { name: "creator", type: "address" },
          { name: "implementationVersion", type: "uint32" },
          { name: "configurationHash", type: "bytes32" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "createRound",
    stateMutability: "payable",
    inputs: [
      { name: "config", type: "tuple", components: roundConfigComponents },
      { name: "callerSalt", type: "bytes32" },
    ],
    outputs: [{ name: "round", type: "address" }],
  },
  {
    type: "event",
    name: "RoundCreated",
    anonymous: false,
    inputs: [
      { name: "round", type: "address", indexed: true },
      { name: "creator", type: "address", indexed: true },
      { name: "implementationVersion", type: "uint32", indexed: true },
      { name: "creatorNonce", type: "uint256", indexed: false },
      { name: "configurationHash", type: "bytes32", indexed: false },
      { name: "deploymentSalt", type: "bytes32", indexed: false },
    ],
  },
] as const;

export const roundFactoryV3Abi = [
  ...roundFactoryAbi.filter(
    (item) =>
      item.type === "function" &&
      item.name !== "getRounds" &&
      item.name !== "createRound" &&
      item.name !== "implementations",
  ),
  {
    type: "function",
    name: "implementations",
    stateMutability: "view",
    inputs: [{ name: "version", type: "uint32" }],
    outputs: [
      { name: "roundImplementation", type: "address" },
      { name: "vaultImplementation", type: "address" },
    ],
  },
  {
    type: "function",
    name: "getRounds",
    stateMutability: "view",
    inputs: [
      { name: "offset", type: "uint256" },
      { name: "limit", type: "uint256" },
    ],
    outputs: [
      {
        name: "records",
        type: "tuple[]",
        components: [
          { name: "round", type: "address" },
          { name: "prizeVault", type: "address" },
          { name: "creator", type: "address" },
          { name: "implementationVersion", type: "uint32" },
          { name: "configurationHash", type: "bytes32" },
          { name: "prizePlanHash", type: "bytes32" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "createRound",
    stateMutability: "payable",
    inputs: [
      { name: "config", type: "tuple", components: roundConfigComponents },
      { name: "vaultConfig", type: "tuple", components: vaultConfigComponents },
      { name: "callerSalt", type: "bytes32" },
    ],
    outputs: [
      { name: "round", type: "address" },
      { name: "prizeVault", type: "address" },
    ],
  },
  {
    type: "event",
    name: "RoundCreated",
    anonymous: false,
    inputs: [
      { name: "round", type: "address", indexed: true },
      { name: "prizeVault", type: "address", indexed: true },
      { name: "creator", type: "address", indexed: true },
      { name: "implementationVersion", type: "uint32", indexed: false },
      { name: "creatorNonce", type: "uint256", indexed: false },
      { name: "configurationHash", type: "bytes32", indexed: false },
      { name: "prizePlanHash", type: "bytes32", indexed: false },
      { name: "roundSalt", type: "bytes32", indexed: false },
      { name: "vaultSalt", type: "bytes32", indexed: false },
    ],
  },
] as const;

export const roundFactoryV8Abi = [
  ...roundFactoryV3Abi.filter((item) => item.name !== "globalAdmins"),
  {
    type: "function",
    name: "globalAdmin",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "isGlobalAdmin",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "bool" }],
  },
] as const;

export const getRoundFactoryAbi = (generation?: number) =>
  generation && generation >= 8
    ? roundFactoryV8Abi
    : generation && generation >= 3
      ? roundFactoryV3Abi
      : roundFactoryAbi;

export const roundAbi = [
  ...[
    ["factory", "address"],
    ["creator", "address"],
    ["deployedImplementationVersion", "uint32"],
    ["configurationHash", "bytes32"],
    ["creationTimestamp", "uint40"],
    ["metadataURI", "string"],
    ["metadataHash", "bytes32"],
    ["roundStart", "uint40"],
    ["submissionsOpen", "uint40"],
    ["submissionsClose", "uint40"],
    ["votingStart", "uint40"],
    ["votingEnd", "uint40"],
    ["votingPowerAdapter", "address"],
    ["votingStrategy", "uint8"],
    ["snapshotMode", "uint8"],
    ["configuredSnapshotBlock", "uint64"],
    ["snapshotBlock", "uint64"],
    ["baseOrFixedVotes", "uint96"],
    ["maxVotesPerSubmission", "uint96"],
    ["maxSubmissionsPerWallet", "uint16"],
    ["maxSubmissions", "uint16"],
    ["winnerCount", "uint8"],
    ["minTitleLength", "uint32"],
    ["maxTitleLength", "uint32"],
    ["minDescriptionLength", "uint32"],
    ["maxDescriptionLength", "uint32"],
    ["snapshotCaptured", "bool"],
    ["finalized", "bool"],
    ["archived", "bool"],
    ["submissionCount", "uint256"],
    ["roundAdminCount", "uint256"],
    ["prizeVault", "address"],
    ["prizePlanHash", "bytes32"],
    ["finalizedAt", "uint40"],
  ].map(([name, type]) => ({
    type: "function",
    name,
    stateMutability: "view",
    inputs: [],
    outputs: [{ type }],
  })),
  {
    type: "function",
    name: "lifecycleState",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8" }],
  },
  {
    type: "function",
    name: "getSubmission",
    stateMutability: "view",
    inputs: [{ name: "submissionId", type: "uint256" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "owner", type: "address" },
          { name: "submissionType", type: "uint8" },
          { name: "status", type: "uint8" },
          { name: "createdAt", type: "uint40" },
          { name: "titleLength", type: "uint32" },
          { name: "descriptionLength", type: "uint32" },
          { name: "titleHash", type: "bytes32" },
          { name: "descriptionHash", type: "bytes32" },
          { name: "metadataURI", type: "string" },
          { name: "metadataHash", type: "bytes32" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "submissionVoteTotals",
    stateMutability: "view",
    inputs: [{ type: "uint256" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "usedVotes",
    stateMutability: "view",
    inputs: [{ type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "voterSubmissionVotes",
    stateMutability: "view",
    inputs: [{ type: "address" }, { type: "uint256" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "remainingVotes",
    stateMutability: "view",
    inputs: [{ type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "votingLimit",
    stateMutability: "view",
    inputs: [{ type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "isRoundAdmin",
    stateMutability: "view",
    inputs: [{ type: "address" }],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "getWinners",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256[]" }],
  },
  {
    type: "function",
    name: "submit",
    stateMutability: "nonpayable",
    inputs: [
      { name: "submissionType", type: "uint8" },
      { name: "title", type: "string" },
      { name: "description", type: "string" },
      { name: "uri", type: "string" },
      { name: "contentHash", type: "bytes32" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "moderateSubmission",
    stateMutability: "nonpayable",
    inputs: [
      { name: "submissionId", type: "uint256" },
      { name: "status", type: "uint8" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "grantRoundAdmin",
    stateMutability: "nonpayable",
    inputs: [{ name: "account", type: "address" }],
    outputs: [],
  },
  {
    type: "function",
    name: "revokeRoundAdmin",
    stateMutability: "nonpayable",
    inputs: [{ name: "account", type: "address" }],
    outputs: [],
  },
  {
    type: "function",
    name: "captureSnapshot",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [{ type: "uint64" }],
  },
  {
    type: "function",
    name: "castVotes",
    stateMutability: "nonpayable",
    inputs: [
      { name: "submissionIds", type: "uint256[]" },
      { name: "amounts", type: "uint256[]" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "finalize",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [{ type: "uint256[]" }],
  },
  {
    type: "function",
    name: "archive",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    type: "event",
    name: "RoundAdminGranted",
    anonymous: false,
    inputs: [
      { name: "account", type: "address", indexed: true },
      { name: "creator", type: "address", indexed: true },
    ],
  },
  {
    type: "event",
    name: "RoundAdminRevoked",
    anonymous: false,
    inputs: [
      { name: "account", type: "address", indexed: true },
      { name: "creator", type: "address", indexed: true },
    ],
  },
  {
    type: "event",
    name: "SubmissionModerated",
    anonymous: false,
    inputs: [
      { name: "submissionId", type: "uint256", indexed: true },
      { name: "previousStatus", type: "uint8", indexed: true },
      { name: "newStatus", type: "uint8", indexed: true },
      { name: "moderator", type: "address", indexed: false },
    ],
  },
  {
    type: "event",
    name: "VotesCast",
    anonymous: false,
    inputs: [
      { name: "voter", type: "address", indexed: true },
      { name: "submissionId", type: "uint256", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "voterSubmissionTotal", type: "uint256", indexed: false },
      { name: "submissionTotal", type: "uint256", indexed: false },
    ],
  },
] as const;

const roundV5SubmissionComponents = [
  { name: "owner", type: "address" },
  { name: "submissionType", type: "uint8" },
  { name: "status", type: "uint8" },
  { name: "createdAt", type: "uint40" },
  { name: "titleLength", type: "uint32" },
  { name: "descriptionLength", type: "uint32" },
  { name: "originalImageCount", type: "uint8" },
  { name: "titleHash", type: "bytes32" },
  { name: "descriptionHash", type: "bytes32" },
  { name: "metadataURI", type: "string" },
  { name: "metadataHash", type: "bytes32" },
] as const;

export const roundV5Abi = [
  ...roundAbi.filter(
    (item) =>
      !(
        item.type === "function" &&
        ["getSubmission", "submit"].includes(item.name)
      ),
  ),
  {
    type: "function",
    name: "getSubmission",
    stateMutability: "view",
    inputs: [{ name: "submissionId", type: "uint256" }],
    outputs: [{ type: "tuple", components: roundV5SubmissionComponents }],
  },
  {
    type: "function",
    name: "submit",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "input",
        type: "tuple",
        components: [
          { name: "submissionType", type: "uint8" },
          { name: "title", type: "string" },
          { name: "description", type: "string" },
          { name: "metadataURI", type: "string" },
          { name: "metadataHash", type: "bytes32" },
          { name: "originalImageCount", type: "uint8" },
        ],
      },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "imageRevisionNonce",
    stateMutability: "view",
    inputs: [{ name: "submissionId", type: "uint256" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "submissionImageCount",
    stateMutability: "view",
    inputs: [{ name: "submissionId", type: "uint256" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "getSubmissionImage",
    stateMutability: "view",
    inputs: [
      { name: "submissionId", type: "uint256" },
      { name: "index", type: "uint256" },
    ],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "imageURI", type: "string" },
          { name: "imageHash", type: "bytes32" },
          { name: "signerA", type: "address" },
          { name: "signerB", type: "address" },
          { name: "executor", type: "address" },
          { name: "appendedAt", type: "uint40" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "hashSubmissionImage",
    stateMutability: "view",
    inputs: [
      { name: "submissionId", type: "uint256" },
      { name: "imageURI", type: "string" },
      { name: "imageHash", type: "bytes32" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ],
    outputs: [{ type: "bytes32" }],
  },
  {
    type: "function",
    name: "appendSubmissionImage",
    stateMutability: "nonpayable",
    inputs: [
      { name: "submissionId", type: "uint256" },
      { name: "imageURI", type: "string" },
      { name: "imageHash", type: "bytes32" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint256" },
      {
        name: "approvalA",
        type: "tuple",
        components: [
          { name: "signer", type: "address" },
          { name: "signature", type: "bytes" },
        ],
      },
      {
        name: "approvalB",
        type: "tuple",
        components: [
          { name: "signer", type: "address" },
          { name: "signature", type: "bytes" },
        ],
      },
    ],
    outputs: [],
  },
  {
    type: "event",
    name: "SubmissionCreated",
    anonymous: false,
    inputs: [
      { name: "submissionId", type: "uint256", indexed: true },
      { name: "owner", type: "address", indexed: true },
      { name: "submissionType", type: "uint8", indexed: true },
      { name: "titleHash", type: "bytes32", indexed: false },
      { name: "descriptionHash", type: "bytes32", indexed: false },
      { name: "titleLength", type: "uint32", indexed: false },
      { name: "descriptionLength", type: "uint32", indexed: false },
      { name: "originalImageCount", type: "uint8", indexed: false },
      { name: "metadataURI", type: "string", indexed: false },
      { name: "metadataHash", type: "bytes32", indexed: false },
    ],
  },
  {
    type: "event",
    name: "SubmissionImageAppended",
    anonymous: false,
    inputs: [
      { name: "submissionId", type: "uint256", indexed: true },
      { name: "revision", type: "uint256", indexed: false },
      { name: "signerA", type: "address", indexed: true },
      { name: "signerB", type: "address", indexed: true },
      { name: "executor", type: "address", indexed: false },
      { name: "imageURI", type: "string", indexed: false },
      { name: "imageHash", type: "bytes32", indexed: false },
    ],
  },
] as const;

export const roundV6Abi = [
  ...roundV5Abi,
  {
    type: "function",
    name: "scheduleConfigured",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "setSchedule",
    stateMutability: "nonpayable",
    inputs: [
      { name: "submissionsOpen", type: "uint40" },
      { name: "submissionsClose", type: "uint40" },
      { name: "votingStart", type: "uint40" },
      { name: "votingEnd", type: "uint40" },
    ],
    outputs: [],
  },
  {
    type: "event",
    name: "ScheduleUpdated",
    anonymous: false,
    inputs: [
      { name: "submissionsOpen", type: "uint40", indexed: false },
      { name: "submissionsClose", type: "uint40", indexed: false },
      { name: "votingStart", type: "uint40", indexed: false },
      { name: "votingEnd", type: "uint40", indexed: false },
      { name: "admin", type: "address", indexed: true },
    ],
  },
] as const;

export const roundV8Abi = [
  ...roundV6Abi.filter(
    (item) => item.name !== "captureSnapshot" && item.name !== "finalize",
  ),
  {
    type: "function",
    name: "finalizationCursor",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "finalizeBatch",
    stateMutability: "nonpayable",
    inputs: [{ name: "maxEntries", type: "uint256" }],
    outputs: [
      { name: "nextCursor", type: "uint256" },
      { name: "complete", type: "bool" },
    ],
  },
] as const;

export const getRoundAbi = (implementationVersion: number) =>
  implementationVersion >= 8
    ? roundV8Abi
    : implementationVersion >= 6
      ? roundV6Abi
      : implementationVersion >= 5
        ? roundV5Abi
        : roundAbi;

export const prizeVaultAbi = [
  {
    type: "event",
    name: "PrizeFunded",
    inputs: [
      { name: "depositor", type: "address", indexed: true },
      { name: "assetType", type: "uint8", indexed: true },
      { name: "token", type: "address", indexed: true },
      { name: "tokenId", type: "uint256", indexed: false },
      { name: "amount", type: "uint256", indexed: false },
      { name: "assetFunded", type: "uint256", indexed: false },
      { name: "assetLiability", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "ContributionRefunded",
    inputs: [
      { name: "depositor", type: "address", indexed: true },
      { name: "assetType", type: "uint8", indexed: true },
      { name: "token", type: "address", indexed: true },
      { name: "tokenId", type: "uint256", indexed: false },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "PrizePlanSealed",
    inputs: [{ name: "caller", type: "address", indexed: true }],
  },
  {
    type: "event",
    name: "PrizePlanCanceled",
    inputs: [{ name: "caller", type: "address", indexed: true }],
  },
  {
    type: "event",
    name: "PrizeReleased",
    inputs: [
      { name: "allocationId", type: "uint256", indexed: true },
      { name: "winnerRank", type: "uint8", indexed: true },
      { name: "recipient", type: "address", indexed: true },
      { name: "assetType", type: "uint8", indexed: false },
      { name: "token", type: "address", indexed: false },
      { name: "tokenId", type: "uint256", indexed: false },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "RecoveryQueued",
    inputs: [
      { name: "actionId", type: "bytes32", indexed: true },
      { name: "nonce", type: "uint256", indexed: true },
      { name: "signerOne", type: "address", indexed: true },
      { name: "signerTwo", type: "address", indexed: false },
      { name: "executeAfter", type: "uint48", indexed: false },
    ],
  },
  {
    type: "event",
    name: "RecoveryExecuted",
    inputs: [
      { name: "actionId", type: "bytes32", indexed: true },
      { name: "recipient", type: "address", indexed: true },
    ],
  },
  {
    type: "event",
    name: "RecoveryCanceled",
    inputs: [
      { name: "actionId", type: "bytes32", indexed: true },
      { name: "nonce", type: "uint256", indexed: true },
    ],
  },
  {
    type: "event",
    name: "RecoveryExpired",
    inputs: [{ name: "actionId", type: "bytes32", indexed: true }],
  },
  {
    type: "event",
    name: "RecoveryRecipientUpdated",
    inputs: [
      { name: "previousRecipient", type: "address", indexed: true },
      { name: "newRecipient", type: "address", indexed: true },
    ],
  },
  {
    type: "event",
    name: "AllocationHeldStateSet",
    inputs: [
      { name: "allocationId", type: "uint256", indexed: true },
      { name: "held", type: "bool", indexed: true },
      { name: "signerOne", type: "address", indexed: true },
      { name: "signerTwo", type: "address", indexed: false },
      { name: "nonce", type: "uint256", indexed: false },
      { name: "heldAt", type: "uint48", indexed: false },
    ],
  },
  {
    type: "event",
    name: "AllocationReclaimed",
    inputs: [
      { name: "allocationId", type: "uint256", indexed: true },
      { name: "recipient", type: "address", indexed: true },
      { name: "signerOne", type: "address", indexed: true },
      { name: "signerTwo", type: "address", indexed: false },
      { name: "nonce", type: "uint256", indexed: false },
      { name: "assetType", type: "uint8", indexed: false },
      { name: "token", type: "address", indexed: false },
      { name: "tokenId", type: "uint256", indexed: false },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "SafetyActionQueued",
    inputs: [
      { name: "actionId", type: "bytes32", indexed: true },
      { name: "kind", type: "uint8", indexed: true },
      { name: "nonce", type: "uint256", indexed: true },
      { name: "signerOne", type: "address", indexed: false },
      { name: "signerTwo", type: "address", indexed: false },
      { name: "executeAfter", type: "uint48", indexed: false },
    ],
  },
  {
    type: "event",
    name: "SafetyActionExecuted",
    inputs: [
      { name: "actionId", type: "bytes32", indexed: true },
      { name: "kind", type: "uint8", indexed: true },
      { name: "recipient", type: "address", indexed: true },
    ],
  },
  ...[
    ["round", "address"],
    ["factory", "address"],
    ["recoveryRecipient", "address"],
    ["prizePlanHash", "bytes32"],
    ["claimPeriod", "uint48"],
    ["recoveryDelay", "uint48"],
    ["state", "uint8"],
    ["allocationCount", "uint256"],
    ["recoveryNonce", "uint256"],
    ["cancellationNonce", "uint256"],
  ].map(([name, type]) => ({
    type: "function",
    name,
    stateMutability: "view",
    inputs: [],
    outputs: [{ type }],
  })),
  {
    type: "function",
    name: "getAllocation",
    stateMutability: "view",
    inputs: [{ name: "allocationId", type: "uint256" }],
    outputs: [
      {
        type: "tuple",
        components: [
          ...prizeAllocationComponents,
          { name: "claimed", type: "bool" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "assetKey",
    stateMutability: "pure",
    inputs: [
      { name: "assetType", type: "uint8" },
      { name: "token", type: "address" },
      { name: "tokenId", type: "uint256" },
    ],
    outputs: [{ type: "bytes32" }],
  },
  {
    type: "function",
    name: "fundedByAsset",
    stateMutability: "view",
    inputs: [{ type: "bytes32" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "liabilityByAsset",
    stateMutability: "view",
    inputs: [{ type: "bytes32" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "recoverableBalance",
    stateMutability: "view",
    inputs: [
      { name: "assetType", type: "uint8" },
      { name: "token", type: "address" },
      { name: "tokenId", type: "uint256" },
    ],
    outputs: [{ type: "uint256" }],
  },
  ...[
    ["safetyNonce", "uint256"],
    ["distributionAvailableAt", "uint256"],
  ].map(([name, type]) => ({
    type: "function",
    name,
    stateMutability: "view",
    inputs: [],
    outputs: [{ type }],
  })),
  ...[
    ["allocationNonces", "uint256"],
    ["isHeld", "bool"],
    ["heldAt", "uint48"],
    ["isReclaimed", "bool"],
  ].map(([name, type]) => ({
    type: "function",
    name,
    stateMutability: "view",
    inputs: [{ name: "allocationId", type: "uint256" }],
    outputs: [{ type }],
  })),
  {
    type: "function",
    name: "fundNative",
    stateMutability: "payable",
    inputs: [],
    outputs: [],
  },
  {
    type: "function",
    name: "fundERC1155Batch",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "tokenIds", type: "uint256[]" },
      { name: "amounts", type: "uint256[]" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "refundContribution",
    stateMutability: "nonpayable",
    inputs: [
      { name: "assetType", type: "uint8" },
      { name: "token", type: "address" },
      { name: "tokenId", type: "uint256" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "cancelUnfunded",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    type: "function",
    name: "fundERC20",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "requestedAmount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "fundERC721",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "tokenId", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "fundERC1155",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "tokenId", type: "uint256" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "seal",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    type: "function",
    name: "release",
    stateMutability: "nonpayable",
    inputs: [{ name: "allocationId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "claim",
    stateMutability: "nonpayable",
    inputs: [{ name: "allocationId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "claimNonces",
    stateMutability: "view",
    inputs: [{ name: "winner", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "claimTo",
    stateMutability: "nonpayable",
    inputs: [
      { name: "allocationId", type: "uint256" },
      { name: "recipient", type: "address" },
      { name: "deadline", type: "uint48" },
      { name: "signature", type: "bytes" },
    ],
    outputs: [],
  },
  ...["hold", "unhold", "reclaim"].map((name) => ({
    type: "function",
    name,
    stateMutability: "nonpayable",
    inputs: [
      { name: "allocationId", type: "uint256" },
      { name: "deadline", type: "uint48" },
      { name: "signerOne", type: "address" },
      { name: "signatureOne", type: "bytes" },
      { name: "signerTwo", type: "address" },
      { name: "signatureTwo", type: "bytes" },
    ],
    outputs: [],
  })),
  {
    type: "function",
    name: "queueSafetyAction",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "action",
        type: "tuple",
        components: [
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
      { name: "signerOne", type: "address" },
      { name: "signatureOne", type: "bytes" },
      { name: "signerTwo", type: "address" },
      { name: "signatureTwo", type: "bytes" },
    ],
    outputs: [{ name: "actionId", type: "bytes32" }],
  },
  {
    type: "function",
    name: "executeSafetyAction",
    stateMutability: "nonpayable",
    inputs: [{ name: "actionId", type: "bytes32" }],
    outputs: [],
  },
  {
    type: "function",
    name: "hashSafetyCancellation",
    stateMutability: "view",
    inputs: [
      { name: "actionId", type: "bytes32" },
      { name: "deadline", type: "uint48" },
    ],
    outputs: [{ type: "bytes32" }],
  },
  {
    type: "function",
    name: "cancelSafetyAction",
    stateMutability: "nonpayable",
    inputs: [
      { name: "actionId", type: "bytes32" },
      { name: "deadline", type: "uint48" },
      { name: "signerOne", type: "address" },
      { name: "signatureOne", type: "bytes" },
      { name: "signerTwo", type: "address" },
      { name: "signatureTwo", type: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "queueRecovery",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "action",
        type: "tuple",
        components: [
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
      { name: "signerOne", type: "address" },
      { name: "signatureOne", type: "bytes" },
      { name: "signerTwo", type: "address" },
      { name: "signatureTwo", type: "bytes" },
    ],
    outputs: [{ name: "actionId", type: "bytes32" }],
  },
  {
    type: "function",
    name: "cancelRecovery",
    stateMutability: "nonpayable",
    inputs: [
      { name: "actionId", type: "bytes32" },
      { name: "deadline", type: "uint48" },
      { name: "signerOne", type: "address" },
      { name: "signatureOne", type: "bytes" },
      { name: "signerTwo", type: "address" },
      { name: "signatureTwo", type: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "executeRecovery",
    stateMutability: "nonpayable",
    inputs: [{ name: "actionId", type: "bytes32" }],
    outputs: [],
  },
  {
    type: "function",
    name: "expireRecovery",
    stateMutability: "nonpayable",
    inputs: [{ name: "actionId", type: "bytes32" }],
    outputs: [],
  },
] as const;

export const prizeErc20Abi = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
] as const;

export const prizeErc721Abi = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "tokenId", type: "uint256" },
    ],
    outputs: [],
  },
] as const;

export const prizeErc1155Abi = [
  {
    type: "function",
    name: "setApprovalForAll",
    stateMutability: "nonpayable",
    inputs: [
      { name: "operator", type: "address" },
      { name: "approved", type: "bool" },
    ],
    outputs: [],
  },
] as const;

export type RoundConfigInput = {
  metadataURI: string;
  metadataHash: `0x${string}`;
  roundStart: number;
  submissionsOpen: number;
  submissionsClose: number;
  votingStart: number;
  votingEnd: number;
  votingPowerAdapter: Address;
  votingStrategy: number;
  snapshotMode: number;
  customSnapshotBlock: bigint;
  baseOrFixedVotes: bigint;
  maxVotesPerSubmission: bigint;
  maxSubmissionsPerWallet: number;
  maxSubmissions: number;
  winnerCount: number;
  minTitleLength: number;
  maxTitleLength: number;
  minDescriptionLength: number;
  maxDescriptionLength: number;
};

export type PrizeAllocationInput = {
  winnerRank: number;
  assetType: number;
  token: Address;
  tokenId: bigint;
  amount: bigint;
};

export type VaultConfigInput = {
  recoveryRecipient: Address;
  claimPeriod: number;
  recoveryDelay: number;
  allocations: PrizeAllocationInput[];
};
