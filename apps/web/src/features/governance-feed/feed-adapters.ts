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
import { makeTopicUrlId, type Topic } from "@/data/goldsky/governance/getTopics";

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

function isNonZeroTimestamp(value: number | string | undefined | null): value is number | string {
  if (value === undefined || value === null) return false;
  return Number(value) > 0;
}

function normalizeFeedAddress(value: Address | string | undefined | null): Address | undefined {
  if (!value) return undefined;

  try {
    return getAddress(value);
  } catch {
    return undefined;
  }
}

function toTimestamp(value: number | string | undefined | null): number {
  return isNonZeroTimestamp(value) ? Number(value) : Math.floor(Date.now() / 1000);
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
  return trimmedTitle ? `Proposal ${proposalId}: ${trimmedTitle}` : `Proposal ${proposalId}`;
}

function pushProposalItems(items: GovernanceFeedItem[], proposal: ProposalOverview) {
  items.push({
    id: `proposal-${proposal.id}-created`,
    category: "proposal",
    type: "proposal-created",
    title: proposalDisplayTitle(proposal.id, proposal.title),
    timestamp: toTimestamp(proposal.createdTimestamp ?? proposal.votingStartTimestamp),
    href: `/vote/${proposal.id}`,
    actorAddress: normalizeFeedAddress(proposal.proposerAddress),
    statusLabel: "Created",
  });

  const stateLabel = proposalStateLabels[proposal.state];
  if (!stateLabel) return;

  const isEndedState = ["successful", "failed", "metagov_closed"].includes(proposal.state);
  const type =
    proposal.state === "active" || proposal.state === "metagov_active"
      ? "proposal-active"
      : proposal.state === "queued"
        ? "proposal-queued"
        : proposal.state === "executed"
          ? "proposal-executed"
          : proposal.state === "cancelled" || proposal.state === "vetoed"
            ? "proposal-cancelled"
            : "proposal-ended";

  items.push({
    id: `proposal-${proposal.id}-${proposal.state}`,
    category: "proposal",
    type,
    title: proposalDisplayTitle(proposal.id, proposal.title),
    timestamp: toTimestamp(
      proposal.state === "queued"
        ? proposal.executionEtaTimestamp
        : isEndedState
          ? proposal.votingEndTimestamp
          : proposal.votingStartTimestamp,
    ),
    href: `/vote/${proposal.id}`,
    actorAddress: normalizeFeedAddress(proposal.proposerAddress),
    statusLabel: stateLabel,
  });
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

function pushVoteItems(items: GovernanceFeedItem[], proposal: DetailedProposal) {
  for (const vote of proposal.votes || []) {
    pushVoteItem(items, vote, proposal);
  }
}

function pushCandidateItems(items: GovernanceFeedItem[], candidate: ProposalIdea) {
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
      valueLabel: feedback.votes ? `${feedback.votes.toLocaleString()} votes` : undefined,
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
      timestamp: toTimestamp(signature.createdTimestamp ?? candidate.lastUpdatedTimestamp),
      href,
      actorAddress: normalizeFeedAddress(signature.signer.id),
      statusLabel: signature.status === "expired" ? "Signature expired" : "Signature",
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
      statusLabel: signature.status === "expired" ? "Signature expired" : "Signature",
    });
  }
}

function pushAuctionItems(items: GovernanceFeedItem[], auction?: Auction | null) {
  if (!auction) return;

  if (!auction.isVRGDAAuction) {
    items.push({
      id: `auction-${auction.nounId}-${auction.state}`,
      category: "auction",
      type: "auction-live",
      title: `Lil Noun ${auction.nounId} auction`,
      description: auction.state === "live" ? "Current auction is live." : "Auction awaiting settlement.",
      timestamp: toTimestamp(auction.startTime),
      href: "/",
      valueLabel: auction.nextMinBid ? `${formatEther(BigInt(auction.nextMinBid))} ETH min bid` : undefined,
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
      description: isVrgdaPurchase ? "VRGDA purchase completed." : "Auction bid placed.",
      timestamp: toTimestamp(bid.timestamp),
      href: "/",
      actorAddress: normalizeFeedAddress(bid.bidderAddress),
      valueLabel: `${formatEther(BigInt(bid.amount))} ETH`,
      statusLabel: isVrgdaPurchase ? "VRGDA purchase" : "Bid",
    });
  }
}

export function buildGovernanceFeedItems(input: GovernanceFeedInput): GovernanceFeedItem[] {
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

  return Array.from(new Map(items.map((item) => [item.id, item])).values()).sort(
    (a, b) => b.timestamp - a.timestamp,
  );
}

export function filterFeedItems(
  items: GovernanceFeedItem[],
  category: GovernanceFeedCategory,
): GovernanceFeedItem[] {
  if (category === "all") return items;
  return items.filter((item) => item.category === category);
}
