import { PonderNoun } from "./types";
import { getGoldskyNounsDelegatedTo } from "@/data/goldsky/nouns";

/**
 * Get all nouns delegated to a specific address
 */
export async function getNounsDelegatedTo(
  address: string,
  limit: number = 50,
  offset: number = 0
): Promise<{ nouns: PonderNoun[]; hasMore: boolean }> {
  try {
    return await getGoldskyNounsDelegatedTo(address, limit, offset);
  } catch (error) {
    console.error('Failed to fetch nouns delegated to address from Goldsky:', error);
    return { nouns: [], hasMore: false };
  }
}

