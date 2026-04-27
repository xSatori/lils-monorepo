import { Address, parseEther } from "viem";

export const LIL_NOUNS_ROUNDS_FEE = parseEther("0.01");
export const LIL_NOUNS_TREASURY_ADDRESS =
  "0xd5f279ff9eb21c6d40c8f345a66f2751c4eea1fb" as Address;
export const LIL_NOUNS_TOKEN_ADDRESS =
  "0x4b10701Bfd7BFEdc47d50562b76b436fbB5BdB3B" as Address;
export const ETH_PRIZE_TOKEN = "0x0000000000000000000000000000000000000000" as Address;

export const roundsFactoryAddresses: Partial<Record<number, Address>> = {
  1: "0x0000000000000000000000000000000000000000",
};

export const roundsFactoryAbi = [
  {
    type: "function",
    name: "FLAT_FEE",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "createEthRound",
    stateMutability: "payable",
    inputs: [
      {
        name: "config",
        type: "tuple",
        components: [
          { name: "admin", type: "address" },
          { name: "eligibilityToken", type: "address" },
          { name: "useVotePower", type: "bool" },
          { name: "startsAt", type: "uint64" },
          { name: "proposalsEndAt", type: "uint64" },
          { name: "votingEndAt", type: "uint64" },
          { name: "endsAt", type: "uint64" },
          { name: "metadataURI", type: "string" },
          { name: "initialWinners", type: "address[]" },
          { name: "initialPayouts", type: "uint256[]" },
        ],
      },
    ],
    outputs: [{ name: "round", type: "address" }],
  },
  {
    type: "function",
    name: "createErc20Round",
    stateMutability: "payable",
    inputs: [
      {
        name: "config",
        type: "tuple",
        components: [
          { name: "admin", type: "address" },
          { name: "eligibilityToken", type: "address" },
          { name: "useVotePower", type: "bool" },
          { name: "startsAt", type: "uint64" },
          { name: "proposalsEndAt", type: "uint64" },
          { name: "votingEndAt", type: "uint64" },
          { name: "endsAt", type: "uint64" },
          { name: "metadataURI", type: "string" },
          { name: "initialWinners", type: "address[]" },
          { name: "initialPayouts", type: "uint256[]" },
        ],
      },
      { name: "prizeToken", type: "address" },
      { name: "prizeAmount", type: "uint256" },
    ],
    outputs: [{ name: "round", type: "address" }],
  },
  {
    type: "function",
    name: "setPrizeTokenAllowed",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "allowed", type: "bool" },
    ],
    outputs: [],
  },
  {
    type: "event",
    name: "RoundCreated",
    anonymous: false,
    inputs: [
      { name: "round", type: "address", indexed: true },
      { name: "creator", type: "address", indexed: true },
      { name: "admin", type: "address", indexed: true },
      { name: "prizeToken", type: "address", indexed: false },
      { name: "prizeAmount", type: "uint256", indexed: false },
      { name: "metadataURI", type: "string", indexed: false },
    ],
  },
] as const;

export const roundsRoundAbi = [
  {
    type: "function",
    name: "submitProposal",
    stateMutability: "nonpayable",
    inputs: [{ name: "proposalMetadataURI", type: "string" }],
    outputs: [{ name: "proposalId", type: "uint256" }],
  },
  {
    type: "function",
    name: "submitVote",
    stateMutability: "nonpayable",
    inputs: [
      { name: "voteHash", type: "bytes32" },
      { name: "voteURI", type: "string" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "submitVoteWithTokenIds",
    stateMutability: "nonpayable",
    inputs: [
      { name: "voteHash", type: "bytes32" },
      { name: "voteURI", type: "string" },
      { name: "tokenIds", type: "uint256[]" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "activateVotingSnapshot",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [{ name: "snapshotBlock", type: "uint256" }],
  },
  {
    type: "function",
    name: "claimPrize",
    stateMutability: "nonpayable",
    inputs: [{ name: "recipient", type: "address" }],
    outputs: [],
  },
  {
    type: "function",
    name: "setUnallocatedRefundApproved",
    stateMutability: "nonpayable",
    inputs: [{ name: "approved", type: "bool" }],
    outputs: [],
  },
  {
    type: "function",
    name: "recoverSurplus",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "recipient", type: "address" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "setWinners",
    stateMutability: "nonpayable",
    inputs: [
      { name: "newWinners", type: "address[]" },
      { name: "newPayouts", type: "uint256[]" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "finalizeWinnersAndPay",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    type: "function",
    name: "globalRefundToCreator",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    type: "function",
    name: "setPaused",
    stateMutability: "nonpayable",
    inputs: [{ name: "newPaused", type: "bool" }],
    outputs: [],
  },
] as const;
