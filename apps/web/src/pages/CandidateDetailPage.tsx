import { Helmet } from 'react-helmet-async'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getProposalIdea, normalizeIdeaId } from '@/data/goldsky/governance/getProposalIdeas'
import CandidateSidebar from '@/components/Candidate/CandidateSidebar'
import { useReadContract } from "wagmi"
import { nounsNftTokenConfig } from "@/data/generated/wagmi"
import { CHAIN_CONFIG } from "@/config"
import { getAddress } from "viem"
import {
  SidebarMainContent,
  SidebarProvider,
  SidebarSideContent,
} from '@/components/Sidebar/ProposalSidebar'
import MarkdownRenderer from '@/components/MarkdownRenderer'
import LoadingSkeletons from '@/components/LoadingSkeletons'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  SubnavTabs,
  SubnavTabsContent,
  SubnavTabsList,
  SubnavTabsTrigger,
} from '@/components/SubnavTab'
import { IdentityExplorerLink } from '@/components/IdentityExplorerLink'
import { formatTimeLeft } from '@/utils/format'
import { ChevronRight } from 'lucide-react'
import { ProposalStateBadge } from '@/components/Proposal/ProposalStateBadge'
import ProposalTransactionSummary from '@/components/Proposal/ProposalTransactionSummary'
import { getAddress as normalizeAddress } from 'viem'
import { SponsorForm } from '@/components/Candidate/SponsorForm'
import { ResponsiveContent } from '@/components/ResponsiveContet'
import CandidateFeedbackProvider from '@/components/Candidate/CandidateFeedbackProvider'
import { CandidateFeedbackForm } from '@/components/Candidate/CandidateFeedbackForm'
import FilteredSortedCandidateFeedback, { FEEDBACK_SORT_ITEMS } from '@/components/Candidate/FilteredSortedCandidateFeedback'
import SearchProvider, { SearchInput } from '@/components/Search'
import SortProvider, { SortSelect } from '@/components/Sort'
import VotingSummary from '@/components/Proposal/VotingSummary'
import { TooltipPopover } from '@/components/ui/tooltipPopover'
import { usePromoteCandidate } from '@/hooks/transactions/usePromoteCandidate'
import { useCancelProposalCandidate } from '@/hooks/transactions/useCancelProposalCandidate'
import { useAccount } from 'wagmi'
import { useNavigate } from 'react-router-dom'
import { Pencil, History } from 'lucide-react'
import { useCandidateVersions } from '@/hooks/useCandidateVersions'
import { CandidateVersionHistoryModal } from '@/components/Candidate/CandidateVersionHistoryModal'
import { useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { useProposalThreshold } from '@/hooks/useProposalThreshold'

export default function CandidateDetailPage() {
  const { id } = useParams<{ id: string }>()
  const proposalThreshold = useProposalThreshold()

  if (!id) {
    return (
      <div className="flex w-full max-w-4xl flex-col items-center justify-center p-20">
        <h1 className="heading-2 mb-4">Invalid Candidate ID</h1>
      </div>
    )
  }

  const candidateId = normalizeIdeaId(id)

  return (
    <CandidateFeedbackProvider>
      <SearchProvider>
        <SortProvider defaultSortValue="recent">
    <>
      <Helmet>
        <title>{`Candidate ${id} | Lil Nouns DAO`}</title>
        <meta name="description" content={`View and discuss proposal candidate ${id} in Lil Nouns DAO.`} />
        <link rel="canonical" href={`https://www.lilnouns.wtf/candidates/${id}`} />

        {/* OpenGraph */}
        <meta property="og:title" content={`Candidate ${id} | Lil Nouns DAO`} />
        <meta property="og:description" content={`View and discuss proposal candidate ${id} in Lil Nouns DAO.`} />
        <meta property="og:url" content={`https://www.lilnouns.wtf/candidates/${id}`} />
      </Helmet>

      {/* Desktop */}
      <div className="hidden w-full lg:block">
        <SidebarProvider>
          <SidebarMainContent>
            <div className="flex w-full max-w-[780px] flex-col gap-8 p-6 pb-[400px] md:p-10 md:pb-[400px]">
              <div className="flex w-full flex-col gap-8 md:px-4">
                {/* Breadcrumb */}
                <div className="flex items-center gap-2 paragraph-sm">
                  <Link to="/candidates">Candidates</Link>
                  <ChevronRight size={16} className="stroke-content-secondary" />
                  <span className="text-content-secondary">Candidate {id}</span>
                </div>

                <CandidateTopWrapper candidateId={candidateId} />
                <CandidateMarkdownWrapper candidateId={candidateId} />
              </div>

              <ResponsiveContent screenSizes={["lg"]}>
                <SponsorFormWrapper candidateId={candidateId} />
              </ResponsiveContent>
            </div>
          </SidebarMainContent>

          <SidebarSideContent className="flex flex-col gap-8 p-6 pb-24 pt-10 scrollbar-thin">
            <CandidateSidebarWrapper candidateId={candidateId} proposalThreshold={proposalThreshold} />
                  
                  <FeedbackSummaryWrapper candidateId={candidateId} />
                  
                  <div className="flex justify-between">
                    <div>
                      <h2 className="heading-5">Feedback</h2>
                      <LearnHowFeedbackWorksTooltipPopover />
                    </div>
                    <div className="flex flex-col gap-2">
                      <SortSelect items={FEEDBACK_SORT_ITEMS} className="w-[160px]" />
                    </div>
                  </div>

                  <SearchInput
                    placeholder="Search feedback"
                    className="w-full bg-background-primary"
                  />

                  <div className="flex flex-col gap-6 pb-[48px]">
                    <FeedbackWrapper candidateId={candidateId} />
                  </div>
          </SidebarSideContent>
        </SidebarProvider>
      </div>

      {/* Mobile */}
      <div className="flex w-full max-w-[780px] flex-col gap-8 p-6 pb-24 md:p-10 md:pb-24 lg:hidden">
        <div className="flex items-center gap-2 paragraph-sm">
          <Link to="/candidates">Candidates</Link>
          <ChevronRight size={16} className="stroke-content-secondary" />
          <span className="text-content-secondary">Candidate {id}</span>
        </div>

        <CandidateTopWrapper candidateId={candidateId} />

        <SubnavTabs defaultTab="description" className="w-full">
          <SubnavTabsList className="sticky top-[64px] z-[1]">
            <SubnavTabsTrigger tab="description">Description</SubnavTabsTrigger>
                  <SubnavTabsTrigger tab="feedback">Feedback</SubnavTabsTrigger>
          </SubnavTabsList>
          <SubnavTabsContent tab="description">
            <CandidateMarkdownWrapper candidateId={candidateId} />
          </SubnavTabsContent>
                <SubnavTabsContent tab="feedback" className="flex flex-col gap-6">
                  <div className="flex flex-col gap-3">
                    <LearnHowFeedbackWorksTooltipPopover />
                    <SortSelect
                      items={FEEDBACK_SORT_ITEMS}
                      className="h-[44px] w-full"
                    />
                    <SearchInput
                      placeholder="Search feedback"
                      className="w-full bg-background-primary"
                    />
                  </div>
                  <FeedbackWrapper candidateId={candidateId} />
          </SubnavTabsContent>
        </SubnavTabs>

              <ResponsiveContent screenSizes={["sm", "md"]}>
                <div className="mt-20">
                <SponsorFormWrapper candidateId={candidateId} />
                </div>
              </ResponsiveContent>
            </div>
          </>
        </SortProvider>
      </SearchProvider>
    </CandidateFeedbackProvider>
  )
}

function LearnHowFeedbackWorksTooltipPopover() {
  return (
    <TooltipPopover
      trigger={
        <div className="text-content-secondary underline transition-all label-sm hover:brightness-90">
          Learn how feedback works
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <p>
          Pre-proposal feedback allows community members to share their thoughts on candidate proposals before they're put onchain. You can provide feedback with For, Against, or Abstain sentiment, and reply to or revote on existing feedback.
        </p>
      </div>
    </TooltipPopover>
  )
}

function FeedbackSummaryWrapper({ candidateId }: { candidateId: string }) {
  const { data: candidate, isLoading } = useQuery({
    queryKey: ['candidate', candidateId],
    queryFn: () => getProposalIdea(candidateId),
  })

  if (isLoading) {
    return <Skeleton className="h-[112px] w-full" />
  }

  if (!candidate) {
    return null
  }

  // Calculate feedback summary (excluding abstain)
  // Only count the latest feedback per voter to avoid double-counting
  const feedbackPosts = candidate.feedbackPosts || []
  
  // Group feedback by voter and keep only the latest one per voter
  const latestFeedbackByVoter = new Map<string, typeof feedbackPosts[0]>()
  feedbackPosts.forEach(feedback => {
    const voterKey = feedback.voterAddress.toLowerCase()
    const existing = latestFeedbackByVoter.get(voterKey)
    
    // Keep the latest feedback (highest timestamp)
    if (!existing || feedback.createdTimestamp > existing.createdTimestamp) {
      latestFeedbackByVoter.set(voterKey, feedback)
    }
  })
  
  // Count only latest feedback per voter (excluding abstain/no signal)
  const uniqueFeedback = Array.from(latestFeedbackByVoter.values())
  const forCount = uniqueFeedback.filter(f => f.support === 1).length
  const againstCount = uniqueFeedback.filter(f => f.support === 0).length

  return (
    <div className="flex flex-col gap-4">
      <h2 className="heading-6">Feedback Summary</h2>
      <VotingSummary
        forVotes={forCount}
        againstVotes={againstCount}
        abstainVotes={0}
        quorumVotes={0}
        proposal={undefined}
      />
    </div>
  )
}

function FeedbackWrapper({ candidateId }: { candidateId: string }) {
  const { data: candidate, isLoading, refetch } = useQuery({
    queryKey: ['candidate', candidateId],
    queryFn: () => getProposalIdea(candidateId),
  })

  if (isLoading) {
    return <LoadingSkeletons count={10} className="h-[100px] w-full" />
  }

  if (!candidate) {
    return null
  }

  return (
    <>
      <ResponsiveContent screenSizes={["lg"]}>
        <CandidateFeedbackForm candidate={candidate} onSuccess={() => refetch()} />
      </ResponsiveContent>
      <FilteredSortedCandidateFeedback 
        feedbackPosts={candidate.feedbackPosts || []} 
        candidateCanceled={!!candidate.canceledTimestamp}
      />
    </>
  )
}

function CandidateTopWrapper({ candidateId }: { candidateId: string }) {
  const { address } = useAccount()
  const navigate = useNavigate()
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false)
  
  // Fetch candidate versions (hook must be called unconditionally, but enabled flag controls execution)
  const candidateVersions = useCandidateVersions(
    candidateId,
    'lilnouns', // TODO: Support nouns DAO type if needed
    true // Enable fetching
  )
  const hasMultipleVersions = candidateVersions && candidateVersions.length > 1
  
  const { data: candidate, isLoading } = useQuery({
    queryKey: ['candidate', candidateId],
    queryFn: () => getProposalIdea(candidateId),
  })


  if (isLoading) {
    return <LoadingSkeletons count={3} className="h-[80px] w-full" />
  }

  if (!candidate) {
    return (
      <div className="flex h-screen w-full flex-col items-center gap-4 py-8 text-center">
        <h2>Candidate not found.</h2>
        <Link to="/candidates">
          <Button className="rounded-full">Back to candidates</Button>
        </Link>
      </div>
    )
  }

  const nowTimestamp = Math.floor(Date.now() / 1000)
  const timeDelta = Math.max(nowTimestamp - candidate.createdTimestamp, 0)
  const timeAgo = formatTimeLeft(timeDelta, true)

  const isProposer = address?.toLowerCase() === candidate.proposerAddress.toLowerCase()
  const canEdit = isProposer && !candidate.canceledTimestamp && !candidate.latestVersion.proposalId
  const proposalId = candidate.latestVersion.proposalId

  return (
    <>
      {/* Proposal banner */}
      {proposalId && (
        <div className="flex items-center justify-between gap-4 rounded-[12px] border border-green-200 bg-green-50 p-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-content-primary">
              This candidate has been promoted to{' '}
              <Link 
                to={`/vote/${proposalId}`}
                className="text-green-700 hover:text-green-900 underline font-semibold"
              >
                Proposal {proposalId}
              </Link>
            </span>
          </div>
          <Link 
            to={`/vote/${proposalId}`}
            className="flex items-center gap-2 text-green-700 hover:text-green-900"
          >
            <ExternalLink size={16} />
            View Proposal
          </Link>
        </div>
      )}
      
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
        <h1 className="heading-3">{candidate.latestVersion.content.title}</h1>
          <div className="flex items-center gap-2">
          {canEdit && (
            <Button
              variant="ghost"
              onClick={() => navigate(`/update/candidate/${candidateId}`)}
              className="flex items-center gap-2"
            >
              <Pencil size={16} />
              Edit
            </Button>
          )}
            {hasMultipleVersions && (
              <Button
                variant="ghost"
                onClick={() => setIsHistoryModalOpen(true)}
                className="flex items-center gap-2"
              >
                <History size={16} />
                History ({candidateVersions.length})
              </Button>
            )}
          </div>
        </div>
        <div className="flex gap-2 text-content-secondary label-sm">
          <span>{timeAgo} ago</span>
          {candidate.canceledTimestamp && <ProposalStateBadge state="cancelled" />}
          {candidate.latestVersion.proposalId && (
            <span className="font-medium text-semantic-positive">
              Promoted to Proposal {candidate.latestVersion.proposalId}
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center whitespace-pre-wrap border-b border-t py-6 leading-7 text-content-secondary">
        Proposed by{" "}
        <IdentityExplorerLink address={normalizeAddress(candidate.proposerAddress)} showAvatar />
      </div>

      <ProposalTransactionSummary transactions={candidate.latestVersion.content.targets.map((target, i) => {
        const calldataStr = candidate.latestVersion.content.calldatas[i] || "";
        const calldataHex = calldataStr.startsWith('0x') 
          ? calldataStr 
          : `0x${calldataStr}`;
        return {
        to: normalizeAddress(target),
        signature: candidate.latestVersion.content.signatures[i],
        value: BigInt(candidate.latestVersion.content.values[i] || "0"),
          calldata: (calldataHex || "0x") as `0x${string}`,
        };
      })} />
      
      {hasMultipleVersions && candidateVersions && (
        <CandidateVersionHistoryModal
          versions={candidateVersions}
          isOpen={isHistoryModalOpen}
          onClose={() => setIsHistoryModalOpen(false)}
        />
      )}
    </>
  )
}

function CandidateMarkdownWrapper({ candidateId }: { candidateId: string }) {
  const { data: candidate, isLoading } = useQuery({
    queryKey: ['candidate', candidateId],
    queryFn: () => getProposalIdea(candidateId),
  })

  if (isLoading) {
    return <LoadingSkeletons count={20} className="h-[200px] w-full" />
  }

  if (!candidate) {
    return null
  }

  // Remove title from description if present (description format: "# Title\n\nDescription")
  let description = candidate.latestVersion.content.description
  const title = candidate.latestVersion.content.title
  if (title && description.startsWith(`# ${title}\n\n`)) {
    description = description.substring(`# ${title}\n\n`.length)
  } else if (title && description.startsWith(`# ${title}\n`)) {
    description = description.substring(`# ${title}\n`.length)
  }

  return (
    <MarkdownRenderer className="gap-4">
      {description}
    </MarkdownRenderer>
  )
}


function SponsorFormWrapper({ candidateId }: { candidateId: string }) {
  const queryClient = useQueryClient()
  const { data: candidate, isLoading, refetch } = useQuery({
    queryKey: ['candidate', candidateId],
    queryFn: () => getProposalIdea(candidateId),
  })

  if (isLoading || !candidate) {
    return null
  }

  // Hide sponsor form if candidate has been promoted to a proposal
  if (candidate.latestVersion.proposalId) {
    return null
  }

  const handleSuccess = async () => {
    // Invalidate cache immediately
    queryClient.invalidateQueries({ queryKey: ['candidate', candidateId] })
    
    // Wait a bit for subgraph to index, then refetch
    setTimeout(async () => {
      await refetch()
    }, 3000) // Wait 3 seconds for subgraph indexing
  }

  return <SponsorForm candidate={candidate} onSuccess={handleSuccess} />
}

function CandidateSidebarWrapper({ candidateId, proposalThreshold }: { candidateId: string, proposalThreshold?: number }) {
  const queryClient = useQueryClient()
  const { data: candidate, isLoading, refetch } = useQuery({
    queryKey: ['candidate', candidateId],
    queryFn: () => getProposalIdea(candidateId),
  })

  // Fetch proposer's voting power from contract (must be called before early returns)
  const { data: proposerVoteWeight } = useReadContract({
    address: CHAIN_CONFIG.addresses.nounsToken,
    abi: nounsNftTokenConfig.abi,
    functionName: "getCurrentVotes",
    args: candidate?.proposerAddress ? [getAddress(candidate.proposerAddress)] : undefined,
    query: {
      enabled: !!candidate?.proposerAddress,
    },
  })

  // Hook must be called before early returns
  const { promoteCandidate, state: promoteState, error: promoteError } = usePromoteCandidate()
  const { cancelCandidate, state: cancelState, error: cancelError } = useCancelProposalCandidate()

  if (isLoading) {
    return <Skeleton className="h-[400px] w-full" />
  }

  if (!candidate) {
    return null
  }

  // Calculate voting power
  const proposerVotingPower = proposerVoteWeight ? Number(proposerVoteWeight) : 0

  const handlePromote = async (mode?: "signatures" | "tokens") => {
    try {
      await promoteCandidate(candidate, { mode })
      // Invalidate cache and refetch candidate data after promotion
      queryClient.invalidateQueries({ queryKey: ['candidate', candidateId] })
      setTimeout(async () => {
        await refetch()
      }, 3000) // Wait 3 seconds for subgraph indexing
    } catch (error) {
      console.error('Failed to promote candidate:', error)
    }
  }

  const handleCancel = async () => {
    try {
      await cancelCandidate(candidate)
      queryClient.invalidateQueries({ queryKey: ['candidate', candidateId] })
      setTimeout(async () => {
        await refetch()
      }, 3000)
    } catch (error) {
      console.error('Failed to cancel candidate:', error)
    }
  }

  // Hide promote button if candidate has been promoted to a proposal
  const hasBeenPromoted = !!candidate.latestVersion.proposalId

  console.log('promotestate: hasBeenPromoted', hasBeenPromoted)
  console.log('promotestate: promoteState', promoteState)
  console.log('promotestate: promoteError', promoteError)
  console.log('promotestate: candidate', candidate)
  console.log('promotestate: proposerVotingPower', proposerVotingPower)
  console.log('promotestate: candidate', candidate)
  console.log('promotestate: candidate', candidate)

  return (
    <CandidateSidebar
      candidate={candidate}
      proposalThreshold={proposalThreshold ?? 0}
      proposerVotingPower={proposerVotingPower}
      onSponsor={() => {}} // Sponsor form is now handled separately
      onPromote={hasBeenPromoted ? undefined : handlePromote}
      promoteState={hasBeenPromoted ? undefined : promoteState}
      promoteError={hasBeenPromoted ? null : (promoteError ? new Error(promoteError.message) : null)}
      onCancel={!candidate.canceledTimestamp && !hasBeenPromoted ? handleCancel : undefined}
      cancelState={!candidate.canceledTimestamp && !hasBeenPromoted ? cancelState : undefined}
      cancelError={!candidate.canceledTimestamp && !hasBeenPromoted ? (cancelError ? new Error(cancelError.message) : null) : null}
    />
  )
}

