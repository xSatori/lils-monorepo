import { describe, expect, it, mock } from "bun:test";

const proposer = "0x000000000000000000000000000000000000dEaD";

mock.module("@/data/ponder/lilCampApi", () => ({
  fetchLilCampCandidates: async () => [
    {
      id: `${proposer.toLowerCase()}-promoted-candidate`,
      slug: "promoted-candidate",
      proposer,
      title: "Promoted Candidate",
      description: "# Promoted Candidate\n\nReady for vote.",
      targets: ["0x0000000000000000000000000000000000000001"],
      values: ["0"],
      signatures_list: [""],
      calldatas: ["0x"],
      proposal_id: 367,
      proposal_id_to_update: null,
      created_timestamp: 100,
      last_updated_timestamp: 120,
      canceled: false,
      signatures: [],
      feedback: [],
      versions: [],
    },
  ],
  fetchLilCampCandidateById: async () => null,
  fetchLilCampCandidateBySlug: async () => null,
}));

describe("getProposalIdeas", () => {
  it("maps promoted candidate proposal ids into the frontend idea model", async () => {
    const { getProposalIdeas } = await import("../getProposalIdeas");

    const ideas = await getProposalIdeas();

    expect(ideas).toHaveLength(1);
    expect(ideas[0].latestVersion.proposalId).toBe(367);
  });
});
