
import { graphQLFetch } from "@/data/utils/graphQLFetch";
import { CHAIN_CONFIG, NOUNS_DAO_GOLDSKY_URL } from "@/config";
import { Proposal, Vote } from "@/data/generated/goldsky/graphql";
import { getAddress } from "viem";
import { DetailedProposal, ProposalTransaction, ProposalVote } from "./common";
import { getProposalState } from "./proposalStateParser";
import { getBlockNumber } from "viem/actions";
import { DaoType } from "./getProposalOverviews";
import { getProposal as getProposalV2 } from "./v2/getProposal";

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
      updatePeriodEndBlock
      objectionPeriodEndBlock
      lastUpdatedTimestamp
      targets
      signatures
      values
      calldatas
      signers
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
    signers?: string[];
    votes: Vote[];
    createdTransactionHash?: string;
    lastUpdatedTimestamp?: string;
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
    if (daoType === 'lilnouns') {
      return getProposalV2(id, daoType);
    }

    const blockNumber = Number(await getBlockNumber(CHAIN_CONFIG.publicClient));
    const blockTimestamp = new Date();
    const goldskyUrl = getGoldskyUrl(daoType);
    
    console.log(`[getProposal] Fetching proposal ${id} from ${daoType} DAO at ${goldskyUrl}`);
    
    const data = await graphQLFetch(
      goldskyUrl,
      query as any,
      { id },
      {
        cache: "no-cache",
      },
    ) as ProposalResponse;

    console.log(`[getProposal] Query result:`, data);

    const proposal = data?.proposal;
    if (!proposal) {
      console.warn(`[getProposal] Proposal ${id} not found in ${daoType} DAO`);
      return null;
    }

    const state = getProposalState(blockNumber, blockTimestamp, {
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
      weight: parseInt(vote.votes), // Alias for backward compatibility
      reason: vote.reason,
      transactionHash: vote.transactionHash,
      blockTimestamp: vote.blockTimestamp,
      timestamp: vote.blockTimestamp, // Alias for backward compatibility
      nouns: vote.nouns || [],
    })) || [];

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

    // Use the common interface to build the base proposal data
    const baseProposal = {
      id: parseInt(proposal.id),
      title: proposal.title,
      proposerAddress: getAddress(proposal.proposer.id),
      forVotes: parseInt(proposal.forVotes),
      againstVotes: parseInt(proposal.againstVotes),
      abstainVotes: parseInt(proposal.abstainVotes),
      quorumVotes: parseInt(proposal.quorumVotes),
      state: state === 'SUCCEEDED' ? 'successful' : 
             state === 'DEFEATED' ? 'failed' :
             state === 'UPDATABLE' ? 'updatable' :
             state.toLowerCase() as any,
      creationBlock: createdBlock,
      createdTimestamp,
      createdTransactionHash: proposal.createdTransactionHash || undefined,
      votingStartBlock: startBlock,
      votingStartTimestamp: votingStartTimestamp,
      votingEndBlock: endBlock,
      votingEndTimestamp: votingEndTimestamp,
      executionEtaTimestamp: proposal.executionETA ? parseInt(proposal.executionETA) : undefined,
      objectionPeriodEndBlock: proposal.objectionPeriodEndBlock ? parseInt(proposal.objectionPeriodEndBlock) : undefined,
    };

    // Map signers if available (from candidate promotion)
    const signers = proposal.signers 
      ? proposal.signers.map(signer => getAddress(signer))
      : undefined;

    return {
      ...baseProposal,
      description: proposal.description || "",
      transactions,
      votes,
      signers,
      lastUpdatedTimestamp: proposal.lastUpdatedTimestamp ? parseInt(proposal.lastUpdatedTimestamp) : undefined,
    };
  } catch (error) {
    console.error('Failed to fetch proposal from Goldsky:', error);
    throw error;
  }
}
