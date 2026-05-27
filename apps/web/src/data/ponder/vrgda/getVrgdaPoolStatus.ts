
import { VrgdaPoolStatus } from "./types";
import { cleanGraphQLFetch } from "../utils/cleanGraphQLFetch";
import { GetLatestVrgdaPoolStatusDocument, GetVrgdaPoolSeedsDocument, OrderDirection } from "@/data/generated/ponder/clean-graphql";
import { isSepoliaNetwork } from "@/utils/networkDetection";
import { getOnChainVrgdaPoolCandidates } from "@/data/vrgda/getOnChainVrgdaPool";

async function getOnChainFallbackPoolStatus(): Promise<VrgdaPoolStatus> {
  const seeds = await getOnChainVrgdaPoolCandidates({
    limit: 256,
    includeUsed: true,
    sortDirection: "desc",
  });
  const usedSeeds = seeds.filter((seed) => seed.isUsed);
  const oldestBlock = seeds.length > 0 ? seeds[seeds.length - 1].blockNumber : "0";
  const newestBlock = seeds.length > 0 ? seeds[0].blockNumber : "0";
  const blocksSpanned = seeds.length > 0 ? Number(BigInt(newestBlock) - BigInt(oldestBlock) + 1n) : 0;

  return {
    currentBlock: newestBlock,
    poolSize: seeds.length,
    availableSeeds: seeds.length - usedSeeds.length,
    usedSeeds: usedSeeds.length,
    latestSeedBlock: newestBlock,
    poolCoverage: {
      oldestBlock,
      newestBlock,
      blocksSpanned,
    },
  };
}

export async function getVrgdaPoolStatus(): Promise<VrgdaPoolStatus> {
  // Disable VRGDA pool queries on Sepolia - VPS not configured for Sepolia yet
  if (isSepoliaNetwork()) {
    console.log('VRGDA pool status disabled on Sepolia - VPS not configured');
    return {
      currentBlock: '0',
      poolSize: 0,
      availableSeeds: 0,
      usedSeeds: 0,
      latestSeedBlock: '0',
      poolCoverage: {
        oldestBlock: '0',
        newestBlock: '0',
        blocksSpanned: 0
      }
    };
  }

  try {
    // Get meta info and latest seed info
    const statusResult = await cleanGraphQLFetch(GetLatestVrgdaPoolStatusDocument);
    
    // Get pool summary with used/unused counts
    const [allSeedsResult, usedSeedsResult] = await Promise.all([
      cleanGraphQLFetch(GetVrgdaPoolSeedsDocument, {
        limit: 1000, // Get all seeds for accurate count
        orderBy: 'blockNumber',
        orderDirection: OrderDirection.Desc
      }),
      cleanGraphQLFetch(GetVrgdaPoolSeedsDocument, {
        where: { isUsed: true },
        limit: 1000,
        orderBy: 'blockNumber',
        orderDirection: OrderDirection.Desc
      })
    ]);

    const allSeeds = allSeedsResult.vrgdaPoolSeeds.items;
    const usedSeeds = usedSeedsResult.vrgdaPoolSeeds.items;
    
    // Calculate pool coverage
    const oldestBlock = allSeeds.length > 0 ? allSeeds[allSeeds.length - 1].blockNumber : '0';
    const newestBlock = allSeeds.length > 0 ? allSeeds[0].blockNumber : '0';
    const blocksSpanned = allSeeds.length > 0 ? 
      parseInt(newestBlock) - parseInt(oldestBlock) + 1 : 0;

    return {
      currentBlock: statusResult._meta.block.number,
      poolSize: allSeeds.length,
      availableSeeds: allSeeds.length - usedSeeds.length,
      usedSeeds: usedSeeds.length,
      latestSeedBlock: newestBlock,
      poolCoverage: {
        oldestBlock,
        newestBlock,
        blocksSpanned
      }
    };
  } catch (error) {
    console.error('Failed to fetch VRGDA pool status from Ponder:', error);
    return getOnChainFallbackPoolStatus();
  }
}

// Helper to check if pool needs refresh (< 256 seeds or getting stale)
export async function shouldRefreshVrgdaPool(): Promise<{
  shouldRefresh: boolean;
  reason?: string;
  status: VrgdaPoolStatus;
}> {
  const status = await getVrgdaPoolStatus();
  
  // Check if pool is too small
  if (status.poolSize < 200) {
    return {
      shouldRefresh: true,
      reason: `Pool size is ${status.poolSize}, below minimum of 200`,
      status
    };
  }
  
  // Check if pool is too far behind current block
  const blockLag = parseInt(status.currentBlock) - parseInt(status.latestSeedBlock);
  if (blockLag > 50) {
    return {
      shouldRefresh: true,
      reason: `Pool is ${blockLag} blocks behind current block`,
      status
    };
  }
  
  // Check if too many seeds are used
  const usageRatio = status.usedSeeds / status.poolSize;
  if (usageRatio > 0.8) {
    return {
      shouldRefresh: true,
      reason: `Pool usage is ${Math.round(usageRatio * 100)}%, above 80% threshold`,
      status
    };
  }
  
  return {
    shouldRefresh: false,
    status
  };
}
