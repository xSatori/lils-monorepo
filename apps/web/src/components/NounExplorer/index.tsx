"use client";
import { Noun } from "@/data/noun/types";
import { useEffect, useRef, useState } from "react";
import NounGrid from "./NounGrid/NounGrid";
import NounFilter from "./NounFilter";
import { ActiveFilters, SortOrder } from "./NounFilter/ActiveFilters";
import { useFilterEngine } from "@/contexts/FilterEngineContext";

interface NounExplorerProps {
  nouns: Noun[];
  onSortChange?: (sortOrder: SortOrder) => void;
  loadMore?: () => void;
  hasMore?: boolean;
  isLoadingMore?: boolean;
}

export default function NounExplorer({
  nouns,
  onSortChange,
  loadMore,
  hasMore,
  isLoadingMore
}: NounExplorerProps) {
  const { filteredNounCount } = useFilterEngine();
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const inFlightRef = useRef(false);
  const loadMoreRef = useRef(loadMore);
  const isLoadingMoreRef = useRef(isLoadingMore);
  const hasMoreRef = useRef(hasMore);

  useEffect(() => {
    loadMoreRef.current = loadMore;
  }, [loadMore]);

  useEffect(() => {
    isLoadingMoreRef.current = isLoadingMore;
  }, [isLoadingMore]);

  useEffect(() => {
    hasMoreRef.current = hasMore;
  }, [hasMore]);

  const handleSortChange = (newSortOrder: SortOrder) => {
    onSortChange?.(newSortOrder);
  };

  // Intersection Observer for seamless infinite scroll
  useEffect(() => {
    if (!hasMoreRef.current) return;
    const node = sentinelRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry.isIntersecting && !inFlightRef.current && !isLoadingMoreRef.current) {
          inFlightRef.current = true;
          loadMoreRef.current?.();
          // allow a short cooldown to avoid rapid retriggers
          setTimeout(() => {
            inFlightRef.current = false;
          }, 800);
        }
      },
      {
        root: null,
        rootMargin: "400px 0px",
        threshold: 0.01,
      }
    );

    observer.observe(node);
    return () => {
      observer.unobserve(node);
      observer.disconnect();
    };
  }, [hasMore]);

  return (
    <div
      className="flex w-full flex-col md:flex-row md:gap-8"
      id="explore-section"
    >
      {/* Filter Sidebar */}
      <div className="shrink-0">
        <NounFilter />
      </div>
      
      {/* Main Content Area - window scroll only */}
      <div className="flex min-w-0 flex-[2] flex-col">
        <div className="sticky top-[63px] z-[8]">
          <ActiveFilters 
            numNouns={filteredNounCount > 0 ? filteredNounCount : nouns.length} 
            onSortChange={handleSortChange} 
          />
        </div>

        <NounGrid nouns={nouns} onEndReached={hasMore ? loadMore : undefined} hasMore={hasMore} />

        {/* Status and sentinel (window scroll) */}
        {nouns.length > 0 && (
          <div className="flex flex-col items-center gap-4 py-8">
            <div className="text-gray-500 text-sm">
              Showing {nouns.length} of {filteredNounCount} nouns
            </div>
            {hasMore ? (
              <div ref={sentinelRef} className="h-6 w-full" />
            ) : (
              <div className="text-gray-500 text-sm">You've reached the end!</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

