import { Noun } from "./types";
import { checkForAllNounRevalidation } from "./getAllNouns";
import { CHAIN_CONFIG } from "@/config";
import { transformVpsNounToNoun } from "./helpers";
import { unstable_cache } from "@/utils/viteCache";
import { SECONDS_PER_HOUR } from "@/utils/constants";
import { nounsTokenAbi } from "@/abis/nounsToken";
import { getAddress } from "viem";

// Import VPS-specific GraphQL query
import { GetNounByIdDocument } from "../generated/ponder/clean-graphql";

type ContractSeedValue = bigint | number;

type ContractSeed = readonly [
  ContractSeedValue,
  ContractSeedValue,
  ContractSeedValue,
  ContractSeedValue,
  ContractSeedValue,
] & {
  background?: ContractSeedValue;
  body?: ContractSeedValue;
  accessory?: ContractSeedValue;
  head?: ContractSeedValue;
  glasses?: ContractSeedValue;
};

type SeedPartName = "background" | "body" | "accessory" | "head" | "glasses";

function getSeedPart(seed: ContractSeed, key: SeedPartName, index: number) {
  return Number(seed[key] ?? seed[index]);
}

async function getNounByIdFromChain(id: string): Promise<Noun | undefined> {
  if (!/^\d+$/.test(id)) {
    console.warn("getNounByIdFromChain - invalid noun ID:", id);
    return undefined;
  }

  const tokenId = BigInt(id);

  try {
    const [owner, seed] = await Promise.all([
      CHAIN_CONFIG.publicClient.readContract({
        address: CHAIN_CONFIG.addresses.nounsToken,
        abi: nounsTokenAbi,
        functionName: "ownerOf",
        args: [tokenId],
      }),
      CHAIN_CONFIG.publicClient.readContract({
        address: CHAIN_CONFIG.addresses.nounsToken,
        abi: nounsTokenAbi,
        functionName: "seeds",
        args: [tokenId],
      }),
    ]);

    const fallbackNoun = transformVpsNounToNoun({
      id,
      owner: getAddress(owner as `0x${string}`),
      background: getSeedPart(seed as ContractSeed, "background", 0),
      body: getSeedPart(seed as ContractSeed, "body", 1),
      accessory: getSeedPart(seed as ContractSeed, "accessory", 2),
      head: getSeedPart(seed as ContractSeed, "head", 3),
      glasses: getSeedPart(seed as ContractSeed, "glasses", 4),
    });

    return { ...fallbackNoun, secondaryListing: null };
  } catch (error) {
    console.error("getNounByIdFromChain - failed to fetch noun from contract:", error);
    return undefined;
  }
}

export async function getNounByIdUncached(id: string): Promise<Noun | undefined> {
  console.log("getNounByIdUncached - using VPS indexer for ID:", id);
  console.log("VPS Indexer URL:", CHAIN_CONFIG.indexerUrl);
  
  try {
    // Direct VPS GraphQL fetch
    const response = await fetch(CHAIN_CONFIG.indexerUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: GetNounByIdDocument,
        variables: { id }
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    const vpsResponse = result.data;
    const noun = vpsResponse?.noun ? transformVpsNounToNoun(vpsResponse.noun as any) : undefined;

    if (noun) {
      checkForAllNounRevalidation(id);
      const fullNoun: Noun = { ...noun, secondaryListing: null };
      return fullNoun;
    }
  } catch (error) {
    console.error("getNounByIdUncached - VPS indexer failed, falling back to contract:", error);
  }

  return getNounByIdFromChain(id);
}

const getNounByIdCached = unstable_cache(getNounByIdUncached, ["get-noun-by-id"], { revalidate: SECONDS_PER_HOUR });

export async function getNounById(id: string): Promise<Noun | undefined> {
  const [noun] = await Promise.all([getNounByIdCached(id)]);

  // Kickoff a check to revalidate all in grid (when its a new Noun)
  checkForAllNounRevalidation(id);

  return noun;
}
