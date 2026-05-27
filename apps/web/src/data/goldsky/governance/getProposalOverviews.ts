import { graphQLFetch } from "@/data/utils/graphQLFetch";
import { CHAIN_CONFIG, NOUNS_DAO_GOLDSKY_URL } from "@/config";
import { ProposalOverview, mapGoldskyProposalToOverview } from "./common";
import { getBlockNumber } from "viem/actions";

export type DaoType = 'lilnouns' | 'nouns';

const query = `
  query GetProposalOverviews($first: Int = 500, $skip: Int = 0) {
    proposals(first: $first, skip: $skip, orderBy: createdBlock, orderDirection: desc) {
      id
      title
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
    }
  }
`;

// Simplified query for environments where updatePeriodEndBlock/objectionPeriodEndBlock
// are not yet available on the subgraph (e.g., older Goldsky versions).
const digestQuery = `
  query GetProposalOverviewsDigest($first: Int = 500, $skip: Int = 0) {
    proposals(first: $first, skip: $skip, orderBy: createdBlock, orderDirection: desc) {
      id
      title
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
    }
  }
`;

interface ProposalOverviewsResponse {
  proposals: Array<{
    id: string;
    title: string;
    proposer: { id: string };
    quorumVotes: string;
    forVotes: string;
    againstVotes: string;
    abstainVotes: string;
    status: string;
    createdBlock: string;
    createdTransactionHash: string;
    startBlock: string;
    endBlock: string;
    executionETA?: string;
    createdTimestamp: string;
    updatePeriodEndBlock?: string;
    objectionPeriodEndBlock?: string;
  }>;
}

// Get the appropriate Goldsky URL based on DAO type (Nouns DAO vs Lil Nouns)
function getGoldskyUrl(daoType: DaoType): string {
  if (daoType === 'nouns') {
    return NOUNS_DAO_GOLDSKY_URL;
  }
  return CHAIN_CONFIG.goldskyUrl.primary;
}

export async function getProposalOverviews(limit: number = 500, daoType: DaoType = 'lilnouns'): Promise<ProposalOverview[]> {
  try {
    const goldskyUrl = getGoldskyUrl(daoType);
    console.log('[getProposalOverviews] Fetching proposals from Goldsky:', goldskyUrl, 'daoType:', daoType);
    const overviewQuery = daoType === 'lilnouns' ? digestQuery : query;
    
    const data = await graphQLFetch(
      goldskyUrl,
      overviewQuery,
      { first: limit, skip: 0 },
      {
        next: { revalidate: 300 }, // Cache for 5 minutes
      },
    ) as ProposalOverviewsResponse;

    console.log('[getProposalOverviews] Received proposals:', data?.proposals?.length || 0);

    if (!data?.proposals) {
      console.warn('[getProposalOverviews] No proposals found in response');
      return [];
    }

    const currentDate = new Date();
    let blockNum: number | undefined;

    // Fetch block number with error handling - don't let RPC failures break the whole query
    try {
      const currentBlockNumber = await getBlockNumber(CHAIN_CONFIG.publicClient);
      blockNum = Number(currentBlockNumber);
    } catch (error) {
      console.warn('Failed to fetch block number, using fallback state calculation:', error);
      blockNum = undefined; // Fallback to status-based state calculation
    }

    // Convert each proposal using the common mapper with shared block data
    const overviews = await Promise.all(
      data.proposals.map(proposal =>
        mapGoldskyProposalToOverview(proposal, blockNum, currentDate)
      )
    );

    console.log('[getProposalOverviews] Converted to overviews:', overviews.length);
    return overviews;
  } catch (error) {
    console.error('[getProposalOverviews] Failed to fetch proposal overviews from Goldsky:', error);
    console.error('[getProposalOverviews] Goldsky URL:', getGoldskyUrl(daoType), 'daoType:', daoType);
    throw error;
  }
}

// Lightweight fetch for ProposalDigestCard (compatible with older subgraphs)
export async function getProposalOverviewsDigest(limit: number = 500, daoType: DaoType = 'lilnouns'): Promise<ProposalOverview[]> {
  try {
    const goldskyUrl = getGoldskyUrl(daoType);
    console.log('[getProposalOverviewsDigest] Fetching proposals from Goldsky:', goldskyUrl, 'daoType:', daoType);
    
    const data = await graphQLFetch(
      goldskyUrl,
      digestQuery,
      { first: limit, skip: 0 },
      {
        next: { revalidate: 300 }, // Cache for 5 minutes
      },
    ) as ProposalOverviewsResponse;

    console.log('[getProposalOverviewsDigest] Received proposals:', data?.proposals?.length || 0);

    if (!data?.proposals) {
      console.warn('[getProposalOverviewsDigest] No proposals found in response');
      return [];
    }

    const currentDate = new Date();
    let blockNum: number | undefined;

    // Fetch block number with error handling - don't let RPC failures break the whole query
    try {
      const currentBlockNumber = await getBlockNumber(CHAIN_CONFIG.publicClient);
      blockNum = Number(currentBlockNumber);
    } catch (error) {
      console.warn('Failed to fetch block number, using fallback state calculation:', error);
      blockNum = undefined; // Fallback to status-based state calculation
    }

    // Convert each proposal using the common mapper with shared block data
    const overviews = await Promise.all(
      data.proposals.map(proposal =>
        mapGoldskyProposalToOverview(proposal, blockNum, currentDate)
      )
    );

    console.log('[getProposalOverviewsDigest] Converted to overviews:', overviews.length);
    return overviews;
  } catch (error) {
    console.error('[getProposalOverviewsDigest] Failed to fetch proposal overviews from Goldsky:', error);
    console.error('[getProposalOverviewsDigest] Goldsky URL:', getGoldskyUrl(daoType), 'daoType:', daoType);
    throw error;
  }
}

// Paginated version for large datasets
export async function getProposalOverviewsPaginated(
  page: number = 0, 
  pageSize: number = 100,
  daoType: DaoType = 'lilnouns'
): Promise<{ proposals: ProposalOverview[], hasMore: boolean }> {
  try {
    const skip = page * pageSize;
    const first = pageSize + 1; // Fetch one extra to check if there are more
    const goldskyUrl = getGoldskyUrl(daoType);
    const overviewQuery = daoType === 'lilnouns' ? digestQuery : query;
    
    const data = await graphQLFetch(
      goldskyUrl,
      overviewQuery,
      { first, skip },
      {
        next: { revalidate: 60 },
      },
    ) as ProposalOverviewsResponse;

    if (!data?.proposals) {
      return { proposals: [], hasMore: false };
    }

    const hasMore = data.proposals.length > pageSize;
    const proposalsToReturn = hasMore ? data.proposals.slice(0, pageSize) : data.proposals;

    const currentDate = new Date();
    let blockNum: number | undefined;

    // Fetch block number with error handling - don't let RPC failures break the whole query
    try {
      const currentBlockNumber = await getBlockNumber(CHAIN_CONFIG.publicClient);
      blockNum = Number(currentBlockNumber);
    } catch (error) {
      console.warn('Failed to fetch block number, using fallback state calculation:', error);
      blockNum = undefined; // Fallback to status-based state calculation
    }

    // Convert each proposal using the common mapper with shared block data
    const overviews = await Promise.all(
      proposalsToReturn.map(proposal => mapGoldskyProposalToOverview(proposal, blockNum, currentDate))
    );

    return { proposals: overviews, hasMore };
  } catch (error) {
    console.error('Failed to fetch paginated proposal overviews from Goldsky:', error);
    throw error;
  }
}
