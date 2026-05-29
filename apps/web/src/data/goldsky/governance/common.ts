import { Address, getAddress } from "viem";
import { getProposalState } from "./proposalStateParser";
import { getBlockNumber } from "viem/actions";
import { CHAIN_CONFIG } from "@/config";
import { ProposalState as UtilsProposalState } from "@/utils/types";

const ETHEREUM_BLOCK_TIME_S = 12;

// Use the same ProposalState type as Ponder for compatibility (Lil Nouns subset)
export type ProposalState =
  | "pending"
  | "active"
  | "successful"
  | "failed"
  | "queued"
  | "executed"
  | "cancelled"
  | "expired"
  | "vetoed"
  | "updatable"           // Proposal is in updateable period (V6)
  | "metagov_active"      // Snapshot vote is active
  | "metagov_closed"      // Snapshot vote closed, awaiting Nouns DAO vote
  | "metagov_pending";    // Snapshot vote hasn't started yet

export type ProposalOverview = {
  id: number;
  title: string;
  proposerAddress: Address;
  forVotes: number;
  againstVotes: number;
  abstainVotes: number;
  quorumVotes: number;
  state: ProposalState;
  creationBlock: number;
  createdTimestamp?: number;
  createdTransactionHash?: string;
  votingStartBlock: number;
  votingStartTimestamp: number;
  votingEndBlock: number;
  votingEndTimestamp: number;
  executionEtaTimestamp?: number;
  objectionPeriodEndBlock?: number;
  isDummy?: boolean; // Test flag - indicates this is a dummy/test proposal
  isTestCandidate?: boolean; // Test flag - indicates this is a test candidate
};

export interface ProposalTransaction {
  to: Address;
  signature: string;
  value: bigint;
  calldata: `0x${string}`;
}

export interface ProposalVote {
  id: string;
  proposalId?: number;
  proposalTitle?: string;
  voterAddress: Address;
  supportDetailed: number;
  votes: string;
  weight: number; // Alias for vote count for backward compatibility
  reason?: string;
  transactionHash: string;
  blockTimestamp: string;
  timestamp: string; // Alias for backward compatibility
  nouns: Array<{ id: string }>;
  voteRevotes?: Array<{
    id: string;
    revote: {
      id: string;
      voter: {
        id: string;
      };
      reason: string | null;
      supportDetailed?: number | null;
    };
  }>;
  voteReplies?: Array<{
    id: string;
    replyVote: {
      id: string;
      voter: {
        id: string;
      };
      reason: string | null;
      supportDetailed?: number | null;
    };
    reply: string;
  }>;
}

export interface DetailedProposal extends ProposalOverview {
  description: string;
  transactions: ProposalTransaction[];
  votes: ProposalVote[];
  createdTransactionHash?: string;
  signers?: Address[]; // Signers from candidate promotion (via proposeBySigs)
  lastUpdatedTimestamp?: number; // Timestamp of last update (V6 proposals)
}

// Convert raw Goldsky proposal data to ProposalOverview format
// Accepts optional currentBlockNumber and currentDate to avoid repeated RPC calls
export async function mapGoldskyProposalToOverview(
  proposal: {
    id: string;
    title: string;
    proposer: { id: string };
    forVotes: string;
    againstVotes: string;
    abstainVotes: string;
    quorumVotes: string;
    status: string;
    createdBlock: string;
    createdTransactionHash?: string;
    startBlock: string;
    endBlock: string;
    executionETA?: string;
    createdTimestamp: string;
    updatePeriodEndBlock?: string;
    objectionPeriodEndBlock?: string;
  },
  currentBlockNumber?: number,
  currentDate?: Date
): Promise<ProposalOverview> {
  const dateNow = currentDate ?? new Date();

  const state = getProposalState(currentBlockNumber, dateNow, {
    status: proposal.status,
    startBlock: proposal.startBlock,
    endBlock: proposal.endBlock,
    forVotes: proposal.forVotes,
    againstVotes: proposal.againstVotes,
    quorumVotes: proposal.quorumVotes,
    executionETA: proposal.executionETA,
    updatePeriodEndBlock: proposal.updatePeriodEndBlock,
      objectionPeriodEndBlock: proposal.objectionPeriodEndBlock,
  });

  const mappedState = mapProposalStateToLowercase(state);

  // Debug: Log when Goldsky status is ACTIVE but our mapped state is not active
  if (proposal.status.toUpperCase() === 'ACTIVE' && mappedState !== 'active') {
    console.log('🔍 State mapping debug for proposal', proposal.id, {
      goldskyStatus: proposal.status,
      calculatedEnum: state,
      mappedState: mappedState,
      currentBlock: currentBlockNumber,
      endBlock: proposal.endBlock,
      hasEnded: currentBlockNumber ? currentBlockNumber > parseInt(proposal.endBlock) : 'unknown'
    });
  }

  // Calculate actual timestamps based on known creation timestamp and block differences
  const createdTimestamp = parseInt(proposal.createdTimestamp);
  const createdBlock = parseInt(proposal.createdBlock);
  const startBlock = parseInt(proposal.startBlock);
  const endBlock = parseInt(proposal.endBlock);
  
  // Use creation timestamp as baseline and estimate start/end times from there
  // This is more accurate than using current time for past/present proposals
  const blocksFromCreationToStart = startBlock - createdBlock;
  const blocksFromCreationToEnd = endBlock - createdBlock;
  
  const votingStartTimestamp = createdTimestamp + (blocksFromCreationToStart * ETHEREUM_BLOCK_TIME_S);
  const votingEndTimestamp = createdTimestamp + (blocksFromCreationToEnd * ETHEREUM_BLOCK_TIME_S);

  return {
    id: parseInt(proposal.id),
    title: proposal.title,
    proposerAddress: getAddress(proposal.proposer.id),
    forVotes: parseInt(proposal.forVotes),
    againstVotes: parseInt(proposal.againstVotes),
    abstainVotes: parseInt(proposal.abstainVotes),
    quorumVotes: parseInt(proposal.quorumVotes),
    state: mappedState,
    creationBlock: createdBlock,
    createdTimestamp,
    createdTransactionHash: proposal.createdTransactionHash,
    votingStartBlock: startBlock,
    votingStartTimestamp: votingStartTimestamp,
    votingEndBlock: endBlock,
    votingEndTimestamp: votingEndTimestamp,
    executionEtaTimestamp: proposal.executionETA ? parseInt(proposal.executionETA) : undefined,
    objectionPeriodEndBlock: proposal.objectionPeriodEndBlock ? parseInt(proposal.objectionPeriodEndBlock) : undefined,
  };
}

// Map ProposalState enum values to lowercase strings for backward compatibility
function mapProposalStateToLowercase(state: UtilsProposalState): ProposalOverview['state'] {
  switch (state) {
    case UtilsProposalState.Pending:
      return 'pending';
    case UtilsProposalState.Active:
      return 'active';
    case UtilsProposalState.Cancelled:
      return 'cancelled';
    case UtilsProposalState.Vetoed:
      return 'vetoed';
    case UtilsProposalState.Queued:
      return 'queued';
    case UtilsProposalState.Executed:
      return 'executed';
    case UtilsProposalState.Succeeded:
      return 'successful';
    case UtilsProposalState.Defeated:
      return 'failed';
    case UtilsProposalState.Updatable:
      return 'updatable'; // Keep updatable state separate for edit functionality
    case UtilsProposalState.ObjectionPeriod:
      return 'successful'; // Show as "successful" but with objection period indicator
    default:
      return 'failed';
  }
}

// Determine combined metagov state based on Nouns DAO and Snapshot states
// Nouns DAO state takes precedence - Snapshot state is only used for display/metagov badges
export function determineMetagovState(
  daoState: ProposalState,
  snapshotProposal?: { state: 'active' | 'closed' | 'pending' }
): ProposalState {
  // Nouns DAO state always takes precedence for filtering/categorization
  // Only use Snapshot state for metagov badges when DAO state is active/pending
  
  if (!snapshotProposal) {
    // If Nouns DAO proposal is active but no Snapshot proposal found
    if (daoState === 'active' || daoState === 'pending') {
      return 'metagov_pending';
    }
    return daoState;
  }

  // Only apply metagov states when DAO proposal is still active/pending
  // If DAO proposal is past (succeeded/failed/etc), use DAO state
  if (daoState !== 'active' && daoState !== 'pending' && daoState !== 'updatable') {
    return daoState;
  }

  switch (snapshotProposal.state) {
    case 'active':
      // If Nouns DAO proposal is pending/active AND Snapshot is active
      if (daoState === 'pending' || daoState === 'active' || daoState === 'updatable') {
        return 'metagov_active';
      }
      break;

    case 'closed':
      // If Nouns DAO vote is still active but Snapshot closed
      if (daoState === 'active' || daoState === 'updatable') {
        return 'metagov_closed'; // "Awaiting Nouns Vote"
      }
      return daoState;

    case 'pending':
      // Snapshot pending, but use DAO state if it's more advanced
      if (daoState === 'active') {
        return daoState; // DAO is active, ignore Snapshot pending
      }
      return daoState; // Use DAO state
  }

  return daoState;
}
