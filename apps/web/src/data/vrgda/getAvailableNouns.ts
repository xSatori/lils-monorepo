import { getOnChainVrgdaPoolCandidates } from "./getOnChainVrgdaPool";

export interface AvailableNoun {
  id: string;
  blockNumber: number;
  image: string;
  price: string;
  svg: string;
}

function svgToDataUri(svg: string) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/**
 * Fetches only the latest VRGDA nouns to prevent memory bloat
 * @param previousCount Number of previous block nouns to fetch (default: 3)
 * @returns Object containing next noun + specified number of previous nouns
 */
export async function getAvailableNouns(previousCount: number = 3): Promise<{
  nextNoun: AvailableNoun | null;
  previousNouns: AvailableNoun[];
}> {
  try {
    const candidates = await getOnChainVrgdaPoolCandidates({
      limit: previousCount + 1,
      includeUsed: false,
      sortDirection: "desc",
    });

    const [nextCandidate, ...previousCandidates] = candidates;
    const toAvailableNoun = (candidate: (typeof candidates)[number]): AvailableNoun => ({
      id: candidate.nounId,
      blockNumber: Number(candidate.blockNumber),
      image: svgToDataUri(candidate.svg),
      price: candidate.priceWei,
      svg: candidate.svg,
    });

    const nextNoun = nextCandidate ? toAvailableNoun(nextCandidate) : null;
    const previousNouns = previousCandidates.map(toAvailableNoun);

    return { nextNoun, previousNouns };
  } catch (error) {
    console.error('Error fetching available nouns:', error);
    return { nextNoun: null, previousNouns: [] };
  }
}
