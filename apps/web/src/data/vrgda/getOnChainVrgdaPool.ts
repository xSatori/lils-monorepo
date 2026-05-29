import { CHAIN_CONFIG } from "@/config";
import { lilVRGDAConfig } from "@/config/lilVRGDAConfig";
import type { VrgdaPoolSeed } from "@/data/ponder/vrgda/types";

const MAX_ONCHAIN_SCAN_COUNT = 256;
const CONTRACT_READ_CHUNK_SIZE = 12;
const ZERO_BLOCK_HASH =
  "0x0000000000000000000000000000000000000000000000000000000000000000";

interface VrgdaSeedTuple {
  background: bigint | number;
  body: bigint | number;
  accessory: bigint | number;
  head: bigint | number;
  glasses: bigint | number;
}

type VrgdaCandidateTuple = readonly [
  bigint,
  VrgdaSeedTuple,
  string,
  bigint,
  `0x${string}`,
  bigint,
];

export interface OnChainVrgdaCandidate extends VrgdaPoolSeed {
  priceWei: string;
  svg: string;
}

interface GetOnChainVrgdaPoolOptions {
  limit?: number;
  offset?: number;
  includeUsed?: boolean;
  sortDirection?: "asc" | "desc";
  scanLimit?: number;
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

function normalizeCandidate(
  [nounId, seed, svg, price, blockHash, blockNumber]: VrgdaCandidateTuple,
  isUsed = false,
): OnChainVrgdaCandidate {
  const normalizedBlockNumber = blockNumber.toString();

  return {
    id: `${normalizedBlockNumber}-${nounId.toString()}`,
    nounId: nounId.toString(),
    blockNumber: normalizedBlockNumber,
    blockHash,
    background: Number(seed.background),
    body: Number(seed.body),
    accessory: Number(seed.accessory),
    head: Number(seed.head),
    glasses: Number(seed.glasses),
    isUsed,
    generatedAt: Math.floor(Date.now() / 1000).toString(),
    priceWei: price.toString(),
    svg,
  };
}

function isValidCandidate(candidate: OnChainVrgdaCandidate) {
  return candidate.blockHash !== ZERO_BLOCK_HASH;
}

async function fetchCandidatesForBlocks(blockNumbers: bigint[]) {
  const chunks = chunkArray(blockNumbers, CONTRACT_READ_CHUNK_SIZE);
  const settledChunks = await Promise.allSettled(
    chunks.map((chunk) =>
      Promise.allSettled(
        chunk.map((blockNumber) =>
          CHAIN_CONFIG.publicClient.readContract({
            ...lilVRGDAConfig,
            functionName: "fetchNoun",
            args: [blockNumber],
          }),
        ),
      ),
    ),
  );

  return settledChunks.flatMap((chunk) => {
    if (chunk.status !== "fulfilled") {
      return [];
    }

    return chunk.value.flatMap((result) => {
      if (result.status !== "fulfilled" || !result.value) {
        return [];
      }

      return [normalizeCandidate(result.value as VrgdaCandidateTuple)];
    });
  });
}

async function fetchUsedBlockNumbers(blockNumbers: bigint[]) {
  const chunks = chunkArray(blockNumbers, CONTRACT_READ_CHUNK_SIZE);
  const usedBlocks = new Set<string>();
  const settledChunks = await Promise.allSettled(
    chunks.map((chunk) =>
      Promise.allSettled(
        chunk.map((blockNumber) =>
          CHAIN_CONFIG.publicClient.readContract({
            ...lilVRGDAConfig,
            functionName: "usedBlockNumbers",
            args: [blockNumber],
          }),
        ),
      ),
    ),
  );

  settledChunks.forEach((chunk, chunkIndex) => {
    if (chunk.status !== "fulfilled") {
      return;
    }

    const sourceBlocks = chunks[chunkIndex];
    chunk.value.forEach((result, resultIndex) => {
      if (result.status === "fulfilled" && result.value === true) {
        usedBlocks.add(sourceBlocks[resultIndex].toString());
      }
    });
  });

  return usedBlocks;
}

export async function getOnChainVrgdaCandidateByBlock(
  blockNumber: bigint | string,
): Promise<OnChainVrgdaCandidate | null> {
  const normalizedBlockNumber = BigInt(blockNumber);
  const [candidate] = await fetchCandidatesForBlocks([normalizedBlockNumber]);

  if (!candidate) {
    return null;
  }

  const usedBlocks = await fetchUsedBlockNumbers([normalizedBlockNumber]);

  return {
    ...candidate,
    isUsed: usedBlocks.has(candidate.blockNumber),
  };
}

export async function getOnChainVrgdaPoolCandidates({
  limit = MAX_ONCHAIN_SCAN_COUNT,
  offset = 0,
  includeUsed = false,
  sortDirection = "desc",
  scanLimit = MAX_ONCHAIN_SCAN_COUNT,
}: GetOnChainVrgdaPoolOptions = {}): Promise<OnChainVrgdaCandidate[]> {
  const [latestBlockNumber, poolSizeResult] = await Promise.all([
    CHAIN_CONFIG.publicClient.getBlockNumber(),
    CHAIN_CONFIG.publicClient.readContract({
      ...lilVRGDAConfig,
      functionName: "poolSize",
    }),
  ]);

  const poolSize = Number(poolSizeResult);
  const latestHistoryCount = Number(latestBlockNumber > 1n ? latestBlockNumber - 1n : 0n);
  const scanCount = Math.min(
    scanLimit,
    MAX_ONCHAIN_SCAN_COUNT,
    poolSize,
    latestHistoryCount,
  );

  let anchorBlockNumber: bigint | null = null;
  let anchorCandidate: OnChainVrgdaCandidate | null = null;

  try {
    const nextNoun = await CHAIN_CONFIG.publicClient.readContract({
      ...lilVRGDAConfig,
      functionName: "fetchNextNoun",
    });
    const nextNounTuple = nextNoun as unknown as VrgdaCandidateTuple;

    anchorBlockNumber = nextNounTuple[5];
    anchorCandidate = normalizeCandidate(nextNounTuple);
  } catch (error) {
    console.warn(
      "[VRGDA] fetchNextNoun reverted, falling back to latest block scan",
      error,
    );
  }

  const baseBlockNumber = anchorBlockNumber ?? latestBlockNumber;
  const historyLength = Math.max(anchorCandidate ? scanCount - 1 : scanCount, 0);
  const historyBlockNumbers = Array.from({ length: historyLength }, (_, index) =>
    baseBlockNumber - BigInt(index + 1),
  ).filter((blockNumber) => blockNumber > 0n);

  const historyCandidates = historyBlockNumbers.length
    ? await fetchCandidatesForBlocks(historyBlockNumbers)
    : [];

  const candidatesByBlock = new Map<string, OnChainVrgdaCandidate>();
  [anchorCandidate, ...historyCandidates].forEach((candidate) => {
    if (candidate && isValidCandidate(candidate)) {
      candidatesByBlock.set(candidate.blockNumber, candidate);
    }
  });

  const candidateBlockNumbers = Array.from(candidatesByBlock.keys()).map(BigInt);
  const usedBlocks = candidateBlockNumbers.length
    ? await fetchUsedBlockNumbers(candidateBlockNumbers)
    : new Set<string>();

  const targetCount = offset + limit;
  const candidates = Array.from(candidatesByBlock.values())
    .map((candidate) => ({
      ...candidate,
      isUsed: usedBlocks.has(candidate.blockNumber),
    }))
    .filter((candidate) => includeUsed || !candidate.isUsed)
    .sort((a, b) => {
      const left = BigInt(a.blockNumber);
      const right = BigInt(b.blockNumber);
      return sortDirection === "asc"
        ? Number(left - right)
        : Number(right - left);
    });

  return candidates.slice(offset, targetCount);
}
