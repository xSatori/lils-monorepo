import { useState, Suspense } from 'react'
import { Helmet } from 'react-helmet-async'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import LoadingSkeletons from '@/components/LoadingSkeletons'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import SearchProvider, { SearchInput } from '@/components/Search'
import { getProposalIdeas } from '@/data/goldsky/governance/getProposalIdeas'
import CandidateCard from '@/components/Candidate/CandidateCard'
import { useSearchContext } from '@/components/Search'
import clsx from 'clsx'
import { useProposalThreshold } from '@/hooks/useProposalThreshold'

function CandidateFeed({
  showActive,
  showCanceled,
  showPromoted,
}: {
  showActive: boolean
  showCanceled: boolean
  showPromoted: boolean
}) {
  const { data: candidates = [], isLoading } = useQuery({
    queryKey: ['candidates'],
    queryFn: () => getProposalIdeas(1000),
    staleTime: 30_000, // 30 seconds - data is fresh for 30s
    gcTime: 5 * 60 * 1000, // 5 minutes - cache for 5 minutes
  })
  const proposalThreshold = useProposalThreshold()
  
  const { debouncedSearchValue } = useSearchContext()

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <LoadingSkeletons
          count={10}
          className="h-[200px] w-full rounded-[16px]"
        />
      </div>
    )
  }

  // Filter candidates
  const filteredCandidates = candidates.filter(candidate => {
    const isActive = !candidate.canceledTimestamp && !candidate.latestVersion.proposalId && !candidate.latestVersion.targetProposalId

    // Status filters
    if (isActive && !showActive) return false
    if (candidate.canceledTimestamp && !showCanceled) return false
    if (candidate.latestVersion.proposalId && !showPromoted) return false
    
    // Search filter
    if (debouncedSearchValue) {
      const searchLower = debouncedSearchValue.toLowerCase()
      const matchesTitle = candidate.latestVersion.content.title.toLowerCase().includes(searchLower)
      const matchesProposer = candidate.proposerAddress.toLowerCase().includes(searchLower)
      const matchesDescription = candidate.latestVersion.content.description.toLowerCase().includes(searchLower)
      
      if (!matchesTitle && !matchesProposer && !matchesDescription) {
        return false
      }
    }

    return true
  })

  // Group candidates by status
  const promotedCandidates = filteredCandidates.filter(i => i.latestVersion.proposalId)
  const activeCandidates = filteredCandidates.filter(i => 
    !i.canceledTimestamp && 
    !i.latestVersion.proposalId && 
    !i.latestVersion.targetProposalId
  )
  const updateCandidates = filteredCandidates.filter(i => i.latestVersion.targetProposalId)
  const canceledCandidates = filteredCandidates.filter(i => i.canceledTimestamp)

  return (
    <div className="flex flex-col gap-10">
      {/* Active Candidates */}
      {activeCandidates.length > 0 && (
        <div className="flex flex-col gap-4">
          <h2 className="heading-6">Active Candidates</h2>
          <div className="flex flex-col gap-4">
            {activeCandidates.map(candidate => (
              <CandidateCard
                key={candidate.id}
                candidate={candidate}
                proposalThreshold={proposalThreshold ?? 0}
              />
            ))}
          </div>
        </div>
      )}

      {/* Promoted Candidates */}
      {showPromoted && promotedCandidates.length > 0 && (
        <div className="flex flex-col gap-4">
          <h2 className="heading-6">Promoted to Proposals</h2>
          <div className="flex flex-col gap-4">
            {promotedCandidates.map(candidate => (
              <CandidateCard
                key={candidate.id}
                candidate={candidate}
                proposalThreshold={proposalThreshold ?? 0}
              />
            ))}
          </div>
        </div>
      )}

      {/* Update Candidates */}
      {updateCandidates.length > 0 && (
        <div className="flex flex-col gap-4">
          <h2 className="heading-6">Proposal Updates</h2>
          <div className="flex flex-col gap-4">
            {updateCandidates.map(candidate => (
              <CandidateCard
                key={candidate.id}
                candidate={candidate}
                proposalThreshold={proposalThreshold ?? 0}
              />
            ))}
          </div>
        </div>
      )}

      {/* Canceled Candidates */}
      {showCanceled && canceledCandidates.length > 0 && (
        <div className="flex flex-col gap-4">
          <h2 className="heading-6">Canceled</h2>
          <div className="flex flex-col gap-4">
            {canceledCandidates.map(candidate => (
              <CandidateCard
                key={candidate.id}
                candidate={candidate}
                proposalThreshold={proposalThreshold ?? 0}
              />
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {filteredCandidates.length === 0 && (
        <div className="flex h-[200px] w-full items-center justify-center rounded-[16px] border bg-gray-50 text-center">
          <div className="flex flex-col gap-2">
            <p className="heading-6">No candidates found</p>
            <p className="text-content-secondary paragraph-sm">
              {debouncedSearchValue 
                ? "Try adjusting your search or filters"
                : "Be the first to submit a proposal candidate!"}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

export default function CandidatePage() {
  const navigate = useNavigate()
  const [showActive, setShowActive] = useState(true)
  const [showCanceled, setShowCanceled] = useState(false)
  const [showPromoted, setShowPromoted] = useState(false)

  return (
    <>
      <Helmet>
        <title>Proposal Candidates | Lil Nouns DAO</title>
        <meta name="description" content="Explore proposal candidates and get temperature checks from the Lil Nouns community before submitting formal proposals." />
        <link rel="canonical" href="https://www.lilnouns.wtf/candidates" />

        {/* OpenGraph */}
        <meta property="og:title" content="Proposal Candidates | Lil Nouns DAO" />
        <meta property="og:description" content="Explore proposal candidates and get temperature checks from the Lil Nouns community." />
      </Helmet>

      <SearchProvider>
        <div className="flex w-full max-w-[780px] flex-col gap-8 p-6 pb-20 md:p-10 md:pb-20">
          <div className="flex flex-col gap-6">
            <div>
              <h1 className="heading-2">Proposal Candidates</h1>
              <p className="text-content-secondary">
                Get feedback and sponsorship before submitting a formal proposal.{" "}
                <Link
                  to="/learn/lil-nouns-dao-governance-explained"
                  className="inline underline transition-colors hover:text-content-secondary"
                >
                  Learn about governance
                </Link>
                .
              </p>
            </div>
            
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setShowActive(!showActive)}
                  className={clsx(
                    "rounded-full px-4 py-2 text-sm transition-colors",
                    showActive
                      ? "bg-background-secondary text-content-primary"
                      : "bg-background-primary text-content-secondary hover:bg-background-secondary"
                  )}
                >
                  Active
                </button>
                <button
                  onClick={() => setShowCanceled(!showCanceled)}
                  className={clsx(
                    "rounded-full px-4 py-2 text-sm transition-colors",
                    showCanceled
                      ? "bg-background-secondary text-content-primary"
                      : "bg-background-primary text-content-secondary hover:bg-background-secondary"
                  )}
                >
                  Canceled
                </button>
                <button
                  onClick={() => setShowPromoted(!showPromoted)}
                  className={clsx(
                    "rounded-full px-4 py-2 text-sm transition-colors",
                    showPromoted
                      ? "bg-background-secondary text-content-primary"
                      : "bg-background-primary text-content-secondary hover:bg-background-secondary"
                  )}
                >
                  Promoted
                </button>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <SearchInput
                  placeholder="Search candidates"
                  className="sm:max-w-[300px]"
                />
                <Button
                  onClick={() => navigate('/new/candidate')}
                  className="whitespace-nowrap self-start sm:self-auto"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Submit Candidate
                </Button>
              </div>
            </div>
          </div>
          
          <Suspense
            fallback={
              <div className="flex flex-col gap-6">
                <LoadingSkeletons
                  count={10}
                  className="h-[200px] w-full rounded-[16px]"
                />
              </div>
            }
          >
            <CandidateFeed
              showActive={showActive}
              showCanceled={showCanceled}
              showPromoted={showPromoted}
            />
          </Suspense>
        </div>
      </SearchProvider>
    </>
  )
}

