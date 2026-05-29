// @ts-nocheck
import { describe, expect, it } from "bun:test";

import { buildGovernanceFeedItems, filterFeedItems } from "./feed-adapters";
import type { GovernanceFeedItem } from "./types";

const proposer = "0x000000000000000000000000000000000000dEaD" as `0x${string}`;
const voter = "0x000000000000000000000000000000000000bEEF" as `0x${string}`;

describe("governance feed adapters", () => {
  it("normalizes proposal lifecycle and vote activity into newest-first feed items", () => {
    const items = buildGovernanceFeedItems({
      proposals: [
        {
          id: 42,
          title: "Fund public goods",
          proposerAddress: proposer,
          forVotes: 12,
          againstVotes: 1,
          abstainVotes: 0,
          quorumVotes: 10,
          state: "active",
          creationBlock: 1,
          createdTimestamp: 100,
          votingStartBlock: 2,
          votingStartTimestamp: 120,
          votingEndBlock: 3,
          votingEndTimestamp: 220,
        },
      ],
      proposalDetails: [
        {
          id: 42,
          title: "Fund public goods",
          proposerAddress: proposer,
          forVotes: 12,
          againstVotes: 1,
          abstainVotes: 0,
          quorumVotes: 10,
          state: "active",
          creationBlock: 1,
          createdTimestamp: 100,
          votingStartBlock: 2,
          votingStartTimestamp: 120,
          votingEndBlock: 3,
          votingEndTimestamp: 220,
          description: "",
          transactions: [],
          votes: [
            {
              id: "42-1",
              voterAddress: voter,
              supportDetailed: 1,
              votes: "7",
              weight: 7,
              reason: "Strong public benefit",
              transactionHash: "0xvote",
              blockTimestamp: "180",
              timestamp: "180",
              nouns: [],
            },
          ],
        },
      ],
    });

    expect(items.map((item) => item.type)).toContain("proposal-created");
    expect(items.map((item) => item.type)).toContain("proposal-active");
    expect(items.map((item) => item.type)).toContain("proposal-vote");
    expect(items[0].timestamp).toBe(180);
    expect(
      items.find((item) => item.type === "proposal-created")?.description,
    ).toBeUndefined();
    expect(
      items.find((item) => item.type === "proposal-created")?.actorAddress,
    ).toBe(proposer);
    expect(
      items.find((item) => item.type === "proposal-active")?.actorAddress,
    ).toBeUndefined();
  });

  it("normalizes recent proposal votes without requiring proposal details", () => {
    const items = buildGovernanceFeedItems({
      proposalVotes: [
        {
          id: "42-1",
          proposalId: 42,
          proposalTitle: "Fund public goods",
          voterAddress: voter,
          supportDetailed: 1,
          votes: "7",
          weight: 7,
          reason: "Strong public benefit",
          transactionHash: "0xvote",
          blockTimestamp: "180",
          timestamp: "180",
          nouns: [],
        },
      ],
    });

    expect(items).toHaveLength(1);
    expect(items[0].type).toBe("proposal-vote");
    expect(items[0].title).toBe("For on Proposal 42: Fund public goods");
    expect(items[0].href).toBe("/vote/42");
    expect(items[0].description).toBe("Strong public benefit");
    expect(items[0].voteCountLabel).toBe("7");
    expect(items[0].valueLabel).toBeUndefined();
  });

  it("keeps proposal vote titles inline instead of duplicating them as descriptions", () => {
    const items = buildGovernanceFeedItems({
      proposalVotes: [
        {
          id: "42-1",
          proposalId: 42,
          proposalTitle: "Fund public goods",
          voterAddress: voter,
          supportDetailed: 1,
          votes: "7",
          weight: 7,
          reason: "",
          transactionHash: "0xvote",
          blockTimestamp: "180",
          timestamp: "180",
          nouns: [],
        },
      ],
    });

    expect(items[0].title).toBe("For on Proposal 42: Fund public goods");
    expect(items[0].description).toBeUndefined();
  });

  it("orders cancellation after creation and omits voting start when cancelled before voting", () => {
    const items = buildGovernanceFeedItems({
      proposals: [
        {
          id: 377,
          title: "Lil GIF Value",
          proposerAddress: proposer,
          forVotes: 0,
          againstVotes: 0,
          abstainVotes: 0,
          quorumVotes: 10,
          state: "cancelled",
          creationBlock: 25031701,
          createdTimestamp: 1778018951,
          votingStartBlock: 25046101,
          votingStartTimestamp: 1778191751,
          votingEndBlock: 25074901,
          votingEndTimestamp: 1778537351,
          canceledBlock: 25031819,
          canceledTimestamp: 1778020367,
        },
      ],
    });

    expect(items.map((item) => item.type)).toEqual([
      "proposal-cancelled",
      "proposal-created",
    ]);
    expect(items[0].timestamp).toBe(1778020367);
    expect(items[1].timestamp).toBe(1778018951);
  });

  it("uses logical lifecycle order when proposal event timestamps are tied", () => {
    const items = buildGovernanceFeedItems({
      proposals: [
        {
          id: 377,
          title: "Lil GIF Value",
          proposerAddress: proposer,
          forVotes: 0,
          againstVotes: 0,
          abstainVotes: 0,
          quorumVotes: 10,
          state: "cancelled",
          creationBlock: 25031701,
          createdTimestamp: 1778018951,
          votingStartBlock: 25046101,
          votingStartTimestamp: 1778191751,
          votingEndBlock: 25074901,
          votingEndTimestamp: 1778537351,
        },
      ],
    });

    expect(items.map((item) => item.type)).toEqual([
      "proposal-cancelled",
      "proposal-created",
    ]);
    expect(items[0].timestamp).toBe(items[1].timestamp);
  });

  it("emits voting start for active proposals after creation", () => {
    const items = buildGovernanceFeedItems({
      proposals: [
        {
          id: 378,
          title: "Lil GIF Value",
          proposerAddress: proposer,
          forVotes: 0,
          againstVotes: 0,
          abstainVotes: 0,
          quorumVotes: 10,
          state: "active",
          creationBlock: 25031822,
          createdTimestamp: 1778020403,
          votingStartBlock: 25046222,
          votingStartTimestamp: 1778193203,
          votingEndBlock: 25075022,
          votingEndTimestamp: 1778538803,
        },
      ],
    });

    expect(items.map((item) => item.type)).toEqual([
      "proposal-active",
      "proposal-created",
    ]);
    expect(items[0].statusLabel).toBe("Voting started");
    expect(items[0].timestamp).toBe(1778193203);
  });

  it("emits each logical proposal lifecycle event in timestamp order", () => {
    const items = buildGovernanceFeedItems({
      proposals: [
        {
          id: 43,
          title: "Execute the plan",
          proposerAddress: proposer,
          forVotes: 20,
          againstVotes: 1,
          abstainVotes: 0,
          quorumVotes: 10,
          state: "executed",
          creationBlock: 1,
          createdTimestamp: 100,
          votingStartBlock: 2,
          votingStartTimestamp: 120,
          votingEndBlock: 3,
          votingEndTimestamp: 220,
          queuedBlock: 4,
          queuedTimestamp: 240,
          executedBlock: 5,
          executedTimestamp: 300,
        },
      ],
    });

    expect(items.map((item) => item.type)).toEqual([
      "proposal-executed",
      "proposal-queued",
      "proposal-ended",
      "proposal-active",
      "proposal-created",
    ]);
    expect(items.map((item) => item.timestamp)).toEqual([
      300, 240, 220, 120, 100,
    ]);
  });

  it("uses logical lifecycle order when successful proposal event timestamps are tied", () => {
    const items = buildGovernanceFeedItems({
      proposals: [
        {
          id: 44,
          title: "Same block lifecycle",
          proposerAddress: proposer,
          forVotes: 20,
          againstVotes: 1,
          abstainVotes: 0,
          quorumVotes: 10,
          state: "executed",
          creationBlock: 1,
          createdTimestamp: 100,
          votingStartBlock: 2,
          votingStartTimestamp: 120,
          votingEndBlock: 3,
          votingEndTimestamp: 220,
          queuedBlock: 3,
          queuedTimestamp: 220,
          executedBlock: 3,
          executedTimestamp: 220,
        },
      ],
    });

    expect(items.map((item) => item.type)).toEqual([
      "proposal-executed",
      "proposal-queued",
      "proposal-ended",
      "proposal-active",
      "proposal-created",
    ]);
  });

  it("deduplicates proposal votes that arrive from both detail and recent vote queries", () => {
    const vote = {
      id: "42-1",
      voterAddress: voter,
      supportDetailed: 1,
      votes: "7",
      weight: 7,
      reason: "Strong public benefit",
      transactionHash: "0xvote",
      blockTimestamp: "180",
      timestamp: "180",
      nouns: [],
    };
    const items = buildGovernanceFeedItems({
      proposalDetails: [
        {
          id: 42,
          title: "Fund public goods",
          proposerAddress: proposer,
          forVotes: 12,
          againstVotes: 1,
          abstainVotes: 0,
          quorumVotes: 10,
          state: "active",
          creationBlock: 1,
          createdTimestamp: 100,
          votingStartBlock: 2,
          votingStartTimestamp: 120,
          votingEndBlock: 3,
          votingEndTimestamp: 220,
          description: "",
          transactions: [],
          votes: [vote],
        },
      ],
      proposalVotes: [
        {
          ...vote,
          proposalId: 42,
          proposalTitle: "Fund public goods",
        },
      ],
    });

    expect(items.filter((item) => item.type === "proposal-vote")).toHaveLength(
      1,
    );
  });

  it("normalizes candidate and topic feedback/signature activity", () => {
    const items = buildGovernanceFeedItems({
      candidates: [
        {
          id: `${proposer.toLowerCase()}-candidate`,
          proposerAddress: proposer,
          slug: "candidate",
          createdTimestamp: 100,
          canceledTimestamp: null,
          lastUpdatedTimestamp: 150,
          latestVersion: {
            id: "candidate-v2",
            createdTimestamp: 150,
            updateMessage: "Updated budget",
            content: {
              title: "Candidate",
              description: "",
              targets: [],
              values: [],
              signatures: [],
              calldatas: [],
            },
            proposalId: 43,
            targetProposalId: null,
            contentSignatures: [
              {
                sig: "0xsig",
                signer: { id: voter, nounsRepresented: [] },
                expirationTimestamp: 999,
                createdTimestamp: 140,
                canceled: false,
                status: "valid",
              },
            ],
          },
          versions: [{ id: "candidate-v1", createdTimestamp: 100 }],
          feedbackPosts: [
            {
              id: "feedback-1",
              voterAddress: voter,
              support: 1,
              reason: "Looks ready",
              votes: 2,
              createdTimestamp: 130,
            },
          ],
          sponsors: [],
        },
      ],
      topics: [
        {
          id: `${proposer.toLowerCase()}-topic`,
          creator: proposer,
          slug: "topic",
          title: "Topic",
          description: "",
          encodedTopicHash: "0x",
          canceled: false,
          createdTimestamp: 200,
          createdBlock: 1,
          createdTransactionHash: "0x",
          lastUpdatedTimestamp: 200,
          lastUpdatedBlock: 1,
          lastUpdatedTransactionHash: "0x",
          feedback: [
            {
              id: "topic-feedback",
              voterAddress: voter,
              support: 1,
              reason: "Discuss this",
              createdTimestamp: 210,
              createdBlock: 1,
              createdTransactionHash: "0x",
            },
          ],
          signatures: [
            {
              id: "topic-signature",
              signerAddress: voter,
              sig: "0xsig",
              expirationTimestamp: 999,
              support: 1,
              sigDigest: "0x",
              reason: "Support",
              createdTimestamp: 220,
              createdBlock: 1,
              createdTransactionHash: "0x",
              status: "valid",
            },
          ],
        },
      ],
    });

    expect(items.map((item) => item.type)).toContain("candidate-promoted");
    expect(items.map((item) => item.type)).toContain("candidate-feedback");
    expect(items.map((item) => item.type)).toContain("topic-feedback");
    expect(items.map((item) => item.type)).toContain("topic-signature");
  });

  it("omits redundant default candidate descriptions", () => {
    const items = buildGovernanceFeedItems({
      candidates: [
        {
          id: `${proposer.toLowerCase()}-candidate`,
          proposerAddress: proposer,
          slug: "candidate",
          createdTimestamp: 100,
          canceledTimestamp: null,
          lastUpdatedTimestamp: 150,
          latestVersion: {
            id: "candidate-v2",
            createdTimestamp: 150,
            updateMessage: "",
            content: {
              title: "Candidate",
              description: "",
              targets: [],
              values: [],
              signatures: [],
              calldatas: [],
            },
            proposalId: null,
            targetProposalId: null,
            contentSignatures: [],
          },
          versions: [{ id: "candidate-v1", createdTimestamp: 100 }],
          feedbackPosts: [],
          sponsors: [],
        },
      ],
    });

    expect(
      items.find((item) => item.type === "candidate-created")?.description,
    ).toBeUndefined();
    expect(
      items.find((item) => item.type === "candidate-updated")?.description,
    ).toBeUndefined();
  });

  it("filters by category without mutating item order", () => {
    const items: GovernanceFeedItem[] = [
      {
        id: "p",
        category: "proposal",
        type: "proposal-created",
        title: "P",
        timestamp: 2,
        href: "/vote/1",
      },
      {
        id: "t",
        category: "topic",
        type: "topic-created",
        title: "T",
        timestamp: 1,
        href: "/topics/t",
      },
    ];

    expect(filterFeedItems(items, "all")).toEqual(items);
    expect(filterFeedItems(items, "topic")).toEqual([items[1]]);
  });

  it("only normalizes VRGDA purchases, not pool seed or price activity", () => {
    const items = buildGovernanceFeedItems({
      auction: {
        nounId: "123",
        isVRGDAAuction: true,
        startTime: "100",
        endTime: "200",
        nextMinBid: "100000000000000000",
        state: "ended-settled",
        nounderAuction: false,
        nounsdaoAuction: false,
        bids: [
          {
            transactionHash: "0xpurchase",
            bidderAddress: voter,
            amount: "100000000000000000",
            timestamp: "150",
          },
        ],
      },
    });

    expect(items).toHaveLength(1);
    expect(items[0].type).toBe("vrgda-purchase");
    expect(items[0].title).toBe("Purchased Lil Noun 123");
  });
});
