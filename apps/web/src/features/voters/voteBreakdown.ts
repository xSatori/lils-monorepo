export interface VoteBreakdownInput {
  supportDetailed: number;
  reason?: string;
}

export interface VotePlacementBreakdown {
  forVotes: number;
  againstVotes: number;
  abstainVotes: number;
  totalVotes: number;
  reasonPercent: number;
}

export function calculateVotePlacementBreakdown(
  votes: VoteBreakdownInput[],
): VotePlacementBreakdown {
  const totals = votes.reduce(
    (acc, vote) => {
      if (vote.supportDetailed === 1) acc.forVotes += 1;
      else if (vote.supportDetailed === 0) acc.againstVotes += 1;
      else if (vote.supportDetailed === 2) acc.abstainVotes += 1;
      return acc;
    },
    { forVotes: 0, againstVotes: 0, abstainVotes: 0 },
  );

  const reasonedVotes = votes.filter((vote) => vote.reason?.trim()).length;

  return {
    ...totals,
    totalVotes: votes.length,
    reasonPercent: votes.length ? Math.round((reasonedVotes / votes.length) * 100) : 0,
  };
}
