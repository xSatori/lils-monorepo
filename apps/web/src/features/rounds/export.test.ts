// @ts-nocheck -- Bun's test globals are executed by Bun and are not in the app tsconfig.
import { describe, expect, it } from "bun:test";

import { roundSubmissionsCsv, roundVoteActivityCsv } from "./export";

describe("Rounds derived CSV exports", () => {
  it("escapes rich metadata and marks deterministic winners", () => {
    const result = roundSubmissionsCsv({
      winners: [0n],
      submissions: [
        {
          id: 0n,
          owner: "0x0000000000000000000000000000000000000001",
          submissionType: 0,
          status: 1,
          metadata: {
            title: 'Useful, "small" tool',
            description: "Line one\nLine two",
          },
          metadataURI: "ipfs://entry",
          metadataHash: "0xmetadata",
          titleHash: "0xtitle",
          descriptionHash: "0xdescription",
          votes: 7n,
        },
      ],
    });
    expect(result).toContain('"Useful, ""small"" tool"');
    expect(result).toContain('"Line one\nLine two"');
    expect(result).toEndWith(",7,true");
  });

  it("includes idempotency coordinates in vote activity", () => {
    const result = roundVoteActivityCsv({
      voteActivity: [
        {
          voter: "0x0000000000000000000000000000000000000002",
          submissionId: 3n,
          amount: 2n,
          voterSubmissionTotal: 5n,
          submissionTotal: 9n,
          transactionHash: "0xtransaction",
          logIndex: 4,
        },
      ],
    });
    expect(result).toContain("0xtransaction,4");
  });
});
