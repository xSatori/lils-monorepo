import {
  SortDirection,
  VrgdaFilters,
  VrgdaPoolSeed,
  VrgdaPoolSeedsResult,
  VrgdaSortField,
} from "./types";
import { CLEAN_GRAPHQL_ENDPOINT } from "../utils/cleanGraphQLFetch";
import { isSepoliaNetwork } from "@/utils/networkDetection";
import { getOnChainVrgdaPoolCandidates } from "@/data/vrgda/getOnChainVrgdaPool";

function matchesFilters(seed: VrgdaPoolSeed, filters: VrgdaFilters) {
  if (filters.isUsed !== undefined && seed.isUsed !== filters.isUsed) return false;
  if (filters.blockNumberGt && BigInt(seed.blockNumber) <= BigInt(filters.blockNumberGt)) return false;
  if (filters.blockNumberGte && BigInt(seed.blockNumber) < BigInt(filters.blockNumberGte)) return false;
  if (filters.blockNumberLt && BigInt(seed.blockNumber) >= BigInt(filters.blockNumberLt)) return false;
  if (filters.blockNumberLte && BigInt(seed.blockNumber) > BigInt(filters.blockNumberLte)) return false;
  if (filters.blockNumbers?.length && !filters.blockNumbers.includes(seed.blockNumber)) return false;
  if (filters.background !== undefined && seed.background !== filters.background) return false;
  if (filters.backgrounds?.length && !filters.backgrounds.includes(seed.background)) return false;
  if (filters.body !== undefined && seed.body !== filters.body) return false;
  if (filters.bodies?.length && !filters.bodies.includes(seed.body)) return false;
  if (filters.accessory !== undefined && seed.accessory !== filters.accessory) return false;
  if (filters.accessories?.length && !filters.accessories.includes(seed.accessory)) return false;
  if (filters.head !== undefined && seed.head !== filters.head) return false;
  if (filters.heads?.length && !filters.heads.includes(seed.head)) return false;
  if (filters.glasses !== undefined && seed.glasses !== filters.glasses) return false;
  if (filters.glassesOptions?.length && !filters.glassesOptions.includes(seed.glasses)) return false;

  return true;
}

function compareSeeds(
  left: VrgdaPoolSeed,
  right: VrgdaPoolSeed,
  sortField: VrgdaSortField,
  sortDirection: SortDirection,
) {
  const direction = sortDirection === "asc" ? 1 : -1;
  const leftValue = left[sortField];
  const rightValue = right[sortField];

  if (sortField === "blockNumber" || sortField === "generatedAt") {
    return Number(BigInt(leftValue as string) - BigInt(rightValue as string)) * direction;
  }

  if (typeof leftValue === "boolean" && typeof rightValue === "boolean") {
    return (Number(leftValue) - Number(rightValue)) * direction;
  }

  return (Number(leftValue) - Number(rightValue)) * direction;
}

async function getOnChainFallbackPoolSeeds(
  filters: VrgdaFilters,
  sortField: VrgdaSortField,
  sortDirection: SortDirection,
  limit: number,
  offset: number,
): Promise<VrgdaPoolSeedsResult> {
  const scanLimit = Math.min(256, Math.max(limit + offset + 32, limit));
  const candidates = await getOnChainVrgdaPoolCandidates({
    limit: scanLimit,
    includeUsed: filters.isUsed !== false,
    sortDirection: sortField === "blockNumber" ? sortDirection : "desc",
  });

  const sortedSeeds = candidates
    .filter((seed) => matchesFilters(seed, filters))
    .sort((left, right) => compareSeeds(left, right, sortField, sortDirection));

  return {
    seeds: sortedSeeds.slice(offset, offset + limit),
    hasMore: sortedSeeds.length > offset + limit,
    total: sortedSeeds.length,
  };
}

export async function getVrgdaPoolSeeds(
  filters: VrgdaFilters = {},
  sortField: VrgdaSortField = "blockNumber",
  sortDirection: SortDirection = "desc",
  limit: number = 50,
  offset: number = 0,
): Promise<VrgdaPoolSeedsResult> {
  if (isSepoliaNetwork()) {
    console.log("VRGDA pool queries disabled on Sepolia - VPS not configured");
    return { seeds: [], hasMore: false };
  }

  try {
    const where: Record<string, unknown> = {};
    if (filters.isUsed !== undefined) where.isUsed = filters.isUsed;
    if (filters.blockNumberGt) where.blockNumber_gt = filters.blockNumberGt;
    if (filters.blockNumberGte) where.blockNumber_gte = filters.blockNumberGte;
    if (filters.blockNumberLt) where.blockNumber_lt = filters.blockNumberLt;
    if (filters.blockNumberLte) where.blockNumber_lte = filters.blockNumberLte;
    if (filters.blockNumbers?.length) where.blockNumber_in = filters.blockNumbers;
    if (filters.background !== undefined) where.background = filters.background;
    if (filters.backgrounds?.length) where.background_in = filters.backgrounds;
    if (filters.body !== undefined) where.body = filters.body;
    if (filters.bodies?.length) where.body_in = filters.bodies;
    if (filters.accessory !== undefined) where.accessory = filters.accessory;
    if (filters.accessories?.length) where.accessory_in = filters.accessories;
    if (filters.head !== undefined) where.head = filters.head;
    if (filters.heads?.length) where.head_in = filters.heads;
    if (filters.glasses !== undefined) where.glasses = filters.glasses;
    if (filters.glassesOptions?.length) where.glasses_in = filters.glassesOptions;

    const variables: Record<string, unknown> = {
      limit,
      offset,
      orderBy: sortField,
      orderDirection: sortDirection,
    };

    if (Object.keys(where).length > 0) {
      variables.where = where;
    }

    const response = await fetch(CLEAN_GRAPHQL_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: `
          query GetVrgdaPoolSeeds($limit: Int!, $offset: Int!, $orderBy: String, $orderDirection: OrderDirection, $where: VrgdaPoolSeedWhereInput) {
            vrgdaPoolSeeds(
              orderBy: $orderBy
              orderDirection: $orderDirection
              limit: $limit
              offset: $offset
              where: $where
            ) {
              pageInfo {
                hasNextPage
                hasPreviousPage
              }
              items {
                id
                blockNumber
                nounId
                background
                body
                accessory
                head
                glasses
                isUsed
                generatedAt
              }
            }
          }
        `,
        variables,
      }),
    });

    if (!response.ok) {
      throw new Error(`GraphQL request failed with status ${response.status}`);
    }

    const result = await response.json();

    if (result.errors) {
      throw new Error(`GraphQL errors: ${result.errors.map((e: any) => e.message).join(", ")}`);
    }

    if (!result.data?.vrgdaPoolSeeds) {
      throw new Error("No vrgdaPoolSeeds in GraphQL response");
    }

    const seeds: VrgdaPoolSeed[] = result.data.vrgdaPoolSeeds.items.map((seed: any) => ({
      id: seed.id,
      nounId: seed.nounId,
      blockNumber: seed.blockNumber,
      background: seed.background,
      body: seed.body,
      accessory: seed.accessory,
      head: seed.head,
      glasses: seed.glasses,
      isUsed: seed.isUsed,
      generatedAt: seed.generatedAt,
    }));

    if (seeds.length === 0 && offset === 0) {
      console.warn("VRGDA Ponder pool returned no seeds; falling back to on-chain pool scan");
      return getOnChainFallbackPoolSeeds(filters, sortField, sortDirection, limit, offset);
    }

    return {
      seeds,
      hasMore: Boolean(result.data.vrgdaPoolSeeds.pageInfo?.hasNextPage),
    };
  } catch (error) {
    console.error("Failed to fetch VRGDA pool seeds from Ponder:", error);
    return getOnChainFallbackPoolSeeds(filters, sortField, sortDirection, limit, offset);
  }
}

export async function getAvailableVrgdaSeeds(
  limit: number = 50,
  offset: number = 0,
): Promise<VrgdaPoolSeedsResult> {
  return getVrgdaPoolSeeds(
    { isUsed: false },
    "blockNumber",
    "desc",
    limit,
    offset,
  );
}

export async function getLatestVrgdaSeeds(
  limit: number = 10,
): Promise<VrgdaPoolSeed[]> {
  const result = await getVrgdaPoolSeeds(
    {},
    "blockNumber",
    "desc",
    limit,
    0,
  );
  return result.seeds;
}
