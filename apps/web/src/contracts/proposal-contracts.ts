/**
 * Contract Definitions
 * Define all contract addresses and chain IDs for your DAO
 */

import { Address } from 'viem'
import { mainnet, sepolia } from 'viem/chains'

export interface ContractInfo {
  address: Address
  chainId: number
}

/**
 * Contract addresses by chain
 */
const CONTRACTS_BY_CHAIN = {
  [mainnet.id]: {
    dao: {
      address: '0x6f3E6272A167e8AcCb32072d08E0957F9c79223d' as Address, // Lil Nouns DAO Proxy
      chainId: mainnet.id
    },
    executor: {
      address: '0xb1a32FC9F9D8b2cf86C068Cae13108809547ef71' as Address, // Lil Nouns Treasury
      chainId: mainnet.id
    },
    token: {
      address: '0x9C8fF314C9Bc7F6e59A9d9225Fb22946427eDC03' as Address, // Lil Nouns Token
      chainId: mainnet.id
    },
    payer: {
      address: '0xF62387d21153fdcbB06Ab3026c2089e418688164' as Address, // Nouns Payer
      chainId: mainnet.id
    },
    'token-buyer': {
      address: '0x387140cD0132ff750263f08aCfdFbEc7b0Cf63c0' as Address,
      chainId: mainnet.id
    },
    'stream-factory': {
      address: '0xb2fFEEF1F68CfacDeFdAFe6F1a9D30Ff47C7cB5e' as Address, // Nouns Stream Factory
      chainId: mainnet.id
    },
    'weth-token': {
      address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2' as Address, // WETH on mainnet
      chainId: mainnet.id
    },
    'usdc-token': {
      address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Address, // USDC on mainnet
      chainId: mainnet.id
    },
    'steth-token': {
      address: '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84' as Address, // stETH on mainnet
      chainId: mainnet.id
    },
    'lido-token': {
      address: '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84' as Address, // LIDO token (same as stETH)
      chainId: mainnet.id
    },
    'reth-token': {
      address: '0xae78736Cd615f374D3085123A210448E74Fc6393' as Address, // Rocket Pool rETH on mainnet
      chainId: mainnet.id
    },
    'oeth-token': {
      address: '0x856c4Efb76C1D1AE02e20CEB03A2A6a08b0b8dC3' as Address, // Origin ETH (OETH) on mainnet
      chainId: mainnet.id
    }
  },
  [sepolia.id]: {
    dao: {
      address: '0xa7C37f79ff5E6F932147fC69724B6ED432CA6Aa7' as Address, // Nouns DAO Proxy (V2)
      chainId: sepolia.id
    },
    executor: {
      address: '0xE54f098b1880C536e0083720922b8a365FB403DC' as Address, // Timelock/Executor
      chainId: sepolia.id
    },
    token: {
      address: '0x6e48e79f718776CF412a87e047722dBFda5B465D' as Address, // Nouns Token
      chainId: sepolia.id
    },
    payer: {
      address: '0xF62387d21153fdcbB06Ab3026c2089e418688164' as Address, // Nouns Payer (same as mainnet)
      chainId: sepolia.id
    },
    'token-buyer': {
      address: '0x387140cD0132ff750263f08aCfdFbEc7b0Cf63c0' as Address, // Same as mainnet
      chainId: sepolia.id
    },
    'stream-factory': {
      address: '0xb2fFEEF1F68CfacDeFdAFe6F1a9D30Ff47C7cB5e' as Address, // Same as mainnet
      chainId: sepolia.id
    },
    'weth-token': {
      address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2' as Address, // WETH (same on Sepolia)
      chainId: sepolia.id
    },
    'usdc-token': {
      address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Address, // USDC (same on Sepolia)
      chainId: sepolia.id
    },
    'steth-token': {
      address: '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84' as Address, // stETH (same on Sepolia)
      chainId: sepolia.id
    },
    'lido-token': {
      address: '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84' as Address, // LIDO token (same as stETH)
      chainId: sepolia.id
    },
    'reth-token': {
      address: '0xae78736Cd615f374D3085123A210448E74Fc6393' as Address, // Rocket Pool rETH (same on Sepolia)
      chainId: sepolia.id
    },
    'oeth-token': {
      address: '0x856c4Efb76C1D1AE02e20CEB03A2A6a08b0b8dC3' as Address, // Origin ETH (OETH) (same on Sepolia)
      chainId: sepolia.id
    }
  }
} as const

/**
 * Get contracts for a specific chain ID
 * Defaults to mainnet if chain ID is not supported
 */
export function getContractsForChain(chainId: number) {
  if (chainId === mainnet.id) {
    return CONTRACTS_BY_CHAIN[mainnet.id]
  }
  if (chainId === sepolia.id) {
    return CONTRACTS_BY_CHAIN[sepolia.id]
  }
  // Default to mainnet for unsupported chains
  console.warn(`Unsupported chain ID: ${chainId}, defaulting to mainnet`)
  return CONTRACTS_BY_CHAIN[mainnet.id]
}

/**
 * Lil Nouns DAO Contract Addresses
 * Defaults to mainnet for backward compatibility
 * Use getContractsForChain() for chain-specific addresses
 */
export const contracts = CONTRACTS_BY_CHAIN[mainnet.id]

export type ContractIdentifier = keyof typeof contracts

/**
 * Resolve a contract by its identifier
 */
export const resolveIdentifier = (id: ContractIdentifier): ContractInfo => {
  const contract = contracts[id]
  if (!contract) {
    throw new Error(`Unknown contract identifier: ${id}`)
  }
  return contract
}

/**
 * Resolve a contract by its address
 */
export const resolveAddress = (address: Address): ContractInfo | undefined => {
  return Object.values(contracts).find(
    (c) => c.address.toLowerCase() === address.toLowerCase()
  )
}

/**
 * Check if an address is a known contract
 */
export const isKnownContract = (address: Address): boolean => {
  return resolveAddress(address) !== undefined
}

/**
 * Get contract identifier from address
 */
export const getContractId = (address: Address): ContractIdentifier | undefined => {
  const entry = Object.entries(contracts).find(
    ([_, contract]) => contract.address.toLowerCase() === address.toLowerCase()
  )
  return entry?.[0] as ContractIdentifier | undefined
}
