import { useState, Suspense } from 'react'
import { Helmet } from 'react-helmet-async'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import LoadingSkeletons from '@/components/LoadingSkeletons'
import { Button } from '@/components/ui/button'
import { Plus, TrendingUp, MessageSquare } from 'lucide-react'
import SearchProvider, { SearchInput } from '@/components/Search'
import { useSearchContext } from '@/components/Search'
import clsx from 'clsx'
import { getTopics, Topic } from '@/data/goldsky/governance/getTopics'
import TopicCard from '@/components/Topic/TopicCard'

type SortOption = 'recent' | 'popular' | 'controversial'

export default function TopicsPage() {
  const navigate = useNavigate()
  const [showActive, setShowActive] = useState(true)
  const [showCanceled, setShowCanceled] = useState(false)

  return (
    <>
      <Helmet>
        <title>Topics | Lil Nouns DAO</title>
        <meta name="description" content="Join discussions and signal your support or opposition on community topics." />
        <link rel="canonical" href="https://www.lilnouns.wtf/topics" />

        {/* OpenGraph */}
        <meta property="og:title" content="Topics | Lil Nouns DAO" />
        <meta property="og:description" content="Join discussions and signal your support on community topics." />
      </Helmet>

      <SearchProvider>
        <div className="flex w-full max-w-[780px] flex-col gap-8 p-6 pb-20 md:p-10 md:pb-20">
          <div className="flex flex-col gap-6">
            <div>
              <h1 className="heading-2">Topics</h1>
              <p className="text-content-secondary">
                Join discussions and signal your support or opposition on community topics.{" "}
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
                  Closed
                </button>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <SearchInput
                  placeholder="Search topics"
                  className="sm:max-w-[300px]"
                />
                <Button
                  onClick={() => navigate('/new/topic')}
                  className="whitespace-nowrap self-start sm:self-auto"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  New Topic
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
            <TopicFeed showActive={showActive} showCanceled={showCanceled} />
          </Suspense>
        </div>
      </SearchProvider>
    </>
  )
}

function TopicFeed({ showActive, showCanceled }: { showActive: boolean; showCanceled: boolean }) {
  const { data: topics = [], isLoading } = useQuery({
    queryKey: ['topics'],
    queryFn: () => getTopics(1000),
    staleTime: 30_000, // 30 seconds - data is fresh for 30s
    gcTime: 5 * 60 * 1000, // 5 minutes - cache for 5 minutes
  })

  const { debouncedSearchValue } = useSearchContext()
  const [sortBy, setSortBy] = useState<SortOption>('recent')

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

  // Filter topics
  let filteredTopics = topics.filter(topic => {
    const isActive = !topic.canceled

    // Status filters
    if (isActive && !showActive) return false
    if (topic.canceled && !showCanceled) return false
    
    // Search filter
    if (debouncedSearchValue) {
      const searchLower = debouncedSearchValue.toLowerCase()
      const matchesTitle = topic.title.toLowerCase().includes(searchLower)
      const matchesCreator = topic.creator.toLowerCase().includes(searchLower)
      const matchesDescription = topic.description.toLowerCase().includes(searchLower)
      
      if (!matchesTitle && !matchesCreator && !matchesDescription) {
        return false
      }
    }

    return true
  })

  // Sort topics
  filteredTopics = [...filteredTopics].sort((a, b) => {
    const aCommentCount = a.feedback.length
    const bCommentCount = b.feedback.length
    
    const aValidSignatures = a.signatures.filter(s => s.status === 'valid')
    const bValidSignatures = b.signatures.filter(s => s.status === 'valid')
    const aForSignatures = aValidSignatures.filter(s => s.support === 1).length
    const aAgainstSignatures = aValidSignatures.filter(s => s.support === 0).length
    const bForSignatures = bValidSignatures.filter(s => s.support === 1).length
    const bAgainstSignatures = bValidSignatures.filter(s => s.support === 0).length
    
    switch (sortBy) {
      case 'popular':
        return bCommentCount - aCommentCount
      case 'controversial':
        const aTotal = aForSignatures + aAgainstSignatures
        const bTotal = bForSignatures + bAgainstSignatures
        const aRatio = aTotal > 0 ? Math.min(aForSignatures, aAgainstSignatures) / aTotal : 0
        const bRatio = bTotal > 0 ? Math.min(bForSignatures, bAgainstSignatures) / bTotal : 0
        return bRatio - aRatio
      case 'recent':
      default:
        return b.createdTimestamp - a.createdTimestamp
    }
  })

  // Group topics by status
  const activeTopics = filteredTopics.filter(t => !t.canceled)
  const canceledTopics = filteredTopics.filter(t => t.canceled)

  return (
    <div className="flex flex-col gap-10">
      {/* Active Topics */}
      {activeTopics.length > 0 && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="heading-6">Active Topics</h2>
            <div className="flex items-center gap-2">
              <span className="text-content-secondary label-sm">Sort by:</span>
              <button
                onClick={() => setSortBy('recent')}
                className={clsx(
                  "px-3 py-1 rounded-full text-sm transition-colors",
                  sortBy === 'recent'
                    ? "bg-background-secondary text-content-primary"
                    : "text-content-secondary hover:bg-background-secondary"
                )}
              >
                Recent
              </button>
              <button
                onClick={() => setSortBy('popular')}
                className={clsx(
                  "px-3 py-1 rounded-full text-sm transition-colors",
                  sortBy === 'popular'
                    ? "bg-background-secondary text-content-primary"
                    : "text-content-secondary hover:bg-background-secondary"
                )}
              >
                <MessageSquare className="w-4 h-4 inline mr-1" />
                Popular
              </button>
              <button
                onClick={() => setSortBy('controversial')}
                className={clsx(
                  "px-3 py-1 rounded-full text-sm transition-colors",
                  sortBy === 'controversial'
                    ? "bg-background-secondary text-content-primary"
                    : "text-content-secondary hover:bg-background-secondary"
                )}
              >
                <TrendingUp className="w-4 h-4 inline mr-1" />
                Controversial
              </button>
            </div>
          </div>
          <div className="flex flex-col gap-4">
            {activeTopics.map(topic => (
              <TopicCard key={topic.id} topic={topic} />
            ))}
          </div>
        </div>
      )}

      {/* Canceled Topics */}
      {showCanceled && canceledTopics.length > 0 && (
        <div className="flex flex-col gap-4">
          <h2 className="heading-6">Canceled</h2>
          <div className="flex flex-col gap-4">
            {canceledTopics.map(topic => (
              <TopicCard key={topic.id} topic={topic} />
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {filteredTopics.length === 0 && (
        <div className="flex h-[200px] w-full items-center justify-center rounded-[16px] border bg-gray-50 text-center">
          <div className="flex flex-col gap-2">
            <p className="heading-6">No topics found</p>
            <p className="text-content-secondary paragraph-sm">
              {debouncedSearchValue 
                ? "Try adjusting your search or filters"
                : "Be the first to start a discussion!"}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

