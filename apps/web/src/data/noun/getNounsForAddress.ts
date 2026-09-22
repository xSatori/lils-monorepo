
import { Address } from "viem";
import { Noun } from "./types";
import { getNounsForAddress as getPonderNounsForAddress } from "@/data/ponder/nouns";
import { transformPonderNounToNoun } from "./helpers";

export async function getNounsForAddress(address: Address): Promise<Noun[]> {
  try {
    // Use efficient Ponder query instead of loading all 7000+ nouns
    const { nouns: ponderNouns } = await getPonderNounsForAddress(address);

    if (!ponderNouns.length) {
      return [];
    }

    // Transform Ponder nouns to app Noun format
    const nouns = ponderNouns.map(transformPonderNounToNoun);

    // Add secondary market listings (Reservoir integration removed)
    const fullNouns = nouns.map((noun) => ({
      ...noun,
      secondaryListing: null, // Reservoir integration removed
    })) as Noun[];

    return fullNouns;
  } catch (error) {
    console.error('Failed to fetch nouns for address:', error);
    return [];
  }
}
