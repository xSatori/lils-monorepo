import { getGoldskyUniqueNounOwnersCount } from "@/data/goldsky/nouns";

/**
 * Get the count of unique canonical noun owners, excluding the burn address.
 */
export async function getUniqueNounOwnersCount(): Promise<number> {
  try {
    return await getGoldskyUniqueNounOwnersCount();
  } catch (error) {
    console.error("Failed to fetch unique noun owners count from Goldsky:", error);
    // Return 0 on error to avoid breaking the UI
    return 0;
  }
}

