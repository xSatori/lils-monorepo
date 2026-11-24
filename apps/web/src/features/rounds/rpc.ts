import type { Abi, Address, Hex, PublicClient } from "viem";

import { contentHash, fetchMetadata } from "./metadata";
import {
  prizeVaultAbi,
  getRoundAbi,
  getRoundFactoryAbi,
  roundFactoryAbi,
  roundFactoryV3Abi,
} from "./contracts";
import {
  LifecycleState,
  type PrizeVaultActivity,
  type RoundMetadata,
  type PrizeVaultView,
  type RoundRecord,
  type RoundSubmission,
  type RoundView,
  type SubmissionMetadata,
} from "./types";

export type FactoryView = {
  creationFee: bigint;
  treasury: Address;
  paused: boolean;
  testMode: boolean;
  activeImplementationVersion: number;
  roundCount: bigint;
  votingPowerAdapter: Address;
  activeImplementation?: Address;
  activeVaultImplementation?: Address;
  votingToken?: Address;
  globalAdmins: Address[];
};

type IndexedEventLog<TArgs> = {
  args: TArgs;
  blockNumber: bigint | null;
  transactionHash: Hex | null;
  logIndex: number;
};

type RoundAdminEventLog = IndexedEventLog<{ account?: Address }>;
type VotesCastEventLog = IndexedEventLog<{
  voter?: Address;
  submissionId?: bigint;
  amount?: bigint;
  voterSubmissionTotal?: bigint;
  submissionTotal?: bigint;
}>;

async function read<T>(
  client: PublicClient,
  address: Address,
  functionName: string,
  args?: readonly unknown[],
  implementationVersion = 4,
) {
  return client.readContract({
    address,
    abi: getRoundAbi(implementationVersion) as Abi,
    functionName,
    args,
  }) as Promise<T>;
}

export async function getFinalizationCursor(
  client: PublicClient,
  round: Address,
  implementationVersion: number,
): Promise<bigint | undefined> {
  return implementationVersion >= 8
    ? read<bigint>(
        client,
        round,
        "finalizationCursor",
        undefined,
        implementationVersion,
      )
    : undefined;
}

export async function getFactoryView(
  client: PublicClient,
  factory: Address,
  factoryGeneration = 2,
): Promise<FactoryView> {
  const [
    creationFee,
    treasury,
    paused,
    testMode,
    activeImplementationVersion,
    roundCount,
    votingPowerAdapter,
  ] = await Promise.all([
    client.readContract({
      address: factory,
      abi: roundFactoryAbi,
      functionName: "creationFee",
    }),
    client.readContract({
      address: factory,
      abi: roundFactoryAbi,
      functionName: "treasury",
    }),
    client.readContract({
      address: factory,
      abi: roundFactoryAbi,
      functionName: "paused",
    }),
    client.readContract({
      address: factory,
      abi: roundFactoryAbi,
      functionName: "testMode",
    }),
    client.readContract({
      address: factory,
      abi: roundFactoryAbi,
      functionName: "activeImplementationVersion",
    }),
    client.readContract({
      address: factory,
      abi: roundFactoryAbi,
      functionName: "roundCount",
    }),
    client.readContract({
      address: factory,
      abi: roundFactoryAbi,
      functionName: "votingPowerAdapter",
    }),
  ]);
  let activeImplementation: Address | undefined;
  let activeVaultImplementation: Address | undefined;
  let globalAdmins: Address[] = [];
  try {
    const configured = await client.readContract({
      address: factory,
      abi: getRoundFactoryAbi(factoryGeneration) as Abi,
      functionName: "implementations",
      args: [activeImplementationVersion],
    });
    activeImplementation = (
      Array.isArray(configured) ? configured[0] : configured
    ) as Address;
    activeVaultImplementation = Array.isArray(configured)
      ? (configured[1] as Address)
      : undefined;
  } catch {
    // Legacy factories stay usable even when implementation discovery is unavailable.
  }
  if (factoryGeneration >= 8) {
    try {
      globalAdmins = [
        (await client.readContract({
          address: factory,
          abi: getRoundFactoryAbi(factoryGeneration) as Abi,
          functionName: "globalAdmin",
        })) as Address,
      ];
    } catch {
      // Round reads remain available if optional admin discovery fails.
    }
  } else if (factoryGeneration >= 3) {
    try {
      globalAdmins = [
        ...((await client.readContract({
          address: factory,
          abi: roundFactoryAbi,
          functionName: "globalAdmins",
        })) as readonly Address[]),
      ];
    } catch {
      // Older factory generations remain readable without global-admin discovery.
    }
  }

  let votingToken: Address | undefined;
  try {
    votingToken = (await client.readContract({
      address: votingPowerAdapter,
      abi: [
        {
          type: "function",
          name: "TOKEN",
          stateMutability: "view",
          inputs: [],
          outputs: [{ type: "address" }],
        },
      ],
      functionName: "TOKEN",
    })) as Address;
  } catch {
    // A custom adapter may not expose its token; omit that optional explorer link.
  }

  return {
    creationFee,
    treasury,
    paused,
    testMode,
    activeImplementationVersion: Number(activeImplementationVersion),
    roundCount,
    votingPowerAdapter,
    activeImplementation,
    activeVaultImplementation,
    votingToken,
    globalAdmins,
  };
}

/** v1 predates the explicit moderation-review lifecycle member. */
export function normalizeLifecycleState(
  rawState: number,
  implementationVersion: number,
): LifecycleState {
  const normalized =
    implementationVersion === 1 && rawState >= 2 ? rawState + 1 : rawState;
  return normalized as LifecycleState;
}

export function normalizeSubmissionsClose(
  implementationVersion: number,
  submissionsClose: number | undefined,
  votingStart: number,
) {
  return implementationVersion === 1 ? votingStart : submissionsClose!;
}

function normalizeRecord(record: {
  round: Address;
  prizeVault?: Address;
  creator: Address;
  implementationVersion: number;
  configurationHash: Hex;
  prizePlanHash?: Hex;
}): RoundRecord {
  return {
    round: record.round,
    prizeVaultAddress: record.prizeVault,
    creator: record.creator,
    implementationVersion: Number(record.implementationVersion),
    configurationHash: record.configurationHash,
    prizePlanHash: record.prizePlanHash,
  };
}

async function discoverFromEvents(
  client: PublicClient,
  factory: Address,
  factoryGeneration = 2,
): Promise<RoundRecord[]> {
  const factoryAbi =
    factoryGeneration >= 3 ? roundFactoryV3Abi : roundFactoryAbi;
  const logs = await client.getContractEvents({
    address: factory,
    abi: factoryAbi,
    eventName: "RoundCreated",
    fromBlock: 0n,
    toBlock: "latest",
  });
  return logs.flatMap((log) => {
    const args = log.args;
    if (
      !args.round ||
      !args.creator ||
      args.implementationVersion === undefined ||
      !args.configurationHash
    )
      return [];
    return [
      {
        round: args.round,
        prizeVaultAddress: "prizeVault" in args ? args.prizeVault : undefined,
        creator: args.creator,
        implementationVersion: Number(args.implementationVersion),
        configurationHash: args.configurationHash,
        prizePlanHash: "prizePlanHash" in args ? args.prizePlanHash : undefined,
      },
    ];
  });
}

/** Factory storage is authoritative. Events are a rebuildable fallback if paged reads fail. */
export async function discoverRounds(
  client: PublicClient,
  factory: Address,
  factoryGeneration = 2,
): Promise<RoundRecord[]> {
  const factoryAbi =
    factoryGeneration >= 3 ? roundFactoryV3Abi : roundFactoryAbi;
  try {
    const count = await client.readContract({
      address: factory,
      abi: factoryAbi,
      functionName: "roundCount",
    });
    const records: RoundRecord[] = [];
    for (let offset = 0n; offset < count; offset += 50n) {
      const page = await client.readContract({
        address: factory,
        abi: factoryAbi,
        functionName: "getRounds",
        args: [offset, 50n],
      });
      records.push(...page.map(normalizeRecord));
    }
    return records;
  } catch (readError) {
    try {
      return await discoverFromEvents(client, factory, factoryGeneration);
    } catch {
      throw readError;
    }
  }
}

type RawPrizeAllocation =
  | readonly [number, number, Address, bigint, bigint, boolean]
  | {
      winnerRank: number;
      assetType: number;
      token: Address;
      tokenId: bigint;
      amount: bigint;
      claimed: boolean;
    };

/** Viem returns fully named Solidity tuples as objects, while mock clients may return arrays. */
export function normalizePrizeAllocationTuple(value: RawPrizeAllocation) {
  const fields =
    "winnerRank" in value
      ? [
          value.winnerRank,
          value.assetType,
          value.token,
          value.tokenId,
          value.amount,
          value.claimed,
        ]
      : value;
  return {
    winnerRank: Number(fields[0]),
    assetType: Number(fields[1]),
    token: fields[2] as Address,
    tokenId: BigInt(fields[3]),
    amount: BigInt(fields[4]),
    claimed: Boolean(fields[5]),
  };
}

const submissionFields = [
  "owner",
  "submissionType",
  "status",
  "createdAt",
  "titleLength",
  "descriptionLength",
  "titleHash",
  "descriptionHash",
  "metadataURI",
  "metadataHash",
] as const;
const submissionV5Fields = [
  ...submissionFields.slice(0, 6),
  "originalImageCount",
  ...submissionFields.slice(6),
] as const;
const submissionImageFields = [
  "imageURI",
  "imageHash",
  "signerA",
  "signerB",
  "executor",
  "appendedAt",
] as const;

function tupleValues(
  value: readonly unknown[] | Record<string, unknown>,
  names: readonly string[],
) {
  const fields = Array.isArray(value)
    ? value
    : names.map((name) => (value as Record<string, unknown>)[name]);
  if (
    fields.length !== names.length ||
    fields.some((field) => field === undefined)
  ) {
    throw new Error("An onchain tuple is missing required fields.");
  }
  return fields;
}

/** Viem decodes named Solidity struct returns as objects, not positional arrays. */
export function normalizeSubmissionTuple(
  value: readonly unknown[] | Record<string, unknown>,
  implementationVersion: number,
) {
  return tupleValues(
    value,
    implementationVersion >= 5 ? submissionV5Fields : submissionFields,
  );
}

export function normalizeSubmissionImageTuple(
  value: readonly unknown[] | Record<string, unknown>,
) {
  return tupleValues(value, submissionImageFields);
}

async function getPrizeVaultView(
  client: PublicClient,
  address: Address,
  implementationVersion: number,
  roundFinalized: boolean,
): Promise<PrizeVaultView> {
  const readPrize = <T>(functionName: string, args?: readonly unknown[]) =>
    client.readContract({
      address,
      abi: prizeVaultAbi as Abi,
      functionName,
      args,
    }) as Promise<T>;
  const legacy = implementationVersion < 4;
  const [
    recoveryRecipient,
    prizePlanHash,
    claimPeriod,
    recoveryDelay,
    state,
    allocationCount,
  ] = await Promise.all([
    readPrize<Address>("recoveryRecipient"),
    readPrize<Hex>("prizePlanHash"),
    readPrize<bigint>("claimPeriod"),
    readPrize<bigint>("recoveryDelay"),
    readPrize<number>("state"),
    readPrize<bigint>("allocationCount"),
  ]);
  const [
    recoveryNonce,
    cancellationNonce,
    safetyNonce,
    distributionAvailableAt,
  ] = legacy
    ? await Promise.all([
        readPrize<bigint>("recoveryNonce"),
        readPrize<bigint>("cancellationNonce"),
        Promise.resolve(0n),
        Promise.resolve(0n),
      ])
    : await Promise.all([
        Promise.resolve(0n),
        Promise.resolve(0n),
        readPrize<bigint>("safetyNonce"),
        roundFinalized
          ? readPrize<bigint>("distributionAvailableAt")
          : Promise.resolve(0n),
      ]);
  const allocationResults = await Promise.all(
    Array.from({ length: Number(allocationCount) }, async (_, index) => {
      try {
        const rawAllocation = await readPrize<RawPrizeAllocation>(
          "getAllocation",
          [BigInt(index)],
        );
        const allocation = normalizePrizeAllocationTuple(rawAllocation);
        const key = await readPrize<Hex>("assetKey", [
          allocation.assetType,
          allocation.token,
          allocation.tokenId,
        ]);
        const [
          funded,
          liability,
          recoverableExcess,
          nonce,
          held,
          heldAt,
          reclaimed,
        ] = await Promise.all([
          readPrize<bigint>("fundedByAsset", [key]),
          readPrize<bigint>("liabilityByAsset", [key]),
          readPrize<bigint>("recoverableBalance", [
            allocation.assetType,
            allocation.token,
            allocation.tokenId,
          ]),
          legacy
            ? Promise.resolve(0n)
            : readPrize<bigint>("allocationNonces", [BigInt(index)]),
          legacy
            ? Promise.resolve(false)
            : readPrize<boolean>("isHeld", [BigInt(index)]),
          legacy
            ? Promise.resolve(0n)
            : readPrize<bigint>("heldAt", [BigInt(index)]),
          legacy
            ? Promise.resolve(false)
            : readPrize<boolean>("isReclaimed", [BigInt(index)]),
        ]);
        return {
          allocation: {
            id: BigInt(index),
            winnerRank: allocation.winnerRank,
            assetType: allocation.assetType,
            token: allocation.token,
            tokenId: allocation.tokenId,
            amount: allocation.amount,
            claimed: allocation.claimed,
            funded,
            liability,
            recoverableExcess,
            nonce,
            held,
            heldAt: Number(heldAt),
            reclaimed,
          },
        };
      } catch (error) {
        return {
          error: `Allocation ${index} could not be read: ${error instanceof Error ? error.message : "RPC failure"}`,
        };
      }
    }),
  );
  const allocations = allocationResults.flatMap((result) =>
    result.allocation ? [result.allocation] : [],
  );
  const projectionErrors = allocationResults.flatMap((result) =>
    result.error ? [result.error] : [],
  );
  const activityEventNames = [
    "PrizeFunded",
    "ContributionRefunded",
    "PrizePlanSealed",
    "PrizePlanCanceled",
    "PrizeReleased",
    "RecoveryQueued",
    "RecoveryExecuted",
    "RecoveryCanceled",
    "RecoveryExpired",
    "RecoveryRecipientUpdated",
    ...(legacy
      ? []
      : [
          "AllocationHeldStateSet",
          "AllocationReclaimed",
          "SafetyActionQueued",
          "SafetyActionExecuted",
        ]),
  ] as const;
  const getContractEvents = client.getContractEvents as unknown as (params: {
    address: Address;
    abi: Abi;
    eventName: string;
    fromBlock: bigint;
    toBlock: "latest";
  }) => Promise<Array<IndexedEventLog<Record<string, unknown>>>>;
  const activityResults = await Promise.allSettled(
    activityEventNames.map(async (eventName) => {
      const logs = await getContractEvents({
        address,
        abi: prizeVaultAbi as Abi,
        eventName,
        fromBlock: 0n,
        toBlock: "latest",
      });
      return logs.map((log): PrizeVaultActivity => {
        const args = log.args || {};
        const account =
          args.depositor ||
          args.caller ||
          args.recipient ||
          args.signerOne ||
          args.newRecipient;
        return {
          kind: eventName,
          blockNumber: log.blockNumber,
          transactionHash: log.transactionHash,
          logIndex: log.logIndex,
          actionId:
            typeof args.actionId === "string"
              ? (args.actionId as Hex)
              : undefined,
          allocationId:
            typeof args.allocationId === "bigint"
              ? args.allocationId
              : undefined,
          account:
            typeof account === "string" ? (account as Address) : undefined,
          amount: typeof args.amount === "bigint" ? args.amount : undefined,
          executeAfter:
            typeof args.executeAfter === "bigint"
              ? Number(args.executeAfter)
              : undefined,
        };
      });
    }),
  );
  const activity = activityResults
    .flatMap((result) => (result.status === "fulfilled" ? result.value : []))
    .sort((a, b) => {
      const blockOrder = Number((a.blockNumber || 0n) - (b.blockNumber || 0n));
      return blockOrder || a.logIndex - b.logIndex;
    });
  const activityUnavailable = activityResults.some(
    (result) => result.status === "rejected",
  );
  if (activityUnavailable) {
    projectionErrors.push(
      "Some prize activity logs could not be rebuilt; direct vault state remains authoritative",
    );
  }
  return {
    address,
    implementationVersion,
    recoveryRecipient,
    prizePlanHash,
    claimPeriod: Number(claimPeriod),
    recoveryDelay: Number(recoveryDelay),
    state: Number(state),
    recoveryNonce,
    cancellationNonce,
    safetyNonce,
    distributionAvailableAt: Number(distributionAvailableAt),
    allocations,
    activity,
    activityUnavailable,
    projectionErrors,
  } as PrizeVaultView;
}

async function loadMetadata<T extends RoundMetadata | SubmissionMetadata>(
  uri: string,
  hash: Hex,
) {
  try {
    return { metadata: await fetchMetadata<T>(uri, hash) };
  } catch (error) {
    return {
      contentError:
        error instanceof Error ? error.message : "Content is unavailable.",
    };
  }
}

async function loadSubmissionMetadata(
  uri: string,
  metadataHash: Hex,
  commitments: {
    titleLength: number;
    descriptionLength: number;
    titleHash: Hex;
    descriptionHash: Hex;
  },
) {
  const loaded = await loadMetadata<SubmissionMetadata>(uri, metadataHash);
  if (!loaded.metadata) return loaded;
  const titleLength = new TextEncoder().encode(loaded.metadata.title).length;
  const descriptionLength = new TextEncoder().encode(
    loaded.metadata.description,
  ).length;
  if (
    titleLength !== commitments.titleLength ||
    descriptionLength !== commitments.descriptionLength ||
    contentHash(loaded.metadata.title).toLowerCase() !==
      commitments.titleHash.toLowerCase() ||
    contentHash(loaded.metadata.description).toLowerCase() !==
      commitments.descriptionHash.toLowerCase()
  ) {
    return {
      contentError:
        "Metadata title or description does not match its onchain commitment.",
    };
  }
  return loaded;
}

async function rebuildRoundIndex(
  client: PublicClient,
  round: Address,
  creator: Address,
  implementationVersion: number,
) {
  const abi = getRoundAbi(implementationVersion);
  try {
    const [grants, revocations, votes] = await Promise.all([
      client.getContractEvents({
        address: round,
        abi,
        eventName: "RoundAdminGranted",
        fromBlock: 0n,
        toBlock: "latest",
      }),
      client.getContractEvents({
        address: round,
        abi,
        eventName: "RoundAdminRevoked",
        fromBlock: 0n,
        toBlock: "latest",
      }),
      client.getContractEvents({
        address: round,
        abi,
        eventName: "VotesCast",
        fromBlock: 0n,
        toBlock: "latest",
      }),
      ...(implementationVersion >= 5
        ? [
            client.getContractEvents({
              address: round,
              abi,
              eventName: "SubmissionImageAppended",
              fromBlock: 0n,
              toBlock: "latest",
            }),
          ]
        : []),
    ]);
    const admins = new Set<Address>([creator]);
    const adminChanges = [
      ...grants.map((log) => ({ log, granted: true })),
      ...revocations.map((log) => ({ log, granted: false })),
    ].sort((a, b) => {
      const blockDelta = Number(
        (a.log.blockNumber || 0n) - (b.log.blockNumber || 0n),
      );
      return blockDelta || a.log.logIndex - b.log.logIndex;
    });
    const seenAdminLogs = new Set<string>();
    adminChanges.forEach(({ log, granted }) => {
      const typedLog = log as unknown as RoundAdminEventLog;
      const account = typedLog.args.account;
      const key = `${log.transactionHash || "pending"}:${log.logIndex}`;
      if (!account || seenAdminLogs.has(key)) return;
      seenAdminLogs.add(key);
      if (granted) admins.add(account);
      else admins.delete(account);
    });
    const activityByLog = new Map<
      string,
      {
        voter: Address;
        submissionId: bigint;
        amount: bigint;
        voterSubmissionTotal: bigint;
        submissionTotal: bigint;
        transactionHash?: Hex;
        blockNumber?: bigint;
        logIndex: number;
      }
    >();
    votes.forEach((log) => {
      const typedLog = log as unknown as VotesCastEventLog;
      const {
        voter,
        submissionId,
        amount,
        voterSubmissionTotal,
        submissionTotal,
      } = typedLog.args;
      if (
        !voter ||
        submissionId === undefined ||
        amount === undefined ||
        voterSubmissionTotal === undefined ||
        submissionTotal === undefined
      )
        return;
      const key = `${log.transactionHash || "pending"}:${log.logIndex}`;
      activityByLog.set(key, {
        voter,
        submissionId,
        amount,
        voterSubmissionTotal,
        submissionTotal,
        transactionHash: log.transactionHash,
        blockNumber: log.blockNumber,
        logIndex: log.logIndex,
      });
    });
    return {
      admins: [...admins],
      activityUnavailable: false,
      voteActivity: [...activityByLog.values()],
    };
  } catch {
    // Event indexes are rebuildable views; critical state hydration below remains authoritative.
    return { admins: [creator], activityUnavailable: true, voteActivity: [] };
  }
}

export async function getRoundView(
  client: PublicClient,
  record: RoundRecord,
): Promise<RoundView> {
  const address = record.round;
  const readVersioned = <T>(functionName: string, args?: readonly unknown[]) =>
    read<T>(client, address, functionName, args, record.implementationVersion);
  const [
    metadataURI,
    metadataHash,
    creationTimestamp,
    roundStart,
    submissionsOpen,
    submissionsClose,
    votingStart,
    votingEnd,
    votingPowerAdapter,
    votingStrategy,
    snapshotBlock,
    snapshotCaptured,
    baseOrFixedVotes,
    maxVotesPerSubmission,
    maxSubmissionsPerWallet,
    maxSubmissions,
    winnerCount,
    minTitleLength,
    maxTitleLength,
    minDescriptionLength,
    maxDescriptionLength,
    lifecycleState,
    finalized,
    finalizationCursor,
    archived,
    submissionCount,
    winners,
    scheduleConfigured,
  ] = await Promise.all([
    readVersioned<string>("metadataURI"),
    readVersioned<Hex>("metadataHash"),
    read<bigint>(client, address, "creationTimestamp"),
    read<bigint>(client, address, "roundStart"),
    read<bigint>(client, address, "submissionsOpen"),
    record.implementationVersion >= 2
      ? read<bigint>(client, address, "submissionsClose")
      : Promise.resolve(undefined),
    read<bigint>(client, address, "votingStart"),
    read<bigint>(client, address, "votingEnd"),
    read<Address>(client, address, "votingPowerAdapter"),
    read<number>(client, address, "votingStrategy"),
    read<bigint>(client, address, "snapshotBlock"),
    read<boolean>(client, address, "snapshotCaptured"),
    read<bigint>(client, address, "baseOrFixedVotes"),
    read<bigint>(client, address, "maxVotesPerSubmission"),
    read<number>(client, address, "maxSubmissionsPerWallet"),
    read<number>(client, address, "maxSubmissions"),
    read<number>(client, address, "winnerCount"),
    read<number>(client, address, "minTitleLength"),
    read<number>(client, address, "maxTitleLength"),
    read<number>(client, address, "minDescriptionLength"),
    read<number>(client, address, "maxDescriptionLength"),
    read<number>(client, address, "lifecycleState"),
    read<boolean>(client, address, "finalized"),
    getFinalizationCursor(client, address, record.implementationVersion),
    read<boolean>(client, address, "archived"),
    read<bigint>(client, address, "submissionCount"),
    read<bigint[]>(client, address, "getWinners"),
    record.implementationVersion >= 6
      ? readVersioned<boolean>("scheduleConfigured")
      : Promise.resolve(true),
  ]);

  const submissions = await Promise.all(
    Array.from(
      { length: Number(submissionCount) },
      async (_, index): Promise<RoundSubmission> => {
        const id = BigInt(index);
        const [rawSubmission, votes] = await Promise.all([
          readVersioned<readonly unknown[] | Record<string, unknown>>(
            "getSubmission",
            [id],
          ),
          read<bigint>(client, address, "submissionVoteTotals", [id]),
        ]);
        const submission = normalizeSubmissionTuple(
          rawSubmission,
          record.implementationVersion,
        );
        const isV5 = record.implementationVersion >= 5;
        const originalImageCount = isV5 ? Number(submission[6]) : 0;
        const titleHashIndex = isV5 ? 7 : 6;
        const descriptionHashIndex = isV5 ? 8 : 7;
        const metadataUriIndex = isV5 ? 9 : 8;
        const metadataHashIndex = isV5 ? 10 : 9;
        const metadataUri = submission[metadataUriIndex] as string;
        const committedMetadataHash = submission[metadataHashIndex] as Hex;
        const loadedContent = await loadSubmissionMetadata(
          metadataUri,
          committedMetadataHash,
          {
            titleLength: Number(submission[4]),
            descriptionLength: Number(submission[5]),
            titleHash: submission[titleHashIndex] as Hex,
            descriptionHash: submission[descriptionHashIndex] as Hex,
          },
        );
        let submissionMetadata = loadedContent.metadata;
        let submissionContentError = loadedContent.contentError;
        if (
          isV5 &&
          submissionMetadata &&
          (submissionMetadata.images || []).length !== originalImageCount
        ) {
          submissionMetadata = undefined;
          submissionContentError =
            "Metadata image count does not match its onchain declaration.";
        }
        const adminAddedImages = isV5
          ? await (async () => {
              const count = await readVersioned<bigint>(
                "submissionImageCount",
                [id],
              );
              return Promise.all(
                Array.from({ length: Number(count) }, async (_, imageIndex) => {
                  const image = normalizeSubmissionImageTuple(
                    await readVersioned<
                      readonly unknown[] | Record<string, unknown>
                    >("getSubmissionImage", [id, BigInt(imageIndex)]),
                  );
                  return {
                    revision: BigInt(imageIndex + 1),
                    uri: image[0],
                    hash: image[1],
                    signerA: image[2],
                    signerB: image[3],
                    executor: image[4],
                    appendedAt: Number(image[5]),
                  };
                }),
              );
            })()
          : [];
        return {
          id,
          owner: submission[0] as Address,
          submissionType: Number(submission[1]),
          status: Number(submission[2]),
          createdAt: Number(submission[3]),
          titleLength: Number(submission[4]),
          descriptionLength: Number(submission[5]),
          originalImageCount,
          titleHash: submission[titleHashIndex] as Hex,
          descriptionHash: submission[descriptionHashIndex] as Hex,
          metadataURI: metadataUri,
          metadataHash: committedMetadataHash,
          votes,
          adminAddedImages,
          metadata: submissionMetadata,
          contentError: submissionContentError,
        };
      },
    ),
  );
  const [metadata, index, prizeVault] = await Promise.all([
    loadMetadata<RoundMetadata>(metadataURI, metadataHash),
    rebuildRoundIndex(
      client,
      address,
      record.creator,
      record.implementationVersion,
    ),
    record.implementationVersion >= 3 && record.prizeVaultAddress
      ? getPrizeVaultView(
          client,
          record.prizeVaultAddress,
          record.implementationVersion,
          finalized,
        )
      : Promise.resolve(undefined),
  ]);
  return {
    ...record,
    metadataURI,
    metadataHash,
    creationTimestamp: Number(creationTimestamp),
    roundStart: Number(roundStart),
    submissionsOpen: Number(submissionsOpen),
    submissionsClose: normalizeSubmissionsClose(
      record.implementationVersion,
      submissionsClose === undefined ? undefined : Number(submissionsClose),
      Number(votingStart),
    ),
    votingStart: Number(votingStart),
    votingEnd: Number(votingEnd),
    scheduleConfigured,
    votingPowerAdapter,
    votingStrategy,
    snapshotBlock,
    snapshotCaptured,
    baseOrFixedVotes,
    maxVotesPerSubmission,
    maxSubmissionsPerWallet: Number(maxSubmissionsPerWallet),
    maxSubmissions: Number(maxSubmissions),
    winnerCount: Number(winnerCount),
    minTitleLength: Number(minTitleLength),
    maxTitleLength: Number(maxTitleLength),
    minDescriptionLength: Number(minDescriptionLength),
    maxDescriptionLength: Number(maxDescriptionLength),
    lifecycleState: normalizeLifecycleState(
      Number(lifecycleState),
      record.implementationVersion,
    ),
    finalized,
    finalizationCursor,
    archived,
    submissions,
    winners,
    ...index,
    ...metadata,
    prizeVault,
  };
}

export async function getVoterView(
  client: PublicClient,
  round: Address,
  voter: Address,
  snapshotCaptured: boolean,
) {
  const [usedVotes, isRoundAdmin, votingLimit, remainingVotes] =
    await Promise.all([
      read<bigint>(client, round, "usedVotes", [voter]),
      read<boolean>(client, round, "isRoundAdmin", [voter]),
      snapshotCaptured
        ? read<bigint>(client, round, "votingLimit", [voter])
        : Promise.resolve(0n),
      snapshotCaptured
        ? read<bigint>(client, round, "remainingVotes", [voter])
        : Promise.resolve(0n),
    ]);
  return { usedVotes, isRoundAdmin, votingLimit, remainingVotes };
}
