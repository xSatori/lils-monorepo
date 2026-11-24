import type { Address, Hex } from "viem";

export enum LifecycleState {
  Upcoming,
  SubmissionsOpen,
  ModerationPending,
  VotingOpen,
  Ended,
  Finalized,
  Archived,
}
export enum SubmissionType {
  Project,
  Trait,
  Other,
}
export enum SubmissionStatus {
  Pending,
  Approved,
  Rejected,
  Hidden,
}
export enum VotingStrategy {
  OnePerEligibleWallet,
  OnePerNftVote,
  FixedPerEligibleWallet,
  BasePlusVotingPower,
}
export enum PrizeAssetType {
  Native,
  Erc20,
  Erc721,
  Erc1155,
}
export enum PrizeVaultState {
  Funding,
  Sealed,
  Canceled,
}

export type PrizeAllocation = {
  id: bigint;
  winnerRank: number;
  assetType: PrizeAssetType;
  token: Address;
  tokenId: bigint;
  amount: bigint;
  claimed: boolean;
  funded: bigint;
  liability: bigint;
  recoverableExcess: bigint;
  nonce: bigint;
  held: boolean;
  heldAt: number;
  reclaimed: boolean;
};

export type PrizeVaultView = {
  address: Address;
  implementationVersion: number;
  recoveryRecipient: Address;
  prizePlanHash: Hex;
  claimPeriod: number;
  recoveryDelay: number;
  state: PrizeVaultState;
  recoveryNonce: bigint;
  cancellationNonce: bigint;
  safetyNonce: bigint;
  distributionAvailableAt: number;
  allocations: PrizeAllocation[];
  activity: PrizeVaultActivity[];
  activityUnavailable: boolean;
  projectionErrors: string[];
};

export type PrizeVaultActivity = {
  kind: string;
  blockNumber: bigint | null;
  transactionHash: Hex | null;
  logIndex: number;
  actionId?: Hex;
  allocationId?: bigint;
  account?: Address;
  amount?: bigint;
  executeAfter?: number;
};

export type RoundRecord = {
  round: Address;
  prizeVaultAddress?: Address;
  creator: Address;
  implementationVersion: number;
  configurationHash: Hex;
  prizePlanHash?: Hex;
};

export type RoundMetadata = {
  title: string;
  description: string;
  image?: string;
  awards?: Array<{ label: string; value?: string }>;
};

export type SubmissionMetadata = {
  schema?: string;
  title: string;
  description: string;
  images?: string[];
  youtubeUrls?: string[];
  media?: Array<{
    uri: string;
    type: "image" | "video" | "audio";
    alt?: string;
    poster?: string;
  }>;
};

export type RoundSubmission = {
  id: bigint;
  owner: Address;
  submissionType: SubmissionType;
  status: SubmissionStatus;
  createdAt: number;
  titleLength: number;
  descriptionLength: number;
  originalImageCount: number;
  titleHash: Hex;
  descriptionHash: Hex;
  metadataURI: string;
  metadataHash: Hex;
  votes: bigint;
  metadata?: SubmissionMetadata;
  contentError?: string;
  adminAddedImages: Array<{
    revision: bigint;
    uri: string;
    hash: Hex;
    signerA: Address;
    signerB: Address;
    executor: Address;
    appendedAt: number;
  }>;
};

export type RoundView = RoundRecord & {
  metadataURI: string;
  metadataHash: Hex;
  metadata?: RoundMetadata;
  contentError?: string;
  creationTimestamp: number;
  roundStart: number;
  submissionsOpen: number;
  submissionsClose: number;
  votingStart: number;
  votingEnd: number;
  scheduleConfigured?: boolean;
  votingPowerAdapter: Address;
  votingStrategy: VotingStrategy;
  snapshotBlock: bigint;
  snapshotCaptured: boolean;
  baseOrFixedVotes: bigint;
  maxVotesPerSubmission: bigint;
  maxSubmissionsPerWallet: number;
  maxSubmissions: number;
  winnerCount: number;
  minTitleLength: number;
  maxTitleLength: number;
  minDescriptionLength: number;
  maxDescriptionLength: number;
  lifecycleState: LifecycleState;
  finalized: boolean;
  finalizationCursor?: bigint;
  archived: boolean;
  submissions: RoundSubmission[];
  winners: bigint[];
  admins: Address[];
  activityUnavailable: boolean;
  voteActivity: Array<{
    voter: Address;
    submissionId: bigint;
    amount: bigint;
    voterSubmissionTotal: bigint;
    submissionTotal: bigint;
    transactionHash?: Hex;
    blockNumber?: bigint;
    logIndex: number;
  }>;
  prizeVault?: PrizeVaultView;
};

export const lifecycleLabels = [
  "Upcoming",
  "Submissions open",
  "Moderation review",
  "Voting open",
  "Ended",
  "Finalized",
  "Archived",
] as const;
export const statusLabels = [
  "Pending",
  "Approved",
  "Rejected",
  "Hidden",
] as const;
export const strategyLabels = [
  "One per eligible wallet",
  "Delegated NFT voting power",
  "Fixed per eligible wallet",
  "Base plus voting power",
] as const;
