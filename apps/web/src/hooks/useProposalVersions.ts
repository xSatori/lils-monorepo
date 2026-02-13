import { useQuery } from '@tanstack/react-query'
import { graphQLFetch } from '@/data/utils/graphQLFetch'
import { CHAIN_CONFIG, NOUNS_DAO_GOLDSKY_URL } from '@/config'
import { getAddress } from 'viem'
import { ProposalTransaction } from '@/data/goldsky/governance/common'
import { DaoType } from '@/data/goldsky/governance/getProposalOverviews'

export interface ProposalVersion {
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
  proposal: {
    id: string
  }
}

interface ProposalVersionRaw {
  id: string
  createdAt: string
  updateMessage: string
  title: string
  description: string
  targets: string[]
  values: string[]
  signatures: string[]
  calldatas: string[]
  proposal: {
    id: string
  }
}

interface ProposalVersionsResponse {
  proposalVersions: ProposalVersionRaw[]
}

// Format proposal transaction details similar to the example
function formatProposalTransactionDetails(
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
      return {
        to: getAddress(target),
        signature: signatures[i] || '',
        value: BigInt(values[i] || '0'),
        calldata: (calldatas[i] || '0x') as `0x${string}`,
      }
    } catch (error) {
      console.error('Error formatting transaction detail:', error, { target, i })
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

const proposalVersionsQuery = (id: string | number) => `
  query GetProposalVersions {
    proposalVersions(where: { proposal_: { id: "${id}" } }) {
      id
      createdAt
      updateMessage
      title
      description
      targets
      values
      signatures
      calldatas
      proposal {
        id
      }
    }
  }
`

export function useProposalVersions(
  id: string | number | null | undefined,
  daoType: DaoType = 'lilnouns',
  enabled: boolean = true
): ProposalVersion[] | undefined {
  const goldskyUrl = getGoldskyUrl(daoType)
  const idString = id?.toString() || ''

  const { data } = useQuery({
    queryKey: ['proposal-versions', idString, daoType],
    queryFn: async () => {
      if (!idString) return null
      try {
        const result = await graphQLFetch<ProposalVersionsResponse, never>(
          goldskyUrl,
          proposalVersionsQuery(idString) as any,
          undefined,
          { cache: 'no-cache' }
        )
        return result
      } catch (error) {
        console.error('Error fetching proposal versions:', error)
        return null
      }
    },
    enabled: enabled && !!idString,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: false, // Don't retry on error to avoid spamming
  })

  if (!data?.proposalVersions) {
    return undefined
  }

  // Sort by creation time (oldest first)
  const sortedProposalVersions = [...data.proposalVersions].sort(
    (a: ProposalVersionRaw, b: ProposalVersionRaw) =>
      parseInt(a.createdAt) > parseInt(b.createdAt) ? 1 : -1
  )

  // Map to numbered versions with formatted transaction details
  const sortedNumberedVersions = sortedProposalVersions.map(
    (proposalVersion: ProposalVersionRaw, i: number) => {
      try {
        const details = formatProposalTransactionDetails(
          proposalVersion.targets || [],
          proposalVersion.values || [],
          proposalVersion.signatures || [],
          proposalVersion.calldatas || []
        )

        return {
          id: proposalVersion.id,
          versionNumber: i + 1,
          createdAt: proposalVersion.createdAt,
          updateMessage: proposalVersion.updateMessage || '',
          description: proposalVersion.description || '',
          targets: proposalVersion.targets || [],
          values: proposalVersion.values || [],
          signatures: proposalVersion.signatures || [],
          calldatas: proposalVersion.calldatas || [],
          title: proposalVersion.title || '',
          details,
          proposal: {
            id: proposalVersion.proposal.id,
          },
        }
      } catch (error) {
        console.error('Error processing proposal version:', error, proposalVersion)
        // Return a safe fallback version
        return {
          id: proposalVersion.id,
          versionNumber: i + 1,
          createdAt: proposalVersion.createdAt,
          updateMessage: proposalVersion.updateMessage || '',
          description: proposalVersion.description || '',
          targets: proposalVersion.targets || [],
          values: proposalVersion.values || [],
          signatures: proposalVersion.signatures || [],
          calldatas: proposalVersion.calldatas || [],
          title: proposalVersion.title || '',
          details: [],
          proposal: {
            id: proposalVersion.proposal.id,
          },
        }
      }
    }
  )

  return sortedNumberedVersions
}

