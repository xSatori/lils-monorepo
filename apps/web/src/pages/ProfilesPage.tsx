import { useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useQuery } from "@tanstack/react-query";

import LoadingSkeletons from "@/components/LoadingSkeletons";
import SearchProvider, { SearchInput, useSearchContext } from "@/components/Search";
import { getAllVoters } from "@/data/goldsky/governance/getAllVoters";
import type { VoterProfile } from "@/data/goldsky/governance/voterStats";
import {
  VoterList,
  type VoterSortMode,
  type VoterTokenStats,
} from "@/features/voters/components";
import { useVoterTokenStats } from "@/features/voters/useVoterTokenStats";

function FilteredVoters({
  voters,
  tokenStatsByAddress,
  sortMode,
  onSortModeChange,
}: {
  voters: VoterProfile[];
  tokenStatsByAddress: Map<string, VoterTokenStats>;
  sortMode: VoterSortMode;
  onSortModeChange: (sortMode: VoterSortMode) => void;
}) {
  const { debouncedSearchValue } = useSearchContext();

  const filteredVoters = useMemo(() => {
    const query = debouncedSearchValue.trim().toLowerCase();
    if (!query) return voters;

    return voters.filter((voter) => voter.address.toLowerCase().includes(query));
  }, [voters, debouncedSearchValue]);

  return (
    <VoterList
      voters={filteredVoters}
      tokenStatsByAddress={tokenStatsByAddress}
      sortMode={sortMode}
      onSortModeChange={onSortModeChange}
      emptyLabel={
        debouncedSearchValue
          ? "No voters matching the search filter."
          : "No voters found."
      }
    />
  );
}

export default function ProfilesPage() {
  const { data: voters = [], isLoading: isLoadingVoters } = useQuery({
    queryKey: ["all-voters"],
    queryFn: () => getAllVoters(5000),
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  const [sortMode, setSortMode] = useState<VoterSortMode>("votes-cast");
  const tokenStatsByAddress = useVoterTokenStats(voters, 100);

  return (
    <>
      <Helmet>
        <title>Voters | Lil Nouns DAO</title>
        <meta
          name="description"
          content="Explore Lil Nouns DAO voters, voting activity, represented nouns, and wallet profiles."
        />
        <link rel="canonical" href="https://www.lilnouns.wtf/voters" />
        <meta property="og:title" content="Voters | Lil Nouns DAO" />
        <meta
          property="og:description"
          content="Explore Lil Nouns DAO voters, voting activity, represented nouns, and wallet profiles."
        />
      </Helmet>

      <SearchProvider>
        <div className="flex w-full max-w-[1400px] gap-12 p-6 pb-20 md:p-10 md:pb-20">
          <div className="flex flex-1 flex-col gap-8">
            <div className="flex flex-col gap-6">
              <div>
                <h1 className="heading-2">Voters</h1>
                <p className="text-content-secondary">
                  Wallets that vote in Lil Nouns governance, ranked by participation.
                </p>
              </div>

              <SearchInput placeholder="Search by address..." className="max-w-[500px]" />
            </div>

            {isLoadingVoters ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {[1, 2, 3, 4, 5, 6].map((index) => (
                  <LoadingSkeletons
                    key={index}
                    count={1}
                    className="h-[112px] w-full rounded-[8px]"
                  />
                ))}
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <h2 className="heading-6">
                    {voters.length} Voter{voters.length !== 1 ? "s" : ""}
                  </h2>
                </div>
                <FilteredVoters
                  voters={voters}
                  tokenStatsByAddress={tokenStatsByAddress}
                  sortMode={sortMode}
                  onSortModeChange={setSortMode}
                />
              </div>
            )}
          </div>
        </div>
      </SearchProvider>
    </>
  );
}
