// Types for Proposal Ideas (similar to Nouns Camp candidates)
// These will be used until the Lil Nouns sponsorship contract is deployed
//todo: look at this
export interface ProposalIdea {
  id: string; // Format: proposerAddress-slug
  proposerAddress: string;
  slug: string;
  createdTimestamp: number;
  canceledTimestamp: number | null;
  lastUpdatedTimestamp: number;
  
  // Content
  latestVersion: IdeaVersion;
  versions: Array<{
    id: string;
    createdTimestamp: number;
  }>;
  
  // Feedback/comments
  feedbackPosts: FeedbackPost[];
  
  // Sponsor signatures
  sponsors: SponsorSignature[];
}

export interface IdeaVersion {
  id: string;
  createdTimestamp: number;
  updateMessage?: string;
  content: {
    title: string;
    description: string;
    targets: string[];
    values: string[];
    signatures: string[];
    calldatas: string[];
  };
  targetProposalId: number | null; // If this is an update to an existing proposal
  proposalId: number | null; // If this was promoted to a proposal
  contentSignatures?: SponsorSignature[]; // Sponsor signatures for this version
}

export interface FeedbackPost {
  id: string;
  voterAddress: string;
  support: number; // 0=against, 1=for, 2=abstain
  reason: string;
  votes: number; // Voting power
  createdTimestamp: number;
  voteReplies?: Array<{
    id: string;
    replyVote: {
      id: string;
      voter: {
        id: string;
      };
      reason: string | null;
    };
    reply: string;
  }>;
  voteRevotes?: Array<{
    id: string;
    revote: {
      id: string;
      voter: {
        id: string;
      };
      reason: string | null;
    };
  }>;
}

export interface SponsorSignature {
  sig: string;
  signer: {
    id: string;
    nounsRepresented: Array<{ id: string }>;
  };
  expirationTimestamp: number;
  createdTimestamp?: number;
  canceled: boolean;
  status?: 'valid' | 'expired' | 'canceled' | 'redundant' | 'busy';
}

export interface FeedItem {
  id: string;
  type: 'feedback' | 'signature' | 'version-update';
  authorAccount: string;
  reason?: string;
  support?: number;
  votes?: number;
  createdTimestamp: number;
  // For signatures
  sig?: string;
  signer?: SponsorSignature['signer'];
  // For version updates
  previousVersion?: IdeaVersion;
  newVersion?: IdeaVersion;
}

export type IdeaStatus = 'active' | 'canceled' | 'promoted' | 'update';

