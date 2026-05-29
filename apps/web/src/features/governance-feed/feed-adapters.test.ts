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
    expect(items.find((item) => item.type === "proposal-created")?.description).toBeUndefined();
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

    expect(items.filter((item) => item.type === "proposal-vote")).toHaveLength(1);
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

    expect(items.find((item) => item.type === "candidate-created")?.description).toBeUndefined();
    expect(items.find((item) => item.type === "candidate-updated")?.description).toBeUndefined();
  });

  it("filters by category without mutating item order", () => {
    const items: GovernanceFeedItem[] = [
      { id: "p", category: "proposal", type: "proposal-created", title: "P", timestamp: 2, href: "/vote/1" },
      { id: "t", category: "topic", type: "topic-created", title: "T", timestamp: 1, href: "/topics/t" },
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
