import { Noun } from "./types";
import { checkForAllNounRevalidation } from "./getAllNouns";
import { CHAIN_CONFIG } from "@/config";
import { transformVpsNounToNoun } from "./helpers";
import { getGoldskyNounById } from "@/data/goldsky/nouns";
import { unstable_cache } from "@/utils/viteCache";
import { SECONDS_PER_HOUR } from "@/utils/constants";
import { nounsTokenAbi } from "@/abis/nounsToken";
import { getAddress } from "viem";

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
  console.log("getNounByIdUncached - using public Goldsky noun data for ID:", id);
  
  try {
    const goldskyNoun = await getGoldskyNounById(id);
    const noun = goldskyNoun ? transformVpsNounToNoun(goldskyNoun) : undefined;

    if (noun) {
      checkForAllNounRevalidation(id);
      const fullNoun: Noun = { ...noun, secondaryListing: null };
      return fullNoun;
    }
  } catch (error) {
    console.error("getNounByIdUncached - Goldsky failed, falling back to contract:", error);
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
