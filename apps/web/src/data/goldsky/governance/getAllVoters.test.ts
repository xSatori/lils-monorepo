// @ts-nocheck
import { describe, expect, it } from "bun:test";

import { buildVoterProfiles } from "./voterStats";

describe("buildVoterProfiles", () => {
  it("aggregates wallets into voter stats sorted by proposals voted and total votes", () => {
    const voters = buildVoterProfiles([
      {
        id: "vote-1",
        voter: { id: "0x0000000000000000000000000000000000000001" },
        proposal: { id: "1" },
        votes: "2",
        reason: "looks good",
        blockTimestamp: "100",
        voteRevotes: [
          {
            id: "revote-1",
            revote: {
              id: "vote-1b",
              voter: { id: "0x0000000000000000000000000000000000000001" },
              reason: "changed my mind",
            },
          },
        ],
      },
      {
        id: "vote-2",
        voter: { id: "0x0000000000000000000000000000000000000001" },
        proposal: { id: "2" },
        votes: "3",
        blockTimestamp: "110",
      },
      {
        id: "vote-3",
        voter: { id: "0x0000000000000000000000000000000000000002" },
        proposal: { id: "1" },
        votes: "10",
        blockTimestamp: "120",
      },
    ]);

    expect(voters).toEqual([
      {
        address: "0x0000000000000000000000000000000000000001",
        proposalsVotedCount: 2,
        totalVotes: 5,
        totalVotesWithReason: 2,
        votesPlacedCount: 2,
        votesWithReasonCount: 1,
        revotesCount: 1,
        lastVoteTimestamp: 110,
      },
      {
        address: "0x0000000000000000000000000000000000000002",
        proposalsVotedCount: 1,
        totalVotes: 10,
        totalVotesWithReason: 0,
        votesPlacedCount: 1,
        votesWithReasonCount: 0,
        revotesCount: 0,
        lastVoteTimestamp: 120,
      },
    ]);
  });
});
