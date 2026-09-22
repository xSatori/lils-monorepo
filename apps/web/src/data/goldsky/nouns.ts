import { CHAIN_CONFIG } from "@/config";
import { graphQLFetchWithFallback } from "@/data/utils/graphQLFetch";
import type {
  NounFilters,
  NounsPaginatedResult,
  PonderNoun,
  NounSortField,
  SortDirection,
} from "@/data/ponder/nouns/types";
import { mapGoldskyNoun, type GoldskyNoun } from "./nounMapper";
export { mapGoldskyNoun, type GoldskyNoun } from "./nounMapper";

const NOUN_FIELDS = `
  id
  owner { id delegate { id } }
  seed { background body accessory head glasses }
`;

const NOUNS_QUERY = `
  query GoldskyNouns($first: Int!, $skip: Int!, $where: Noun_filter, $orderBy: Noun_orderBy!, $orderDirection: OrderDirection!) {
    nouns(first: $first, skip: $skip, where: $where, orderBy: $orderBy, orderDirection: $orderDirection) { ${NOUN_FIELDS} }
  }
`;

const NOUN_BY_ID_QUERY = `
  query GoldskyNounById($id: String!) {
    noun(id: $id) { ${NOUN_FIELDS} }
  }
`;

const NOUNS_BY_IDS_QUERY = `
  query GoldskyNounsByIds($ids: [String!]!, $orderDirection: OrderDirection!) {
    nouns(first: 1000, where: { id_in: $ids }, orderBy: id, orderDirection: $orderDirection) { ${NOUN_FIELDS} }
  }
`;

const DELEGATED_NOUNS_QUERY = `
  query GoldskyDelegatedNouns($delegate: String!, $first: Int!, $skip: Int!, $orderDirection: OrderDirection!) {
    accounts(where: { delegate: $delegate }) {
      nouns(first: $first, skip: $skip, orderBy: id, orderDirection: $orderDirection) { ${NOUN_FIELDS} }
    }
  }
`;

function toOrderBy(sortField: NounSortField): "id" {
  // Goldsky's canonical noun ordering is id. Trait/owner ordering was a custom
  // Ponder behavior and callers only use it for deterministic pagination.
  void sortField;
  return "id";
}

function nounWhere(filters: NounFilters): Record<string, unknown> {
  const where: Record<string, unknown> = {};
  if (filters.owner) where.owner = filters.owner.toLowerCase();
  if (filters.owners?.length) where.owner_in = filters.owners.map((address) => address.toLowerCase());

  const seed: Record<string, unknown> = {};
  const scalarFilters: Array<[keyof NounFilters, string]> = [
    ["background", "background"], ["backgrounds", "background_in"],
    ["body", "body"], ["bodies", "body_in"],
    ["accessory", "accessory"], ["accessories", "accessory_in"],
    ["head", "head"], ["heads", "head_in"],
    ["glasses", "glasses"], ["glassesOptions", "glasses_in"],
  ];
  for (const [input, field] of scalarFilters) {
    const value = filters[input];
    if (value !== undefined && (!Array.isArray(value) || value.length > 0)) seed[field] = value;
  }
  if (Object.keys(seed).length) where.seed_ = seed;
  return where;
}

async function queryGoldsky<T>(query: string, variables: Record<string, unknown>): Promise<T | null> {
  return graphQLFetchWithFallback<T, Record<string, unknown>>(
    CHAIN_CONFIG.goldskyUrl,
    query as any,
    variables,
    { next: { revalidate: 60 } },
  );
}

export async function getGoldskyNounById(id: string): Promise<PonderNoun | undefined> {
  const result = await queryGoldsky<{ noun?: GoldskyNoun | null }>(NOUN_BY_ID_QUERY, { id });
  return result?.noun ? mapGoldskyNoun(result.noun) ?? undefined : undefined;
}

export async function getGoldskyNounsByIds(ids: readonly string[], direction: SortDirection = "desc"): Promise<PonderNoun[]> {
  if (!ids.length) return [];
  const result = await queryGoldsky<{ nouns?: GoldskyNoun[] }>(NOUNS_BY_IDS_QUERY, {
    ids,
    orderDirection: direction,
  });
  return (result?.nouns ?? []).map(mapGoldskyNoun).filter((noun): noun is PonderNoun => Boolean(noun));
}

export async function getGoldskyNounsPaginated(
  filters: NounFilters = {},
  sortField: NounSortField = "id",
  sortDirection: SortDirection = "desc",
  limit = 50,
  offset = 0,
): Promise<NounsPaginatedResult> {
  if (filters.delegate || filters.delegates?.length) {
    const delegates = filters.delegates?.length ? filters.delegates : [filters.delegate!];
    const responses = await Promise.all(delegates.map((delegate) => queryGoldsky<{ accounts?: Array<{ nouns?: GoldskyNoun[] }> }>(DELEGATED_NOUNS_QUERY, {
      delegate: delegate.toLowerCase(), first: limit + 1, skip: offset, orderDirection: sortDirection,
    })));
    const deduped = new Map<string, PonderNoun>();
    for (const response of responses) for (const account of response?.accounts ?? []) for (const noun of account.nouns ?? []) {
      const mapped = mapGoldskyNoun(noun);
      if (mapped) deduped.set(mapped.id, mapped);
    }
    const nouns = [...deduped.values()].sort((a, b) => sortDirection === "desc" ? Number(b.id) - Number(a.id) : Number(a.id) - Number(b.id));
    return { nouns: nouns.slice(0, limit), hasMore: nouns.length > limit };
  }

  const result = await queryGoldsky<{ nouns?: GoldskyNoun[] }>(NOUNS_QUERY, {
    first: limit + 1,
    skip: offset,
    where: nounWhere(filters),
    orderBy: toOrderBy(sortField),
    orderDirection: sortDirection,
  });
  const nouns = (result?.nouns ?? []).map(mapGoldskyNoun).filter((noun): noun is PonderNoun => Boolean(noun));
  return { nouns: nouns.slice(0, limit), hasMore: nouns.length > limit };
}

export async function getGoldskyNounsForAddress(address: string, limit = 50, offset = 0) {
  return getGoldskyNounsPaginated({ owner: address }, "id", "desc", limit, offset);
}

export async function getGoldskyNounsDelegatedTo(address: string, limit = 50, offset = 0) {
  return getGoldskyNounsPaginated({ delegate: address }, "id", "desc", limit, offset);
}

export async function getGoldskyUniqueNounOwnersCount(): Promise<number> {
  const owners = new Set<string>();
  let offset = 0;
  const limit = 1000;
  while (true) {
    const page = await getGoldskyNounsPaginated({}, "id", "asc", limit, offset);
    page.nouns.forEach((noun) => {
      if (noun.owner !== "0x0000000000000000000000000000000000000000") owners.add(noun.owner.toLowerCase());
    });
    if (!page.hasMore) return owners.size;
    offset += limit;
  }
}
