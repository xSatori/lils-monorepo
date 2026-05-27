"use client";
import { useState, useEffect, useCallback } from 'react';
import { VrgdaPoolSeed } from '@/data/ponder/vrgda/types';

const BOOKMARKS_STORAGE_KEY = 'vrgda-bookmarks';

interface BookmarkedSeed {
  nounId: string;
  blockNumber: string;
  blockHash: string;
  seed: {
    background: number;
    body: number;
    accessory: number;
    head: number;
    glasses: number;
  };
  savedAt: number;
}

interface BookmarkStorage {
  currentPoolBlock?: string;
  seeds: BookmarkedSeed[];
}

export const useVrgdaBookmarks = (currentPoolSeeds?: VrgdaPoolSeed[]) => {
  const [bookmarkedSeeds, setBookmarkedSeeds] = useState<BookmarkedSeed[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Load bookmarks from localStorage on mount
  useEffect(() => {
    const loadBookmarks = () => {
      try {
        const stored = localStorage.getItem(BOOKMARKS_STORAGE_KEY);
        if (stored) {
          const data: BookmarkStorage = JSON.parse(stored);
          
          // Check if we need to clear old bookmarks (if pool changed)
          if (currentPoolSeeds && currentPoolSeeds.length > 0) {
            const currentBlockNumber = currentPoolSeeds[0]?.blockNumber;
            
            // If stored pool block is different or seeds are no longer valid, clear them
            if (String(data.currentPoolBlock) !== currentBlockNumber || !areBookmarksValid(data.seeds, currentPoolSeeds)) {
              setBookmarkedSeeds([]);
              saveBookmarks([], currentBlockNumber);
            } else {
              setBookmarkedSeeds(data.seeds);
            }
          } else {
            setBookmarkedSeeds(data.seeds);
          }
        }
      } catch (error) {
        console.error('Failed to load VRGDA bookmarks:', error);
        setBookmarkedSeeds([]);
      } finally {
        setIsLoading(false);
      }
    };

    loadBookmarks();
  }, [currentPoolSeeds]);

  // Check if bookmarked seeds are still valid in current pool
  const areBookmarksValid = (bookmarks: BookmarkedSeed[], poolSeeds: VrgdaPoolSeed[]): boolean => {
    if (bookmarks.length === 0) return true;
    
    const poolNounIds = new Set(poolSeeds.map(seed => seed.nounId));
    return bookmarks.some(bookmark => poolNounIds.has(bookmark.nounId));
  };

  // Save bookmarks to localStorage
  const saveBookmarks = useCallback((seeds: BookmarkedSeed[], currentBlock?: string) => {
    try {
      const data: BookmarkStorage = {
        currentPoolBlock: currentBlock,
        seeds
      };
      localStorage.setItem(BOOKMARKS_STORAGE_KEY, JSON.stringify(data));
    } catch (error) {
      console.error('Failed to save VRGDA bookmarks:', error);
    }
  }, []);

  // Add a seed to bookmarks
  const addBookmark = useCallback((seed: VrgdaPoolSeed) => {
    const newBookmark: BookmarkedSeed = {
      nounId: seed.nounId,
      blockNumber: seed.blockNumber,
      blockHash: seed.blockHash ?? '',
      seed: {
        background: seed.background,
        body: seed.body,
        accessory: seed.accessory,
        head: seed.head,
        glasses: seed.glasses
      },
      savedAt: Date.now()
    };

    const updatedBookmarks = [...bookmarkedSeeds, newBookmark];
    setBookmarkedSeeds(updatedBookmarks);
    
    const currentBlock = currentPoolSeeds?.[0]?.blockNumber;
    saveBookmarks(updatedBookmarks, currentBlock);
  }, [bookmarkedSeeds, currentPoolSeeds, saveBookmarks]);

  // Remove a seed from bookmarks (blockNumber is primary identifier)
  const removeBookmark = useCallback((nounId: string, blockNumber: string) => {
    const updatedBookmarks = bookmarkedSeeds.filter(bookmark => 
      !(String(bookmark.blockNumber) === blockNumber && bookmark.nounId === nounId)
    );
    setBookmarkedSeeds(updatedBookmarks);
    
    const currentBlock = currentPoolSeeds?.[0]?.blockNumber;
    saveBookmarks(updatedBookmarks, currentBlock);
  }, [bookmarkedSeeds, currentPoolSeeds, saveBookmarks]);

  // Check if a seed is bookmarked (blockNumber is primary identifier)
  const isBookmarked = useCallback((nounId: string, blockNumber: string): boolean => {
    return bookmarkedSeeds.some(bookmark => 
      String(bookmark.blockNumber) === blockNumber && bookmark.nounId === nounId
    );
  }, [bookmarkedSeeds]);

  // Toggle bookmark status
  const toggleBookmark = useCallback((seed: VrgdaPoolSeed) => {
    if (isBookmarked(seed.nounId, seed.blockNumber)) {
      removeBookmark(seed.nounId, seed.blockNumber);
    } else {
      addBookmark(seed);
    }
  }, [isBookmarked, removeBookmark, addBookmark]);

  // Check if a bookmarked seed is still available in current pool
  const isBookmarkInCurrentPool = useCallback((bookmark: BookmarkedSeed): boolean => {
    if (!currentPoolSeeds || currentPoolSeeds.length === 0) return false;
    
    return currentPoolSeeds.some(poolSeed => 
      poolSeed.blockNumber === String(bookmark.blockNumber) && poolSeed.nounId === bookmark.nounId
    );
  }, [currentPoolSeeds]);

  // Clear all bookmarks
  const clearBookmarks = useCallback(() => {
    setBookmarkedSeeds([]);
    const currentBlock = currentPoolSeeds?.[0]?.blockNumber;
    saveBookmarks([], currentBlock);
  }, [currentPoolSeeds, saveBookmarks]);

  return {
    bookmarkedSeeds,
    isLoading,
    addBookmark,
    removeBookmark,
    isBookmarked,
    toggleBookmark,
    clearBookmarks,
    isBookmarkInCurrentPool,
    bookmarkCount: bookmarkedSeeds.length
  };
};
