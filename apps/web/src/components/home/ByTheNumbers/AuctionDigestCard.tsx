// Fetch past 8 nouns (auctions)
// This assumes you have a function getPastAuctions(count) or similar available
// If you need to use TanStack Query:
import { NounImageBase } from "@/components/NounImage";
import { getRecentNouns } from "@/data/noun/getAllNouns";
import { Noun } from "@/types";
import { useQuery } from "@tanstack/react-query";
import { readContract } from "viem/actions";
import { CHAIN_SPECIFIC_CONFIGS } from "@/config";
import { lilVRGDAConfig } from "@/config/lilVRGDAConfig";
import { graphQLFetch } from "@/data/utils/graphQLFetch";
import { formatEther } from "viem";
import { isSepoliaNetwork } from "@/utils/networkDetection";
import { mainnet, sepolia } from "viem/chains";
import { transformVpsNounToNoun } from "@/data/noun/helpers";
import { getGoldskyNounsByIds } from "@/data/goldsky/nouns";

type AuctionDigestCardProps = {
  className?: string;
  nouns: Noun[]| null;
};

const AuctionDigestCard: React.FC<AuctionDigestCardProps> = ({
  className = "",
  nouns,
}) => {

  // Get chain-specific config dynamically
  const isSepolia = isSepoliaNetwork();
  const chainId = isSepolia ? sepolia.id : mainnet.id;

  const { data: currentVRGDANoun } = useQuery({
    queryKey: ["vrgda-current-noun", chainId],
    queryFn: async () => {
      // Get the correct chain config dynamically
      const config = CHAIN_SPECIFIC_CONFIGS[chainId];
      
      if (!config) {
        console.error('No chain config found for chainId:', chainId);
        return null;
      }
      
      const currentBlock = await config.publicClient.getBlockNumber();
      const blockNumber = currentBlock - 1n; // use previous block for stability

      const result = await readContract(config.publicClient, {
        address: config.addresses.lilVRGDAProxy,
        abi: lilVRGDAConfig.abi,
        functionName: "fetchNoun",
        args: [blockNumber],
      });

      const [nounId, seed] = result as any; // [id, seed, svg, price, hash]

      const noun: Noun = {
        id: nounId.toString(),
        owner: "0x0000000000000000000000000000000000000000" as any,
        traits: {
          background: { seed: Number(seed.background), name: `Background ${seed.background}` },
          body: { seed: Number(seed.body), name: `Body ${seed.body}` },
          accessory: { seed: Number(seed.accessory), name: `Accessory ${seed.accessory}` },
          head: { seed: Number(seed.head), name: `Head ${seed.head}` },
          glasses: { seed: Number(seed.glasses), name: `Glasses ${seed.glasses}` },
        },
        secondaryListing: null,
      };

      return noun;
    },
    staleTime: 12000,
    refetchInterval: 12000,
  });

  const current = currentVRGDANoun ?? (nouns && nouns.length > 0 ? nouns[0] : null);

  // Featured historical Lil Nouns from the public Goldsky subgraph.
  const FEATURED_IDS = ["2", "69", "424", "45", "999", "2317", "2332", "4398", "2198"] as const;

  const { data: featured } = useQuery({
    queryKey: ["featured-lilnouns", FEATURED_IDS.join(","), chainId],
    queryFn: async () => {
      // Get the correct chain config dynamically
      const config = CHAIN_SPECIFIC_CONFIGS[chainId];
      
      if (!config) {
        console.error('No chain config found for chainId:', chainId);
        return [];
      }

      const goldskyNouns = await getGoldskyNounsByIds(FEATURED_IDS);
      
      // Fetch auctions from Goldsky
      const auctionsQuery = /* GraphQL */ `
        query FeaturedAuctions($ids: [ID!]!) {
          auctions(where: { noun_in: $ids, settled: true }) {
            id
            noun { id }
            amount
            settled
          }
        }
      `;

      let auctionsResult = await graphQLFetch(config.goldskyUrl.primary, auctionsQuery as any, { ids: FEATURED_IDS }, { next: { revalidate: 0 } });
      if (!auctionsResult) {
        auctionsResult = await graphQLFetch(config.goldskyUrl.fallback, auctionsQuery as any, { ids: FEATURED_IDS }, { next: { revalidate: 0 } });
      }
      const auctionsResp = (auctionsResult as any)?.auctions ?? [];

      // Map auction amounts by noun ID
      const amountByNounId = new Map<string, string>();
      for (const a of auctionsResp) {
        const nounId = a.noun?.id || a.id;
        if (a.amount && BigInt(a.amount) > 0n) {
          amountByNounId.set(nounId, a.amount);
        }
      }

      // Transform canonical nested Goldsky nouns to the existing app shape.
      const items: { noun: Noun; soldForEth?: number }[] = goldskyNouns.map((goldskyNoun) => {
        const noun = transformVpsNounToNoun(goldskyNoun);
        const amt = amountByNounId.get(noun.id);
        return { 
          noun: { ...noun, secondaryListing: null }, 
          soldForEth: amt ? Number(formatEther(BigInt(amt))) : undefined 
        };
      });

      // Sort by the order of FEATURED_IDS
      items.sort((a, b) => FEATURED_IDS.indexOf(a.noun.id as any) - FEATURED_IDS.indexOf(b.noun.id as any));
      return items;
    },
    staleTime: 60_000,
  });

  return (
    <div className={`w-full h-full rounded-[16px] bg-[#F1F4F9] px-6 pt-6 pb-0 flex flex-col ${className} overflow-hidden`}>
      {/* Header */}
      <div className="mb-4">
        <h3 className="font-bold text-[22px] leading-tight text-[#1F2937] mb-1">Token auctions</h3>
        <p className="text-[16px] leading-[1.6] text-[#68778D] mt-0">
          Each token is a vote and all proceeds go to a treasury. Traits are randomly generated and preserved on-chain forever.
        </p>
      </div>

      {/* Content area fills remaining height and scrolls only the list */}
      <div className="flex-1 flex flex-col gap-0 overflow-hidden">
        {/* Current auction large card */}
        <div className={`rounded-[16px] border border-black ${current && current.traits?.background?.seed === 1 ? "bg-nouns-warm" : "bg-nouns-cool"} px-4 md:px-6 pb-3 md:pb-4 flex flex-col items-center text-center mb-3`}>
          <div className="rounded-[12px] w-full p-2 md:p-3 mb-1 flex justify-center items-center">
            {current ? (
              <NounImageBase noun={current} width={180} height={180} className="w-[140px] h-[140px] md:w-[180px] md:h-[180px]" />
            ) : (
              <div className="w-[140px] h-[140px] md:w-[180px] md:h-[180px] bg-neutral-200 rounded" />
            )}
          </div>
          <h3 className="text-[20px] md:text-[26px] font-extrabold text-[#111827] mb-1">Current Lil Noun</h3>
        </div>

        {/* Featured historical nouns list */}
        <div className="flex-1 overflow-y-auto pt-0">
          <ul className="flex flex-col gap-2" style={{ scrollbarWidth: "none" as any }}>
            <style>{`::-webkit-scrollbar{display:none}`}</style>
            {(featured ?? []).map(({ noun, soldForEth }) => (
              <li
                key={noun.id}
                className={`flex items-end justify-between rounded-[14px] border border-black px-4 ${
                  noun.traits.background.seed === 1 ? "bg-nouns-warm" : "bg-nouns-cool"
                }`}
              >
                <div className="flex items-end gap-2 min-w-0">
                  <NounImageBase noun={noun} width={56} height={56} className="self-end" />
                  <div className="flex flex-col justify-start leading-tight mb-2">
                    <div className="font-bold text-[14px] text-[#111827] mb-0">{`Lil ${noun.id}`}</div>
                    <div className="font-bold text-[14px] text-[#68778D] mt-0">
                      {soldForEth ? (
                        <>Sold for<span className="text-black ml-2">Ξ {soldForEth.toFixed(0)}</span></>
                      ) : (
                        "Sold"
                      )}
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
};

export function AuctionDigestCardWrapper({ className = "" }: { className?: string }) {
    const { data: nouns } = useQuery({
        queryKey: ['nouns', 8],
        queryFn: () => getRecentNouns(8),
    });
    return (
      <AuctionDigestCard
            className={`w-full h-full rounded-[16px] bg-[#F1F4F9] dark:bg-white/10  p-6 ` +
                className} nouns={nouns ?? null}      />
    );
}
