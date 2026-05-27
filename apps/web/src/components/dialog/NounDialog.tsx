import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import clsx from "clsx";
import Image from "@/components/OptimizedImage";
import { Noun, NounTraitType } from "@/data/noun/types";
import { Separator } from "../ui/separator";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CHAIN_CONFIG } from "@/config";
import { Link } from "react-router-dom";
import { Button } from "../ui/button";
import { Skeleton } from "../ui/skeleton";
import { useNounImage } from "@/hooks/useNounImage";
import { scrollToNounExplorer } from "@/utils/scroll";
import { EnsAvatar } from "../EnsAvatar";
import { EnsName } from "../EnsName";
import { LinkExternal } from "../ui/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getNounById } from "@/data/noun/getNounById";
import {
  DrawerDialog,
  DrawerDialogContent,
  DrawerDialogContentInner,
  DrawerDialogTitle,
} from "../ui/DrawerDialog";
import { traitNameToSlug, seedToSlug } from "@/utils/traitUrlHelpers";
import { graphQLFetch } from "@/data/utils/graphQLFetch";
import { formatEther } from "viem";
import { formatNumber } from "@/utils/format";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";

export default function NounDialog() {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  
  // Get lilnounId directly from search params
  const nounId = searchParams.get("lilnounId");
  
  // Debug logging (only when nounId changes)
  useEffect(() => {
    if (nounId) {
      console.log("NounDialog opened for nounId:", nounId);
      console.log("Chain ID:", import.meta.env.VITE_CHAIN_ID);
      console.log("Has Alchemy key:", !!import.meta.env.VITE_ALCHEMY_API_KEY);
    }
  }, [nounId]);

  const dummyNoun: Noun = {
    id: "1",
    owner: "0x0000000000000000000000000000000000000000",
    traits: {
      background: { seed: 1, name: "Background" },
      head: { seed: 1, name: "Head" },
      glasses: { seed: 1, name: "Glasses" },
      body: { seed: 1, name: "Body" },
      accessory: { seed: 1, name: "Accessory" },
    },
    secondaryListing: null
  };
  

  // Try to get noun from existing cache first, then fetch if needed
  const { data: noun, isLoading: nounLoading, error } = useQuery({
    queryKey: ["noun", nounId],
    queryFn: async () => {
      if (!nounId) return null;
      
      console.log("🔍 Fetching Lil Noun:", nounId);
      
      try {
        const result = await getNounById(nounId);
        console.log("✅ getNounById result:", result);
        return result || null;
      } catch (err) {
        console.error("❌ getNounById error:", err);
        return null;
      }
    },
    enabled: !!nounId,
    // Try to use cached data from the explore page
    initialData: () => {
      // Check if we have the noun in the "all-nouns" cache
      const allNounsData = queryClient.getQueryData(["all-nouns"]);
      if (allNounsData && Array.isArray(allNounsData)) {
        const cachedNoun = allNounsData.find((n: Noun) => n.id === nounId);
        if (cachedNoun) {
          console.log("🎯 Found noun in cache:", cachedNoun);
          return cachedNoun;
        }
      }
      return undefined;
    }
  });
  
  // Debug logging for query errors only
  useEffect(() => {
    if (error) {
      console.error("Noun query error:", error);
    }
  }, [error]);

  const [displayNoun, setDisplayNoun] = useState<Noun | undefined>();

  useEffect(() => {
    if (noun) {
      setDisplayNoun(noun);
    } else if (!nounId) {
      // Latch the selected Noun so we can have a nice exit animation
    }
  }, [noun, nounId]);

  const fullImageData = useNounImage("full", noun || undefined);

  function handleOpenChange(open: boolean) {
    if (!open) {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("lilnounId");
      setSearchParams(params, { replace: true });
    }
  }

  const heldByTreasury = useMemo(() => {
    return displayNoun?.owner === CHAIN_CONFIG.addresses.nounsTreasury;
  }, [displayNoun]);

  // Check if this is a special reward token
  // Every 10th token (0, 10, 20, 30...) goes to lil nounders
  // Every 10th token offset by 1 (1, 11, 21, 31...) goes to Nouns DAO
  const rewardInfo = useMemo(() => {
    if (!nounId) return null;
    const idNum = parseInt(nounId);
    if (isNaN(idNum)) return null;
    
    if (idNum % 10 === 0) {
      return {
        message: "Lilnounder reward",
        tooltip: (
          <>
            <p className="mb-2">
              Because 100% of Lil Noun auction proceeds are sent to Lil Nouns DAO, Lil Nounders
              have chosen to compensate themselves with Lil Nouns. Every 10th Lil Noun for the
              first 5 years of the project (Lil Noun ids #0, #10, #20, #30 and so on) will be
              automatically sent to the Lil Nounder's multisig to be vested and shared among the
              founding members of the project.
            </p>
            <p>
              Lil Nounder distributions don't interfere with the cadence of 15 minute auctions.
              Lil Nouns are sent directly to the Lil Nounder's Multisig, and auctions continue on
              schedule with the next available Lil Noun ID.
            </p>
          </>
        ),
      };
    } else if (idNum % 10 === 1) {
      return {
        message: "Nouns DAO reward",
        tooltip: (
          <>
            <p className="mb-2">
              For being selfless stewards of cc0, Lil Nounders have chosen to compensate the Nouns
              DAO with Lil Nouns. Every 11th Lil Noun for the first 5 years of the project (Lil
              Noun ids #1, #11, #21, #31 and so on) will be automatically sent to the Nouns DAO to
              be vested and shared among members of the project.
            </p>
            <p>
              Nouns DAO distributions don't interfere with the cadence of 15 minute auctions. Lil
              Nouns are sent directly to the Nouns DAO Treasury, and auctions continue on schedule
              with the next available Lil Noun ID.
            </p>
          </>
        ),
      };
    }
    return null;
  }, [nounId]);

  // Query for auction purchase amount
  const { data: auctionData } = useQuery({
    queryKey: ["noun-auction", nounId],
    queryFn: async () => {
      if (!nounId) return null;
      
      try {
        const query = /* GraphQL */ `
          query GetNounAuction($nounId: ID!) {
            auctions(
              where: { noun: $nounId, settled: true }
              orderBy: startTime
              orderDirection: asc
              first: 1
            ) {
              id
              amount
              settled
              startTime
            }
          }
        `;

        let result = await graphQLFetch(
          CHAIN_CONFIG.goldskyUrl.primary,
          query as any,
          { nounId },
          { next: { revalidate: 300 } }
        );
        
        if (!result) {
          result = await graphQLFetch(
            CHAIN_CONFIG.goldskyUrl.fallback,
            query as any,
            { nounId },
            { next: { revalidate: 300 } }
          );
        }

        const auctions = (result as any)?.auctions ?? [];
        if (auctions.length > 0 && auctions[0].amount) {
          return {
            amount: auctions[0].amount,
            startTime: auctions[0].startTime,
          };
        }
        return null;
      } catch (error) {
        console.error("Failed to fetch auction data:", error);
        return null;
      }
    },
    enabled: !!nounId,
  });

  // Query for voting history
  const { data: votingHistory } = useQuery({
    queryKey: ["noun-voting-history", nounId],
    queryFn: async () => {
      if (!nounId) return null;
      
      try {
        // Query the Noun entity and access its votes through the derived field
        const query = /* GraphQL */ `
          query GetNounVotingHistory($nounId: ID!) {
            noun(id: $nounId) {
              id
              votes(
                orderBy: blockTimestamp
                orderDirection: desc
                first: 100
              ) {
                id
                proposal {
                  id
                  title
                }
                supportDetailed
                blockTimestamp
                transactionHash
              }
            }
          }
        `;

        let result = await graphQLFetch(
          CHAIN_CONFIG.goldskyUrl.primary,
          query as any,
          { nounId },
          { next: { revalidate: 300 } }
        );
        
        if (!result) {
          result = await graphQLFetch(
            CHAIN_CONFIG.goldskyUrl.fallback,
            query as any,
            { nounId },
            { next: { revalidate: 300 } }
          );
        }

        const noun = (result as any)?.noun;
        const votes = noun?.votes ?? [];
        return votes.length > 0 ? votes : null;
      } catch (error) {
        console.error("Failed to fetch voting history:", error);
        return null;
      }
    },
    enabled: !!nounId,
  });

  // Show dialog if nounId exists, even if loading or no data yet
  if (!nounId) {
    return null;
  }

  return (
    <DrawerDialog open={nounId !== null} onOpenChange={handleOpenChange}>
      <DrawerDialogContent
        className={clsx(
          "md:aspect-[100/45] md:max-w-[min(95vw,1400px)]",
          displayNoun?.traits.background.seed === 1 ? "bg-nouns-warm" : "bg-nouns-cool",
        )}
      >
        <DrawerDialogTitle className="sr-only">
          Lil Noun {displayNoun?.id || nounId}
        </DrawerDialogTitle>
        <DrawerDialogContentInner className={clsx("p-0 md:flex-row")}>
          <div className="w-full pl-6 pt-6 heading-1 md:hidden">
            Lil Noun {displayNoun?.id || nounId}
          </div>
          <Image
            src={fullImageData ?? "/noun-loading-skull.gif"}
            width={600}
            height={600}
            alt="Lil Noun"
            unoptimized={fullImageData === undefined}
            className="flex aspect-square h-fit max-h-[400px] w-full max-w-[min(70%,400px)] shrink-0 justify-center object-contain object-bottom md:h-full md:max-h-none md:w-[45%] md:max-w-none"
          />

          <div className="flex w-full flex-auto flex-col gap-6 overflow-visible px-6 pb-6 scrollbar-track-transparent md:h-full md:overflow-y-auto md:px-8 md:pt-12">
            <h2 className="hidden md:block">Lil Noun {displayNoun?.id || nounId}</h2>
            <Separator className="h-[2px]" />

            {displayNoun?.owner && (
              <LinkExternal
                className="flex min-w-0 items-center gap-2 hover:brightness-75"
                href={`${CHAIN_CONFIG.chain.blockExplorers?.default.url}/address/${displayNoun.owner}`}
              >
                <div className="flex w-fit max-w-full items-center gap-6">
                  <EnsAvatar address={displayNoun.owner} size={36} />
                  <div className="flex h-full min-w-0 flex-col justify-start overflow-hidden label-md">
                    <span className="text-content-secondary paragraph-sm">
                      Held by
                    </span>
                    <EnsName address={displayNoun.owner} />
                  </div>
                </div>
              </LinkExternal>
            )}

            {/* {heldByTreasury && displayNoun?.id && (
              <>
                <Link to={`/treasury-swap/${displayNoun.id}`}>
                  <Button className="w-full">Create a swap offer</Button>
                </Link>
                <div className="text-content-secondary">
                  You can create a swap offer proposal for this Lil Noun.
                </div>
              </>
            )} */}

            <Separator className="h-[2px]" />

            <div className="flex flex-col gap-4">
              <h5>Traits</h5>
              {nounLoading ? (
                <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                  {Array(5).fill(0).map((_, i) => (
                    <div key={i} className="flex justify-start gap-4 rounded-xl bg-black/5 p-2">
                      <Skeleton className="h-12 w-12 rounded-lg" />
                      <div className="flex flex-col gap-1">
                        <Skeleton className="h-4 w-16" />
                        <Skeleton className="h-4 w-24" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                  <NounTraitCard type="head" noun={noun || undefined} />
                  <NounTraitCard type="glasses" noun={noun || undefined} />
                  <NounTraitCard type="body" noun={noun || undefined} />
                  <NounTraitCard type="accessory" noun={noun || undefined} />
                  <NounTraitCard type="background" noun={noun || undefined} />
                </div>
              )}
            </div>

            <Separator className="h-[2px]" />

            <div className="flex flex-col gap-4">
              <h5>Info</h5>
              {auctionData?.amount && (
                <div className="flex w-fit items-center gap-2.5 rounded-lg bg-black/5 p-2 label-sm">
                  <span className="text-content-secondary">Purchased for:</span>
                  <span className="font-semibold">
                    Ξ {formatNumber({ 
                      input: Number(formatEther(BigInt(auctionData.amount))),
                      maxFractionDigits: 2
                    })}
                  </span>
                </div>
              )}
              {rewardInfo && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex w-fit items-center gap-2.5 rounded-lg bg-black/5 p-2 label-sm cursor-help">
                      <span className="text-content-secondary">{rewardInfo.message}</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-[400px]">
                    <div className="flex flex-col gap-3">
                      {rewardInfo.tooltip}
                    </div>
                  </TooltipContent>
                </Tooltip>
              )}
              {votingHistory && votingHistory.length > 0 && (
                <div className="flex flex-col gap-2">
                  <div className="flex w-fit items-center gap-2.5 rounded-lg bg-black/5 p-2 label-sm">
                    <span className="text-content-secondary">Voting history:</span>
                    <span className="font-semibold">{votingHistory.length} vote{votingHistory.length !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="flex flex-col gap-1 max-h-[200px] overflow-y-auto">
                    {votingHistory.slice(0, 5).map((vote: any) => (
                      <LinkExternal
                        key={vote.id}
                        href={`${CHAIN_CONFIG.chain.blockExplorers?.default.url}/tx/${vote.transactionHash}`}
                        className="text-sm text-content-secondary hover:text-content-primary"
                      >
                        Proposal {vote.proposal.id}: {vote.proposal.title || 'Untitled'}
                        {vote.supportDetailed === 1 && ' ✓'}
                        {vote.supportDetailed === 0 && ' ✗'}
                        {vote.supportDetailed === 2 && ' ⊘'}
                      </LinkExternal>
                    ))}
                    {votingHistory.length > 5 && (
                      <span className="text-sm text-content-secondary">
                        +{votingHistory.length - 5} more
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>

            <Separator className="h-[2px]" />
          </div>
        </DrawerDialogContentInner>
      </DrawerDialogContent>
    </DrawerDialog>
  );
}

function NounTraitCard({ type, noun }: { type: NounTraitType; noun?: Noun }) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const traitImage = useNounImage(type, noun);
  const trait = noun?.traits[type];

  const handleClick = useCallback(() => {
    if (trait) {
      const params = new URLSearchParams();
      
      // Use new format: traitType=trait-slug (e.g., head=cool-cat)
      // Use seed to get standardized trait name from filter lists
      const filterKey = type;
      const traitSlug = seedToSlug(trait.seed, type);
      if (traitSlug) {
        // Set single value: head=cat
        params.set(filterKey, traitSlug);
      }

      // Always navigate to /explore with the filter applied
      navigate(`/explore?${params.toString()}`);
      
      // Scroll to explore section
      scrollToNounExplorer();
    }
  }, [type, trait, navigate]);

  return (
    <button
      className="flex justify-start gap-4 rounded-xl bg-black/5 p-2 text-start clickable-active hover:bg-black/10"
      onClick={() => handleClick()}
    >
      {traitImage ? (
        <Image
          src={traitImage}
          width={48}
          height={48}
          alt="Lil Noun Trait"
          className="h-12 w-12 rounded-lg"
        />
      ) : (
        <Skeleton className="h-12 w-12 rounded-lg" />
      )}
      <div className="flex flex-col">
        <span className="text-content-secondary paragraph-sm">
          {type.charAt(0).toUpperCase() + type.slice(1)}
        </span>
        <span className="label-md">
          {trait?.name
            ?.split("-")
            .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
            .join(" ")}
        </span>
      </div>
    </button>
  );
}
