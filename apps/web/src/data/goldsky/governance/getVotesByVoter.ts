import { graphQLFetch } from "@/data/utils/graphQLFetch";
import { CHAIN_CONFIG } from "@/config";
import { getAddress, Address } from "viem";

const votesByVoterQuery = `
  query GetVotesByVoter($voterAddress: ID!) {
    votes(
      first: 1000
      orderBy: blockTimestamp
      orderDirection: desc
      where: {
        voter: $voterAddress
      }
    ) {
      id
      proposal {
        id
        title
      }
      supportDetailed
      votes
      reason
      transactionHash
      blockTimestamp
      nouns {
        id
      }
    }
  }
`;

export interface VoterVote {
  id: string;
  proposalId: number;
  proposalTitle: string;
  supportDetailed: number;
  votes: number;
  reason?: string;
  transactionHash?: string;
  blockTimestamp: number;
  nouns: Array<{ id: string }>;
}

interface VotesByVoterResponse {
  votes: Array<{
    id: string;
    proposal: {
      id: string;
      title: string;
    };
    supportDetailed: number;
    votes: string;
    reason?: string | null;
    transactionHash?: string | null;
    blockTimestamp: string;
    nouns?: Array<{ id: string }>;
  }>;
}

async function fetchVotesByVoter(
  endpoint: string,
  voterAddress: Address,
): Promise<VoterVote[]> {
  const normalizedAddress = getAddress(voterAddress).toLowerCase();
  const data = await graphQLFetch(
    endpoint,
    votesByVoterQuery,
    { voterAddress: normalizedAddress },
    { cache: "no-cache" },
  ) as VotesByVoterResponse;

  if (!data?.votes) return [];

  return data.votes
    .map((vote) => ({
      id: vote.id,
      proposalId: Number(vote.proposal.id),
      proposalTitle: vote.proposal.title,
      supportDetailed: vote.supportDetailed,
      votes: parseInt(vote.votes),
      reason: vote.reason || undefined,
      transactionHash: vote.transactionHash || undefined,
      blockTimestamp: Number(vote.blockTimestamp || 0),
      nouns: vote.nouns || [],
    }))
    .filter((vote) => vote.votes > 0 && Number.isFinite(vote.proposalId));
}

export async function getVotesForVoter(voterAddress: Address): Promise<VoterVote[]> {
  try {
    return await fetchVotesByVoter(CHAIN_CONFIG.goldskyUrl.primary, voterAddress);
  } catch (error) {
    console.error("Failed to fetch votes by voter from Goldsky:", error);
    try {
      return await fetchVotesByVoter(CHAIN_CONFIG.goldskyUrl.fallback, voterAddress);
    } catch (fallbackError) {
      console.error("Failed to fetch votes by voter from fallback:", fallbackError);
      return [];
    }
  }
}

/**
 * Get the number of unique proposals a voter has voted on with weight > 0
 */
export async function getProposalsVotedCount(
  voterAddress: Address
): Promise<number> {
  const votes = await getVotesForVoter(voterAddress);
  return new Set(votes.map((vote) => vote.proposalId)).size;
}

