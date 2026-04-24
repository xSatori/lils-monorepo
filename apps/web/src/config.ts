import {
  Address,
  PublicClient,
  createPublicClient,
  fallback,
  getAddress,
  http,
} from "viem";
import { mainnet, Chain, sepolia } from "viem/chains";
// Environment variables are automatically available in Vite as import.meta.env.VITE_*

// Dynamic chain detection based on hostname (sepolia.localhost vs localhost)
import { detectChainFromHostname } from "./utils/networkDetection";

// Get sepolia addresses from addresses.json; prepare Sepolia config object
import addresses from "./addresses.json";

// Helper to safely get addresses by chainId, fallback to empty object if not present
const getChainAddresses = (chainId: string): Record<string, string> =>
  (addresses as Record<string, Record<string, string>>)[chainId] ?? {};

const sepoliaAddresses = getChainAddresses("11155111");

export interface ChainSpecificData {
  chain: Chain;
  publicClient: PublicClient;
  rpcUrl: {
    primary: string;
    fallback: string;
    /** Optional second fallback for 3-way rotation (e.g. external RPC proxy + Alchemy + Infura) */
    fallback2?: string;
  };
  addresses: {
    nounsToken: Address;
    nounsTreasury: Address; // a.k.a NounsDAOExecutor, which is the treasury time lock
    nounsDaoProxy: Address; // GovernorBravoDelegator, proxy to logic contract
    nounsDAODataProxy: Address; // proxy to NounsDAOData.sol contract, which
    nounsAuctionHouseProxy: Address;
    wrappedNativeToken: Address;
    noundersMultisig: Address;
    usdc: Address;
    nounsPayer: Address;
    nounsTokenBuyer: Address;
    stEth: Address;
    [key: string]: Address; // Allow additional addresses like nounsSeeder, lilVRGDA, etc.
  };
  nounsGovernanceUrl: string;
  subgraphUrl: {
    primary: string;
    fallback: string;
  };
  goldskyUrl: {
    primary: string;
    fallback: string;
  };
  indexerUrl: string; // Ponder indexer for financial data
  swapForWrappedNativeUrl: string;
  daoParams?: {
    votingPeriod: number;
    votingDelay: number;
    proposalThresholdBPS: number;
    lastMinuteWindowBlocks: number;
    objectionPeriodBlocks: number;
    updatablePeriodBlocks: number;
    minQuorumBPS: number;
    maxQuorumBPS: number;
    quorumCoefficient: number;
  };
  dataContractFees?: {
    createCandidateCost: bigint;
    updateCandidateCost: bigint;
    createTopicCost: bigint;
    feeRecipient: Address;
  };
}

const alchemyMainnetHttp = `https://eth-mainnet.g.alchemy.com/v2/${import.meta.env.VITE_ALCHEMY_API_KEY!}`;
const infuraMainnetHttp = `https://mainnet.infura.io/v3/${import.meta.env.VITE_INFURA_API_KEY!}`;

/**
 * Ethereum mainnet RPC URLs. Default: Alchemy → Infura (no Netlify/serverless per request).
 * Optional `VITE_RPC_PROXY_URL`: external JSON-RPC proxy (e.g. Cloudflare Worker with Goldsky secret).
 */
function getEthereumMainnetRpcUrls(): {
  primary: string;
  fallback: string;
  fallback2?: string;
} {
  const proxy = import.meta.env.VITE_RPC_PROXY_URL?.trim();
  if (proxy) {
    return {
      primary: proxy,
      fallback: alchemyMainnetHttp,
      fallback2: infuraMainnetHttp,
    };
  }
  return { primary: alchemyMainnetHttp, fallback: infuraMainnetHttp };
}

function createEthereumMainnetTransport() {
  const { primary, fallback: fallbackUrl, fallback2 } = getEthereumMainnetRpcUrls();
  if (fallback2 != null) {
    return fallback([http(primary), http(fallbackUrl), http(fallback2)]);
  }
  return fallback([http(primary), http(fallbackUrl)]);
}

export const mainnetPublicClient = createPublicClient({
  chain: mainnet,
  transport: createEthereumMainnetTransport(),
});

/** Lil Nouns mainnet: same transport stack as `mainnetPublicClient`. */
const lilNounsMainnetPublicClient = createPublicClient({
  chain: mainnet,
  transport: createEthereumMainnetTransport(),
});



// nouns dao specific configs and contract addresses
// (kept for potential future use; currently unused in codebase)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _NOUNSDAO_CHAIN_SPECIFIC_CONFIGS: Record<number, ChainSpecificData> = {
  [mainnet.id]: {
    chain: mainnet,
    rpcUrl: getEthereumMainnetRpcUrls(),
    publicClient: mainnetPublicClient,
    addresses: {
      nounsToken: getAddress("0x9C8fF314C9Bc7F6e59A9d9225Fb22946427eDC03"),
      nounsTreasury: getAddress("0xb1a32FC9F9D8b2cf86C068Cae13108809547ef71"),
      nounsDaoProxy: getAddress("0x6f3E6272A167e8AcCb32072d08E0957F9c79223d"),
      nounsDAODataProxy: getAddress(
        "0xf790A5f59678dd733fb3De93493A91f472ca1365",
      ),
      nounsAuctionHouseProxy: getAddress(
        "0x830BD73E4184ceF73443C15111a1DF14e495C706",
      ),
      wrappedNativeToken: getAddress(
        "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
      ),
      noundersMultisig: getAddress(
        "0x2573C60a6D127755aA2DC85e342F7da2378a0Cc5",
      ),
      usdc: getAddress("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"),
      nounsPayer: getAddress("0xd97Bcd9f47cEe35c0a9ec1dc40C1269afc9E8E1D"),
      nounsTokenBuyer: getAddress("0x4f2acdc74f6941390d9b1804fabc3e780388cfe5"),
      stEth: getAddress("0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84"),
    },
    nounsGovernanceUrl: "https://lilnouns.wtf/",
    subgraphUrl: {
      primary:
        "https://api.goldsky.com/api/public/project_cldjvjgtylso13swq3dre13sf/subgraphs/nouns/1.0.2/gn",
      fallback: `https://gateway-arbitrum.network.thegraph.com/api/${import.meta.env.VITE_DECENTRALIZED_SUBGRAPH_API_KEY}/deployments/id/Qmdfajyi6PSmc45xWpbZoYdses84SAAze6ZcCxuDAhJFzt`,
    },
    goldskyUrl: {
      primary: "https://api.goldsky.com/api/public/project_cldjvjgtylso13swq3dre13sf/subgraphs/nouns/1.0.2/gn",
      fallback: "https://api.goldsky.com/api/public/project_cldjvjgtylso13swq3dre13sf/subgraphs/nouns/1.0.2/gn",
    },
    indexerUrl: import.meta.env.VITE_INDEXER_URL!,
    swapForWrappedNativeUrl:
      "https://app.uniswap.org/swap?outputCurrency=0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2&chain=mainnet",
  },
  [sepolia.id]: {
    chain: sepolia,
    rpcUrl: {
      primary: `https://eth-sepolia.g.alchemy.com/v2/${import.meta.env.VITE_ALCHEMY_API_KEY!}`,
      fallback: `https://sepolia.infura.io/v3/${import.meta.env.VITE_INFURA_API_KEY!}`,
    },
    publicClient: createPublicClient({
      chain: sepolia,
      transport: fallback([
        http(
          `https://eth-sepolia.g.alchemy.com/v2/${import.meta.env.VITE_ALCHEMY_API_KEY!}`,
        ),
        http(
          `https://sepolia.infura.io/v3/${import.meta.env.VITE_INFURA_API_KEY!}`,
        ),
      ]),
    }),
    addresses: {
      // Core Nouns Contracts
      nounsToken: getAddress("0x6e48e79f718776CF412a87e047722dBFda5B465D"),
      nounsSeeder: getAddress("0x08d66049bad81Ae4a195F5E1E259eF8feed3EbdA"),
      nounsDescriptor: getAddress("0x852f20f0140a4b5aa29c70bf39c9a85edc2b454e"),
      nftDescriptor: getAddress("0x4943aa6c89cb69ef2bc5b56fa7ee94ae7c17c981"),

      // DAO Governance Contracts - Current V2 (pre-upgrade)
      nounsDAOProxy: getAddress("0xa7C37f79ff5E6F932147fC69724B6ED432CA6Aa7"), // Current proxy (V2)
      nounsDAOLogicV2: getAddress("0x77a74fBb28a1E08645587f52B73170D4c69Ba212"), // Current logic
      nounsDaoProxy: getAddress("0xa7C37f79ff5E6F932147fC69724B6ED432CA6Aa7"), // Alias for compatibility

      // DAO Governance Contracts 
      nounsDAOProxyV3: getAddress("0xa0506d9907343b3E9F9DE6E6a9B6a4Ef86cF76f6"), // Same as V2 (not upgraded)
      nounsDAOLogicV6: getAddress("0x30393AEF947AFD607E8311bb9Cb22a9755c016c9"), // Same as V2 (not upgraded)


      // Treasury & Executor
      nounsTreasury: getAddress("0xE54f098b1880C536e0083720922b8a365FB403DC"), // Timelock/Executor

      // DAOData Contracts
      nounsDAODataProxy: getAddress("0x2C0A2ef5CfC156269c9e0011001D4a393A4046Dc"), // Proxy
      nounsDAODataLogic: getAddress("0x78C31d397b82D3E124C7f9fAA320F7b63EA54067"), // V1 implementation
      nounsDAODataV2Logic: getAddress("0x6a69ff922710F720Ca8224704c0a19300E97e413"), // V2 implementation (active)

      // Auction
      nounsAuctionHouseProxy: getAddress("0xa7C37f79ff5E6F932147fC69724B6ED432CA6Aa7"),

      // Lil Nouns VRGDA
      lilVRGDA: getAddress("0xba4d2951571ee2aa78180c1d06cddb44ac2eac9f"),
      lilVRGDAProxy: getAddress("0x0d8c4d18765ab8808ab6cee4d7a760e8b93ab20c"),
      nounsSeederV2: getAddress("0xde44fa588474f9c6ef6a631dd46c76d6ff614e01"),

      // Standard Tokens (Sepolia)
      wrappedNativeToken: getAddress("0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14"), // WETH Sepolia
      usdc: getAddress("0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238"), // USDC Sepolia
      stEth: getAddress("0x3e3FE7dBc6B4C189E7128855dD526361c49b40Af"), // Lido stETH Sepolia

      // Multisig & Payer
      noundersMultisig: getAddress("0x0000000000000000000000000000000000000000"),
      nounsPayer: getAddress("0xd97Bcd9f47cEe35c0a9ec1dc40C1269afc9E8E1D"),
      nounsTokenBuyer: getAddress("0x4f2acdc74f6941390d9b1804fabc3e780388cfe5"),
    },
    nounsGovernanceUrl: "https://sepolia.lilnouns.wtf/",
    subgraphUrl: {
      primary: "https://api.goldsky.com/api/public/project_cldjvjgtylso13swq3dre13sf/subgraphs/lil-nouns-sepolia/0.1.17/gn",
      fallback: "https://api.goldsky.com/api/public/project_cldjvjgtylso13swq3dre13sf/subgraphs/lil-nouns-sepolia/0.1.17/gn",
    },
    goldskyUrl: {
      primary: "https://api.goldsky.com/api/public/project_cldjvjgtylso13swq3dre13sf/subgraphs/lil-nouns-sepolia/0.1.17/gn",
      fallback: "https://api.goldsky.com/api/public/project_cldjvjgtylso13swq3dre13sf/subgraphs/lil-nouns-sepolia/0.1.17/gn",
    },
    indexerUrl: import.meta.env.VITE_INDEXER_URL!, // mainnet for now, didn't deploy for sepolia yet
    swapForWrappedNativeUrl: "",
    daoParams: {
      votingPeriod: 80,
      votingDelay: 1,
      proposalThresholdBPS: 100,
      lastMinuteWindowBlocks: 100,
      objectionPeriodBlocks: 500,
      updatablePeriodBlocks: 300,
      minQuorumBPS: 1000,
      maxQuorumBPS: 4000,
      quorumCoefficient: 1000000,
    },
    dataContractFees: {
      createCandidateCost: BigInt("10000000000000000"), // 0.01 ETH
      updateCandidateCost: BigInt("10000000000000000"), // 0.01 ETH
      createTopicCost: BigInt("20000000000000000"), // 0.02 ETH
      feeRecipient: getAddress("0xE54f098b1880C536e0083720922b8a365FB403DC"),
    },
  },
};

// lil nouns dao specific configs and contract addresses(except for sepolia)
export const CHAIN_SPECIFIC_CONFIGS: Record<number, ChainSpecificData> = {
  [mainnet.id]: {
    chain: mainnet,
    rpcUrl: getEthereumMainnetRpcUrls(),
    publicClient: lilNounsMainnetPublicClient,
    addresses: {
      nounsToken: getAddress("0x4b10701Bfd7BFEdc47d50562b76b436fbB5BdB3B"),
      nounsSeeder: getAddress("0xCC8a0FB5ab3C7132c1b2A0109142Fb112c4Ce515"),
      nounsDescriptor: getAddress("0xb2a47999b3117c7dD628920ED8e77eBDfB948B68"),
      nftDescriptor: getAddress("0x0BBAd8c947210ab6284699605ce2a61780958264"),
      nounsAuctionHouseProxy: getAddress("0x55e0F7A3bB39a28Bd7Bcc458e04b3cF00Ad3219E"),
      nounsDaoProxy: getAddress("0x5d2C31ce16924C2a71D317e5BbFd5ce387854039"),
      nounsTreasury: getAddress("0xd5f279ff9EB21c6D40C8f345a66f2751C4eeA1fB"),
      nounsDAODataProxy: getAddress("0x5d2C31ce16924C2a71D317e5BbFd5ce387854039"),
      lilVRGDA: getAddress("0x7a7c1c0a87f9bbbfc8456fbd1c48e9ccb8ca2bc6"),
      lilVRGDAProxy: getAddress("0xa2587b1e2626904c8575640512b987bd3d3b592d"),
      nounsSeederV2: getAddress("0x03d00f6483ff4584d00a8f385a5368a8dbe0912b"),
      wrappedNativeToken: getAddress(
        "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
      ),
      noundersMultisig: getAddress(
        "0x3cf6a7f06015aCad49F76044d3c63D7fE477D945",
      ),
      usdc: getAddress("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"),
      nounsPayer: getAddress("0xd97Bcd9f47cEe35c0a9ec1dc40C1269afc9E8E1D"),
      nounsTokenBuyer: getAddress("0x4f2acdc74f6941390d9b1804fabc3e780388cfe5"),
      stEth: getAddress("0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84"),
    },
    nounsGovernanceUrl: "https://lilnouns.wtf/",
    subgraphUrl: {
      primary:
        "https://api.goldsky.com/api/public/project_cldjvjgtylso13swq3dre13sf/subgraphs/lil-nouns-subgraph/1.0.10/gn",
      fallback: "https://api.goldsky.com/api/public/project_cldjvjgtylso13swq3dre13sf/subgraphs/lil-nouns-subgraph/1.0.10/gn",
    },
    goldskyUrl: {
      primary: "https://api.goldsky.com/api/public/project_cldjvjgtylso13swq3dre13sf/subgraphs/lil-nouns-subgraph/1.0.10/gn",
      fallback: "https://api.goldsky.com/api/public/project_cldjvjgtylso13swq3dre13sf/subgraphs/lil-nouns-subgraph/1.0.10/gn",
    },
  indexerUrl:
    import.meta.env.VITE_INDEXER_URL ||
    "https://graphql.lilnouns.wtf",
    swapForWrappedNativeUrl:
      "https://app.uniswap.org/swap?outputCurrency=0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2&chain=mainnet",
  },
  [sepolia.id]: {
    chain: sepolia,
    rpcUrl: {
      primary: `https://eth-sepolia.g.alchemy.com/v2/${import.meta.env.VITE_ALCHEMY_API_KEY!}`,
      fallback: `https://sepolia.infura.io/v3/${import.meta.env.VITE_INFURA_API_KEY!}`,
    },
    publicClient: createPublicClient({
      chain: sepolia,
      transport: fallback([
        http(
          `https://eth-sepolia.g.alchemy.com/v2/${import.meta.env.VITE_ALCHEMY_API_KEY!}`,
        ),
        http(
          `https://sepolia.infura.io/v3/${import.meta.env.VITE_INFURA_API_KEY!}`,
        ),
      ]),
    }),
    addresses: {
      // Core Nouns Contracts
      nounsToken: getAddress(sepoliaAddresses.nounsToken),
      nounsSeeder: getAddress(sepoliaAddresses.nounsSeeder),
      nounsDescriptor: getAddress(sepoliaAddresses.nounsDescriptor),
      nftDescriptor: getAddress(sepoliaAddresses.nftDescriptor),

      // DAO Governance Contracts - Current V2 (pre-upgrade)
      nounsDAOProxy: getAddress(sepoliaAddresses.nounsDAOProxy), // Current proxy (V2)
      nounsDAOLogicV2: getAddress(sepoliaAddresses.nounsDAOLogicV2), // Current logic
      nounsDaoProxy: getAddress(sepoliaAddresses.nounsDAOProxy), // Alias for compatibility

      nounsDAOLogicV5: getAddress(sepoliaAddresses.nounsDAOLogicV5), 

      // Treasury & Executor
      nounsTreasury: getAddress(sepoliaAddresses.nounsDAOExecutor), // Timelock/Executor

      // DAOData Contracts
      nounsDAODataProxy: getAddress(sepoliaAddresses.nounsDAODataProxy), // Proxy
      nounsDAODataLogic: getAddress(sepoliaAddresses.nounsDAODataV2Logic), // V1 implementation
      nounsDAODataV2Logic: getAddress(sepoliaAddresses.nounsDAODataV2Logic), // V2 implementation (active)

      // Auction
      nounsAuctionHouseProxy: getAddress(sepoliaAddresses.nounsAuctionHouseProxy),

      // Lil Nouns VRGDA
      lilVRGDA: getAddress(sepoliaAddresses.lilVRGDA),
      lilVRGDAProxy: getAddress(sepoliaAddresses.lilVRGDAProxy),
      nounsSeederV2: getAddress(sepoliaAddresses.nounsSeederV2),

      // Standard Tokens (Sepolia)
      wrappedNativeToken: getAddress(sepoliaAddresses.wrappedNativeToken),
      usdc: getAddress(sepoliaAddresses.usdc),
      stEth: getAddress(sepoliaAddresses.stEth),

      nounsPayer: getAddress(sepoliaAddresses.nounsPayer),
      nounsTokenBuyer: getAddress(sepoliaAddresses.nounsTokenBuyer || "0x4f2acdc74f6941390d9b1804fabc3e780388cfe5"),
      noundersMultisig: getAddress(sepoliaAddresses.noundersMultisig),
    },
    nounsGovernanceUrl: "https://sepolia.lilnouns.wtf/",
    subgraphUrl: {
      primary: `https://api.goldsky.com/api/public/project_cldjvjgtylso13swq3dre13sf/subgraphs/lil-nouns-sepolia/0.1.17/gn`,
      fallback: `https://api.goldsky.com/api/public/project_cldjvjgtylso13swq3dre13sf/subgraphs/lil-nouns-sepolia/0.1.17/gn`,
    },
    goldskyUrl: {
      primary: "https://api.goldsky.com/api/public/project_cldjvjgtylso13swq3dre13sf/subgraphs/lil-nouns-sepolia/0.1.17/gn",
      fallback: "https://api.goldsky.com/api/public/project_cldjvjgtylso13swq3dre13sf/subgraphs/lil-nouns-sepolia/0.1.17/gn",
    },
    indexerUrl: import.meta.env.VITE_INDEXER_URL!, // mainnet for now, didn't deploy for sepolia yet
    swapForWrappedNativeUrl: "",
    daoParams: {
      votingPeriod: 20,
      votingDelay: 1,
      proposalThresholdBPS: 100,
      lastMinuteWindowBlocks: 100,
      objectionPeriodBlocks: 500,
      updatablePeriodBlocks: 300,
      minQuorumBPS: 1000,
      maxQuorumBPS: 4000,
      quorumCoefficient: 10000,
    },
    dataContractFees: {
      createCandidateCost: BigInt("10000000000000000"), // 0.01 ETH
      updateCandidateCost: BigInt("10000000000000000"), // 0.01 ETH
      createTopicCost: BigInt("20000000000000000"), // 0.02 ETH
      feeRecipient: getAddress("0xE54f098b1880C536e0083720922b8a365FB403DC"),
    },
  },
};

export const CHAIN_CONFIG =
  CHAIN_SPECIFIC_CONFIGS[detectChainFromHostname()]!;

/** Canonical Nouns DAO (mainnet) subgraph – use for daoType === 'nouns' proposal/candidate queries */
export const NOUNS_DAO_GOLDSKY_URL =
  "https://api.goldsky.com/api/public/project_cldjvjgtylso13swq3dre13sf/subgraphs/nouns/1.0.2/gn";

/**
 * Helper to get the active DAO proxy address
 * Returns V2 proxy by default, or V3 proxy if it exists and is different
 * This ensures compatibility during the V2 -> V6 upgrade transition
 */
export function getActiveDAOProxy(): Address {
  const config = CHAIN_CONFIG.addresses;

  // Check if V3 proxy exists and is different from V2/legacy proxy
  const v3Proxy = config.nounsDAOProxyV3;
  const currentProxy = config.nounsDAOProxy || config.nounsDaoProxy;

  // If V3 exists and is different, use it (post-upgrade)
  // Otherwise use current proxy (V2, pre-upgrade)
  if (v3Proxy && v3Proxy.toLowerCase() !== currentProxy.toLowerCase()) {
    return v3Proxy;
  }

  return currentProxy;
}

/**
 * Returns true if the DAO has been upgraded to V6
 * Checks if there's a distinct V3 proxy address different from the V2 proxy
 */
export function isDAOUpgradedToV6(): boolean {
  const config = CHAIN_CONFIG.addresses;
  const v3Proxy = config.nounsDAOProxyV3;
  const currentProxy = config.nounsDAOProxy || config.nounsDaoProxy;

  return v3Proxy && v3Proxy.toLowerCase() !== currentProxy.toLowerCase();
}

/**
 * Returns the appropriate DAO logic address based on upgrade status
 */
export function getActiveDAOLogic(): Address {
  const config = CHAIN_CONFIG.addresses;

  if (isDAOUpgradedToV6() && config.nounsDAOLogicV6) {
    return config.nounsDAOLogicV6;
  }

  return config.nounsDAOLogicV2 || config.nounsDaoProxy; // Fallback to proxy if logic not specified
}
