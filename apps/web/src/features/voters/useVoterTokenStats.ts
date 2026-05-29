import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import type { VoterProfile } from "@/data/goldsky/governance/voterStats";
import { getVoterDelegationStats } from "@/data/goldsky/governance/getVoterDelegationProfile";

import type { VoterTokenStats } from "./components";

const emptyTokenStats = new Map<string, VoterTokenStats>();

async function fetchVoterTokenStats(
  voters: VoterProfile[],
): Promise<Map<string, VoterTokenStats>> {
  const stats = new Map<string, VoterTokenStats>();
  const batchSize = 100;

  for (let i = 0; i < voters.length; i += batchSize) {
    const batch = voters.slice(i, i + batchSize);

    try {
      const batchStats = await getVoterDelegationStats(batch.map((voter) => voter.address));
      batchStats.forEach((value, key) => {
        stats.set(key, {
          owned: value.owned,
          currentVotingPower: value.currentVotingPower,
          tokenHoldersRepresented: value.tokenHoldersRepresented,
          delegateAddress: value.delegateAddress,
        });
      });
    } catch (error) {
      console.error("Failed to fetch voter delegation stats:", error);
      batch.forEach((voter) => {
        stats.set(voter.address.toLowerCase(), {
          owned: 0,
          currentVotingPower: 0,
        });
      });
    }
  }

  return stats;
}

export function useVoterTokenStats(voters: VoterProfile[], limit = 100, enabled = true) {
  const votersToFetch = useMemo(() => voters.slice(0, limit), [voters, limit]);
  const addresses = useMemo(
    () => votersToFetch.map((voter) => voter.address.toLowerCase()),
    [votersToFetch],
  );

  const { data: tokenStatsByAddress = emptyTokenStats } =
    useQuery({
      queryKey: ["voter-token-stats", addresses],
      queryFn: () => fetchVoterTokenStats(votersToFetch),
      enabled: enabled && votersToFetch.length > 0,
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      refetchOnMount: false,
      refetchOnWindowFocus: false,
    });

  return useMemo(() => {
    const stats = new Map(tokenStatsByAddress);
    votersToFetch.forEach((voter) => {
      const key = voter.address.toLowerCase();
      if (!stats.has(key)) {
        stats.set(key, { owned: 0, currentVotingPower: 0, isLoading: true });
      }
    });
    return stats;
  }, [tokenStatsByAddress, votersToFetch]);
}
