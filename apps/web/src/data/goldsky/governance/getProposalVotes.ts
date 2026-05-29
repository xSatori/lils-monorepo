
import { graphQLFetch } from "@/data/utils/graphQLFetch";
import { CHAIN_CONFIG } from "@/config";
import { Vote } from "@/data/generated/goldsky/graphql";
import { getAddress } from "viem";
import { ProposalVote } from "./common";

const query = `
  query GetProposalVotes($proposalId: ID!, $timestamp: BigInt) {
    votes(
      first: 1000
      orderBy: blockTimestamp
      orderDirection: desc
      where: {
        proposal: $proposalId
        ${`blockTimestamp_gt: $timestamp`}
      }
    ) {
      id
      voter {
        id
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

const allVotesQuery = `
  query GetAllProposalVotes($proposalId: ID!) {
    votes(
      first: 1000
      orderBy: blockTimestamp
      orderDirection: desc
      where: {
        proposal: $proposalId
      }
    ) {
      id
      voter {
        id
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

const recentVotesQuery = `
  query GetRecentProposalVotes($first: Int!) {
    votes(
      first: $first
      orderBy: blockTimestamp
      orderDirection: desc
    ) {
      id
      proposal {
        id
        title
      }
      voter {
        id
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

interface ProposalVotesResponse {
  votes: Vote[];
}

interface RecentProposalVotesResponse {
  votes: Array<
    Vote & {
      proposal: {
        id: string;
        title: string;
      };
    }
  >;
}

function mapVoteToProposalVote(
  vote: Vote,
  proposal?: { id: string; title: string },
): ProposalVote {
  return {
    id: vote.id,
    proposalId: proposal ? Number(proposal.id) : undefined,
    proposalTitle: proposal?.title,
    voterAddress: getAddress(vote.voter.id),
    supportDetailed: vote.supportDetailed,
    votes: vote.votes,
    weight: parseInt(vote.votes),
    reason: vote.reason,
    transactionHash: vote.transactionHash,
    blockTimestamp: vote.blockTimestamp,
    timestamp: vote.blockTimestamp,
    nouns: vote.nouns || [],
  };
}

export async function getProposalVotes(
  proposalId: string,
): Promise<ProposalVote[]> {
  try {
    const data = await graphQLFetch(
      CHAIN_CONFIG.goldskyUrl.primary,
      allVotesQuery,
      { proposalId },
      {
        cache: "no-cache",
      },
    ) as ProposalVotesResponse;

    if (!data?.votes) {
      return [];
    }

    return data.votes.map((vote) => mapVoteToProposalVote(vote));
  } catch (error) {
    console.error('Failed to fetch proposal votes from Goldsky:', error);
    throw error;
  }
}

export async function getRecentProposalVotes(
  limit: number = 200,
): Promise<ProposalVote[]> {
  try {
    const data = await graphQLFetch(
      CHAIN_CONFIG.goldskyUrl.primary,
      recentVotesQuery,
      { first: limit },
      {
        cache: "no-cache",
      },
    ) as RecentProposalVotesResponse;

    if (!data?.votes) {
      return [];
    }

    return data.votes.map((vote) =>
      mapVoteToProposalVote(vote, vote.proposal),
    );
  } catch (error) {
    console.error("Failed to fetch recent proposal votes from Goldsky:", error);
    throw error;
  }
}

export async function getProposalVotesAfterTimestamp(
  proposalId: string,
  timestamp: number,
): Promise<ProposalVote[]> {
  try {
    const data = await graphQLFetch(
      CHAIN_CONFIG.goldskyUrl.primary,
      query,
      { proposalId, timestamp: timestamp.toString() },
      {
        cache: "no-cache",
      },
    ) as ProposalVotesResponse;

    if (!data?.votes) {
      return [];
    }

    return data.votes.map((vote) => mapVoteToProposalVote(vote));
  } catch (error) {
    console.error('Failed to fetch proposal votes after timestamp from Goldsky:', error);
    throw error;
  }
}
