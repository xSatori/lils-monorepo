import { getGoldskyNounsPaginated } from "@/data/goldsky/nouns";
import { revalidateTag, unstable_cache } from "@/utils/viteCache";
import { CHAIN_CONFIG } from "@/config";
import { transformVpsNounToNoun } from "./helpers";
import { Noun } from "./types";

export interface CompactNoun {
  id: string;
  seed: [number, number, number, number, number];
  createdAt: string;
}

const BATCH_SIZE = 1000;

function displayNouns(nouns: Awaited<ReturnType<typeof getGoldskyNounsPaginated>>["nouns"]): Noun[] {
  return nouns.map(transformVpsNounToNoun).map((noun) => ({ ...noun, secondaryListing: null }));
}

async function fetchAll(sortOrder: "newest" | "oldest" = "newest"): Promise<Noun[]> {
  const nouns: Noun[] = [];
  let offset = 0;
  while (true) {
    const page = await getGoldskyNounsPaginated({}, "id", sortOrder === "newest" ? "desc" : "asc", BATCH_SIZE, offset);
    nouns.push(...displayNouns(page.nouns));
    if (!page.hasMore) break;
    offset += BATCH_SIZE;
  }
  return nouns;
}

async function runPaginatedNounsQueryUncached() {
  return fetchAll("newest");
}

const runPaginatedNounsQuery = unstable_cache(
  runPaginatedNounsQueryUncached,
  ["goldsky-paginated-nouns-query", CHAIN_CONFIG.chain.id.toString()],
  { revalidate: 5 * 60, tags: [`goldsky-paginated-nouns-query-${CHAIN_CONFIG.chain.id.toString()}`] },
);

export async function getAllNounsUncached(): Promise<Noun[]> {
  return runPaginatedNounsQueryUncached();
}

export async function getRecentNouns(limit = 200): Promise<Noun[]> {
  try {
    const page = await getGoldskyNounsPaginated({}, "id", "desc", limit, 0);
    return displayNouns(page.nouns);
  } catch (error) {
    console.error("Error in getRecentNouns:", error);
    return [];
  }
}

export async function getAllNounsComplete(sortOrder: "newest" | "oldest" = "newest") {
  try {
    const nouns = await fetchAll(sortOrder);
    return { nouns, totalCount: nouns.length };
  } catch (error) {
    console.error("Error fetching all nouns:", error);
    return { nouns: [], totalCount: 0 };
  }
}

export async function getAllNounsForFiltering() {
  return getAllNounsComplete("newest");
}

export async function getNounsWithCursor(first = 100, after?: string, orderDirection: "asc" | "desc" = "desc") {
  const offset = after ? Number.parseInt(after, 10) : 0;
  const result = await getNounsWithOffset(Number.isFinite(offset) ? offset : 0, first, orderDirection);
  return { ...result, endCursor: result.hasNextPage ? String((Number.isFinite(offset) ? offset : 0) + first) : undefined };
}

export async function getNounsWithOffset(offset = 0, limit = 100, orderDirection: "asc" | "desc" = "desc") {
  try {
    const page = await getGoldskyNounsPaginated({}, "id", orderDirection, limit, offset);
    return { nouns: displayNouns(page.nouns), hasNextPage: page.hasMore };
  } catch (error) {
    console.error("Error in getNounsWithOffset:", error);
    return { nouns: [], hasNextPage: false };
  }
}

export async function getCompactNounsWithOffset(offset = 0, limit = 100, orderDirection: "asc" | "desc" = "desc") {
  try {
    const page = await getGoldskyNounsPaginated({}, "id", orderDirection, limit, offset);
    return {
      nouns: page.nouns.map((noun) => ({
        id: noun.id,
        seed: [noun.background, noun.body, noun.accessory, noun.head, noun.glasses],
        createdAt: noun.createdAt ?? "",
      })),
      hasNextPage: page.hasMore,
    };
  } catch (error) {
    console.error("Error in getCompactNounsWithOffset:", error);
    return { nouns: [], hasNextPage: false };
  }
}

export async function getNounsPaginated(page = 0, pageSize = 100) {
  try {
    const result = await getGoldskyNounsPaginated({}, "id", "desc", pageSize, page * pageSize);
    return { nouns: displayNouns(result.nouns), hasMore: result.hasMore };
  } catch (error) {
    console.error("Error in getNounsPaginated:", error);
    return { nouns: [], hasMore: false };
  }
}

export async function getNounsBatch(startId: number, endId: number): Promise<Noun[]> {
  const nouns = await fetchAll("oldest");
  return nouns.filter((noun) => Number(noun.id) >= startId && Number(noun.id) <= endId);
}

export async function getAllNouns(): Promise<Noun[]> {
  return runPaginatedNounsQuery();
}

export async function forceAllNounRevalidation() {
  revalidateTag(`goldsky-paginated-nouns-query-${CHAIN_CONFIG.chain.id.toString()}`);
}

export async function checkForAllNounRevalidation(nounId: string) {
  const allNouns = await getAllNouns();
  if (allNouns[0]?.id && BigInt(allNouns[0].id) < BigInt(nounId)) forceAllNounRevalidation();
}
