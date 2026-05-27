"use client";
import { formatEther, zeroAddress } from "viem";
import Settle from "./Settle";
import { Auction } from "@/data/auction/types";
import { formatNumber } from "@/utils/format";
import { AuctionDetailTemplate } from "./AuctionDetailsTemplate";
import { Button } from "../ui/button";
import { LinkExternal, LinkShallow } from "../ui/link";
import { CHAIN_CONFIG } from "@/config";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import Icon from "../ui/Icon";
import { mainnet } from "viem/chains";
import { BidHistoryDialog } from "./BidHistoryDialog";
import { EnsAvatar } from "../EnsAvatar";
import { EnsName } from "../EnsName";

export function EndedAuction({
  auction,
}: {
  auction: Auction;
}) {
  const winningBid = auction.bids[0];

  const address = auction.nounderAuction
    ? CHAIN_CONFIG.addresses.noundersMultisig
    : auction.nounsdaoAuction ? CHAIN_CONFIG.addresses.nounsTreasury : (auction.bids[0]?.bidderAddress ?? zeroAddress);

    // TODO set address to nouns treasury in config

  return (
    <>
      <AuctionDetailTemplate
        item1={{
          title: "Winning bid",
          value: auction.nounderAuction
            ? "n/a"
            : formatNumber({
                input: Number(
                  formatEther(
                    winningBid ? BigInt(winningBid.amount) : BigInt(0),
                  ),
                ),
                unit: "ETH",
              }),
        }}
        item2={{
          title: "Won by",
          value: (
            <div className="flex flex-row items-center gap-2">
              <LinkExternal
                href={
                  CHAIN_CONFIG.chain.blockExplorers?.default.url +
                  `/address/${address}`
                }
                className="flex min-w-0 items-center gap-2"
              >
                <div className="relative">
                  <EnsAvatar
                    address={address}
                    size={36}
                    className="!h-[20px] !w-[20px] md:!h-[36px] md:!w-[36px]"
                  />
                </div>
                <EnsName address={address} />
              </LinkExternal>
              {auction.nounderAuction && (
                <Tooltip>
                  <TooltipTrigger>
                    <Icon
                      icon="circleInfo"
                      className="fill-content-secondary"
                      size={20}
                    />
                  </TooltipTrigger>
                  <TooltipContent className="text-wrap bg-background-dark text-center">
                    All Noun auction proceeds go to the Nouns Treasury. The
                    founders ('Nounders'), are compensated with Nouns. Every
                    10th Noun for the first 5 years goes to their multisig
                    wallet.
                  </TooltipContent>
                </Tooltip>
              )}
               {auction.nounsdaoAuction && (
                <Tooltip>
                  <TooltipTrigger>
                    <Icon
                      icon="circleInfo"
                      className="fill-content-secondary"
                      size={20}
                    />
                  </TooltipTrigger>
                  <TooltipContent className="text-wrap bg-background-dark text-center">
                    Thanks NounsDAO for your support! Every 10th Lil Noun (ids #1, #11, #21...) goes to the Nouns DAO Treasury.
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
          ),
        }}
      />

      {auction.state == "ended-unsettled" &&
        (CHAIN_CONFIG.chain == mainnet ? (
          <LinkExternal
            href="https://fomonouns.wtf/"
            className="w-full hover:brightness-100"
          >
            <Button className="w-full">Help mint the next Noun</Button>
          </LinkExternal>
        ) : (
          <Settle />
        ))}
      {auction.state == "ended-settled" && (
        <div className="flex w-full flex-col gap-2 md:flex-row md:gap-4">
          <LinkShallow
            searchParam={{ name: "nounId", value: auction.nounId }}
            className="md:w-[200px]"
            variant="secondary"
            size="default"
          >
            Noun profile
          </LinkShallow>

          <LinkExternal
            href={`${CHAIN_CONFIG.chain.blockExplorers?.default.url}/token/${CHAIN_CONFIG.addresses.nounsToken}?a=${auction.nounId}`}
            className="flex w-full hover:brightness-100 md:w-[200px]"
          >
            <Button variant="secondary" className="w-full">
              Etherscan
            </Button>
          </LinkExternal>
        </div>
      )}
      {auction.bids.length > 0 && (
        <BidHistoryDialog
          nounId={auction.nounId}
          bids={auction.bids}
        >
          Bid history ({auction.bids.length})
        </BidHistoryDialog>
      )}
    </>
  );
}
