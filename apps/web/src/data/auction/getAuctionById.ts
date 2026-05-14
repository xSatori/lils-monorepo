import { graphql } from "../generated/gql";
import { graphQLFetchWithFallback } from "../utils/graphQLFetch";
import { CHAIN_CONFIG } from "@/config";
import { BigIntString } from "@/utils/types";
import { Auction, Bid } from "./types";
import { Hex, getAddress } from "viem";
import { getProtocolParams } from "../protocol/getProtocolParams";
import { bigIntMax } from "@/utils/bigint";
import { revalidateTag, unstable_cache } from "@/utils/viteCache";
import { FIRST_VRGDA_NOUN_ID } from "@/utils/vrgdaUtils";

const NOUNDER_AUCTION_CUTOFF = BigInt(175300);
const NOUNSDAO_AUCTION_CUTOFF = BigInt(175301);
const VRGDA_AUCTION_CUTOFF = BigInt(FIRST_VRGDA_NOUN_ID); // Use the correct VRGDA cutoff

const query = graphql(/* GraphQL */ `
  query Auction($id: ID!) {
    auction(id: $id) {
      id
      noun {
        id
      }
      amount
      startTime
      endTime
      bidder {
        id
      }
      settled
      isVrgda
      bids {
        id
        bidder {
          id
        }
        amount
        blockTimestamp
      }
    }
  }
`);

async function getAuctionByIdUncached(
  id: BigIntString,
): Promise<Auction | undefined> {

  const isNounderNoun = BigInt(id) % BigInt(10) == BigInt(0)
  const isNounsDAONoun = BigInt(id) % BigInt(10) == BigInt(1)
  const isVRGDANoun = BigInt(id) >= VRGDA_AUCTION_CUTOFF;

  // Create mock auctions for Nounder/NounsDAO nouns or any VRGDA noun
  if (
    (BigInt(id) <= NOUNDER_AUCTION_CUTOFF && isNounderNoun) ||
    (BigInt(id) <= NOUNSDAO_AUCTION_CUTOFF && isNounsDAONoun) ||
    isVRGDANoun
  ) {
    const nextNoun = await getAuctionByIdUncached(
      (BigInt(id) + BigInt(1)).toString(),
    );

    // isVRGDANoun already defined above
    
    const auction: Auction = {
      nounId: id,

      startTime: nextNoun?.startTime ?? "0",
      endTime: nextNoun?.startTime ?? "0",

      nextMinBid: "0",

      // VRGDA auctions are always "live" since they can be purchased anytime
      state: isVRGDANoun ? "live" : "ended-settled",

      bids: [],

      isVRGDAAuction: isVRGDANoun,
      nounderAuction: false,
      nounsdaoAuction: false
    };

    if (isNounderNoun) {
      auction.nounderAuction = true;
    } else {
      auction.nounderAuction = false;
    }

    if (isNounsDAONoun) {
      auction.nounsdaoAuction = true;
    } else {
      auction.nounsdaoAuction = false;
    }

    return auction;
  }

  const [result, params] = await Promise.all([
    graphQLFetchWithFallback(
      CHAIN_CONFIG.subgraphUrl,
      query,
      { id },
      { next: { revalidate: 0 } },
    ),
    getProtocolParams(),
  ]);

  const auction = result?.auction;
  if (!auction) {
    console.error("getAuctionByIdUncached - no auction found", id);
    return undefined;
  }

  const bids: Bid[] = auction.bids.map((bid: any) => ({
    transactionHash: bid.id as Hex, // Using bid.id as transaction hash
    bidderAddress: getAddress(bid.bidder.id),
    amount: bid.amount,
    timestamp: bid.blockTimestamp,
    clientId: undefined, // clientId not available in Lil Nouns schema
  }));

  // Sort descending by amount
  bids.sort((a, b) => (BigInt(b.amount) > BigInt(a.amount) ? 1 : -1));

  const highestBidAmount =
    auction.bids.length > 0 ? BigInt(bids[0].amount) : BigInt(0);
  const nextMinBid = bigIntMax(
    BigInt(params.reservePrice),
    highestBidAmount +
      (highestBidAmount * BigInt(params.minBidIncrementPercentage)) /
        BigInt(100),
  );

  const nowS = Date.now() / 1000;
  const ended = nowS > Number(auction.endTime);

  return {
    nounId: auction.noun.id,

    startTime: auction.startTime,
    endTime: auction.endTime,

    nextMinBid: nextMinBid.toString(),

    state: ended
      ? auction.settled
        ? "ended-settled"
        : "ended-unsettled"
      : "live",

    bids,

    nounderAuction: false,
    nounsdaoAuction: false,
  } as Auction;
}

const getAuctionByIdCached = unstable_cache(
  getAuctionByIdUncached,
  ["get-auction-by-id"],
  {
    tags: ["get-auction-by-id"],
  },
);

export async function getAuctionById(id: BigIntString) {
  const cachedAuction = await getAuctionByIdCached(id);

  if (cachedAuction?.state != "ended-settled") {
    revalidateTag("get-auction-by-id");
    return await getAuctionByIdCached(id);
  }

  return cachedAuction;
}
