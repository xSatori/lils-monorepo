"use client";
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { motion, AnimatePresence } from 'framer-motion';

// Components
import { VrgdaSeedItem } from './VrgdaSeedItem';
import { VrgdaDetailsPanel } from './VrgdaDetailsPanel';
import { VrgdaFilterSidebarNew } from './VrgdaFilterSidebarNew';
import { BuildNounModal } from './BuildNounModal';
import { VrgdaConnectionStatus } from './VrgdaConnectionStatus';

// Hooks
import { useVrgdaSeeds } from '../hooks/useVrgdaSeeds';
import { useVrgdaFiltering } from '../hooks/useVrgdaFiltering';
import { useStableSelection } from '../hooks/useStableSelection';
import { useVRGDAData } from '@/hooks/useVRGDAData';
import { useVrgdaBookmarks } from '@/hooks/useVrgdaBookmarks';
import { formatEther } from 'viem';

// Simple breakpoint hook
function useBreakpointValues<T>(values: Record<string, T>): T | undefined {
  const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1280);

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  if (windowWidth >= 1280) return values.xl;
  if (windowWidth >= 1024) return values.lg;
  if (windowWidth >= 768) return values.md;
  return values.sm;
}

export const VrgdaExploreViewer: React.FC = () => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [showComboBuilder, setShowComboBuilder] = useState(false);
  const [showFilterSidebar, setShowFilterSidebar] = useState(false);
  const [showSavedView, setShowSavedView] = useState(false);
  const [scrollPosition, setScrollPosition] = useState(0);
  
  // VRGDA pricing data
  const { currentPrice, timeToNextDrop, isLoading: vrgdaLoading } = useVRGDAData();

  // Data fetching with real-time updates
  const {
    seeds,
    isLoading,
    connectionStatus,
    isConnected,
    error,
    refresh,
    newSeedIds
  } = useVrgdaSeeds({ 
    limit: 256,
    onNewSeeds: (newSeeds) => {
      console.log('New VRGDA seeds detected:', newSeeds.length);
    }
  });

  // Bookmarking system
  const { bookmarkedSeeds, bookmarkCount } = useVrgdaBookmarks(seeds);

  // Filtering and sorting
  const {
    filteredSeeds,
    activeFilters,
    setActiveFilters,
    sortOrder,
    setSortOrder,
    searchCombo,
    setSearchCombo,
    availableTraits,
    clearFilters
  } = useVrgdaFiltering(seeds);

  // Convert bookmarked seeds to VrgdaPoolSeed format for display
  const savedSeedsAsPoolSeeds = useMemo(() => {
    return bookmarkedSeeds.map(bookmark => ({
      id: bookmark.nounId,
      nounId: bookmark.nounId,
      blockNumber: bookmark.blockNumber,
      blockHash: bookmark.blockHash,
      background: bookmark.seed.background,
      body: bookmark.seed.body,
      accessory: bookmark.seed.accessory,
      head: bookmark.seed.head,
      glasses: bookmark.seed.glasses,
      isUsed: false,
      generatedAt: bookmark.savedAt.toString(),
    }));
  }, [bookmarkedSeeds]);

  // Choose which seeds to display based on view mode
  const displaySeeds = showSavedView ? savedSeedsAsPoolSeeds : filteredSeeds;

  // Stable selection management
  const {
    selectedSeedId,
    selectedSeed,
    selectSeed,
    clearSelection,
    navigateSelection
  } = useStableSelection(displaySeeds);

  // Grid configuration
  const ITEM_SIZE = 96;
  const GAP_SIZE = 6;

  // Responsive columns
  const itemsPerRow = useBreakpointValues({
    xl: 8,
    lg: 7,
    md: 6,
    sm: 4,
  }) ?? 8;

  const totalRows = Math.ceil(displaySeeds.length / itemsPerRow);

  // Virtualization setup (memory optimized for 256+ items)
  const rowVirtualizer = useVirtualizer({
    count: totalRows,
    getScrollElement: () => containerRef.current,
    estimateSize: () => ITEM_SIZE + GAP_SIZE,
    overscan: 2, // Optimized for smooth scrolling with 256 items
    measureElement: (element) => element?.getBoundingClientRect().height ?? ITEM_SIZE + GAP_SIZE,
  });

  const columnVirtualizer = useVirtualizer({
    horizontal: true,
    count: itemsPerRow,
    getScrollElement: () => containerRef.current,
    estimateSize: () => ITEM_SIZE + GAP_SIZE,
    overscan: 1, // Keep column overscan minimal
    measureElement: (element) => element?.getBoundingClientRect().width ?? ITEM_SIZE + GAP_SIZE,
  });

  // Keyboard navigation
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      clearSelection();
    }
    if (e.key === 'ArrowRight') {
      navigateSelection('next');
    }
    if (e.key === 'ArrowLeft') {
      navigateSelection('previous');
    }
  }, [clearSelection, navigateSelection]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Handle combo builder
  const handleApplyCombo = (combo: any) => {
    setSearchCombo(combo);
  };

  // Get active filter count for the button badge
  const getActiveFilterCount = () => {
    return Object.values(activeFilters).reduce((count, values) => {
      return count + (values?.length || 0);
    }, 0);
  };

  // Format time to next drop
  const formatTimeToNextDrop = (seconds: number | undefined) => {
    if (!seconds || seconds <= 0) return "Now";
    
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    } else {
      return `${secs}s`;
    }
  };

  const currentPriceEth = currentPrice ? parseFloat(formatEther(currentPrice)).toFixed(4) : "—";
  const timeDisplay = formatTimeToNextDrop(timeToNextDrop);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Connection Status */}
      <VrgdaConnectionStatus
        connectionStatus={connectionStatus}
        isConnected={isConnected}
        error={error}
        onRefresh={refresh}
      />

      {/* Main Explorer */}
      <div className="relative flex h-[665px] overflow-hidden rounded-2xl border border-gray-200 shadow-lg">
        {/* Animated Filter Sidebar - Part of flex layout */}
        <AnimatePresence>
          {showFilterSidebar && (
            <motion.div
              key="filter-sidebar"
              layout
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
              className="w-64 flex-shrink-0 border-r border-gray-200"
            >
              <VrgdaFilterSidebarNew
                activeFilters={activeFilters}
                onFiltersChange={setActiveFilters}
                onClearFilters={clearFilters}
                onClose={() => setShowFilterSidebar(false)}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Explore Container - Flexible width */}
        <div className="flex-1 flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
            <div className="flex flex-col">
              <h3 className="text-lg font-semibold">
                <span>VRGDA Pool</span>{' '}
                <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  <strong>{displaySeeds.length}</strong> {showSavedView ? 'saved' : 'available'}
                </motion.span>
                {searchCombo && !showSavedView && (
                  <span className="ml-2 text-sm text-blue-600">
                    (filtered by combo)
                  </span>
                )}
              </h3>
              <div className="flex items-center gap-6 text-sm text-gray-600 mt-2">
                <div>
                  <span className="font-medium">Current Price:</span> {currentPriceEth} ETH
                </div>
                {timeToNextDrop && timeToNextDrop > 0 && (
                  <div>
                    <span className="font-medium">Price drops in:</span> {timeDisplay}
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3">
              {/* Saved Nouns Button */}
              <motion.button
                onClick={() => {
                  setShowSavedView(!showSavedView);
                  if (!showSavedView) {
                    // Close filter sidebar when switching to saved view
                    setShowFilterSidebar(false);
                  }
                }}
                className={`flex items-center gap-2 px-3 py-1 text-sm font-medium rounded-lg border transition-colors ${
                  showSavedView 
                    ? 'bg-red-50 text-red-700 border-red-200' 
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                }`}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <svg className="w-4 h-4" fill={showSavedView ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24" strokeWidth={showSavedView ? 0 : 2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                </svg>
                Saved
                {bookmarkCount > 0 && (
                  <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                    {bookmarkCount}
                  </span>
                )}
              </motion.button>

              {/* Filter Button - Only show when not in saved view */}
              {!showSavedView && (
                <motion.button
                  onClick={() => setShowFilterSidebar(!showFilterSidebar)}
                  className={`flex items-center gap-2 px-3 py-1 text-sm font-medium rounded-lg border transition-colors ${
                    showFilterSidebar 
                      ? 'bg-blue-50 text-blue-700 border-blue-200' 
                      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                  }`}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                  </svg>
                  Filters
                  {getActiveFilterCount() > 0 && (
                    <span className="bg-blue-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                      {getActiveFilterCount()}
                    </span>
                  )}
                </motion.button>
              )}
              
              {/* Sort Dropdown */}
              <select
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value as 'latest' | 'oldest')}
                className="border rounded px-3 py-1 text-sm"
              >
                <option value="latest">Latest First</option>
                <option value="oldest">Oldest First</option>
              </select>
            </div>
          </div>

          {/* Virtualized Grid */}
          <motion.div
            layout
            ref={containerRef}
            className="flex-1 overflow-y-auto overscroll-contain p-3"
            onScroll={(e: React.UIEvent<HTMLDivElement>) => {
              const target = e.currentTarget;
              setScrollPosition(target.scrollTop);
            }}
          >
            <div
              style={{
                height: `${rowVirtualizer.getTotalSize()}px`,
                width: `${columnVirtualizer.getTotalSize()}px`,
                position: 'relative',
              }}
            >
              {rowVirtualizer.getVirtualItems().map(virtualRow => (
                <React.Fragment key={virtualRow.key}>
                  {columnVirtualizer.getVirtualItems().map(virtualColumn => {
                    const itemIndex = virtualRow.index * itemsPerRow + virtualColumn.index;
                    if (itemIndex >= displaySeeds.length) return null;

                    const seed = displaySeeds[itemIndex];
                    return (
                      <div
                        key={seed.id}
                        className="absolute"
                        style={{
                          left: `${virtualColumn.start}px`,
                          top: `${virtualRow.start}px`,
                          width: `${ITEM_SIZE}px`,
                          height: `${ITEM_SIZE}px`,
                        }}
                      >
                        <VrgdaSeedItem
                          seed={seed}
                          isSelected={selectedSeedId === seed.id}
                          isNewlyAdded={newSeedIds.has(seed.id)}
                          onSelect={selectSeed}
                          size={ITEM_SIZE}
                          animationDelay={Math.min(virtualColumn.index * 50, 500)} // Cap animation delay
                        />
                      </div>
                    );
                  })}
                </React.Fragment>
              ))}
            </div>
          </motion.div>
        </div>

        {/* Details Panel */}
        {selectedSeed && (
          <VrgdaDetailsPanel
            seed={selectedSeed}
            onPrevious={() => navigateSelection('previous')}
            onNext={() => navigateSelection('next')}
            canGoPrevious={displaySeeds.findIndex(s => s.id === selectedSeedId) > 0}
            canGoNext={displaySeeds.findIndex(s => s.id === selectedSeedId) < displaySeeds.length - 1}
            allSeeds={seeds}
            vrgdaPrice={currentPrice}
            onClose={clearSelection}
          />
        )}
      </div>

      {/* Build a Noun Modal */}
      <BuildNounModal
        isOpen={showComboBuilder}
        onClose={() => setShowComboBuilder(false)}
        availableTraits={availableTraits}
        onApplyCombo={handleApplyCombo}
      />
    </div>
  );
};
