import { useEffect, useState, Suspense } from 'react'
import { Helmet } from 'react-helmet-async'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import LoadingSkeletons from '@/components/LoadingSkeletons'
import InfiniteProposalOverviews from '@/components/Proposal/InfiniteProposalOverviews'
import SearchProvider, { SearchInput } from '@/components/Search'
import { getProposalOverviews } from '@/data/goldsky/governance/getProposalOverviewsVersioned'
import { ProposalOverview } from '@/data/goldsky/governance/common'
import { getProposalIdeas, makeUrlId } from '@/data/goldsky/governance/getProposalIdeas'
import { Button } from '@/components/ui/button'
import { Plus, Users, ChevronRight, Calendar } from 'lucide-react'
import clsx from 'clsx'
import CreateTypeDialog from '@/components/CreateTypeDialog'
import { isSepoliaNetwork } from '@/utils/networkDetection'
import CandidatesDialog from '@/components/dialog/CandidatesDialog'
import TopicsDialog from '@/components/dialog/TopicsDialog'
import { useQueryClient } from '@tanstack/react-query'
import { Topic, getTopics, makeTopicUrlId } from '@/data/goldsky/governance/getTopics'
import { isDaoVersion5 } from '@/utils/daoVersion'
import { useDiscordEvents } from '@/hooks/useDiscordEvents'
import { formatEventDateTime, getDiscordEventUrl } from '@/data/discord/getScheduledEvents'

type DaoType = 'lilnouns' | 'nouns'

function ProposalSectionsWrapper({ daoType, dummyProposals }: { daoType: DaoType; dummyProposals: ProposalOverview[] }) {
  const [initialProposals, setInitialProposals] = useState<ProposalOverview[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadProposals() {
      try {
        const proposals = await getProposalOverviews(100, daoType)
        setInitialProposals(proposals)
      } catch (error) {
        console.error('Failed to load proposals:', error)
      } finally {
        setLoading(false)
      }
    }
    loadProposals()
  }, [daoType])

  if (loading) {
    return (
      <div className="flex flex-col gap-14">
        <div className="flex flex-col gap-4">
          <h2 className="heading-6">Active</h2>
          <LoadingSkeletons
            count={3}
            className="h-[85px] w-full rounded-[16px]"
          />
        </div>

        <div className="flex flex-col gap-4">
          <h2 className="heading-6">Upcoming</h2>
          <LoadingSkeletons
            count={3}
            className="h-[85px] w-full rounded-[16px]"
          />
        </div>

        <div className="flex flex-col gap-4">
          <h2 className="heading-6">Past</h2>
          <LoadingSkeletons
            count={20}
            className="h-[85px] w-full rounded-[16px]"
          />
        </div>
      </div>
    )
  }

  return (
    <InfiniteProposalOverviews 
      initialProposals={initialProposals}
      dummyProposals={dummyProposals}
      pageSize={100}
      daoType={daoType}
    />
  )
}

export default function VotePage() {
  const queryClient = useQueryClient()
  const location = useLocation()
  const navigate = useNavigate()
  
  // Determine initial daoType from URL path
  const initialDaoType = (location.pathname === '/vote/nouns' || location.pathname === '/vote/nounsdao') ? 'nouns' : 'lilnouns'
  const [daoType, setDaoType] = useState<DaoType>(initialDaoType)
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [dummyProposals, setDummyProposals] = useState<ProposalOverview[]>([])
  const isSepolia = isSepoliaNetwork()

  // Sync daoType with URL path
  useEffect(() => {
    const pathBasedDaoType: DaoType = 
      (location.pathname === '/vote/nouns' || location.pathname === '/vote/nounsdao') 
        ? 'nouns' 
        : 'lilnouns'
    
    setDaoType(pathBasedDaoType)
  }, [location.pathname]) // Only depend on pathname to avoid loops

  const handleDaoTypeChange = (newDaoType: DaoType) => {
    setDaoType(newDaoType)
    if (newDaoType === 'nouns') {
      navigate('/vote/nouns', { replace: true })
    } else {
      navigate('/vote', { replace: true })
    }
  }

  // Create dummy active proposal
  const createDummyProposal = (): ProposalOverview => {
    const now = Math.floor(Date.now() / 1000)
    const votingEndTimestamp = now + (7 * 24 * 60 * 60) // 7 days from now
    
    return {
      id: 999999, // Use a high ID to avoid conflicts
      title: 'Sunset Nouns 95',
      proposerAddress: '0xa7C37f79ff5E6F932147fC69724B6ED432CA6Aa7' as `0x${string}`,
      forVotes: 17,
      againstVotes: 3,
      abstainVotes: 5,
      quorumVotes: 10,
      state: 'active',
      creationBlock: 0,
      votingStartBlock: 0,
      votingStartTimestamp: now,
      votingEndBlock: 0,
      votingEndTimestamp: votingEndTimestamp,
      isDummy: true,
    }
  }

  // Create dummy active candidate
  const createDummyCandidate = (): ProposalOverview => {
    const now = Math.floor(Date.now() / 1000)
    const votingEndTimestamp = now + (7 * 24 * 60 * 60) // 7 days from now
    
    return {
      id: 999998, // Use a high ID to avoid conflicts
      title: 'Test Candidate Proposal',
      proposerAddress: '0xa7C37f79ff5E6F932147fC69724B6ED432CA6Aa7' as `0x${string}`,
      forVotes: 0,
      againstVotes: 0,
      abstainVotes: 0,
      quorumVotes: 10,
      state: 'active',
      creationBlock: 0,
      votingStartBlock: 0,
      votingStartTimestamp: now,
      votingEndBlock: 0,
      votingEndTimestamp: votingEndTimestamp,
      isDummy: true,
      isTestCandidate: true,
    }
  }

  const handleAddDummyProposal = () => {
    const dummy = createDummyProposal()
    setDummyProposals(prev => {
      // Remove existing dummy proposal if any, then add new one
      const filtered = prev.filter(p => p.id !== dummy.id)
      return [...filtered, dummy]
    })
  }

  const handleAddDummyCandidate = () => {
    const dummy = createDummyCandidate()
    setDummyProposals(prev => {
      // Remove existing dummy candidate if any, then add new one
      const filtered = prev.filter(p => p.id !== dummy.id)
      return [...filtered, dummy]
    })
  }

  // Create dummy topic
  const createDummyTopic = (): Topic => {
    const now = Math.floor(Date.now() / 1000)
    const creator = '0xa7C37f79ff5E6F932147fC69724B6ED432CA6Aa7' as `0x${string}`
    const slug = `test-topic-${now}`
    const topicId = `${creator.toLowerCase()}-${slug}`
    
    return {
      id: topicId,
      creator: creator.toLowerCase(),
      slug,
      title: 'Test Topic Discussion',
      description: `# Test Topic

This is a test topic created for development and testing purposes.

## Purpose

This topic allows developers to test the topic functionality without needing to create real topics on-chain.

## Features

- Test topic creation
- Test feedback submission
- Test signature functionality
- Test UI components

Feel free to experiment with this test topic!`,
      encodedTopicHash: '0x' + '0'.repeat(64),
      canceled: false,
      createdTimestamp: now,
      createdBlock: 0,
      createdTransactionHash: '0x' + '0'.repeat(64),
      lastUpdatedTimestamp: now,
      lastUpdatedBlock: 0,
      lastUpdatedTransactionHash: '0x' + '0'.repeat(64),
      feedback: [],
      signatures: [],
    }
  }

  const handleAddDummyTopic = () => {
    const dummyTopic = createDummyTopic()
    
    // Add to React Query cache
    queryClient.setQueryData<Topic[]>(['topics'], (oldTopics = []) => {
      // Remove existing dummy topic if any, then add new one
      const filtered = oldTopics.filter(t => !t.id.includes('test-topic-'))
      return [dummyTopic, ...filtered]
    })
    
    // Also invalidate to refetch if needed
    queryClient.invalidateQueries({ queryKey: ['topics'] })
  }

  return (
    <>
      <Helmet>
        <title>Vote on Proposals | Lil Nouns DAO</title>
        <meta name="description" content="Explore and vote on Lil Nouns DAO proposals to shape the future of Lil Nouns through decentralized governance." />
        <link rel="canonical" href="https://www.lilnouns.wtf/vote" />

        {/* OpenGraph */}
        <meta property="og:title" content="Vote on Proposals | Lil Nouns DAO" />
        <meta property="og:description" content="Explore and vote on Lil Nouns DAO proposals to shape the future of Lil Nouns through decentralized governance." />
      </Helmet>

      <SearchProvider>
        <div className="flex w-full max-w-[1400px] gap-12 p-6 pb-20 md:p-10 md:pb-20">
          {/* Main Content */}
          <div className="flex flex-1 flex-col gap-8">
            <div className="flex flex-col gap-6">
              <div>
                <h1 className="heading-2">Vote</h1>
                <p>
                  {daoType === 'nouns' ? (
                    <>
                      Vote on Nouns DAO proposals using your lil noun.{" "}
                      <Link
                        to="/learn/lil-nouns-dao-governance-explained"
                        className="inline underline transition-colors hover:text-content-secondary"
                      >
                        Learn about meta-governance
                      </Link>
                      .
                    </>
                  ) : (
                    <>
                      Vote on Lil Nouns DAO proposals.{" "}
                      <Link
                        to="/learn/lil-nouns-dao-governance-explained"
                        className="inline underline transition-colors hover:text-content-secondary"
                      >
                        Learn about governance
                      </Link>
                      .
                    </>
                  )}
                </p>
              </div>
              
              {/* DAO Selection Buttons */}
              <div className="flex items-center gap-3">
                <button
                  onClick={() => handleDaoTypeChange('lilnouns')}
                  className={clsx(
                    "rounded-full px-6 py-2 text-sm font-medium transition-all",
                    daoType === 'lilnouns'
                      ? "border-2 border-blue-500 bg-white text-content-primary font-bold"
                      : "border border-gray-300 bg-white text-content-secondary"
                  )}
                >
                  Lil Nouns DAO
                </button>
                <button
                  onClick={() => handleDaoTypeChange('nouns')}
                  className={clsx(
                    "rounded-full px-6 py-2 text-sm font-medium transition-all",
                    daoType === 'nouns'
                      ? "border-2 border-blue-500 bg-white text-content-primary font-bold"
                      : "border border-gray-300 bg-white text-content-secondary"
                  )}
                >
                  Nouns DAO
                </button>
              </div>
              
              <div className="flex w-full items-center justify-between gap-3">
                <SearchInput
                  placeholder="Search proposals"
                  className="max-w-[500px]"
                />
                <Button
                  onClick={() => setIsCreateDialogOpen(true)}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  {daoType === 'nouns' ? 'create nouns prop' : 'create'}
                </Button>
              </div>
            </div>
            
            <Suspense
              fallback={
                <div className="flex flex-col gap-14">
                  <div className="flex flex-col gap-4">
                    <h2 className="heading-6">Active</h2>
                    <LoadingSkeletons
                      count={3}
                      className="h-[85px] w-full rounded-[16px]"
                    />
                  </div>

                  <div className="flex flex-col gap-4">
                    <h2 className="heading-6">Upcoming</h2>
                    <LoadingSkeletons
                      count={3}
                      className="h-[85px] w-full rounded-[16px]"
                    />
                  </div>

                  <div className="flex flex-col gap-4">
                    <h2 className="heading-6">Past</h2>
                    <LoadingSkeletons
                      count={20}
                      className="h-[85px] w-full rounded-[16px]"
                    />
                  </div>
                </div>
              }
            >
              <ProposalSectionsWrapper daoType={daoType} dummyProposals={dummyProposals} />
            </Suspense>
          </div>

          {/* Right Sidebar */}
          <div className="hidden lg:flex flex-col gap-6 w-[380px] shrink-0 pt-[108px]">
            {/* Candidates Card */}
            <CandidatesCard />

            {/* Top Discussions Card */}
            <TopDiscussionsCard />

            {/* Community Card */}
            <CommunityCard />
          </div>
        </div>
      </SearchProvider>

      {/* Create Type Dialog */}
      <CreateTypeDialog
        isOpen={isCreateDialogOpen}
        onClose={() => setIsCreateDialogOpen(false)}
        daoType={daoType}
      />

      {/* Test Buttons (Sepolia only) */}
      {isSepolia && (
        <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2">
          <Button
            onClick={handleAddDummyProposal}
            variant="secondary"
            className="bg-yellow-100 hover:bg-yellow-200 text-yellow-900 border border-yellow-300"
          >
            Add Test Proposal
          </Button>
          <Button
            onClick={handleAddDummyCandidate}
            variant="secondary"
            className="bg-blue-100 hover:bg-blue-200 text-blue-900 border border-blue-300"
          >
            Add Test Candidate
          </Button>
          <Button
            onClick={handleAddDummyTopic}
            variant="secondary"
            className="bg-green-100 hover:bg-green-200 text-green-900 border border-green-300"
          >
            Add Test Topic
          </Button>
        </div>
      )}
    </>
  )
}

function CandidatesCard() {
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const isVersion5 = isDaoVersion5()
  const { data: candidates = [], isLoading } = useQuery({
    queryKey: ['candidates'],
    queryFn: () => getProposalIdeas(50),
    staleTime: 30_000,
    gcTime: 5 * 60 * 1000,
  })

  // Filter active candidates (not canceled, not promoted, not updates)
  const activeCandidates = candidates.filter(i => {
    const isActive = !i.canceledTimestamp && 
    !i.latestVersion.proposalId && 
                     !i.latestVersion.targetProposalId;
    if (!isActive && i.latestVersion.targetProposalId) {
      console.log('[CandidatesCard] Filtered out update candidate:', i.id, 'targetProposalId:', i.latestVersion.targetProposalId);
    }
    if (!isActive && i.canceledTimestamp) {
      console.log('[CandidatesCard] Filtered out canceled candidate:', i.id);
    }
    return isActive;
  }).slice(0, 3)
  
  console.log('[CandidatesCard] Total candidates:', candidates.length, 'Active candidates:', activeCandidates.length);

  if (isLoading) {
    return (
      <div className="rounded-[16px] border bg-white p-6">
        <h3 className="heading-6 mb-4">Candidates</h3>
        <div className="flex flex-col gap-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="flex items-start gap-3">
              <div className="flex items-center justify-center w-10 h-10 rounded bg-gray-100 animate-pulse shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="h-4 bg-gray-100 rounded animate-pulse mb-2" />
                <div className="h-3 bg-gray-100 rounded animate-pulse w-2/3" />
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="rounded-[16px] border bg-white p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="heading-6">Candidates</h3>
          {isVersion5 && (
          <button
            onClick={() => setIsDialogOpen(true)}
            className="text-content-secondary hover:text-content-primary transition-colors flex items-center gap-1 text-sm"
          >
            More
            <ChevronRight className="w-4 h-4" />
          </button>
          )}
        </div>
        <div className="flex flex-col gap-3">
          {activeCandidates.length > 0 ? (
            activeCandidates.map((candidate) => (
              <Link 
                key={candidate.id} 
                to={`/candidates/${makeUrlId(candidate.id)}`}
                className="flex items-start gap-3 cursor-pointer hover:opacity-70 transition-opacity"
              >
                <div className="flex items-center justify-center w-10 h-10 rounded bg-gray-100 text-gray-600 text-sm font-medium shrink-0">
                  {candidate.slug.substring(0, 3).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-content-primary line-clamp-2">
                    {candidate.latestVersion.content.title}
                  </p>
                  <p className="text-xs text-content-secondary mt-1">
                    Updated recently
                  </p>
                </div>
              </Link>
            ))
          ) : (
            <p className="text-content-secondary paragraph-sm text-center py-4">
              No active candidates
            </p>
          )}
        </div>
      </div>
      <CandidatesDialog open={isDialogOpen} onOpenChange={setIsDialogOpen} />
    </>
  )
}

function TopDiscussionsCard() {
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const isVersion5 = isDaoVersion5()
  const { data: topics = [], isLoading } = useQuery({
    queryKey: ['topics'],
    queryFn: () => getTopics(200),
    staleTime: 30_000,
    gcTime: 5 * 60 * 1000,
  })

  // Filter out canceled topics, sort by last updated (most recent first), take top 3
  const topDiscussions = topics
    .filter(t => !t.canceled)
    .sort((a, b) => b.lastUpdatedTimestamp - a.lastUpdatedTimestamp)
    .slice(0, 3)

  // Helper function to format activity string
  const formatActivity = (topic: Topic): string => {
    const now = Math.floor(Date.now() / 1000)
    const timeDelta = now - topic.lastUpdatedTimestamp
    const days = Math.floor(timeDelta / (24 * 60 * 60))
    
    let timeAgo: string
    if (days === 0) {
      timeAgo = "Active today"
    } else if (days === 1) {
      timeAgo = "Active yesterday"
    } else {
      timeAgo = `Active ${days} days ago`
    }
    
    const replyCount = topic.feedback.length
    const replyText = replyCount === 1 ? "reply" : "replies"
    
    return `${timeAgo} • ${replyCount} ${replyText}`
  }
  
  return (
    <>
      <div className="rounded-[16px] border bg-white p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="heading-6">Top discussions</h3>
          {isVersion5 && (
          <button
            onClick={() => setIsDialogOpen(true)}
            className="text-content-secondary hover:text-content-primary transition-colors flex items-center gap-1 text-sm"
          >
            More
            <ChevronRight className="w-4 h-4" />
          </button>
          )}
        </div>
        <div className="flex flex-col gap-3">
          {isLoading ? (
            [1, 2, 3].map(i => (
              <div key={i} className="animate-pulse">
                <div className="h-4 bg-gray-100 rounded mb-1" />
                <div className="h-3 bg-gray-100 rounded w-2/3" />
              </div>
            ))
          ) : topDiscussions.length > 0 ? (
            topDiscussions.map((topic) => (
            <Link 
                key={topic.id} 
                to={`/topics/${makeTopicUrlId(topic.id)}`}
              className="cursor-pointer hover:opacity-70 transition-opacity"
            >
              <p className="text-sm font-medium text-content-primary mb-1">
                  {topic.title}
              </p>
              <p className="text-xs text-content-secondary">
                  {formatActivity(topic)}
              </p>
            </Link>
            ))
          ) : (
            <p className="text-content-secondary paragraph-sm text-center py-4">
              No active discussions
            </p>
          )}
        </div>
      </div>
      <TopicsDialog open={isDialogOpen} onOpenChange={setIsDialogOpen} />
    </>
  )
}

function CommunityCard() {
  const { data: events = [], isLoading } = useDiscordEvents()

  // Fallback content if no Discord events are available
  const fallbackEvents = [
    {
      name: 'Open Innovation Call',
      description: 'Twice a month • Memes welcome',
    },
  ]

  const hasDiscordEvents = events.length > 0
  const displayEvents = hasDiscordEvents ? events.slice(0, 3) : fallbackEvents

  return (
    <div className="rounded-[16px] border bg-white p-6">
      <h3 className="heading-6 mb-4">Community</h3>
      <div className="flex flex-col gap-3">
        {isLoading ? (
          // Loading skeleton
          [1, 2].map(i => (
            <div key={i} className="flex items-start gap-3 animate-pulse">
              <div className="w-10 h-10 rounded bg-gray-100 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="h-4 bg-gray-100 rounded mb-2" />
                <div className="h-3 bg-gray-100 rounded w-2/3" />
              </div>
            </div>
          ))
        ) : displayEvents.length > 0 ? (
          displayEvents.map((event, index) => {
            if (hasDiscordEvents && 'id' in event) {
              // Discord event
              const discordEvent = event
              const eventUrl = getDiscordEventUrl(discordEvent)
              return (
                <a
                  key={discordEvent.id}
                  href={eventUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-start gap-3 cursor-pointer hover:opacity-70 transition-opacity"
                >
                  <div className="flex items-center justify-center w-10 h-10 rounded bg-blue-50 shrink-0">
                    <Calendar className="w-5 h-5 text-blue-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-content-primary line-clamp-2">
                      {discordEvent.name}
                    </p>
                    <p className="text-xs text-content-secondary mt-1">
                      {discordEvent.scheduled_start_time
                        ? formatEventDateTime(discordEvent.scheduled_start_time)
                        : 'Upcoming event'}
                    </p>
                  </div>
                </a>
              )
            } else {
              // Fallback event
              const fallbackEvent = event as { name: string; description: string }
              return (
                <div
                  key={`fallback-${index}`}
                  className="flex items-start gap-3 cursor-pointer hover:opacity-70 transition-opacity"
                >
                  <div className="flex items-center justify-center w-10 h-10 rounded bg-blue-50 shrink-0">
                    <Users className="w-5 h-5 text-blue-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-content-primary line-clamp-2">
                      {fallbackEvent.name}
                    </p>
                    <p className="text-xs text-content-secondary mt-1">
                      {fallbackEvent.description}
                    </p>
                  </div>
                </div>
              )
            }
          })
        ) : (
          <p className="text-content-secondary paragraph-sm text-center py-4">
            No upcoming events
          </p>
        )}
      </div>
    </div>
  )
}