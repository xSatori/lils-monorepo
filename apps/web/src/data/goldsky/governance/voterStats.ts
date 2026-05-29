import { getAddress, type Address } from "viem";

export interface VoterStatVote {
  id: string;
  voter: {
    id: string;
  };
  proposal: {
    id: string;
  };
  votes: string;
  reason?: string | null;
  blockTimestamp: string;
  voteRevotes?: Array<{
    id: string;
    revote: {
      id: string;
      voter: {
        id: string;
      };
      reason: string | null;
    };
  }>;
}

export interface VoterProfile {
  address: Address;
  proposalsVotedCount: number;
  totalVotes: number;
  totalVotesWithReason: number;
  votesPlacedCount: number;
  votesWithReasonCount: number;
  revotesCount: number;
  lastVoteTimestamp: number;
}

export function buildVoterProfiles(votes: VoterStatVote[]): VoterProfile[] {
  const voterMap = new Map<
    string,
    {
      proposals: Set<string>;
      totalVotes: number;
      totalVotesWithReason: number;
      votesPlacedCount: number;
      votesWithReasonCount: number;
      revotesCount: number;
      lastVoteTimestamp: number;
    }
  >();

  votes.forEach((vote) => {
    const weight = parseInt(vote.votes);
    if (!Number.isFinite(weight) || weight <= 0 || !vote.proposal?.id) return;

    let voterAddress: string;
    try {
      voterAddress = getAddress(vote.voter.id).toLowerCase();
    } catch {
      return;
    }

    if (!voterMap.has(voterAddress)) {
      voterMap.set(voterAddress, {
        proposals: new Set(),
        totalVotes: 0,
        totalVotesWithReason: 0,
        votesPlacedCount: 0,
        votesWithReasonCount: 0,
        revotesCount: 0,
        lastVoteTimestamp: 0,
      });
    }

    const voterData = voterMap.get(voterAddress)!;
    const hasReason = Boolean(vote.reason?.trim());
    voterData.proposals.add(vote.proposal.id);
    voterData.totalVotes += weight;
    voterData.votesPlacedCount += 1;
    voterData.revotesCount += vote.voteRevotes?.length ?? 0;
    if (hasReason) {
      voterData.totalVotesWithReason += weight;
      voterData.votesWithReasonCount += 1;
    }
    voterData.lastVoteTimestamp = Math.max(
      voterData.lastVoteTimestamp,
      Number(vote.blockTimestamp || 0),
    );
  });

  const voters: VoterProfile[] = Array.from(voterMap.entries()).map(
    ([address, data]) => ({
      address: getAddress(address) as Address,
      proposalsVotedCount: data.proposals.size,
      totalVotes: data.totalVotes,
      totalVotesWithReason: data.totalVotesWithReason,
      votesPlacedCount: data.votesPlacedCount,
      votesWithReasonCount: data.votesWithReasonCount,
      revotesCount: data.revotesCount,
      lastVoteTimestamp: data.lastVoteTimestamp,
    }),
  );

  voters.sort((a, b) => {
    if (b.proposalsVotedCount !== a.proposalsVotedCount) {
      return b.proposalsVotedCount - a.proposalsVotedCount;
    }
    return b.totalVotes - a.totalVotes;
  });

  return voters;
}
