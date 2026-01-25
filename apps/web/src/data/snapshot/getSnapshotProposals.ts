import { graphQLFetch } from "@/data/utils/graphQLFetch";

export interface SnapshotProposal {
  id: string;
  title: string;
  body: string;
  choices: string[];
  start: number;
  end: number;
  snapshot: string;
  state: 'active' | 'closed' | 'pending';
  author: string;
  scores: number[];
  scores_total: number;
  scores_updated: number;
  space: {
    id: string;
    name: string;
  };
}

export interface SnapshotVote {
  voter: string;
  vp: number;
  choice: number; // For leagueoflils.eth: 1 = For, 2 = Against, 3 = Abstain
  reason?: string;
}

const SNAPSHOT_GRAPHQL_URL = 'https://hub.snapshot.org/graphql';

const snapshotProposalsQuery = `
  query GetSnapshotProposals($space: String!) {
    proposals(
      first: 1000
      skip: 0
      where: { space_in: [$space] }
      orderBy: "created"
      orderDirection: desc
    ) {
      id
      title
      body
      choices
      start
      end
      snapshot
      state
      author
      scores
      scores_total
      scores_updated
      space {
        id
        name
      }
    }
  }
`;

interface SnapshotProposalsResponse {
  proposals: SnapshotProposal[];
}

export async function getSnapshotProposals(space: string = 'leagueoflils.eth'): Promise<SnapshotProposal[]> {
  try {
    const data = await graphQLFetch(
      SNAPSHOT_GRAPHQL_URL,
      snapshotProposalsQuery,
      { space },
      {
        next: { revalidate: 60 }, // Cache for 1 minute
      },
    ) as SnapshotProposalsResponse;

    return data?.proposals || [];
  } catch (error) {
    console.error('Failed to fetch Snapshot proposals:', error);
    return [];
  }
}

const snapshotVotesQuery = `
  query GetSnapshotVotes($proposalId: String!) {
    votes(where: { proposal: $proposalId }) {
      voter
      vp
      choice
      reason
    }
  }
`;

interface SnapshotVotesResponse {
  votes: SnapshotVote[];
}

export async function getSnapshotVotes(proposalId: string): Promise<SnapshotVote[]> {
  try {
    console.log('🔍 Fetching Snapshot votes for proposal:', proposalId);
    const data = await graphQLFetch(
      SNAPSHOT_GRAPHQL_URL,
      snapshotVotesQuery,
      { proposalId },
      {
        next: { revalidate: 60 },
      },
    ) as SnapshotVotesResponse;

    console.log('✅ Snapshot votes fetched:', data?.votes?.length || 0, 'votes');
    return data?.votes || [];
  } catch (error) {
    console.error('Failed to fetch Snapshot votes:', error);
    return [];
  }
}

// Match Snapshot proposals with Nouns DAO proposals using transaction hash or URL
export function matchSnapshotProposal(
  daoProposal: { createdTransactionHash?: string; id?: number },
  snapshotProposals: SnapshotProposal[]
): SnapshotProposal | undefined {
  if (!daoProposal.createdTransactionHash && !daoProposal.id) {
    console.log('❌ No transaction hash or proposal ID found in DAO proposal:', daoProposal);
    return undefined;
  }

  // Try multiple matching strategies
  const matched = snapshotProposals.find(snapshotProposal => {
    // Strategy 1: Match by transaction hash (most reliable)
    if (daoProposal.createdTransactionHash) {
      const hashLower = daoProposal.createdTransactionHash.toLowerCase();
      const bodyLower = snapshotProposal.body.toLowerCase();
      
      // Check for hash with or without 0x prefix
      if (bodyLower.includes(hashLower) || 
          bodyLower.includes(hashLower.substring(2))) {
        return true;
      }
    }
    
    // Strategy 2: Match by proposal URL (various formats)
    if (daoProposal.id) {
      const urlPatterns = [
        `https://lilnouns.wtf/vote/nouns/${daoProposal.id}`,
        `https://nouns.wtf/vote/${daoProposal.id}`,
        `lilnouns.wtf/vote/nouns/${daoProposal.id}`,
        `nouns.wtf/vote/${daoProposal.id}`,
        `/vote/nouns/${daoProposal.id}`,
        `/vote/${daoProposal.id}`,
        `prop ${daoProposal.id}`,
        `proposal ${daoProposal.id}`,
        `#${daoProposal.id}`,
      ];
      
      const bodyLower = snapshotProposal.body.toLowerCase();
      for (const pattern of urlPatterns) {
        if (bodyLower.includes(pattern.toLowerCase())) {
          return true;
        }
      }
    }
    
    return false;
  });
  
  // Only log when there's no match (for debugging)
  if (!matched && daoProposal.id) {
    console.log(`❌ [Metagov Match] No Snapshot match for Nouns Prop ${daoProposal.id}:`, {
      transactionHash: daoProposal.createdTransactionHash || 'MISSING',
      snapshotProposalsChecked: snapshotProposals.length,
      sampleSnapshotTitles: snapshotProposals.slice(0, 3).map(p => p.title.substring(0, 40))
    });
  }
  
  return matched;
}

