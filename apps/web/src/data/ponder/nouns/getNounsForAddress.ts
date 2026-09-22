
import { PonderNoun } from "./types";
import { getGoldskyNounsForAddress } from "@/data/goldsky/nouns";

export async function getNounsForAddress(
  address: string,
  limit: number = 50,
  offset: number = 0
): Promise<{ nouns: PonderNoun[]; hasMore: boolean }> {
  try {
    return await getGoldskyNounsForAddress(address, limit, offset);
  } catch (error) {
    console.error('Failed to fetch nouns for address from Goldsky:', error);
    return { nouns: [], hasMore: false };
  }
}
