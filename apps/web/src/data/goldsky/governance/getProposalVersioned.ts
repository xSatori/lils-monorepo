import { getDaoVersion } from '@/utils/daoVersion'
import { getProposal as getProposalV5 } from './getProposal'
import { getProposal as getProposalV2 } from './v2/getProposal'
import { DetailedProposal } from './common'
import { DaoType } from './getProposalOverviews'

/**
 * Get proposal details - automatically uses V2 or V5 queries based on DAO version
 */
export async function getProposal(id: string, daoType: DaoType = 'lilnouns'): Promise<DetailedProposal | null> {
  const daoVersion = getDaoVersion()
  
  if (daoType === 'lilnouns') {
    return getProposalV2(id, daoType)
  }

  if (daoVersion === 5) {
    return getProposalV5(id, daoType)
  } else {
    return getProposalV2(id, daoType)
  }
}

