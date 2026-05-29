import { formatEther, getAddress, type Address } from "viem";

import type { Auction } from "@/data/auction/types";
import type {
  DetailedProposal,
  ProposalOverview,
  ProposalState,
  ProposalVote,
} from "@/data/goldsky/governance/common";
import type { ProposalIdea } from "@/data/goldsky/governance/ideaTypes";
import { makeUrlId } from "@/data/goldsky/governance/getProposalIdeas";
import {
  makeTopicUrlId,
  type Topic,
} from "@/data/goldsky/governance/getTopics";

import type { GovernanceFeedCategory, GovernanceFeedItem } from "./types";

export interface GovernanceFeedInput {
  proposals?: ProposalOverview[];
  proposalDetails?: DetailedProposal[];
  proposalVotes?: ProposalVote[];
  candidates?: ProposalIdea[];
  topics?: Topic[];
  auction?: Auction | null;
}

const proposalStateLabels: Partial<Record<ProposalState, string>> = {
  active: "Voting active",
  successful: "Voting ended",
  failed: "Voting ended",
  queued: "Queued",
  executed: "Executed",
  cancelled: "Cancelled",
  vetoed: "Vetoed",
  metagov_active: "Metagov active",
  metagov_closed: "Metagov closed",
  metagov_pending: "Metagov pending",
};

const votingStartedStates: ProposalState[] = [
  "active",
  "successful",
  "failed",
  "queued",
  "executed",
  "cancelled",
  "vetoed",
  "metagov_active",
  "metagov_closed",
];

const votingEndedStates: ProposalState[] = [
  "successful",
  "failed",
  "queued",
  "executed",
];

const feedItemSortRank: Partial<Record<GovernanceFeedItem["type"], number>> = {
  "proposal-executed": 90,
  "proposal-cancelled": 80,
  "proposal-queued": 70,
  "proposal-ended": 60,
  "proposal-vote": 50,
  "proposal-active": 40,
  "proposal-created": 30,
  "candidate-cancelled": 80,
  "candidate-promoted": 70,
  "candidate-signature": 60,
  "candidate-feedback": 50,
  "candidate-updated": 40,
  "candidate-created": 30,
  "topic-closed": 70,
  "topic-signature": 60,
  "topic-feedback": 50,
  "topic-created": 30,
  "vrgda-purchase": 60,
  "auction-bid": 50,
  "auction-live": 30,
};

function isNonZeroTimestamp(
  value: number | string | undefined | null,
): value is number | string {
  if (value === undefined || value === null) return false;
  return Number(value) > 0;
}

function normalizeFeedAddress(
  value: Address | string | undefined | null,
): Address | undefined {
  if (!value) return undefined;

  try {
    return getAddress(value);
  } catch {
    return undefined;
  }
}

function toTimestamp(value: number | string | undefined | null): number {
  return isNonZeroTimestamp(value)
    ? Number(value)
    : Math.floor(Date.now() / 1000);
}

function optionalTimestamp(
  value: number | string | undefined | null,
): number | undefined {
  return isNonZeroTimestamp(value) ? Number(value) : undefined;
}

function getSafeLifecycleTimestamp(
  proposal: ProposalOverview,
  value: number | string | undefined | null,
  fallback?: number | string | undefined | null,
): number | undefined {
  const timestamp = optionalTimestamp(value) ?? optionalTimestamp(fallback);
  if (timestamp === undefined) return undefined;
  const createdTimestamp = optionalTimestamp(proposal.createdTimestamp);
  return createdTimestamp === undefined
    ? timestamp
    : Math.max(timestamp, createdTimestamp);
}

function supportLabel(support: number | undefined): string {
  if (support === 1) return "For";
  if (support === 0) return "Against";
  if (support === 2) return "Abstain";
  return "Vote";
}

function feedbackSupportLabel(support: number | undefined): string {
  if (support === 2) return "Comment";
  return supportLabel(support);
}

function proposalDisplayTitle(proposalId: number | string, title?: string) {
  const trimmedTitle = title?.trim();
  return trimmedTitle
    ? `Proposal ${proposalId}: ${trimmedTitle}`
    : `Proposal ${proposalId}`;
}

function pushProposalLifecycleItem(
  items: GovernanceFeedItem[],
  proposal: ProposalOverview,
  type: GovernanceFeedItem["type"],
  idSuffix: string,
  timestamp: number,
  statusLabel: string,
) {
  items.push({
    id: `proposal-${proposal.id}-${idSuffix}`,
    category: "proposal",
    type,
    title: proposalDisplayTitle(proposal.id, proposal.title),
    timestamp,
    href: `/vote/${proposal.id}`,
    statusLabel,
  });
}

function wasCancelledBeforeVotingStarted(proposal: ProposalOverview) {
  const cancellationTimestamp = optionalTimestamp(proposal.canceledTimestamp);
  const votingStartTimestamp = optionalTimestamp(proposal.votingStartTimestamp);

  return (
    cancellationTimestamp !== undefined &&
    votingStartTimestamp !== undefined &&
    cancellationTimestamp < votingStartTimestamp
  );
}

function canShowVotingStarted(proposal: ProposalOverview) {
  if (proposal.state !== "cancelled" && proposal.state !== "vetoed") {
    return votingStartedStates.includes(proposal.state);
  }

  return (
    optionalTimestamp(proposal.canceledTimestamp) !== undefined &&
    !wasCancelledBeforeVotingStarted(proposal)
  );
}

function wasCancelledBeforeVotingEnded(proposal: ProposalOverview) {
  const cancellationTimestamp = optionalTimestamp(proposal.canceledTimestamp);
  const votingEndTimestamp = optionalTimestamp(proposal.votingEndTimestamp);

  return (
    cancellationTimestamp !== undefined &&
    votingEndTimestamp !== undefined &&
    cancellationTimestamp < votingEndTimestamp
  );
}

function canShowVotingEnded(proposal: ProposalOverview) {
  if (votingEndedStates.includes(proposal.state)) return true;
  if (proposal.state !== "cancelled" && proposal.state !== "vetoed") {
    return false;
  }

  return (
    optionalTimestamp(proposal.canceledTimestamp) !== undefined &&
    !wasCancelledBeforeVotingEnded(proposal)
  );
}

function pushProposalItems(
  items: GovernanceFeedItem[],
  proposal: ProposalOverview,
) {
  items.push({
    id: `proposal-${proposal.id}-created`,
    category: "proposal",
    type: "proposal-created",
    title: proposalDisplayTitle(proposal.id, proposal.title),
    timestamp: toTimestamp(
      proposal.createdTimestamp ?? proposal.votingStartTimestamp,
    ),
    href: `/vote/${proposal.id}`,
    actorAddress: normalizeFeedAddress(proposal.proposerAddress),
    statusLabel: "Created",
  });

  if (canShowVotingStarted(proposal)) {
    const votingStartTimestamp = getSafeLifecycleTimestamp(
      proposal,
      proposal.votingStartTimestamp,
    );

    if (votingStartTimestamp !== undefined) {
      pushProposalLifecycleItem(
        items,
        proposal,
        "proposal-active",
        "voting-started",
        votingStartTimestamp,
        "Voting started",
      );
    }
  }

  if (canShowVotingEnded(proposal)) {
    const votingEndTimestamp = getSafeLifecycleTimestamp(
      proposal,
      proposal.votingEndTimestamp,
    );

    if (votingEndTimestamp !== undefined) {
      pushProposalLifecycleItem(
        items,
        proposal,
        "proposal-ended",
        "voting-ended",
        votingEndTimestamp,
        "Voting ended",
      );
    }
  }

  if (["queued", "executed"].includes(proposal.state)) {
    const queuedTimestamp = getSafeLifecycleTimestamp(
      proposal,
      proposal.queuedTimestamp,
      proposal.votingEndTimestamp,
    );

    if (queuedTimestamp !== undefined) {
      pushProposalLifecycleItem(
        items,
        proposal,
        "proposal-queued",
        "queued",
        queuedTimestamp,
        "Queued",
      );
    }
  }

  if (proposal.state === "executed") {
    const executedTimestamp = getSafeLifecycleTimestamp(
      proposal,
      proposal.executedTimestamp,
      proposal.queuedTimestamp ?? proposal.executionEtaTimestamp,
    );

    if (executedTimestamp !== undefined) {
      pushProposalLifecycleItem(
        items,
        proposal,
        "proposal-executed",
        "executed",
        executedTimestamp,
        "Executed",
      );
    }
  }

  if (proposal.state === "cancelled" || proposal.state === "vetoed") {
    const cancelledTimestamp = getSafeLifecycleTimestamp(
      proposal,
      proposal.canceledTimestamp,
      proposal.createdTimestamp,
    );

    if (cancelledTimestamp !== undefined) {
      pushProposalLifecycleItem(
        items,
        proposal,
        "proposal-cancelled",
        proposal.state,
        cancelledTimestamp,
        proposalStateLabels[proposal.state] || "Cancelled",
      );
    }
  }
}

function pushVoteItem(
  items: GovernanceFeedItem[],
  vote: ProposalVote,
  fallbackProposal?: Pick<DetailedProposal, "id" | "title">,
) {
  const proposalId = vote.proposalId ?? fallbackProposal?.id;
  if (proposalId === undefined) return;

  const reason = vote.reason?.trim();
  const proposalTitle = vote.proposalTitle ?? fallbackProposal?.title;

  items.push({
    id: `proposal-${proposalId}-vote-${vote.id}`,
    category: "proposal",
    type: "proposal-vote",
    title: `${supportLabel(vote.supportDetailed)} on ${proposalDisplayTitle(proposalId, proposalTitle)}`,
    description: reason || undefined,
    timestamp: toTimestamp(vote.blockTimestamp || vote.timestamp),
    href: `/vote/${proposalId}`,
    actorAddress: normalizeFeedAddress(vote.voterAddress),
    voteCountLabel: Number(vote.weight || vote.votes || 0).toLocaleString(),
    statusLabel: supportLabel(vote.supportDetailed),
  });
}

function pushVoteItems(
  items: GovernanceFeedItem[],
  proposal: DetailedProposal,
) {
  for (const vote of proposal.votes || []) {
    pushVoteItem(items, vote, proposal);
  }
}

function pushCandidateItems(
  items: GovernanceFeedItem[],
  candidate: ProposalIdea,
) {
  const href = `/candidates/${makeUrlId(candidate.id)}`;
  const title = candidate.latestVersion.content.title;

  items.push({
    id: `candidate-${candidate.id}-created`,
    category: "candidate",
    type: "candidate-created",
    title,
    timestamp: toTimestamp(candidate.createdTimestamp),
    href,
    actorAddress: normalizeFeedAddress(candidate.proposerAddress),
    statusLabel: "Candidate created",
  });

  if (candidate.latestVersion.proposalId) {
    items.push({
      id: `candidate-${candidate.id}-promoted-${candidate.latestVersion.proposalId}`,
      category: "candidate",
      type: "candidate-promoted",
      title,
      description: `Promoted to Proposal ${candidate.latestVersion.proposalId}.`,
      timestamp: toTimestamp(candidate.lastUpdatedTimestamp),
      href,
      actorAddress: normalizeFeedAddress(candidate.proposerAddress),
      statusLabel: "Promoted",
    });
  } else if (candidate.canceledTimestamp) {
    items.push({
      id: `candidate-${candidate.id}-cancelled`,
      category: "candidate",
      type: "candidate-cancelled",
      title,
      timestamp: toTimestamp(candidate.canceledTimestamp),
      href,
      actorAddress: normalizeFeedAddress(candidate.proposerAddress),
      statusLabel: "Cancelled",
    });
  } else if (candidate.lastUpdatedTimestamp > candidate.createdTimestamp) {
    items.push({
      id: `candidate-${candidate.id}-updated-${candidate.latestVersion.id}`,
      category: "candidate",
      type: "candidate-updated",
      title,
      description: candidate.latestVersion.updateMessage || undefined,
      timestamp: toTimestamp(candidate.lastUpdatedTimestamp),
      href,
      actorAddress: normalizeFeedAddress(candidate.proposerAddress),
      statusLabel: "Updated",
    });
  }

  for (const feedback of candidate.feedbackPosts || []) {
    items.push({
      id: `candidate-${candidate.id}-feedback-${feedback.id}`,
      category: "candidate",
      type: "candidate-feedback",
      title,
      description: feedback.reason || "Candidate feedback submitted.",
      timestamp: toTimestamp(feedback.createdTimestamp),
      href,
      actorAddress: normalizeFeedAddress(feedback.voterAddress),
      valueLabel: feedback.votes
        ? `${feedback.votes.toLocaleString()} votes`
        : undefined,
      statusLabel: feedbackSupportLabel(feedback.support),
    });
  }

  for (const signature of candidate.latestVersion.contentSignatures || []) {
    items.push({
      id: `candidate-${candidate.id}-signature-${signature.signer.id}-${signature.sig.slice(0, 10)}`,
      category: "candidate",
      type: "candidate-signature",
      title,
      description: "Candidate sponsorship signature added.",
      timestamp: toTimestamp(
        signature.createdTimestamp ?? candidate.lastUpdatedTimestamp,
      ),
      href,
      actorAddress: normalizeFeedAddress(signature.signer.id),
      statusLabel:
        signature.status === "expired" ? "Signature expired" : "Signature",
    });
  }
}

function pushTopicItems(items: GovernanceFeedItem[], topic: Topic) {
  const href = `/topics/${makeTopicUrlId(topic.id)}`;

  items.push({
    id: `topic-${topic.id}-created`,
    category: "topic",
    type: "topic-created",
    title: topic.title,
    description: "Governance topic opened.",
    timestamp: toTimestamp(topic.createdTimestamp),
    href,
    actorAddress: normalizeFeedAddress(topic.creator),
    statusLabel: "Topic created",
  });

  if (topic.canceled) {
    items.push({
      id: `topic-${topic.id}-closed`,
      category: "topic",
      type: "topic-closed",
      title: topic.title,
      description: "Governance topic closed.",
      timestamp: toTimestamp(topic.lastUpdatedTimestamp),
      href,
      actorAddress: normalizeFeedAddress(topic.creator),
      statusLabel: "Closed",
    });
  }

  for (const feedback of topic.feedback || []) {
    items.push({
      id: `topic-${topic.id}-feedback-${feedback.id}`,
      category: "topic",
      type: "topic-feedback",
      title: topic.title,
      description: feedback.reason || "Topic feedback submitted.",
      timestamp: toTimestamp(feedback.createdTimestamp),
      href,
      actorAddress: normalizeFeedAddress(feedback.voterAddress),
      statusLabel: feedbackSupportLabel(feedback.support),
    });
  }

  for (const signature of topic.signatures || []) {
    items.push({
      id: `topic-${topic.id}-signature-${signature.id}`,
      category: "topic",
      type: "topic-signature",
      title: topic.title,
      description: signature.reason || "Topic signature added.",
      timestamp: toTimestamp(signature.createdTimestamp),
      href,
      actorAddress: normalizeFeedAddress(signature.signerAddress),
      statusLabel:
        signature.status === "expired" ? "Signature expired" : "Signature",
    });
  }
}

function pushAuctionItems(
  items: GovernanceFeedItem[],
  auction?: Auction | null,
) {
  if (!auction) return;

  if (!auction.isVRGDAAuction) {
    items.push({
      id: `auction-${auction.nounId}-${auction.state}`,
      category: "auction",
      type: "auction-live",
      title: `Lil Noun ${auction.nounId} auction`,
      description:
        auction.state === "live"
          ? "Current auction is live."
          : "Auction awaiting settlement.",
      timestamp: toTimestamp(auction.startTime),
      href: "/",
      valueLabel: auction.nextMinBid
        ? `${formatEther(BigInt(auction.nextMinBid))} ETH min bid`
        : undefined,
      statusLabel: "Auction",
    });
  }

  for (const bid of auction.bids || []) {
    const isVrgdaPurchase = auction.isVRGDAAuction;

    items.push({
      id: `auction-${auction.nounId}-bid-${bid.transactionHash}`,
      category: "auction",
      type: isVrgdaPurchase ? "vrgda-purchase" : "auction-bid",
      title: isVrgdaPurchase
        ? `Purchased Lil Noun ${auction.nounId}`
        : `Bid on Lil Noun ${auction.nounId}`,
      description: isVrgdaPurchase
        ? "VRGDA purchase completed."
        : "Auction bid placed.",
      timestamp: toTimestamp(bid.timestamp),
      href: "/",
      actorAddress: normalizeFeedAddress(bid.bidderAddress),
      valueLabel: `${formatEther(BigInt(bid.amount))} ETH`,
      statusLabel: isVrgdaPurchase ? "VRGDA purchase" : "Bid",
    });
  }
}

export function buildGovernanceFeedItems(
  input: GovernanceFeedInput,
): GovernanceFeedItem[] {
  const items: GovernanceFeedItem[] = [];

  for (const proposal of input.proposals || []) {
    pushProposalItems(items, proposal);
  }

  for (const proposal of input.proposalDetails || []) {
    pushVoteItems(items, proposal);
  }

  for (const vote of input.proposalVotes || []) {
    pushVoteItem(items, vote);
  }

  for (const candidate of input.candidates || []) {
    pushCandidateItems(items, candidate);
  }

  for (const topic of input.topics || []) {
    pushTopicItems(items, topic);
  }

  pushAuctionItems(items, input.auction);

  return Array.from(
    new Map(items.map((item) => [item.id, item])).values(),
  ).sort((a, b) => {
    if (a.timestamp !== b.timestamp) return b.timestamp - a.timestamp;

    const rankDiff =
      (feedItemSortRank[b.type] || 0) - (feedItemSortRank[a.type] || 0);
    if (rankDiff !== 0) return rankDiff;

    return b.id.localeCompare(a.id);
  });
}

export function filterFeedItems(
  items: GovernanceFeedItem[],
  category: GovernanceFeedCategory,
): GovernanceFeedItem[] {
  if (category === "all") return items;
  return items.filter((item) => item.category === category);
}
