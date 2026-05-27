export interface VrgdaPoolSeed {
  id: string;
  nounId: string;
  blockNumber: string; // BigInt as string
  blockHash?: string;
  background: number;
  body: number;
  accessory: number;
  head: number;
  glasses: number;
  isUsed: boolean;
  isValid?: boolean;
  generatedAt: string; // BigInt timestamp as string
  invalidatedAt?: string | null;
}

export interface VrgdaPoolSeedsResult {
  seeds: VrgdaPoolSeed[];
  hasMore: boolean;
  total?: number;
}

export interface VrgdaPoolStatus {
  currentBlock: string; // BigInt as string
  poolSize: number;
  availableSeeds: number;
  usedSeeds: number;
  latestSeedBlock: string; // BigInt as string
  poolCoverage: {
    oldestBlock: string;
    newestBlock: string;
    blocksSpanned: number;
  };
}

export interface VrgdaFilters {
  isUsed?: boolean;
  blockNumberGt?: string; // BigInt as string
  blockNumberGte?: string;
  blockNumberLt?: string;
  blockNumberLte?: string;
  blockNumbers?: string[]; // Array of BigInt strings
  background?: number;
  backgrounds?: number[];
  body?: number;
  bodies?: number[];
  accessory?: number;
  accessories?: number[];
  head?: number;
  heads?: number[];
  glasses?: number;
  glassesOptions?: number[];
}

export type VrgdaSortField = 'blockNumber' | 'background' | 'body' | 'accessory' | 'head' | 'glasses' | 'isUsed' | 'generatedAt';
export type SortDirection = 'asc' | 'desc';

// Real-time subscription types
export interface VrgdaPoolUpdate {
  type: 'SEED_ADDED' | 'SEED_USED' | 'POOL_REFRESHED';
  seed?: VrgdaPoolSeed;
  seeds?: VrgdaPoolSeed[];
  timestamp: string;
}

export interface VrgdaSubscriptionOptions {
  onUpdate: (update: VrgdaPoolUpdate) => void;
  onError?: (error: Error) => void;
  pollInterval?: number; // milliseconds, default 12000 (12 seconds)
  includeUsedSeeds?: boolean;
}
