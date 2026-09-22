
import { NounsPaginatedResult, NounFilters, NounSortField, SortDirection } from "./types";
import { getGoldskyNounsPaginated } from "@/data/goldsky/nouns";

export async function getNounsPaginated(
  filters: NounFilters = {},
  sortField: NounSortField = 'id',
  sortDirection: SortDirection = 'desc',
  limit: number = 50,
  offset: number = 0
): Promise<NounsPaginatedResult> {
  try {
    return await getGoldskyNounsPaginated(filters, sortField, sortDirection, limit, offset);
  } catch (error) {
    console.error('Failed to fetch paginated nouns from Goldsky:', error);
    return { nouns: [], hasMore: false };
  }
}
