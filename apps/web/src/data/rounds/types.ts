export type RoundState = "Upcoming" | "Proposing" | "Voting" | "Ended";

export interface RoundCommunity {
  name: string;
  handle: string;
  image: string;
}

export interface RoundAward {
  place: number;
  label: string;
  amount: string;
}

export interface RoundAdmin {
  name: string;
  handle: string;
  image: string;
  role: string;
  wallet?: string;
}

export interface RoundExternalLink {
  label: string;
  href: string;
  description: string;
}

export interface RoundProposal {
  id: string;
  title: string;
  proposer: string;
  summary: string;
  image?: string;
  votes: number;
}

export type RoundPrizeTokenType = "ETH" | "ERC20";
export type RoundEligibilityType = "LilNouns" | "CustomERC721";

export interface RoundWinnerPayout {
  wallet: string;
  amount: string;
}

export interface RoundOnchainConfig {
  chainId: 1;
  prizeTokenType: RoundPrizeTokenType;
  prizeTokenAddress?: string;
  feeAmount: string;
  feeRecipient: string;
  eligibilityType: RoundEligibilityType;
  eligibilityTokenAddress: string;
  useVotePower: boolean;
  winnerPayouts: RoundWinnerPayout[];
}

export interface Round {
  id: string;
  handle: string;
  name: string;
  summary: string;
  description: string;
  image: string;
  start: string;
  votingStart: string;
  end: string;
  funds: string;
  participants: number;
  creator?: string;
  visibility?: "Public" | "Unlisted";
  moderationStatus?: "Open" | "Paused" | "Archived";
  onchain?: RoundOnchainConfig;
  admin: RoundAdmin;
  community: RoundCommunity;
  links: RoundExternalLink[];
  awards: RoundAward[];
  proposals: RoundProposal[];
}

export type CreateRoundInput = Pick<
  Round,
  | "name"
  | "summary"
  | "description"
  | "image"
  | "start"
  | "votingStart"
  | "end"
  | "funds"
  | "admin"
  | "links"
  | "awards"
> & {
  onchain?: RoundOnchainConfig;
};
