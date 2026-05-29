import { graphQLFetch } from "@/data/utils/graphQLFetch";
import { CHAIN_CONFIG, NOUNS_DAO_GOLDSKY_URL } from "@/config";
import { ProposalOverview, mapGoldskyProposalToOverviewV2 } from "./common";
import { getBlockNumber } from "viem/actions";

export type DaoType = "lilnouns" | "nouns";

// V2 query - doesn't include updatePeriodEndBlock or objectionPeriodEndBlock
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
      canceledBlock
      canceledTimestamp
      queuedBlock
      queuedTimestamp
      executedBlock
      executedTimestamp
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
    canceledBlock?: string | null;
    canceledTimestamp?: string | null;
    queuedBlock?: string | null;
    queuedTimestamp?: string | null;
    executedBlock?: string | null;
    executedTimestamp?: string | null;
    createdTimestamp: string;
  }>;
}

// Get the appropriate Goldsky URL based on DAO type (Nouns DAO vs Lil Nouns)
function getGoldskyUrl(daoType: DaoType): string {
  if (daoType === "nouns") {
    return NOUNS_DAO_GOLDSKY_URL;
  }
  return CHAIN_CONFIG.goldskyUrl.primary;
}

export async function getProposalOverviews(
  limit: number = 500,
  daoType: DaoType = "lilnouns",
): Promise<ProposalOverview[]> {
  try {
    const goldskyUrl = getGoldskyUrl(daoType);
    console.log(
      "[getProposalOverviews V2] Fetching proposals from Goldsky:",
      goldskyUrl,
      "daoType:",
      daoType,
    );

    const data = (await graphQLFetch(
      goldskyUrl,
      query,
      { first: limit, skip: 0 },
      {
        next: { revalidate: 300 }, // Cache for 5 minutes
      },
    )) as ProposalOverviewsResponse;

    console.log(
      "[getProposalOverviews V2] Received proposals:",
      data?.proposals?.length || 0,
    );

    if (!data?.proposals) {
      console.warn("[getProposalOverviews V2] No proposals found in response");
      return [];
    }

    const currentDate = new Date();
    let blockNum: number | undefined;

    // Fetch block number with error handling
    try {
      const currentBlockNumber = await getBlockNumber(
        CHAIN_CONFIG.publicClient,
      );
      blockNum = Number(currentBlockNumber);
    } catch (error) {
      console.warn(
        "Failed to fetch block number, using fallback state calculation:",
        error,
      );
      blockNum = undefined;
    }

    // Convert each proposal using V2 mapper
    const overviews = await Promise.all(
      data.proposals.map((proposal) =>
        mapGoldskyProposalToOverviewV2(proposal, blockNum, currentDate),
      ),
    );

    console.log(
      "[getProposalOverviews V2] Converted to overviews:",
      overviews.length,
    );
    return overviews;
  } catch (error) {
    console.error(
      "[getProposalOverviews V2] Failed to fetch proposal overviews from Goldsky:",
      error,
    );
    console.error(
      "[getProposalOverviews V2] Goldsky URL:",
      getGoldskyUrl(daoType),
      "daoType:",
      daoType,
    );
    throw error;
  }
}

// Paginated version for large datasets
export async function getProposalOverviewsPaginated(
  page: number = 0,
  pageSize: number = 100,
  daoType: DaoType = "lilnouns",
): Promise<{ proposals: ProposalOverview[]; hasMore: boolean }> {
  try {
    const skip = page * pageSize;
    const first = pageSize + 1; // Fetch one extra to check if there are more
    const goldskyUrl = getGoldskyUrl(daoType);

    const data = (await graphQLFetch(
      goldskyUrl,
      query,
      { first, skip },
      {
        next: { revalidate: 60 },
      },
    )) as ProposalOverviewsResponse;

    if (!data?.proposals) {
      return { proposals: [], hasMore: false };
    }

    const hasMore = data.proposals.length > pageSize;
    const proposalsToReturn = hasMore
      ? data.proposals.slice(0, pageSize)
      : data.proposals;

    const currentDate = new Date();
    let blockNum: number | undefined;

    try {
      const currentBlockNumber = await getBlockNumber(
        CHAIN_CONFIG.publicClient,
      );
      blockNum = Number(currentBlockNumber);
    } catch (error) {
      console.warn(
        "Failed to fetch block number, using fallback state calculation:",
        error,
      );
      blockNum = undefined;
    }

    const overviews = await Promise.all(
      proposalsToReturn.map((proposal) =>
        mapGoldskyProposalToOverviewV2(proposal, blockNum, currentDate),
      ),
    );

    return { proposals: overviews, hasMore };
  } catch (error) {
    console.error(
      "Failed to fetch paginated proposal overviews from Goldsky V2:",
      error,
    );
    throw error;
  }
}
