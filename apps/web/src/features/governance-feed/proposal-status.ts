import type { ProposalOverview, ProposalState } from "@/data/goldsky/governance/common";

const liveProposalStates = new Set<ProposalState>([
  "pending",
  "active",
  "updatable",
  "metagov_active",
  "metagov_pending",
]);

const concludedProposalStates = new Set<ProposalState>([
  "successful",
  "failed",
  "cancelled",
  "executed",
  "vetoed",
]);

function getCurrentTimestamp() {
  return Math.floor(Date.now() / 1000);
}

function getEndedVoteState(proposal: ProposalOverview): ProposalState {
  const hasQuorum = proposal.forVotes >= proposal.quorumVotes;
  const hasMoreForVotes = proposal.forVotes > proposal.againstVotes;
  return hasQuorum && hasMoreForVotes ? "successful" : "failed";
}

export function normalizeProposalStatusByTiming(
  proposal: ProposalOverview,
  nowTimestamp = getCurrentTimestamp(),
): ProposalOverview {
  if (
    liveProposalStates.has(proposal.state) &&
    proposal.votingEndTimestamp > 0 &&
    nowTimestamp > proposal.votingEndTimestamp
  ) {
    return {
      ...proposal,
      state: getEndedVoteState(proposal),
    };
  }

  return proposal;
}

export function isLiveProposal(
  proposal: ProposalOverview,
  nowTimestamp = getCurrentTimestamp(),
) {
  const normalizedProposal = normalizeProposalStatusByTiming(proposal, nowTimestamp);

  if (!liveProposalStates.has(normalizedProposal.state)) {
    return false;
  }

  if (
    normalizedProposal.votingEndTimestamp > 0 &&
    nowTimestamp > normalizedProposal.votingEndTimestamp
  ) {
    return false;
  }

  if (
    ["active", "metagov_active"].includes(normalizedProposal.state) &&
    normalizedProposal.votingStartTimestamp > 0 &&
    nowTimestamp < normalizedProposal.votingStartTimestamp
  ) {
    return false;
  }

  return true;
}

export function isConcludedProposal(
  proposal: ProposalOverview,
  nowTimestamp = getCurrentTimestamp(),
) {
  const normalizedProposal = normalizeProposalStatusByTiming(proposal, nowTimestamp);

  if (isLiveProposal(normalizedProposal, nowTimestamp)) {
    return false;
  }

  return concludedProposalStates.has(normalizedProposal.state);
}

export function getProposalBuckets(
  proposals: ProposalOverview[],
  nowTimestamp = getCurrentTimestamp(),
) {
  const normalizedProposals = proposals.map((proposal) =>
    normalizeProposalStatusByTiming(proposal, nowTimestamp),
  );

  return {
    active: normalizedProposals.filter((proposal) =>
      isLiveProposal(proposal, nowTimestamp),
    ),
    concluded: normalizedProposals.filter((proposal) =>
      isConcludedProposal(proposal, nowTimestamp),
    ),
  };
}
