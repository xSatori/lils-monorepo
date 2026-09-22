# Ponder Integration - Clean GraphQL API

This module provides TypeScript functions and React hooks for custom Ponder-only
data, chiefly VRGDA pool state and financial snapshots. Canonical Lil Noun,
owner, seed, and delegate reads now use the public Goldsky subgraph through
`@/data/goldsky/nouns`.

## 🚀 Quick Start

### Basic Usage

```typescript
import { 
  getLatestVrgdaSeeds, 
  useVrgdaPoolMonitor 
} from '@/data/ponder';

// Server-side functions
const latestSeeds = await getLatestVrgdaSeeds(10);

// Client-side hooks
const { data: poolStatus } = useVrgdaPoolStatus();
const { data: availableSeeds } = useAvailableVrgdaSeeds(20);
```

## 📊 Canonical noun reads

Use `@/data/goldsky/nouns` for canonical noun data. It maps the public
Goldsky nested `owner` and `seed` entities and preserves Goldsky pagination.
The legacy compatibility wrappers in this folder forward noun reads there;
new code should not add Ponder noun queries.

### Server Functions

```typescript
// Get a specific noun
const noun = await getNounById('123');

// Get nouns for an address
const { nouns, hasMore } = await getNounsForAddress(
  '0x123...', 
  50, // limit
  0   // offset
);

// Get paginated nouns with filters
const result = await getNounsPaginated(
  { 
    owner: '0x123...', 
    background: 1,
    accessories: [1, 2, 3] 
  },
  'id',     // sort field
  'desc',   // sort direction
  20,       // limit
  0         // offset
);
```

### React Query Hooks

```typescript
// Get a noun by ID
const { data: noun, isLoading } = useNounById('123');

// Get nouns for an address
const { data: nouns } = useNounsForAddress('0x123...');

// Get paginated nouns with filters
const { data: result } = useNounsPaginated(
  { background: 1, body: 2 },
  'id',
  'desc',
  20
);

// Infinite scroll for nouns
const {
  data,
  fetchNextPage,
  hasNextPage,
  isFetchingNextPage,
} = useInfiniteNouns({ owner: '0x123...' });
```

## 🎱 VRGDA Functions

### Server Functions

```typescript
// Get pool status
const status = await getVrgdaPoolStatus();
console.log(`Pool has ${status.availableSeeds} available seeds`);

// Get latest seeds
const latestSeeds = await getLatestVrgdaSeeds(10);

// Get available seeds only
const { seeds, hasMore } = await getAvailableVrgdaSeeds(50);

// Get seed by block number
const seed = await getVrgdaSeedByBlock('23405147');

// Get seeds with filters
const result = await getVrgdaPoolSeeds(
  {
    isUsed: false,
    blockNumberGt: '23400000',
    background: 1
  },
  'blockNumber',
  'desc',
  20
);

// Check if pool needs refresh
const { shouldRefresh, reason } = await shouldRefreshVrgdaPool();
```

### React Query Hooks

```typescript
// Pool status
const { data: status } = useVrgdaPoolStatus();

// Latest seeds
const { data: latestSeeds } = useLatestVrgdaSeeds(10);

// Available seeds
const { data: availableSeeds } = useAvailableVrgdaSeeds(50);

// Upcoming auction seeds (oldest available first)
const { data: upcomingSeeds } = useUpcomingAuctionSeeds(5);

// Specific seed by block
const { data: seed } = useVrgdaSeedByBlock('23405147');

// Infinite scroll for seeds
const {
  data,
  fetchNextPage,
  hasNextPage,
} = useInfiniteVrgdaPoolSeeds({ isUsed: false });
```

## 🔄 Real-time VRGDA Monitoring

### Basic Monitoring

```typescript
import { useVrgdaPoolMonitor } from '@/data/ponder';

function MyComponent() {
  const { refresh, disconnect } = useVrgdaPoolMonitor(
    // On new seeds
    (newSeeds) => {
      console.log('New seeds available:', newSeeds);
      // Update your UI, invalidate queries, etc.
    },
    // On seed used
    (usedSeed) => {
      console.log('Seed used:', usedSeed);
    },
    12000 // Poll every 12 seconds
  );

  return (
    <div>
      <button onClick={refresh}>Refresh Now</button>
      <button onClick={disconnect}>Stop Monitoring</button>
    </div>
  );
}
```

### Advanced Monitoring

```typescript
import { useVrgdaPoolListener } from '@/data/ponder';

function AdvancedMonitor() {
  const { refresh } = useVrgdaPoolListener({
    onUpdate: (update) => {
      switch (update.type) {
        case 'SEED_ADDED':
          console.log('New seed:', update.seed);
          break;
        case 'SEED_USED':
          console.log('Seed used:', update.seed);
          break;
        case 'POOL_REFRESHED':
          console.log('Pool refreshed with seeds:', update.seeds);
          break;
      }
    },
    onError: (error) => {
      console.error('Monitoring error:', error);
    },
    pollInterval: 12000,
    includeUsedSeeds: false
  });

  return <div>Advanced monitoring active</div>;
}
```

## 🔧 Integration with TanStack Query

The module also provides pre-configured query functions for TanStack Query:

```typescript
import { 
  ponderNounQuery, 
  vrgdaPoolStatusQuery, 
  latestVrgdaSeedsQuery 
} from '@/data/tanstackQueries';

// Use with useQuery
const nounQuery = useQuery(ponderNounQuery('123'));
const statusQuery = useQuery(vrgdaPoolStatusQuery());
const seedsQuery = useQuery(latestVrgdaSeedsQuery(10));
```

## 🎯 Key Features

- **Type-safe**: Full TypeScript support with generated types
- **Real-time**: Live updates for VRGDA pool changes
- **Efficient**: Optimized queries with proper caching
- **Flexible**: Comprehensive filtering and sorting options
- **React-ready**: Built-in hooks for easy React integration
- **Server-compatible**: Works in both client and server components

## 📡 GraphQL Endpoint

GraphQL API is available at `https://graphql.lilnouns.wtf`:

- ✅ `nouns` - Noun ownership and trait data
- ✅ `vrgdaPoolSeeds` - VRGDA seed generation data

## 📚 Related Documentation

For infrastructure and backend details, see:
- **`docs/vps.ponder.md`** - Ponder indexer infrastructure, configuration, and event handlers
- **`docs/vps.graphql.md`** - GraphQL API service documentation, schema, and queries

This README focuses on frontend integration. For backend/infrastructure details, refer to the docs above.
