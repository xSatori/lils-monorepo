
import { VrgdaPoolSeed } from "./types";
import { cleanGraphQLFetch } from "../utils/cleanGraphQLFetch";
import { GetVrgdaPoolSeedByBlockDocument } from "@/data/generated/ponder/clean-graphql";
import { isSepoliaNetwork } from "@/utils/networkDetection";

export async function getVrgdaSeedByBlock(blockNumber: string): Promise<VrgdaPoolSeed | null> {
  // Disable VRGDA pool queries on Sepolia - VPS not configured for Sepolia yet
  if (isSepoliaNetwork()) {
    console.log('VRGDA seed by block disabled on Sepolia - VPS not configured');
    return null;
  }

  try {
    const result = await cleanGraphQLFetch(GetVrgdaPoolSeedByBlockDocument, { 
      blockNumber 
    });
    
    if (!result.vrgdaPoolSeed) {
      return null;
    }

    return {
      id: result.vrgdaPoolSeed.id,
      nounId: result.vrgdaPoolSeed.nounId,
      blockNumber: result.vrgdaPoolSeed.blockNumber,
      background: result.vrgdaPoolSeed.background,
      body: result.vrgdaPoolSeed.body,
      accessory: result.vrgdaPoolSeed.accessory,
      head: result.vrgdaPoolSeed.head,
      glasses: result.vrgdaPoolSeed.glasses,
      isUsed: result.vrgdaPoolSeed.isUsed,
      generatedAt: result.vrgdaPoolSeed.generatedAt,
    };
  } catch (error) {
    console.error('Failed to fetch VRGDA seed by block from Ponder:', error);
    return null;
  }
}

// Helper to get seeds for multiple blocks
export async function getVrgdaSeedsByBlocks(blockNumbers: string[]): Promise<VrgdaPoolSeed[]> {
  try {
    const results = await Promise.allSettled(
      blockNumbers.map(blockNumber => getVrgdaSeedByBlock(blockNumber))
    );

    return results
      .filter((result): result is PromiseFulfilledResult<VrgdaPoolSeed | null> => 
        result.status === 'fulfilled' && result.value !== null
      )
      .map(result => result.value!);
  } catch (error) {
    console.error('Failed to fetch VRGDA seeds by blocks:', error);
    return [];
  }
}
