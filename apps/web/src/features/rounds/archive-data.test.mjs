import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";
import { test } from "node:test";

function archive(name) {
  return JSON.parse(readFileSync(new URL(`./archive/${name}.json`, import.meta.url), "utf8"));
}

test("each archived round resolves to its own proposals, winner references and ballot records", () => {
  const rounds = archive("index");
  assert.equal(new Set(rounds.map((round) => round.handle)).size, rounds.length);
  assert.deepEqual([...new Set(rounds.map((round) => round.source))].sort(), ["nouns.gg", "prop-house"]);
  for (const round of rounds) {
    const { proposals, votes } = archive(round.handle);
    const ids = new Set(proposals.map((proposal) => proposal.id));
    assert.equal(ids.size, round.proposalCount);
    for (const award of round.awards) {
      assert.ok(award.winnerProposalId === null || ids.has(award.winnerProposalId));
    }
    for (const proposal of proposals) {
      assert.equal(proposal.roundHandle, round.handle);
      assert.equal(proposal.source, round.source);
      const ballots = votes[proposal.id] || [];
      assert.equal(new Set(ballots.map((vote) => vote.voter)).size, proposal.voterCount);
      assert.equal(new Set(ballots.map((vote) => vote.id)).size, ballots.length);
    }
    assert.ok(Object.keys(votes).every((id) => ids.has(Number(id))));
  }
});
