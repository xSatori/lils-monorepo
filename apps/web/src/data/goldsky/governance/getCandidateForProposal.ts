import { graphQLFetch } from "@/data/utils/graphQLFetch";
import { CHAIN_CONFIG, NOUNS_DAO_GOLDSKY_URL } from "@/config";
import { DaoType } from "./getProposalOverviews";

const query = `
  query GetCandidateForProposal($proposalId: String!) {
    proposalCandidates(
      first: 1
      where: {
        latestVersion_: {
          content_: {
            matchingProposalIds_contains: [$proposalId]
          }
        }
      }
    ) {
      id
      slug
    }
  }
`;

interface CandidateForProposalResponse {
  proposalCandidates: Array<{
    id: string;
    slug: string;
  }>;
}

// Get the appropriate Goldsky URL based on DAO type (Nouns DAO vs Lil Nouns)
function getGoldskyUrl(daoType: DaoType): string {
  if (daoType === 'nouns') {
    return NOUNS_DAO_GOLDSKY_URL;
  }
  return CHAIN_CONFIG.goldskyUrl.primary;
}

export async function getCandidateForProposal(
  proposalId: string | number,
  daoType: DaoType = 'lilnouns'
): Promise<{ id: string; slug: string } | null> {
  try {
    const goldskyUrl = getGoldskyUrl(daoType);
    const proposalIdString = proposalId.toString();
    
    console.log('[getCandidateForProposal] Searching for candidate with proposalId:', proposalIdString);
    console.log('[getCandidateForProposal] Using Goldsky URL:', goldskyUrl);
    
    const data = await graphQLFetch<CandidateForProposalResponse, { proposalId: string }>(
      goldskyUrl,
      query as any,
      { proposalId: proposalIdString },
      { cache: "no-cache" }
    );

    console.log('[getCandidateForProposal] Query result:', data);

    if (!data?.proposalCandidates || data.proposalCandidates.length === 0) {
      console.log('[getCandidateForProposal] No candidates found for proposalId:', proposalIdString);
      return null;
    }

    const candidate = data.proposalCandidates[0];
    console.log('[getCandidateForProposal] Found candidate:', candidate);
    return {
      id: candidate.id,
      slug: candidate.slug,
    };
  } catch (error) {
    console.error('Failed to fetch candidate for proposal:', error);
    return null;
  }
}

