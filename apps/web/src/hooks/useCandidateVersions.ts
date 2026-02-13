import { useQuery } from '@tanstack/react-query'
import { graphQLFetch } from '@/data/utils/graphQLFetch'
import { CHAIN_CONFIG, NOUNS_DAO_GOLDSKY_URL } from '@/config'
import { getAddress } from 'viem'
import { ProposalTransaction } from '@/data/goldsky/governance/common'
import { DaoType } from '@/data/goldsky/governance/getProposalOverviews'

export interface CandidateVersion {
  id: string
  versionNumber: number
  createdAt: string
  updateMessage: string
  title: string
  description: string
  targets: string[]
  values: string[]
  signatures: string[]
  calldatas: string[]
  details: ProposalTransaction[]
  candidate: {
    id: string
    slug: string
  }
}

interface CandidateVersionRaw {
  id: string
  createdTimestamp: string
  updateMessage: string
  content: {
    title: string
    description: string
    targets: string[]
    values: string[]
    signatures: string[]
    calldatas: string[]
  }
}

interface CandidateVersionsResponse {
  proposalCandidate: {
    id: string
    slug: string
    versions: CandidateVersionRaw[]
  } | null
}

// Format candidate transaction details
function formatCandidateTransactionDetails(
  targets: string[],
  values: string[],
  signatures: string[],
  calldatas: string[]
): ProposalTransaction[] {
  if (!targets || targets.length === 0) {
    return []
  }
  
  return targets.map((target, i) => {
    try {
      const calldataStr = calldatas[i] || ''
      const calldataHex = calldataStr.startsWith('0x') 
        ? calldataStr 
        : `0x${calldataStr}`
      
      return {
        to: getAddress(target),
        signature: signatures[i] || '',
        value: BigInt(values[i] || '0'),
        calldata: (calldataHex || '0x') as `0x${string}`,
      }
    } catch (error) {
      console.error('Error formatting candidate transaction detail:', error, { target, i })
      // Return a safe fallback
      return {
        to: '0x0000000000000000000000000000000000000000' as `0x${string}`,
        signature: signatures[i] || '',
        value: BigInt(0),
        calldata: '0x' as `0x${string}`,
      }
    }
  })
}

// Get the appropriate Goldsky URL based on DAO type
function getGoldskyUrl(daoType: DaoType): string {
  if (daoType === 'nouns') {
    return NOUNS_DAO_GOLDSKY_URL
  }
  // Default to Lil Nouns
  return CHAIN_CONFIG.goldskyUrl.primary
}

const candidateVersionsQuery = (id: string) => `
  query GetCandidateVersions {
    proposalCandidate(id: "${id}") {
      id
      slug
      versions {
        id
        createdTimestamp
        updateMessage
        content {
          title
          description
          targets
          values
          signatures
          calldatas
        }
      }
    }
  }
`

export function useCandidateVersions(
  id: string | null | undefined,
  daoType: DaoType = 'lilnouns',
  enabled: boolean = true
): CandidateVersion[] | undefined {
  const goldskyUrl = getGoldskyUrl(daoType)
  const idString = id?.toString()

  const { data } = useQuery({
    queryKey: ['candidate-versions', idString, daoType],
    queryFn: async () => {
      if (!idString) return null
      try {
        const result = await graphQLFetch<CandidateVersionsResponse, never>(
          goldskyUrl,
          candidateVersionsQuery(idString) as any,
          undefined,
          { cache: 'no-cache' }
        )
        return result
      } catch (error) {
        console.error('Error fetching candidate versions:', error)
        return null
      }
    },
    enabled: enabled && !!idString,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: false, // Don't retry on error to avoid spamming
  })

  if (!data?.proposalCandidate?.versions) {
    return undefined
  }

  const candidate = data.proposalCandidate

  // Sort by creation time (oldest first)
  const sortedVersions = [...candidate.versions].sort(
    (a: CandidateVersionRaw, b: CandidateVersionRaw) =>
      parseInt(a.createdTimestamp) > parseInt(b.createdTimestamp) ? 1 : -1
  )

  // Map to numbered versions with formatted transaction details
  const sortedNumberedVersions = sortedVersions.map(
    (version: CandidateVersionRaw, i: number) => {
      try {
        const details = formatCandidateTransactionDetails(
          version.content.targets || [],
          version.content.values || [],
          version.content.signatures || [],
          version.content.calldatas || []
        )

        return {
          id: version.id,
          versionNumber: i + 1,
          createdAt: version.createdTimestamp,
          updateMessage: version.updateMessage || '',
          description: version.content.description || '',
          targets: version.content.targets || [],
          values: version.content.values || [],
          signatures: version.content.signatures || [],
          calldatas: version.content.calldatas || [],
          title: version.content.title || '',
          details,
          candidate: {
            id: candidate.id,
            slug: candidate.slug,
          },
        }
      } catch (error) {
        console.error('Error processing candidate version:', error, version)
        // Return a safe fallback version
        return {
          id: version.id,
          versionNumber: i + 1,
          createdAt: version.createdTimestamp,
          updateMessage: version.updateMessage || '',
          description: version.content.description || '',
          targets: version.content.targets || [],
          values: version.content.values || [],
          signatures: version.content.signatures || [],
          calldatas: version.content.calldatas || [],
          title: version.content.title || '',
          details: [],
          candidate: {
            id: candidate.id,
            slug: candidate.slug,
          },
        }
      }
    }
  )

  return sortedNumberedVersions
}

