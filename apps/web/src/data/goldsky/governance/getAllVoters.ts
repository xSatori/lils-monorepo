import { graphQLFetch } from "@/data/utils/graphQLFetch";
import { CHAIN_CONFIG } from "@/config";
import { buildVoterProfiles, type VoterProfile, type VoterStatVote } from "./voterStats";

const allVotersQuery = `
  query GetAllVoters($first: Int!, $skip: Int!) {
    votes(
      first: $first
      skip: $skip
      orderBy: blockTimestamp
      orderDirection: desc
    ) {
      id
      voter {
        id
      }
      proposal {
        id
      }
      votes
      reason
      blockTimestamp
      voteRevotes {
        id
        revote {
          id
          voter {
            id
          }
          reason
        }
      }
    }
  }
`;

interface AllVotersResponse {
  votes: VoterStatVote[];
}

async function fetchVoterVotes(
  endpoint: string,
  limit: number,
): Promise<VoterStatVote[]> {
  const allVotes: VoterStatVote[] = [];
  let skip = 0;
  const batchSize = 1000;
  let hasMore = true;

  while (hasMore && allVotes.length < limit) {
    const data = await graphQLFetch(
      endpoint,
      allVotersQuery,
      { first: batchSize, skip },
      { cache: "no-cache" },
    ) as AllVotersResponse | null;

    if (!data?.votes || data.votes.length === 0) {
      hasMore = false;
      break;
    }

    allVotes.push(...data.votes);
    skip += batchSize;

    if (data.votes.length < batchSize) {
      hasMore = false;
    }
  }

  return allVotes;
}

/**
 * Get all unique voters with their voting statistics
 */
export async function getAllVoters(
  limit: number = 1000
): Promise<VoterProfile[]> {
  try {
    const allVotes = await fetchVoterVotes(CHAIN_CONFIG.goldskyUrl.primary, limit);
    return buildVoterProfiles(allVotes).slice(0, limit);
  } catch (error) {
    console.error("Failed to fetch all voters from Goldsky:", error);
    try {
      const allVotes = await fetchVoterVotes(CHAIN_CONFIG.goldskyUrl.fallback, limit);
      return buildVoterProfiles(allVotes).slice(0, limit);
    } catch (fallbackError) {
      console.error("Failed to fetch all voters from fallback:", fallbackError);
      return [];
    }
  }
}

