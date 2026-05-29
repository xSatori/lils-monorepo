// @ts-nocheck
import { describe, expect, it } from "bun:test";

import type { ProposalOverview } from "@/data/goldsky/governance/common";

import {
  getProposalBuckets,
  normalizeProposalStatusByTiming,
} from "./proposal-status";

const proposer = "0x000000000000000000000000000000000000dEaD" as `0x${string}`;

function proposal(overrides: Partial<ProposalOverview>): ProposalOverview {
  return {
    id: 1,
    title: "Proposal",
    proposerAddress: proposer,
    forVotes: 10,
    againstVotes: 0,
    abstainVotes: 0,
    quorumVotes: 8,
    state: "active",
    creationBlock: 1,
    createdTimestamp: 100,
    votingStartBlock: 2,
    votingStartTimestamp: 120,
    votingEndBlock: 3,
    votingEndTimestamp: 220,
    ...overrides,
  };
}

describe("proposal status timing guards", () => {
  it("keeps active proposals in the active bucket while voting is live", () => {
    const buckets = getProposalBuckets([proposal({ id: 1 })], 180);

    expect(buckets.active.map((item) => item.id)).toEqual([1]);
    expect(buckets.concluded).toHaveLength(0);
  });

  it("moves stale active proposals past voting end into concluded", () => {
    const buckets = getProposalBuckets(
      [
        proposal({
          id: 378,
          state: "active",
          votingEndTimestamp: 220,
          forVotes: 20,
          againstVotes: 30,
          quorumVotes: 10,
        }),
      ],
      300,
    );

    expect(buckets.active).toHaveLength(0);
    expect(buckets.concluded.map((item) => item.id)).toEqual([378]);
    expect(buckets.concluded[0].state).toBe("failed");
  });

  it("normalizes stale active proposals to successful when they passed", () => {
    const normalized = normalizeProposalStatusByTiming(
      proposal({
        state: "active",
        votingEndTimestamp: 220,
        forVotes: 30,
        againstVotes: 2,
        quorumVotes: 10,
      }),
      300,
    );

    expect(normalized.state).toBe("successful");
  });
});
