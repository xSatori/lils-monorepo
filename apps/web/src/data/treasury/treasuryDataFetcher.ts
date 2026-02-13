import { Address, formatUnits, getAddress } from "viem";
import { readContract } from "viem/actions";
import { getContractsForChain } from "@/contracts/proposal-contracts";
import { CHAIN_SPECIFIC_CONFIGS } from "@/config";

// ERC20 ABI for balanceOf
const ERC20_ABI = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "decimals",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
] as const;

// CoinGecko API types
interface CoinGeckoPriceResponse {
  [tokenId: string]: {
    usd: number;
  };
}

// League of Lils multisig address
const LEAGUE_OF_LILS_MULTISIG = getAddress("0xDCb4117e3A00632efCaC3C169E0B23959f555E5e");

// Nouns DAO subgraph URL
const NOUNS_DAO_SUBGRAPH_URL = "https://api.goldsky.com/api/public/project_cldjvjgtylso13swq3dre13sf/subgraphs/nouns/1.0.2/gn";

export interface TreasuryData {
  totalEth: number;
  totalUsd: number;
  totalNouns: number;
  // Detailed balances by contract
  executor: {
    eth: number;
    steth: number;
    weth: number;
    usdc: number;
    oeth: number;
    reth: number;
  };
  payer: {
    eth: number;
    steth: number;
    weth: number;
    usdc: number;
    oeth: number;
    reth: number;
  };
  tokenBuyer: {
    eth: number;
    steth: number;
    weth: number;
    usdc: number;
    oeth: number;
    reth: number;
  };
}

interface TokenBalance {
  balance: bigint;
  decimals: number;
}

interface NounsSubgraphAccount {
  id: string;
  tokenBalance: string;
  nouns: Array<{ id: string }>;
}

interface NounsSubgraphResponse {
  accounts: NounsSubgraphAccount[];
}

/**
 * Fetch ETH balance for an address
 */
async function getEthBalance(
  publicClient: any,
  address: Address
): Promise<bigint> {
  return await publicClient.getBalance({ address });
}

/**
 * Fetch ERC20 token balance
 */
async function getTokenBalance(
  publicClient: any,
  tokenAddress: Address,
  accountAddress: Address
): Promise<TokenBalance> {
  try {
    // Normalize to EIP-55 checksum so viem accepts the address
    const token = getAddress(tokenAddress);
    const account = getAddress(accountAddress);
    const [balance, decimals] = await Promise.all([
      readContract(publicClient, {
        address: token,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [account],
      }),
      readContract(publicClient, {
        address: token,
        abi: ERC20_ABI,
        functionName: "decimals",
      }).catch(() => 18), // Default to 18 decimals if not available
    ]);

    return {
      balance: balance as bigint,
      decimals: decimals as number,
    };
  } catch (error) {
    console.warn(`Failed to fetch balance for token ${tokenAddress}:`, error);
    return { balance: 0n, decimals: 18 };
  }
}

/**
 * Fetch token prices from CoinGecko
 */
async function getEthPriceUsd(): Promise<number> {
  try {
    const response = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd"
    );
    const data: CoinGeckoPriceResponse = await response.json();
    return data.ethereum?.usd || 0;
  } catch (error) {
    console.warn("Failed to fetch CoinGecko prices, using fallback:", error);
    return 3000; // Fallback price
  }
}

/**
 * Fetch Nouns DAO token balance from subgraph
 */
async function getNounsBalanceFromSubgraph(
  address: Address
): Promise<number> {
  try {
    const query = `
      query GetAccount($id: ID!) {
        accounts(where: {id: $id}) {
          id
          tokenBalance
          nouns {
            id
          }
        }
      }
    `;

    const response = await fetch(NOUNS_DAO_SUBGRAPH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        variables: { id: address.toLowerCase() },
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();

    if (result.errors) {
      console.error("GraphQL errors:", result.errors);
      return 0;
    }

    const data = result.data as NounsSubgraphResponse;

    if (!data?.accounts || data.accounts.length === 0) {
      return 0;
    }

    const account = data.accounts[0];
    // tokenBalance is the number of Nouns owned
    const balance = parseInt(account.tokenBalance || "0");
    return balance;
  } catch (error) {
    console.warn(`Failed to fetch Nouns balance from subgraph for ${address}:`, error);
    return 0;
  }
}

/**
 * Main function to fetch treasury data
 * Fetches balances from executor (treasury), payer, and token buyer contracts
 * for ETH, stETH, oETH, wrapped ETH, and USDC
 */
export async function getTreasuryData(
  chainId: number
): Promise<TreasuryData> {
  const contracts = getContractsForChain(chainId);
  const config = CHAIN_SPECIFIC_CONFIGS[chainId];
  
  if (!config) {
    throw new Error(`No config found for chain ID: ${chainId}`);
  }
  
  const publicClient = config.publicClient;

  // Use Nouns DAO executor address from config (not Lil Nouns executor)
  const executorAddress = config.addresses.nounsTreasury;
  const payerAddress = contracts.payer.address;
  const tokenBuyerAddress = contracts["token-buyer"].address;

  // Get token addresses
  const usdcAddress = contracts["usdc-token"].address;
  const stethAddress = contracts["steth-token"].address;
  const wethAddress = contracts["weth-token"].address;
  const oethAddress = contracts["oeth-token"].address;
  const rethAddress = contracts["reth-token"].address;

  // Fetch all balances in parallel for all contracts and tokens
  const [
    executorEthBalance,
    executorStethBalance,
    executorWethBalance,
    executorUsdcBalance,
    executorOethBalance,
    executorRethBalance,
    payerEthBalance,
    payerStethBalance,
    payerWethBalance,
    payerUsdcBalance,
    payerOethBalance,
    payerRethBalance,
    tokenBuyerEthBalance,
    tokenBuyerStethBalance,
    tokenBuyerWethBalance,
    tokenBuyerUsdcBalance,
    tokenBuyerOethBalance,
    tokenBuyerRethBalance,
    ethPriceUsd,
    executorNounsBalance,
    leagueNounsBalance,
  ] = await Promise.all([
    // Executor balances
    getEthBalance(publicClient, executorAddress),
    getTokenBalance(publicClient, stethAddress, executorAddress),
    getTokenBalance(publicClient, wethAddress, executorAddress),
    getTokenBalance(publicClient, usdcAddress, executorAddress),
    getTokenBalance(publicClient, oethAddress, executorAddress),
    getTokenBalance(publicClient, rethAddress, executorAddress),
    // Payer balances
    getEthBalance(publicClient, payerAddress),
    getTokenBalance(publicClient, stethAddress, payerAddress),
    getTokenBalance(publicClient, wethAddress, payerAddress),
    getTokenBalance(publicClient, usdcAddress, payerAddress),
    getTokenBalance(publicClient, oethAddress, payerAddress),
    getTokenBalance(publicClient, rethAddress, payerAddress),
    // Token buyer balances
    getEthBalance(publicClient, tokenBuyerAddress),
    getTokenBalance(publicClient, stethAddress, tokenBuyerAddress),
    getTokenBalance(publicClient, wethAddress, tokenBuyerAddress),
    getTokenBalance(publicClient, usdcAddress, tokenBuyerAddress),
    getTokenBalance(publicClient, oethAddress, tokenBuyerAddress),
    getTokenBalance(publicClient, rethAddress, tokenBuyerAddress),
    // ETH price in USD
    getEthPriceUsd(),
    // Nouns DAO tokens owned/delegated to Lil Nouns executor/treasury
    getNounsBalanceFromSubgraph(executorAddress),
    // Nouns DAO tokens owned/delegated to League of Lils multisig
    getNounsBalanceFromSubgraph(LEAGUE_OF_LILS_MULTISIG),
  ]);

  // Convert balances to numbers
  const executor = {
    eth: Number(formatUnits(executorEthBalance, 18)),
    steth: Number(formatUnits(executorStethBalance.balance, executorStethBalance.decimals)),
    weth: Number(formatUnits(executorWethBalance.balance, executorWethBalance.decimals)),
    usdc: Number(formatUnits(executorUsdcBalance.balance, executorUsdcBalance.decimals)),
    oeth: Number(formatUnits(executorOethBalance.balance, executorOethBalance.decimals)),
    reth: Number(formatUnits(executorRethBalance.balance, executorRethBalance.decimals)),
  };

  const payer = {
    eth: Number(formatUnits(payerEthBalance, 18)),
    steth: Number(formatUnits(payerStethBalance.balance, payerStethBalance.decimals)),
    weth: Number(formatUnits(payerWethBalance.balance, payerWethBalance.decimals)),
    usdc: Number(formatUnits(payerUsdcBalance.balance, payerUsdcBalance.decimals)),
    oeth: Number(formatUnits(payerOethBalance.balance, payerOethBalance.decimals)),
    reth: Number(formatUnits(payerRethBalance.balance, payerRethBalance.decimals)),
  };

  const tokenBuyer = {
    eth: Number(formatUnits(tokenBuyerEthBalance, 18)),
    steth: Number(formatUnits(tokenBuyerStethBalance.balance, tokenBuyerStethBalance.decimals)),
    weth: Number(formatUnits(tokenBuyerWethBalance.balance, tokenBuyerWethBalance.decimals)),
    usdc: Number(formatUnits(tokenBuyerUsdcBalance.balance, tokenBuyerUsdcBalance.decimals)),
    oeth: Number(formatUnits(tokenBuyerOethBalance.balance, tokenBuyerOethBalance.decimals)),
    reth: Number(formatUnits(tokenBuyerRethBalance.balance, tokenBuyerRethBalance.decimals)),
  };

  // Calculate total ETH equivalent (all assets converted to ETH)
  // USDC is converted to ETH using price
  const totalEth =
    executor.eth +
    executor.steth +
    executor.weth +
    executor.usdc / ethPriceUsd +
    executor.oeth +
    executor.reth +
    payer.eth +
    payer.steth +
    payer.weth +
    payer.usdc / ethPriceUsd +
    payer.oeth +
    payer.reth +
    tokenBuyer.eth +
    tokenBuyer.steth +
    tokenBuyer.weth +
    tokenBuyer.usdc / ethPriceUsd +
    tokenBuyer.oeth +
    tokenBuyer.reth;

  // Calculate USD value
  const totalUsd = totalEth * ethPriceUsd;

  // Calculate total Nouns from subgraph
  const totalNouns = executorNounsBalance + leagueNounsBalance;

  return {
    totalEth,
    totalUsd,
    totalNouns,
    executor,
    payer,
    tokenBuyer,
  };
}
