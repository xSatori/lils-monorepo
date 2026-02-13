import { graphQLFetch } from "@/data/utils/graphQLFetch";
import { CHAIN_CONFIG, NOUNS_DAO_GOLDSKY_URL } from "@/config";
import { Proposal, Vote } from "@/data/generated/goldsky/graphql";
import { getAddress } from "viem";
import { DetailedProposal, ProposalTransaction, ProposalVote } from "./common";
import { getProposalStateV2 } from "./proposalStateParser";
import { getBlockNumber } from "viem/actions";
import { DaoType } from "./getProposalOverviews";
import { ProposalState } from "@/utils/types";

// V2 query - doesn't include V5 fields
const query = `
  query GetProposal($id: ID!) {
    proposal(id: $id) {
      id
      title
      description
      proposer {
        id
      }
      quorumVotes
      forVotes
      againstVotes
      abstainVotes
      status
      createdBlock
      createdTransactionHash
      startBlock
      endBlock
      executionETA
      createdTimestamp
      targets
      signatures
      values
      calldatas
      votes(first: 1000, orderBy: blockTimestamp, orderDirection: desc) {
        id
        voter {
          id
        }
        supportDetailed
        votes
        reason
        transactionHash
        blockTimestamp
        nouns {
          id
        }
      }
    }
  }
`;

interface ProposalResponse {
  proposal: Proposal & {
    description: string;
    targets: string[];
    signatures: string[];
    values: string[];
    calldatas: string[];
    votes: Vote[];
    createdTransactionHash?: string;
  };
}

// Get the appropriate Goldsky URL based on DAO type (Nouns DAO vs Lil Nouns)
function getGoldskyUrl(daoType: DaoType): string {
  if (daoType === 'nouns') {
    return NOUNS_DAO_GOLDSKY_URL;
  }
  return CHAIN_CONFIG.goldskyUrl.primary;
}

export async function getProposal(id: string, daoType: DaoType = 'lilnouns'): Promise<DetailedProposal | null> {
  try {
    const blockNumber = Number(await getBlockNumber(CHAIN_CONFIG.publicClient));
    const blockTimestamp = new Date();
    const goldskyUrl = getGoldskyUrl(daoType);
    
    console.log(`[getProposal V2] Fetching proposal ${id} from ${daoType} DAO at ${goldskyUrl}`);
    
    const data = await graphQLFetch(
      goldskyUrl,
      query as any,
      { id },
      {
        cache: "no-cache",
      },
    ) as ProposalResponse;

    console.log(`[getProposal V2] Query result:`, data);

    const proposal = data?.proposal;
    if (!proposal) {
      console.warn(`[getProposal V2] Proposal ${id} not found in ${daoType} DAO`);
      return null;
    }

    const state = getProposalStateV2(blockNumber, blockTimestamp, {
      status: proposal.status,
      startBlock: proposal.startBlock,
      endBlock: proposal.endBlock,
      forVotes: proposal.forVotes,
      againstVotes: proposal.againstVotes,
      quorumVotes: proposal.quorumVotes,
      executionETA: proposal.executionETA,
    });
    
    console.log(`[getProposal V2] Proposal ${id} state calculation:`, {
      goldskyStatus: proposal.status,
      calculatedState: state,
      blockNumber,
      executionETA: proposal.executionETA,
      currentTimestamp: blockTimestamp.getTime() / 1000,
    });
    
    const transactions: ProposalTransaction[] = proposal.targets?.map(
      (target, i) => ({
        to: getAddress(target),
        signature: proposal.signatures[i],
        value: BigInt(proposal.values[i]),
        calldata: proposal.calldatas[i] as `0x${string}`,
      })
    ) || [];

    const votes: ProposalVote[] = proposal.votes?.map((vote) => ({
      id: vote.id,
      voterAddress: getAddress(vote.voter.id),
      supportDetailed: vote.supportDetailed,
      votes: vote.votes,
      weight: parseInt(vote.votes),
      reason: vote.reason,
      transactionHash: vote.transactionHash,
      blockTimestamp: vote.blockTimestamp,
      timestamp: vote.blockTimestamp,
      nouns: vote.nouns || [],
    })) || [];

    // Map ProposalState enum to lowercase string state
    // ProposalState enum values are uppercase (e.g., "QUEUED", "SUCCEEDED")
    let mappedState: string;
    switch (state) {
      case ProposalState.Succeeded:
        mappedState = 'successful';
        break;
      case ProposalState.Defeated:
        mappedState = 'failed';
        break;
      case ProposalState.Queued:
        mappedState = 'queued';
        break;
      case ProposalState.Active:
        mappedState = 'active';
        break;
      case ProposalState.Pending:
        mappedState = 'pending';
        break;
      case ProposalState.Executed:
        mappedState = 'executed';
        break;
      case ProposalState.Cancelled:
        mappedState = 'cancelled';
        break;
      case ProposalState.Vetoed:
        mappedState = 'vetoed';
        break;
      default:
        // Fallback to lowercase enum value
        mappedState = state.toLowerCase() as any;
    }

    // Calculate timestamps using createdTimestamp (same approach as overview mapping)
    // This ensures consistency between list and detail views
    const createdTimestamp = parseInt(proposal.createdTimestamp);
    const createdBlock = parseInt(proposal.createdBlock);
    const startBlock = parseInt(proposal.startBlock);
    const endBlock = parseInt(proposal.endBlock);
    
    const blocksFromCreationToStart = startBlock - createdBlock;
    const blocksFromCreationToEnd = endBlock - createdBlock;
    
    const votingStartTimestamp = createdTimestamp + (blocksFromCreationToStart * 12);
    const votingEndTimestamp = createdTimestamp + (blocksFromCreationToEnd * 12);

    // Build base proposal data (V2 doesn't have signers, lastUpdatedTimestamp, or objectionPeriodEndBlock)
    const baseProposal = {
      id: parseInt(proposal.id),
      title: proposal.title,
      proposerAddress: getAddress(proposal.proposer.id),
      forVotes: parseInt(proposal.forVotes),
      againstVotes: parseInt(proposal.againstVotes),
      abstainVotes: parseInt(proposal.abstainVotes),
      quorumVotes: parseInt(proposal.quorumVotes),
      state: mappedState as any,
      creationBlock: createdBlock,
      createdTransactionHash: proposal.createdTransactionHash || undefined,
      votingStartBlock: startBlock,
      votingStartTimestamp: votingStartTimestamp,
      votingEndBlock: endBlock,
      votingEndTimestamp: votingEndTimestamp,
      executionEtaTimestamp: proposal.executionETA ? parseInt(proposal.executionETA) : undefined,
      objectionPeriodEndBlock: undefined, // V2 doesn't have objection period
    };

    return {
      ...baseProposal,
      description: proposal.description || "",
      transactions,
      votes,
      // V2 doesn't have signers or lastUpdatedTimestamp
      signers: undefined,
      lastUpdatedTimestamp: undefined,
    };
  } catch (error) {
    console.error('Failed to fetch proposal from Goldsky V2:', error);
    throw error;
  }
}

