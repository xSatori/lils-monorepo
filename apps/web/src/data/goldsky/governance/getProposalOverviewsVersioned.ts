import { getDaoVersion } from '@/utils/daoVersion'
import { getProposalOverviews as getProposalOverviewsV5, getProposalOverviewsPaginated as getProposalOverviewsPaginatedV5 } from './getProposalOverviews'
import { getProposalOverviews as getProposalOverviewsV2, getProposalOverviewsPaginated as getProposalOverviewsPaginatedV2 } from './v2/getProposalOverviews'
import { ProposalOverview } from './common'
import { DaoType } from './getProposalOverviews'

/**
 * Get proposal overviews - automatically uses V2 or V5 queries based on DAO version
 */
export async function getProposalOverviews(limit: number = 500, daoType: DaoType = 'lilnouns'): Promise<ProposalOverview[]> {
  const daoVersion = getDaoVersion()
  
  if (daoType === 'lilnouns') {
    return getProposalOverviewsV2(limit, daoType)
  }

  if (daoVersion === 5) {
    return getProposalOverviewsV5(limit, daoType)
  } else {
    return getProposalOverviewsV2(limit, daoType)
  }
}

/**
 * Get paginated proposal overviews - automatically uses V2 or V5 queries based on DAO version
 */
export async function getProposalOverviewsPaginated(
  page: number = 0,
  pageSize: number = 100,
  daoType: DaoType = 'lilnouns'
): Promise<{ proposals: ProposalOverview[], hasMore: boolean }> {
  const daoVersion = getDaoVersion()
  
  if (daoType === 'lilnouns') {
    return getProposalOverviewsPaginatedV2(page, pageSize, daoType)
  }

  if (daoVersion === 5) {
    return getProposalOverviewsPaginatedV5(page, pageSize, daoType)
  } else {
    return getProposalOverviewsPaginatedV2(page, pageSize, daoType)
  }
}

