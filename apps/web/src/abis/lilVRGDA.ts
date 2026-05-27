export const lilVRGDAAbi = [
  // From LilVRGDA.sol contract - key functions we need:
  {
    inputs: [
      { name: "expectedBlockNumber", type: "uint256" },
      { name: "expectedNounId", type: "uint256" }
    ],
    name: "buyNow",
    outputs: [],
    stateMutability: "payable",
    type: "function"
  },
  {
    inputs: [],
    name: "getCurrentVRGDAPrice",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "nextNounId",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "poolSize",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "reservePrice",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "updateInterval",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [{ name: "blockNumber", type: "uint256" }],
    name: "fetchNoun",
    outputs: [
      { name: "nounId", type: "uint256" },
      { 
        name: "seed", 
        type: "tuple",
        components: [
          { name: "background", type: "uint48" },
          { name: "body", type: "uint48" },
          { name: "accessory", type: "uint48" },
          { name: "head", type: "uint48" },
          { name: "glasses", type: "uint48" }
        ]
      },
      { name: "svg", type: "string" },
      { name: "price", type: "uint256" },
      { name: "hash", type: "bytes32" },
      { name: "blockNum", type: "uint256" }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "fetchNextNoun",
    outputs: [
      { name: "nounId", type: "uint256" },
      { 
        name: "seed", 
        type: "tuple",
        components: [
          { name: "background", type: "uint48" },
          { name: "body", type: "uint48" },
          { name: "accessory", type: "uint48" },
          { name: "head", type: "uint48" },
          { name: "glasses", type: "uint48" }
        ]
      },
      { name: "svg", type: "string" },
      { name: "price", type: "uint256" },
      { name: "hash", type: "bytes32" },
      { name: "blockNumber", type: "uint256" }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [{ name: "numSold", type: "uint256" }],
    name: "getVRGDAPrice",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "nextNounIdForCaller",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "getSeederBlockNumber",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "targetPrice",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "paused",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [{ name: "", type: "uint256" }],
    name: "usedBlockNumbers",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
    type: "function"
  },
  // Events
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "nounId", type: "uint256" },
      { indexed: false, name: "winner", type: "address" },
      { indexed: false, name: "amount", type: "uint256" }
    ],
    name: "AuctionSettled",
    type: "event"
  }
] as const;
