import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { getProposalOverviews } from "@/data/goldsky/governance/getProposalOverviewsVersioned";
import { getProposal } from "@/data/goldsky/governance/getProposalVersioned";
import {
  getProposalIdea,
  getProposalIdeas,
} from "@/data/goldsky/governance/getProposalIdeas";
import { getRecentProposalVotes } from "@/data/goldsky/governance/getProposalVotes";
import { getTopic, getTopics } from "@/data/goldsky/governance/getTopics";
import { useAuctionData } from "@/hooks/useAuctionData";

import { buildGovernanceFeedItems } from "./feed-adapters";

const PROPOSAL_LIMIT = 80;
const PROPOSAL_DETAILS_LIMIT = 12;
const PROPOSAL_VOTE_LIMIT = 200;
const CANDIDATE_DETAILS_LIMIT = 40;
const TOPIC_DETAILS_LIMIT = 40;

function mergeById<T extends { id: string }>(base: T[], details: T[]): T[] {
  const detailById = new Map(details.map((item) => [item.id, item]));
  return base.map((item) => detailById.get(item.id) || item);
}

export function useGovernanceFeedData() {
  const proposalsQuery = useQuery({
    queryKey: ["governance-feed", "proposals"],
    queryFn: () => getProposalOverviews(PROPOSAL_LIMIT, "lilnouns"),
    staleTime: 60_000,
  });

  const proposalIds = useMemo(
    () =>
      (proposalsQuery.data || [])
        .slice(0, PROPOSAL_DETAILS_LIMIT)
        .map((proposal) => proposal.id),
    [proposalsQuery.data],
  );

  const proposalDetailsQuery = useQuery({
    queryKey: ["governance-feed", "proposal-details", proposalIds.join(",")],
    queryFn: async () => {
      const results = await Promise.allSettled(
        proposalIds.map((id) => getProposal(String(id), "lilnouns")),
      );

      return results
        .map((result) => (result.status === "fulfilled" ? result.value : null))
        .filter((proposal): proposal is NonNullable<typeof proposal> => proposal !== null);
    },
    enabled: proposalIds.length > 0,
    staleTime: 60_000,
  });

  const proposalVotesQuery = useQuery({
    queryKey: ["governance-feed", "proposal-votes"],
    queryFn: () => getRecentProposalVotes(PROPOSAL_VOTE_LIMIT),
    staleTime: 60_000,
  });

  const candidatesQuery = useQuery({
    queryKey: ["governance-feed", "candidates"],
    queryFn: () => getProposalIdeas(250),
    staleTime: 60_000,
  });

  const candidateDetailIds = useMemo(
    () =>
      (candidatesQuery.data || [])
        .slice(0, CANDIDATE_DETAILS_LIMIT)
        .map((candidate) => candidate.id),
    [candidatesQuery.data],
  );

  const candidateDetailsQuery = useQuery({
    queryKey: [
      "governance-feed",
      "candidate-details",
      candidateDetailIds.join(","),
    ],
    queryFn: async () => {
      const results = await Promise.allSettled(
        candidateDetailIds.map((id) => getProposalIdea(id)),
      );

      return results
        .map((result) => (result.status === "fulfilled" ? result.value : null))
        .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null);
    },
    enabled: candidateDetailIds.length > 0,
    staleTime: 60_000,
  });

  const topicsQuery = useQuery({
    queryKey: ["governance-feed", "topics"],
    queryFn: () => getTopics(250),
    staleTime: 60_000,
  });

  const topicDetailIds = useMemo(
    () =>
      (topicsQuery.data || [])
        .slice(0, TOPIC_DETAILS_LIMIT)
        .map((topic) => topic.id),
    [topicsQuery.data],
  );

  const topicDetailsQuery = useQuery({
    queryKey: ["governance-feed", "topic-details", topicDetailIds.join(",")],
    queryFn: async () => {
      const results = await Promise.allSettled(
        topicDetailIds.map((id) => getTopic(id)),
      );

      return results
        .map((result) => (result.status === "fulfilled" ? result.value : null))
        .filter((topic): topic is NonNullable<typeof topic> => topic !== null);
    },
    enabled: topicDetailIds.length > 0,
    staleTime: 60_000,
  });

  const { auction } = useAuctionData();

  const feedItems = useMemo(
    () => {
      const candidates = mergeById(
        candidatesQuery.data || [],
        candidateDetailsQuery.data || [],
      );
      const topics = mergeById(
        topicsQuery.data || [],
        topicDetailsQuery.data || [],
      );

      return buildGovernanceFeedItems({
        proposals: proposalsQuery.data || [],
        proposalDetails: proposalDetailsQuery.data || [],
        proposalVotes: proposalVotesQuery.data || [],
        candidates,
        topics,
        auction,
      });
    },
    [
      auction,
      candidateDetailsQuery.data,
      candidatesQuery.data,
      proposalDetailsQuery.data,
      proposalsQuery.data,
      proposalVotesQuery.data,
      topicDetailsQuery.data,
      topicsQuery.data,
    ],
  );

  const error =
    proposalsQuery.error ||
    proposalDetailsQuery.error ||
    proposalVotesQuery.error ||
    candidatesQuery.error ||
    candidateDetailsQuery.error ||
    topicsQuery.error ||
    topicDetailsQuery.error ||
    null;

  return {
    feedItems,
    proposals: proposalsQuery.data || [],
    candidates: mergeById(
      candidatesQuery.data || [],
      candidateDetailsQuery.data || [],
    ),
    topics: mergeById(topicsQuery.data || [], topicDetailsQuery.data || []),
    isLoading:
      proposalsQuery.isLoading ||
      candidatesQuery.isLoading ||
      topicsQuery.isLoading ||
      proposalDetailsQuery.isLoading ||
      proposalVotesQuery.isLoading ||
      candidateDetailsQuery.isLoading ||
      topicDetailsQuery.isLoading,
    error,
  };
}
