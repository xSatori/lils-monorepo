import { useQuery } from "@tanstack/react-query";
import type { Address } from "viem";
import { usePublicClient } from "wagmi";

import {
  discoverRounds,
  getFactoryView,
  getRoundView,
  getVoterView,
} from "./rpc";

export const roundsQueryKey = (chainId: number, factory?: Address) =>
  ["onchain-rounds", chainId, factory] as const;

type LegacyFactory = { address: Address; generation: number };

export function useRounds(
  chainId: number,
  factory?: Address,
  factoryGeneration = 2,
  legacyFactories: LegacyFactory[] = [],
) {
  const client = usePublicClient({ chainId });
  return useQuery({
    queryKey: [...roundsQueryKey(chainId, factory), legacyFactories],
    enabled: Boolean(client && factory),
    queryFn: async () => {
      if (!client || !factory)
        throw new Error("Rounds are not configured on this network.");
      const [factoryView, records] = await Promise.all([
        getFactoryView(client, factory, factoryGeneration),
        discoverRounds(client, factory, factoryGeneration),
      ]);
      const legacyRecords = await Promise.all(
        legacyFactories.map(({ address, generation }) =>
          discoverRounds(client, address, generation),
        ),
      );
      const uniqueRecords = Array.from(
        new Map(
          [...records, ...legacyRecords.flat()].map((record) => [
            record.round.toLowerCase(),
            record,
          ]),
        ).values(),
      );
      const rounds = await Promise.all(
        uniqueRecords.map((record) => getRoundView(client, record)),
      );
      return { factory: factoryView, rounds };
    },
    refetchInterval: 15_000,
  });
}

export function useVoterView(
  chainId: number,
  round: Address | undefined,
  voter: Address | undefined,
  snapshotCaptured: boolean,
) {
  const client = usePublicClient({ chainId });
  return useQuery({
    queryKey: ["onchain-round-voter", round, voter, snapshotCaptured],
    enabled: Boolean(client && round && voter),
    queryFn: () => {
      if (!client || !round || !voter)
        throw new Error("Wallet is not connected.");
      return getVoterView(client, round, voter, snapshotCaptured);
    },
    refetchInterval: 12_000,
  });
}
