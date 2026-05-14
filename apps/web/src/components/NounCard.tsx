"use client";
import { Noun } from "@/data/noun/types";
import Image from "@/components/OptimizedImage";
import { twMerge } from "tailwind-merge";
import { useMemo, useRef, useState, useEffect } from "react";
import { CHAIN_CONFIG } from "@/config";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";
import { useInView, motion } from "framer-motion";
import { useNounImage } from "@/hooks/useNounImage";
import Icon from "./ui/Icon";
import clsx from "clsx";
import { formatTokenAmount } from "@/utils/utils";
import { isAddressEqual } from "viem";

interface NounCardProps {
  noun: Noun;
  size?: number;
  enableHover: boolean;
  alwaysShowNumber?: boolean;
  lazyLoad?: boolean;
  animationDelay?: number;
  isSelected?: boolean;
}

export default function NounCard({
  noun,
  size,
  enableHover,
  alwaysShowNumber,
  lazyLoad,
  animationDelay = 0,
  isSelected = false,
}: NounCardProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [shouldShowFallback, setShouldShowFallback] = useState(false);
  const [fallbackStartTime, setFallbackStartTime] = useState(0);
  const isInView = useInView(ref, { margin: "500px 0px" });
  const minFallbackDuration = 800; // Minimum time to show skeleton
  
  const nounIdNum = parseInt(noun.id);
  // ID-based: allocation nouns keep their badge regardless of current owner
  // (post-VRGDA, both nounder and DAO allocations land in the Lil Nouns treasury)
  const isNounderAllocation = !isNaN(nounIdNum) && nounIdNum % 10 === 0;
  const isNounsDAOAllocation = !isNaN(nounIdNum) && nounIdNum % 10 === 1;

  // Treasury badge only for non-allocation nouns actively held by the treasury
  const isTreasuryNoun = useMemo(
    () => !isNounderAllocation && !isNounsDAOAllocation &&
          noun.owner == CHAIN_CONFIG.addresses.nounsTreasury,
    [noun.owner, isNounderAllocation, isNounsDAOAllocation],
  );

  const isAuctionNoun = useMemo(() => {
    return isAddressEqual(
      CHAIN_CONFIG.addresses.nounsAuctionHouseProxy,
      noun.owner,
    );
  }, [noun.owner]);

  const nounImage = useNounImage("full", noun);

  // Progressive loading logic
  useEffect(() => {
    if (!isLoaded && !shouldShowFallback && isInView) {
      const timer = setTimeout(() => {
        setShouldShowFallback(true);
        setFallbackStartTime(Date.now());
      }, 150); // Show skeleton after 150ms if not loaded
      return () => clearTimeout(timer);
    } else if (isLoaded && shouldShowFallback) {
      const elapsed = Date.now() - fallbackStartTime;
      if (elapsed >= minFallbackDuration) {
        setShouldShowFallback(false);
      } else {
        setTimeout(() => setShouldShowFallback(false), minFallbackDuration - elapsed);
      }
    }
  }, [isLoaded, shouldShowFallback, fallbackStartTime, isInView]);

  const handleImageLoad = () => {
    setIsLoaded(true);
  };

  const handleImageError = () => {
    setIsLoaded(false);
    setShouldShowFallback(true);
  };

  return (
    <div
      ref={ref}
      data-selected={isSelected}
      className={twMerge(
        // ANIMATIONS DISABLED FOR TESTING
        // "motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in group cursor-pointer overflow-clip rounded-2xl shadow-sm transition-all ease-in-out hover:shadow-lg motion-safe:hover:scale-105 motion-safe:data-[selected=true]:scale-105 relative flex aspect-square justify-center bg-transparent",
        "group cursor-pointer overflow-clip rounded-2xl shadow-sm transition-all ease-in-out hover:shadow-lg relative flex aspect-square justify-center bg-transparent",
        size && size <= 100 && "rounded-xl",
        size && size <= 50 && "rounded-lg",
      )}
      style={{
        // animationDuration: `${animationDelay}ms`,
      }}
    >
      {!isInView && lazyLoad ? (
        <div className="aspect-square bg-background-secondary animate-pulse" />
      ) : (
        <>
          {/* Loading State / Skeleton - DISABLED FOR TESTING */}
          {/* {shouldShowFallback && (
            <div className="absolute inset-0 flex items-center justify-center bg-background-secondary animate-pulse">
              <div className="w-8 h-8 bg-gray-300 rounded-lg animate-pulse" />
              <div className="absolute bottom-2 left-2 text-xs text-gray-500">
                #{noun.id}
              </div>
            </div>
          )} */}
          
          {/* Noun Image */}
          <Image
            src={nounImage ?? "/noun-loading-skull.gif"}
            fill={size == undefined}
            width={size}
            height={size}
            alt="Noun"
            className="object-contain outline outline-4 outline-transparent opacity-100"
            // OPACITY TRANSITION DISABLED FOR TESTING
            // className={`object-contain outline outline-4 outline-transparent transition-opacity duration-300 ${
            //   isLoaded ? 'opacity-100' : 'opacity-0'
            // }`}
            unoptimized={nounImage == undefined}
            draggable={false}
            onLoad={handleImageLoad}
            onError={handleImageError}
          />
          <h6
            className={twMerge(
              "absolute bottom-[8px] hidden rounded-full bg-white px-3 py-0.5 text-content-primary shadow-lg",
              size && size <= 100 && "bottom-[4px] px-2 text-sm",
              enableHover && "group-hover:block",
              alwaysShowNumber && "block",
            )}
          >
            {noun.id}
          </h6>
          {isTreasuryNoun && enableHover && (
            <Tooltip>
              <TooltipTrigger className="absolute left-2 top-2 z-[6]" asChild>
                <div className="rounded-full bg-white p-[5px] shadow-md">
                  <Icon icon="treasury" size={size ? size / 10 : 20} />
                </div>
              </TooltipTrigger>
              <TooltipContent>
                This Lil Noun is held by the Lil Nouns treasury. <br />
                You can create a swap offer for this Noun.
              </TooltipContent>
            </Tooltip>
          )}

          {isNounderAllocation && enableHover && (
            <Tooltip>
              <TooltipTrigger className="absolute left-2 top-2 z-[6]" asChild>
                <div className="rounded-full bg-white p-[5px] shadow-md">
                  <Icon icon="treasury" size={size ? size / 10 : 20} className="fill-purple-500" />
                </div>
              </TooltipTrigger>
              <TooltipContent>
                Lil Nounder reward. <br />
                This Lil Noun was automatically sent to the Lil Nounders&apos; multisig.
              </TooltipContent>
            </Tooltip>
          )}

          {isNounsDAOAllocation && enableHover && (
            <Tooltip>
              <TooltipTrigger className="absolute left-2 top-2 z-[6]" asChild>
                <div className="rounded-full bg-white p-[5px] shadow-md">
                  <Icon icon="treasury" size={size ? size / 10 : 20} className="fill-blue-500" />
                </div>
              </TooltipTrigger>
              <TooltipContent>
                Nouns DAO reward. <br />
                This Lil Noun was automatically sent to the Nouns DAO treasury.
              </TooltipContent>
            </Tooltip>
          )}

          {noun.secondaryListing && enableHover && (
            <Tooltip>
              <TooltipTrigger className="absolute right-2 top-2 z-[6]" asChild>
                <div className="flex items-center gap-1 rounded-full bg-[#212529]/40 py-[5px] pl-1.5 pr-2 text-center text-white backdrop-blur-[2px] label-sm">
                  <Image
                    src="/ethereum-logo.png"
                    width={20}
                    height={20}
                    alt="Ξ"
                  />
                  <span>
                    {formatTokenAmount(
                      BigInt(noun.secondaryListing.priceRaw),
                      18,
                    )}
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                This Noun is listed on the secondary market.
              </TooltipContent>
            </Tooltip>
          )}
          {isAuctionNoun && enableHover && (
            <Tooltip>
              <TooltipTrigger
                className="absolute left-2 top-2 z-[6] font-bold text-white label-sm"
                asChild
              >
                <div className="flex items-center justify-center gap-[7px] rounded-full bg-background-dark py-2 pl-3 pr-4 shadow-md">
                  <div className="h-2 w-2 rounded-full bg-green-200 shadow-[0px_-1px_4px_0px_#26CB7E8C]" />
                  Bid
                </div>
              </TooltipTrigger>
              <TooltipContent>
                This Noun is currently on auction.
                <br />
                You can create a bid to win it!
              </TooltipContent>
            </Tooltip>
          )}
        </>
      )}
    </div>
  );
}
