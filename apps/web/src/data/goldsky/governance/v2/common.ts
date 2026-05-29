import { Address, getAddress } from "viem";
import { getProposalStateV2 } from "./proposalStateParser";
import { getBlockNumber } from "viem/actions";
import { CHAIN_CONFIG } from "@/config";
import { ProposalState as UtilsProposalState } from "@/utils/types";
// Re-export types from main common.ts for compatibility
import {
  ProposalOverview,
  ProposalTransaction,
  ProposalVote,
  DetailedProposal,
} from "../common";

const ETHEREUM_BLOCK_TIME_S = 12;

// Types are re-exported from main common.ts above

// Convert raw Goldsky V2 proposal data to ProposalOverview format
// V2 doesn't have updatePeriodEndBlock, objectionPeriodEndBlock, or updatable states
export async function mapGoldskyProposalToOverviewV2(
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
    canceledBlock?: string | null;
    canceledTimestamp?: string | null;
    queuedBlock?: string | null;
    queuedTimestamp?: string | null;
    executedBlock?: string | null;
    executedTimestamp?: string | null;
    createdTimestamp: string;
  },
  currentBlockNumber?: number,
  currentDate?: Date,
): Promise<ProposalOverview> {
  const dateNow = currentDate ?? new Date();

  const state = getProposalStateV2(currentBlockNumber, dateNow, {
    status: proposal.status,
    startBlock: proposal.startBlock,
    endBlock: proposal.endBlock,
    forVotes: proposal.forVotes,
    againstVotes: proposal.againstVotes,
    quorumVotes: proposal.quorumVotes,
    executionETA: proposal.executionETA,
  });

  const mappedState = mapProposalStateToLowercase(state);

  // Calculate actual timestamps based on known creation timestamp and block differences
  const createdTimestamp = parseInt(proposal.createdTimestamp);
  const createdBlock = parseInt(proposal.createdBlock);
  const startBlock = parseInt(proposal.startBlock);
  const endBlock = parseInt(proposal.endBlock);

  // Use creation timestamp as baseline and estimate start/end times from there
  const blocksFromCreationToStart = startBlock - createdBlock;
  const blocksFromCreationToEnd = endBlock - createdBlock;

  const votingStartTimestamp =
    createdTimestamp + blocksFromCreationToStart * ETHEREUM_BLOCK_TIME_S;
  const votingEndTimestamp =
    createdTimestamp + blocksFromCreationToEnd * ETHEREUM_BLOCK_TIME_S;

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
    createdTransactionHash: proposal.createdTransactionHash,
    votingStartBlock: startBlock,
    votingStartTimestamp: votingStartTimestamp,
    votingEndBlock: endBlock,
    votingEndTimestamp: votingEndTimestamp,
    canceledBlock: proposal.canceledBlock
      ? parseInt(proposal.canceledBlock)
      : undefined,
    canceledTimestamp: proposal.canceledTimestamp
      ? parseInt(proposal.canceledTimestamp)
      : undefined,
    queuedBlock: proposal.queuedBlock
      ? parseInt(proposal.queuedBlock)
      : undefined,
    queuedTimestamp: proposal.queuedTimestamp
      ? parseInt(proposal.queuedTimestamp)
      : undefined,
    executedBlock: proposal.executedBlock
      ? parseInt(proposal.executedBlock)
      : undefined,
    executedTimestamp: proposal.executedTimestamp
      ? parseInt(proposal.executedTimestamp)
      : undefined,
    executionEtaTimestamp: proposal.executionETA
      ? parseInt(proposal.executionETA)
      : undefined,
    // V2 doesn't have objectionPeriodEndBlock - leave undefined
    objectionPeriodEndBlock: undefined,
  };
}

// Map ProposalState enum values to lowercase strings for backward compatibility
// V2 doesn't support updatable or objection period states
function mapProposalStateToLowercase(
  state: UtilsProposalState,
): ProposalOverview["state"] {
  switch (state) {
    case UtilsProposalState.Pending:
      return "pending";
    case UtilsProposalState.Active:
      return "active";
    case UtilsProposalState.Cancelled:
      return "cancelled";
    case UtilsProposalState.Vetoed:
      return "vetoed";
    case UtilsProposalState.Queued:
      return "queued";
    case UtilsProposalState.Executed:
      return "executed";
    case UtilsProposalState.Succeeded:
      return "successful";
    case UtilsProposalState.Defeated:
      return "failed";
    // V2 doesn't support these states
    case UtilsProposalState.Updatable:
    case UtilsProposalState.ObjectionPeriod:
      // Fallback to failed for unknown states
      return "failed";
    default:
      return "failed";
  }
}
