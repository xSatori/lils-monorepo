import { describe, expect, it } from "bun:test";

import { calculateVotePlacementBreakdown } from "./voteBreakdown";

describe("calculateVotePlacementBreakdown", () => {
  it("counts vote placements instead of voting power weight", () => {
    const breakdown = calculateVotePlacementBreakdown([
      { supportDetailed: 1, reason: "yes" },
      { supportDetailed: 1 },
      { supportDetailed: 0, reason: "no" },
      { supportDetailed: 2 },
    ]);

    expect(breakdown).toEqual({
      forVotes: 2,
      againstVotes: 1,
      abstainVotes: 1,
      totalVotes: 4,
      reasonPercent: 50,
    });
  });
});
