import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { NounFilterEngine, FilterCounts, FilterResult, CompactIndexData } from '@/utils/NounFilterEngine';
import { useNounFilters } from '@/hooks/useNounFilters';
import { CHAIN_CONFIG } from '@/config';
import { GetNounsPaginatedDocument, OrderDirection } from '@/data/generated/ponder/clean-graphql';

interface FilterEngineContextType {
  filterEngine: NounFilterEngine | null;
  filterCounts: FilterCounts | null;
  totalNounCount: number;
  filteredNounCount: number;
  isLoading: boolean;
  error: Error | null;
}

const FilterEngineContext = createContext<FilterEngineContextType | undefined>(undefined);

// In-memory cache so /explore isn't forced to rebuild the full compact index
// (fetching all nouns from the indexer) on every navigation.
let sharedCompactIndex: CompactIndexData | null = null;
let sharedCompactIndexPromise: Promise<CompactIndexData> | null = null;

export function FilterEngineProvider({ children }: { children: ReactNode }) {
  const [filterEngine, setFilterEngine] = useState<NounFilterEngine | null>(null);
  const [filterCounts, setFilterCounts] = useState<FilterCounts | null>(null);
  const [totalNounCount, setTotalNounCount] = useState<number>(0);
  const [filteredNounCount, setFilteredNounCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const filters = useNounFilters();

  // Initialize filter engine with compact index
  useEffect(() => {
    let engine: NounFilterEngine | null = null;

    const initializeFilterEngine = async () => {
      try {
        setIsLoading(true);
        const compactIndex = await (async (): Promise<CompactIndexData> => {
          if (sharedCompactIndex) {
            return sharedCompactIndex;
          }
          if (sharedCompactIndexPromise) {
            return sharedCompactIndexPromise;
          }

          sharedCompactIndexPromise = (async (): Promise<CompactIndexData> => {
            console.log('🚀 Building compact noun index from GraphQL (cache miss)...');

            // Fetch all nouns in batches to build compact index
            const allNouns: Array<{
              id: string;
              background: number;
              body: number;
              accessory: number;
              head: number;
              glasses: number;
            }> = [];

            let offset = 0;
            const batchSize = 1000;
            let hasMore = true;
            let iteration = 0;
            const MAX_ITERATIONS = 500; // Safety fuse: 500 * 1000 = 500k nouns worth of pages
            let prevBatchFirstId: string | null = null;

            while (hasMore) {
              iteration += 1;
              if (iteration > MAX_ITERATIONS) {
                console.warn('🧯 FilterEngine index build hit MAX_ITERATIONS; aborting loop', {
                  iteration,
                  offset,
                });
                break;
              }

              const response = await fetch(CHAIN_CONFIG.indexerUrl, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  query: GetNounsPaginatedDocument,
                  variables: {
                    limit: batchSize,
                    offset,
                    orderBy: 'id',
                    orderDirection: OrderDirection.Asc,
                  },
                }),
              });

              if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
              }

              const result = await response.json();

              if (result.errors) {
                throw new Error(
                  `GraphQL errors: ${result.errors.map((e: any) => e.message).join(', ')}`,
                );
              }

              const vpsResponse = result.data;

              const pageInfo = vpsResponse?.nouns?.pageInfo;
              const batchItems = vpsResponse?.nouns?.items;

              if (!batchItems || batchItems.length === 0) {
                hasMore = false;
                break;
              }

              const batchNouns = batchItems.map((noun: any) => ({
                id: noun.id,
                background: noun.background,
                body: noun.body,
                accessory: noun.accessory,
                head: noun.head,
                glasses: noun.glasses,
              }));

              // If the indexer ignores offset, we'll repeatedly receive the same first noun.
              const batchFirstId = batchNouns[0]?.id ?? null;
              if (batchFirstId && prevBatchFirstId && batchFirstId === prevBatchFirstId) {
                console.warn('🧯 FilterEngine index build received same first ID twice; aborting', {
                  offset,
                  batchFirstId,
                });
                break;
              }
              prevBatchFirstId = batchFirstId;

              allNouns.push(...batchNouns);

              // Use pageInfo if available (preferred stopping condition)
              if (pageInfo && pageInfo.hasNextPage === false) {
                hasMore = false;
                break;
              }

              // Check if we got fewer nouns than requested (end of data)
              if (batchNouns.length < batchSize) {
                hasMore = false;
              } else {
                offset += batchSize;
              }
            }

            console.log(`✅ Fetched ${allNouns.length} nouns for compact index`);

            // Build compact index
            const nounIds = allNouns.map((n) => n.id);
            const seeds = allNouns.map((n) => [
              n.background,
              n.body,
              n.accessory,
              n.head,
              n.glasses,
            ]);

            // Convert seeds to base64 for compact storage
            const seedsJson = JSON.stringify(seeds);
            const seedsBase64 = btoa(seedsJson); // Use browser's btoa instead of Buffer

            const builtCompactIndex: CompactIndexData = {
              version: '1.0.0',
              totalCount: allNouns.length,
              nounIds,
              seedsBase64,
            };

            sharedCompactIndex = builtCompactIndex;
            return builtCompactIndex;
          })();

          try {
            return await sharedCompactIndexPromise;
          } finally {
            sharedCompactIndexPromise = null;
          }
        })();

        // Create and initialize worker (fast once compactIndex is available)
        engine = new NounFilterEngine();
        const initialResult = await engine.init(compactIndex);

        console.log('✅ Filter engine initialized:', {
          total: initialResult.total,
          traitTypes: Object.keys(initialResult.counts),
          backgroundCount: Object.keys(initialResult.counts.background).length,
          bodyCount: Object.keys(initialResult.counts.body).length,
          accessoryCount: Object.keys(initialResult.counts.accessory).length,
          headCount: Object.keys(initialResult.counts.head).length,
          glassesCount: Object.keys(initialResult.counts.glasses).length,
        });

        setFilterEngine(engine);
        setFilterCounts(initialResult.counts);
        setTotalNounCount(initialResult.total);
        setFilteredNounCount(initialResult.total); // Initially all match
        setIsLoading(false);
      } catch (error) {
        console.error('❌ Error initializing filter engine:', error);
        setError(error as Error);
        setIsLoading(false);
      }
    };

    initializeFilterEngine();

    // Clean up on unmount
    return () => {
      if (engine) {
        engine.destroy();
      }
    };
  }, []);

  // Apply filters when they change (reads from URL via useNounFilters hook)
  useEffect(() => {
    if (!filterEngine) return;

    const applyCurrentFilters = async () => {
      try {
        // Convert string arrays from URL to number arrays for worker
        const nounFilters = {
          background: filters.background.length > 0 ? filters.background.map(Number) : undefined,
          body: filters.body.length > 0 ? filters.body.map(Number) : undefined,
          accessory: filters.accessory.length > 0 ? filters.accessory.map(Number) : undefined,
          head: filters.head.length > 0 ? filters.head.map(Number) : undefined,
          glasses: filters.glasses.length > 0 ? filters.glasses.map(Number) : undefined,
        };

        // Only log on actual filter changes (not every render)
        const hasFilters = filters.totalCount > 0;
        if (hasFilters) {
          console.log('🔄 Applying filters from URL:', {
            filters: nounFilters,
            totalFiltersActive: filters.totalCount,
          });
        }
        
        const result = await filterEngine.applyFilters(nounFilters);

        if (hasFilters) {
          console.log('✅ Filters applied:', {
            total: result.total,
          });
        }

        setFilterCounts(result.counts);
        setFilteredNounCount(result.total);
      } catch (error) {
        console.error('❌ Error applying filters:', error);
      }
    };

    applyCurrentFilters();
  }, [filterEngine, filters.background, filters.body, filters.accessory, filters.head, filters.glasses, filters.totalCount]);

  return (
    <FilterEngineContext.Provider
      value={{
        filterEngine,
        filterCounts,
        totalNounCount,
        filteredNounCount,
        isLoading,
        error,
      }}
    >
      {children}
    </FilterEngineContext.Provider>
  );
}

export function useFilterEngine() {
  const context = useContext(FilterEngineContext);
  if (context === undefined) {
    throw new Error('useFilterEngine must be used within a FilterEngineProvider');
  }
  return context;
}

