"use client";
import clsx from "clsx";
import { VRGDAuctionInterface } from "./VRGDAuctionInterface";
import { NounImageBase } from "../NounImage";
import { useVRGDAData } from "@/hooks/useVRGDAData";
import { useVrgdaRealtimePool } from "@/data/ponder/hooks/useVrgdaRealtimePool";
import { useQuery } from "@tanstack/react-query";
import { lilVRGDAConfig } from "@/config/lilVRGDAConfig";
import { readContract } from "viem/actions";
import { CHAIN_SPECIFIC_CONFIGS } from "@/config";
import { isSepoliaNetwork } from "@/utils/networkDetection";
import { mainnet, sepolia } from "viem/chains";

interface VRGDAClientProps {
  initialNounId?: string;
}

export default function VRGDAClient({ initialNounId }: VRGDAClientProps) {
  const { config, currentPrice, timeToNextDrop, isLoading: vrgdaLoading } = useVRGDAData();
  const isSepolia = isSepoliaNetwork();
  
  // Debug: Log chain detection
  console.log('VRGDAClient - Component render:', {
    isSepolia,
    chainId: isSepolia ? sepolia.id : mainnet.id,
    initialNounId,
    hostname: typeof window !== 'undefined' ? window.location.hostname : 'SSR'
  });
  
  // Only use VPS hook on mainnet - on Sepolia, get block directly from chain
  const { latestBlock } = useVrgdaRealtimePool({ enabled: !isSepolia });

  // Get the current VRGDA noun ID from contract
  // Use chainId in query key to ensure proper cache separation
  const chainId = isSepolia ? sepolia.id : mainnet.id;
  const { data: contractNounId } = useQuery({
    queryKey: ["vrgda-next-noun-id", chainId],
    queryFn: async () => {
      // Ensure we're using the correct chain config
      const config = CHAIN_SPECIFIC_CONFIGS[chainId];
      
      if (!config) {
        console.error('No config found for chainId:', chainId);
        return null;
      }
      
      console.log('VRGDAClient - Fetching nextNounId:', {
        isSepolia,
        chainId,
        contractAddress: config.addresses.lilVRGDAProxy,
        chainName: config.chain.name,
        rpcUrl: config.rpcUrl.primary
      });
      
      const nextNounId = await readContract(config.publicClient, {
        address: config.addresses.lilVRGDAProxy,
        abi: lilVRGDAConfig.abi,
        functionName: "nextNounId",
      });
      
      console.log('VRGDAClient - Received nextNounId:', {
        nextNounId: nextNounId.toString(),
        chainId,
        chainName: config.chain.name
      });
      
      return nextNounId.toString();
    },
    staleTime: 30000, // 30 seconds
    refetchInterval: 60000, // 1 minute
  });

  // Get block number: use VPS on mainnet, or fetch directly from chain on Sepolia
  // Always fetch from chain as fallback, but prefer VPS on mainnet
  const { data: chainBlockNumber, isLoading: isLoadingBlock } = useQuery({
    queryKey: ["current-block-number", isSepolia],
    queryFn: async () => {
      // Ensure we're using the correct chain config
      const chainId = isSepolia ? sepolia.id : mainnet.id;
      const config = CHAIN_SPECIFIC_CONFIGS[chainId];
      
      const currentBlock = await config.publicClient.getBlockNumber();
      return Number(currentBlock) - 1; // Use previous block for stability
    },
    enabled: true, // Always enabled as fallback
    staleTime: 12000, // 12 seconds
    refetchInterval: 12000,
  });

  // Use VPS block on mainnet if available, otherwise use chain block (works for both chains)
  const blockNumber = latestBlock?.blockNumber 
    ? Number(latestBlock.blockNumber) - 1 
    : chainBlockNumber;

  // Get the current noun ID to display
  // Prioritize contractNounId (chain-specific) over initialNounId (may be cached from wrong chain)
  // Only use initialNounId if contractNounId is not available yet
  // If we're on Sepolia but initialNounId looks like mainnet (>= 7983), ignore it
  let currentNounId: string | undefined;
  if (contractNounId) {
    currentNounId = contractNounId;
  } else if (isSepolia && initialNounId && parseInt(initialNounId) >= 7983) {
    // Ignore mainnet-looking initialNounId on Sepolia
    console.warn('VRGDAClient - Ignoring mainnet-looking initialNounId on Sepolia:', initialNounId);
    currentNounId = undefined;
  } else {
    currentNounId = initialNounId;
  }

    // Check if contract is paused
    const { data: isPaused } = useQuery({
      queryKey: ["vrgda-paused", chainId],
      queryFn: async () => {
        const config = CHAIN_SPECIFIC_CONFIGS[chainId];
        const isPaused = await readContract(config.publicClient, {
          address: config.addresses.lilVRGDAProxy,
          abi: lilVRGDAConfig.abi,
          functionName: "paused",
        });
        return isPaused;
      },
    });
  
  const currentNounIdNum = currentNounId ? parseInt(currentNounId) : undefined;
  
  // Debug: Log which noun ID we're displaying
  console.log('VRGDAClient - Displaying noun:', {
    isSepolia,
    chainId,
    initialNounId,
    contractNounId,
    currentNounId,
    currentNounIdNum,
    usingContractNounId: !!contractNounId,
    usingInitialNounId: !contractNounId && !!initialNounId && (!isSepolia || parseInt(initialNounId) < 7983),
    warning: !contractNounId && initialNounId && isSepolia && parseInt(initialNounId) >= 7983 ? 'Ignored mainnet-looking initialNounId!' : null
  });

  // Fetch noun data using the VRGDA contract's fetchNoun function
  const { data: nounData, isLoading: nounLoading } = useQuery({
    queryKey: ["vrgda-noun-data", currentNounId, blockNumber, isSepolia],
    queryFn: async () => {
      if (!currentNounId || !blockNumber) return null;
      
      // Ensure we're using the correct chain config
      const chainId = isSepolia ? sepolia.id : mainnet.id;
      const config = CHAIN_SPECIFIC_CONFIGS[chainId];
      
      console.log('VRGDAClient - Fetching noun data:', {
        isSepolia,
        chainId,
        currentNounId,
        blockNumber,
        latestBlockNumber: latestBlock?.blockNumber,
        chainBlockNumber,
        contractAddress: config.addresses.lilVRGDAProxy,
        chainName: config.chain.name
      });
      
      const result = await readContract(config.publicClient, {
        address: config.addresses.lilVRGDAProxy,
        abi: lilVRGDAConfig.abi,
        functionName: "fetchNoun",
        args: [BigInt(blockNumber)],
      });
      
      // result is [nounId, seed, svg, price, hash]
      const [nounId, seed, svg, price, hash] = result;
      
      // Compare with pool seed if available (mainnet only)
      if (!isSepolia && blockNumber) {
        try {
          const { getVrgdaSeedByBlock } = await import('@/data/ponder/vrgda/getVrgdaSeedByBlock');
          const poolSeed = await getVrgdaSeedByBlock(blockNumber.toString());
          
          if (poolSeed) {
            const contractSeed = {
              background: Number(seed.background),
              body: Number(seed.body),
              accessory: Number(seed.accessory),
              head: Number(seed.head),
              glasses: Number(seed.glasses),
            };
            
            const poolSeedTraits = {
              background: poolSeed.background,
              body: poolSeed.body,
              accessory: poolSeed.accessory,
              head: poolSeed.head,
              glasses: poolSeed.glasses,
            };
            
            const seedsMatch = JSON.stringify(contractSeed) === JSON.stringify(poolSeedTraits);
            
            const nounIdsMatch = poolSeed.nounId === nounId.toString();
            
            console.log('VRGDAClient - Seed comparison for block', blockNumber, {
              contractSeed,
              poolSeed: poolSeedTraits,
              seedsMatch,
              nounIdsMatch,
              poolSeedBlockNumber: poolSeed.blockNumber,
              poolSeedNounId: poolSeed.nounId,
              contractNounId: nounId.toString(),
              blockNumberUsed: blockNumber,
            });
            
            if (!nounIdsMatch) {
              console.error('❌ NOUN ID MISMATCH: Pool seed uses nounId', poolSeed.nounId, 'but contract uses', nounId.toString(), 'for block', blockNumber);
              console.error('This causes seed mismatch because seed generation uses both blockNumber AND nounId');
            }
            
            if (!seedsMatch) {
              if (nounIdsMatch) {
                console.warn('⚠️ SEED MISMATCH (same nounId): Contract seed does not match pool seed for block', blockNumber, '- possible blockNumber mismatch');
              } else {
                console.error('❌ SEED MISMATCH (different nounId): Contract seed does not match pool seed because nounIds differ');
              }
            }
          } else {
            console.warn('⚠️ No pool seed found for block', blockNumber, '- seed may not be in pool yet');
          }
        } catch (error) {
          console.error('Error comparing with pool seed:', error);
        }
      }
      
      return {
        id: nounId.toString(),
        owner: "0x0000000000000000000000000000000000000000" as `0x${string}`, // Not owned yet
        seed,
        svg,
        price,
        hash,
        traits: {
          background: { seed: Number(seed.background), name: `Background ${seed.background}` },
          body: { seed: Number(seed.body), name: `Body ${seed.body}` },
          accessory: { seed: Number(seed.accessory), name: `Accessory ${seed.accessory}` },
          head: { seed: Number(seed.head), name: `Head ${seed.head}` },
          glasses: { seed: Number(seed.glasses), name: `Glasses ${seed.glasses}` },
        },
        secondaryListing: null,
      };
    },
    enabled: !!currentNounId && blockNumber !== undefined && blockNumber > 0,
    staleTime: 12000, // 12 seconds (close to block time)
    refetchInterval: 12000,
  });

  // Only show error state if we have no basic data to work with
  // But don't block if we have nounId and blockNumber - we can still show the UI
  if (vrgdaLoading && !config && !currentNounIdNum) {
    return (
      <div className="flex min-h-[389px] w-full items-center justify-center">
        <div>Loading VRGDA auction...</div>
      </div>
    );
  }

  // Show loading if block number is still loading
  if (isLoadingBlock && !blockNumber) {
    return (
      <div className="flex min-h-[389px] w-full items-center justify-center">
        <div>Loading block number...</div>
      </div>
    );
  }

  if (!currentNounIdNum) {
    return (
      <div className="flex min-h-[389px] w-full items-center justify-center">
        <div>Unable to load VRGDA lil noun data</div>
      </div>
    );
  }

  // Show loading if we don't have block number yet
  if (!blockNumber || blockNumber === 0) {
    return (
      <div className="flex min-h-[389px] w-full items-center justify-center">
        <div>Waiting for block number...</div>
      </div>
    );
  }

  return (
    <>
      <div
        className={clsx(
          "absolute inset-0 z-0",
          nounData?.traits?.background?.seed === 1 ? "bg-nouns-warm" : "bg-nouns-cool",
        )}
      />
      <div
        className={clsx(
          "flex flex-col items-center justify-end gap-0 md:flex-1 md:items-end md:bg-transparent md:pr-[60px]",
        )}
      >
        <NounImageBase
          noun={nounData ?? undefined}
          width={370}
          height={370}
          priority
          className="z-10 flex h-[194px] w-[194px] flex-1 grow-0 select-none items-end justify-end rounded-3xl object-contain object-bottom md:h-[470px] md:w-[470px]"
        />
      </div>
      <div className="z-10 flex min-h-[389px] w-full min-w-0 flex-1 flex-col items-start justify-start gap-4 bg-white p-6 md:min-h-[477px] md:w-fit md:gap-6 md:bg-transparent">
        <div className="flex w-full flex-col gap-2 md:pt-[44px]">
          <div className="flex w-full flex-row-reverse items-center justify-between gap-3 md:flex-row md:justify-start">
            <span className="text-content-secondary label-md">
              Block {blockNumber}
            </span>
          </div>
          <div className="flex whitespace-pre-wrap heading-1">
            Lil Noun {nounData?.id ?? currentNounId}
          </div>
        </div>

        <VRGDAuctionInterface
          auction={{
            nounId: { toNumber: () => nounData?.id ? parseInt(nounData.id) : (currentNounIdNum ?? 0) },
            blockNumber: blockNumber,
            isPaused: isPaused ? true : false,
          }}
        />
      </div>
    </>
  );
}