import type { Address } from "viem";

export type GovernanceFeedCategory =
  | "all"
  | "proposal"
  | "candidate"
  | "topic"
  | "auction";

export type GovernanceFeedItemType =
  | "proposal-created"
  | "proposal-active"
  | "proposal-ended"
  | "proposal-queued"
  | "proposal-executed"
  | "proposal-cancelled"
  | "proposal-vote"
  | "candidate-created"
  | "candidate-updated"
  | "candidate-promoted"
  | "candidate-cancelled"
  | "candidate-feedback"
  | "candidate-signature"
  | "topic-created"
  | "topic-closed"
  | "topic-feedback"
  | "topic-signature"
  | "auction-live"
  | "auction-bid"
  | "vrgda-purchase";

export interface GovernanceFeedItem {
  id: string;
  category: Exclude<GovernanceFeedCategory, "all">;
  type: GovernanceFeedItemType;
  title: string;
  description?: string;
  timestamp: number;
  href: string;
  actorAddress?: Address;
  valueLabel?: string;
  voteCountLabel?: string;
  statusLabel?: string;
  metaLabel?: string;
}

export interface FeedDigestItem {
  id: string;
  title: string;
  href: string;
  meta: string;
}
