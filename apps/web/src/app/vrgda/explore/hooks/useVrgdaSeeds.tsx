"use client";
import { useState, useEffect, useMemo } from 'react';
import { useVrgdaRealtimePool } from '@/data/ponder/hooks/useVrgdaRealtimePool';
import { useVrgdaPoolSeeds } from '@/data/ponder/hooks/useVrgdaQueries';
import { VrgdaPoolSeed } from '@/data/ponder/vrgda/types';
import { isSepoliaNetwork } from '@/utils/networkDetection';

interface VrgdaSeedWithMetadata extends VrgdaPoolSeed {
  vrgdaPrice: string;
  isNewlyAdded: boolean;
  addedAt: number;
}

interface UseVrgdaSeedsOptions {
  limit?: number;
  onNewSeeds?: (seeds: VrgdaPoolSeed[]) => void;
}

export function useVrgdaSeeds({ 
  limit = 256, 
  onNewSeeds 
}: UseVrgdaSeedsOptions = {}) {
  const [stableSeeds, setStableSeeds] = useState<VrgdaSeedWithMetadata[]>([]);
  const [newSeedIds, setNewSeedIds] = useState<Set<string>>(new Set());
  const isSepolia = isSepoliaNetwork();
  
  // Fetch initial pool data
  const { 
    data: poolSeeds, 
    isLoading: isLoadingInitial,
    error: poolSeedsError,
    refetch: refetchSeeds
  } = useVrgdaPoolSeeds(
    { isUsed: false }, // filters
    'blockNumber', // sortField - sort by block number, not generatedAt
    'desc', // sortDirection
    limit // limit
  );

  // Debug logging (reduced verbosity)
  // console.log('useVrgdaSeeds - poolSeeds:', poolSeeds);
  // console.log('useVrgdaSeeds - poolSeeds?.seeds:', poolSeeds?.seeds);
  // console.log('useVrgdaSeeds - isLoadingInitial:', isLoadingInitial);

  // Real-time monitoring now that CORS is resolved
  // Disabled on Sepolia - not indexed in Ponder yet
  const { 
    isActive, 
    connectionStatus, 
    refresh 
  } = useVrgdaRealtimePool({
    enabled: !isSepolia, // Disable on Sepolia - not indexed in Ponder yet
    onNewSeeds: (newSeeds) => {
      // Mark new seeds for highlighting
      const newIds = new Set(newSeeds.map(seed => seed.id));
      setNewSeedIds(prev => new Set([...prev, ...newIds]));
      
      // Auto-remove highlighting after 5 seconds
      setTimeout(() => {
        setNewSeedIds(prev => {
          const updated = new Set(prev);
          newIds.forEach(id => updated.delete(id));
          return updated;
        });
      }, 5000);
      
      onNewSeeds?.(newSeeds);
    },
    onSeedsUsed: (usedSeeds) => {
      // Remove used seeds from stable list
      const usedIds = new Set(usedSeeds.map(seed => seed.id));
      setStableSeeds(prev => prev.filter(seed => !usedIds.has(seed.id)));
    }
  });

  // Transform pool seeds with VRGDA metadata
  const transformedSeeds = useMemo(() => {
    if (!poolSeeds?.seeds) return [];

    const transformed = poolSeeds.seeds.map((seed): VrgdaSeedWithMetadata => ({
      ...seed,
      vrgdaPrice: "0.1", // Fixed VRGDA price - replace with actual calculation
      isNewlyAdded: newSeedIds.has(seed.id),
      addedAt: Date.now()
    }));
    return transformed;
  }, [poolSeeds, newSeedIds]);

  // Update stable seeds while preserving user interactions
  useEffect(() => {
    if (transformedSeeds.length > 0) {
      setStableSeeds(prev => {
        // If this is initial load, replace entirely
        if (prev.length === 0) {
          return transformedSeeds;
        }
        
        // For updates, merge new seeds while preserving order
        const existingIds = new Set(prev.map(seed => seed.id));
        const newSeeds = transformedSeeds.filter(seed => !existingIds.has(seed.id));
        
        // Add new seeds to the beginning (latest first)
        return [...newSeeds, ...prev].slice(0, limit);
      });
    }
  }, [transformedSeeds, limit]);

  // Reduced logging - uncomment for debugging
  // console.log('useVrgdaSeeds - final stableSeeds.length:', stableSeeds.length);

  return {
    seeds: stableSeeds,
    isLoading: isLoadingInitial,
    connectionStatus,
    isConnected: isActive,
    error: poolSeedsError,
    refresh,
    newSeedIds
  };
}
