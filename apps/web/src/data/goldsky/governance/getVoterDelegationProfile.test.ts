import { describe, expect, it } from "bun:test";
import { getAddress, type Address } from "viem";

import.meta.env.VITE_MAINNET_RPC_URL ??= "http://127.0.0.1:8545";

const { buildVoterDelegationProfile, buildVoterDelegationStats } = await import(
  "./getVoterDelegationProfile"
);

const voterAddress = getAddress("0xdcf37d8aa17142f053aaa7dc56025ab00d897a19") as Address;
const delegateAddress = getAddress("0xfc538ffd2923dddaed09c8ad1a51686275c56183") as Address;

describe("buildVoterDelegationProfile", () => {
  it("uses delegate voting power and represented nouns separate from owned delegated-away nouns", () => {
    const profile = buildVoterDelegationProfile(
      voterAddress,
      {
        id: voterAddress.toLowerCase(),
        tokenBalance: "9",
        delegate: { id: delegateAddress.toLowerCase() },
        nouns: [
          {
            id: "599",
            owner: {
              id: voterAddress.toLowerCase(),
              delegate: { id: delegateAddress.toLowerCase() },
            },
            seed: {
              background: "1",
              body: "29",
              accessory: "16",
              head: "96",
              glasses: "5",
            },
          },
        ],
      },
      {
        id: voterAddress.toLowerCase(),
        delegatedVotes: "17",
        tokenHoldersRepresentedAmount: 4,
        nounsRepresented: [
          {
            id: "8072",
            owner: {
              id: "0xbeb696c7cf034da6ffa413b411ba38184d2162af",
              delegate: { id: voterAddress.toLowerCase() },
            },
            seed: {
              background: "0",
              body: "28",
              accessory: "27",
              head: "105",
              glasses: "20",
            },
          },
        ],
      },
    );

    expect(profile.currentVotingPower).toBe(17);
    expect(profile.ownedNouns).toHaveLength(1);
    expect(profile.representedNouns).toHaveLength(1);
    expect(profile.delegateAddress).toBe(delegateAddress);
    expect(profile.tokenHoldersRepresented).toBe(4);
    expect(profile.representedNouns[0]).toMatchObject({
      id: "8072",
      delegate: voterAddress.toLowerCase(),
      background: 0,
      body: 28,
      accessory: 27,
      head: 105,
      glasses: 20,
    });
  });
});

describe("buildVoterDelegationStats", () => {
  it("maps voter-list current voting power from Delegate.delegatedVotes", () => {
    const stats = buildVoterDelegationStats([voterAddress], {
      accounts: [
        {
          id: voterAddress.toLowerCase(),
          tokenBalance: "9",
          delegate: { id: delegateAddress.toLowerCase() },
        },
      ],
      delegates: [
        {
          id: voterAddress.toLowerCase(),
          delegatedVotes: "17",
          tokenHoldersRepresentedAmount: 4,
        },
      ],
    });

    expect(stats.get(voterAddress.toLowerCase())).toEqual({
      address: voterAddress,
      currentVotingPower: 17,
      owned: 9,
      delegateAddress,
      tokenHoldersRepresented: 4,
    });
  });
});
