import { getAddress, type Address } from "viem";

import { CHAIN_CONFIG } from "@/config";
import type { PonderNoun } from "@/data/ponder/nouns/types";
import { graphQLFetchWithFallback } from "@/data/utils/graphQLFetch";

export interface VoterDelegationProfile {
  address: Address;
  currentVotingPower: number;
  representedNouns: PonderNoun[];
  ownedNouns: PonderNoun[];
  delegateAddress?: Address;
  tokenHoldersRepresented: number;
}

export interface VoterDelegationStats {
  address: Address;
  currentVotingPower: number;
  owned: number;
  delegateAddress?: Address;
  tokenHoldersRepresented: number;
}

interface SubgraphSeed {
  background: string;
  body: string;
  accessory: string;
  head: string;
  glasses: string;
}

interface SubgraphAccountRef {
  id: string;
  delegate?: {
    id: string;
  } | null;
}

interface SubgraphNoun {
  id: string;
  owner?: SubgraphAccountRef | null;
  seed?: SubgraphSeed | null;
}

interface SubgraphAccount {
  id: string;
  tokenBalance: string;
  delegate?: {
    id: string;
  } | null;
  nouns?: SubgraphNoun[];
}

interface SubgraphDelegate {
  id: string;
  delegatedVotes: string;
  tokenHoldersRepresentedAmount: number;
  nounsRepresented?: SubgraphNoun[];
}

interface VoterDelegationProfileResponse {
  account?: SubgraphAccount | null;
  delegate?: SubgraphDelegate | null;
}

interface VoterDelegationStatsResponse {
  accounts: SubgraphAccount[];
  delegates: SubgraphDelegate[];
}

const voterDelegationProfileQuery = `
  query GetVoterDelegationProfile($id: ID!) {
    account(id: $id) {
      id
      tokenBalance
      delegate {
        id
      }
      nouns(first: 1000, orderBy: id, orderDirection: desc) {
        id
        owner {
          id
          delegate {
            id
          }
        }
        seed {
          background
          body
          accessory
          head
          glasses
        }
      }
    }
    delegate(id: $id) {
      id
      delegatedVotes
      tokenHoldersRepresentedAmount
      nounsRepresented(first: 1000, orderBy: id, orderDirection: desc) {
        id
        owner {
          id
          delegate {
            id
          }
        }
        seed {
          background
          body
          accessory
          head
          glasses
        }
      }
    }
  }
`;

const voterDelegationStatsQuery = `
  query GetVoterDelegationStats($ids: [ID!]!, $first: Int!) {
    accounts(first: $first, where: { id_in: $ids }) {
      id
      tokenBalance
      delegate {
        id
      }
    }
    delegates(first: $first, where: { id_in: $ids }) {
      id
      delegatedVotes
      tokenHoldersRepresentedAmount
    }
  }
`;

function parseCount(value: string | number | undefined | null): number {
  if (value == null) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeAddress(value: string | undefined | null): Address | undefined {
  if (!value) return undefined;

  try {
    return getAddress(value) as Address;
  } catch {
    return undefined;
  }
}

function mapSubgraphNoun(noun: SubgraphNoun): PonderNoun | null {
  if (!noun.seed) return null;

  return {
    id: noun.id,
    owner: noun.owner?.id ?? "",
    delegate: noun.owner?.delegate?.id ?? undefined,
    background: parseCount(noun.seed.background),
    body: parseCount(noun.seed.body),
    accessory: parseCount(noun.seed.accessory),
    head: parseCount(noun.seed.head),
    glasses: parseCount(noun.seed.glasses),
  };
}

function mapNouns(nouns: SubgraphNoun[] | undefined): PonderNoun[] {
  return (nouns ?? []).map(mapSubgraphNoun).filter((noun): noun is PonderNoun => Boolean(noun));
}

export function buildVoterDelegationProfile(
  address: Address,
  account?: SubgraphAccount | null,
  delegate?: SubgraphDelegate | null,
): VoterDelegationProfile {
  return {
    address,
    currentVotingPower: parseCount(delegate?.delegatedVotes),
    representedNouns: mapNouns(delegate?.nounsRepresented),
    ownedNouns: mapNouns(account?.nouns),
    delegateAddress: normalizeAddress(account?.delegate?.id),
    tokenHoldersRepresented: delegate?.tokenHoldersRepresentedAmount ?? 0,
  };
}

export async function getVoterDelegationProfile(
  address: string,
): Promise<VoterDelegationProfile> {
  const normalizedAddress = getAddress(address) as Address;
  const id = normalizedAddress.toLowerCase();
  const data = await graphQLFetchWithFallback<
    VoterDelegationProfileResponse,
    { id: string }
  >(
    CHAIN_CONFIG.goldskyUrl,
    voterDelegationProfileQuery,
    { id },
    { cache: "no-cache" },
  );

  return buildVoterDelegationProfile(
    normalizedAddress,
    data?.account,
    data?.delegate,
  );
}

export function buildVoterDelegationStats(
  addresses: Address[],
  response?: VoterDelegationStatsResponse | null,
): Map<string, VoterDelegationStats> {
  const accountsByAddress = new Map(
    (response?.accounts ?? []).map((account) => [account.id.toLowerCase(), account]),
  );
  const delegatesByAddress = new Map(
    (response?.delegates ?? []).map((delegate) => [delegate.id.toLowerCase(), delegate]),
  );

  return new Map(
    addresses.map((address) => {
      const key = address.toLowerCase();
      const account = accountsByAddress.get(key);
      const delegate = delegatesByAddress.get(key);

      return [
        key,
        {
          address,
          currentVotingPower: parseCount(delegate?.delegatedVotes),
          owned: parseCount(account?.tokenBalance),
          delegateAddress: normalizeAddress(account?.delegate?.id),
          tokenHoldersRepresented: delegate?.tokenHoldersRepresentedAmount ?? 0,
        },
      ];
    }),
  );
}

export async function getVoterDelegationStats(
  addresses: Address[],
): Promise<Map<string, VoterDelegationStats>> {
  const normalizedAddresses = addresses.map((address) => getAddress(address) as Address);
  const ids = normalizedAddresses.map((address) => address.toLowerCase());
  const data = await graphQLFetchWithFallback<
    VoterDelegationStatsResponse,
    { ids: string[]; first: number }
  >(
    CHAIN_CONFIG.goldskyUrl,
    voterDelegationStatsQuery,
    { ids, first: Math.max(ids.length, 1) },
    { cache: "no-cache" },
  );

  return buildVoterDelegationStats(normalizedAddresses, data);
}
