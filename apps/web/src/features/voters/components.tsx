import { Link } from "react-router-dom";
import { MoreHorizontal } from "lucide-react";
import { type Address } from "viem";

import { EnsAvatar } from "@/components/EnsAvatar";
import { EnsName } from "@/components/EnsName";
import type { VoterProfile } from "@/data/goldsky/governance/voterStats";
import { cn } from "@/utils/shadcn";

export interface VoterTokenStats {
  owned: number;
  currentVotingPower: number;
  tokenHoldersRepresented?: number;
  delegateAddress?: Address;
  isLoading?: boolean;
}

export type VoterSortMode =
  | "most-revoted"
  | "passed-authored-sponsored"
  | "votes-cast"
  | "votes-cast-with-reason"
  | "total-votes-cast"
  | "total-votes-cast-with-reason"
  | "current-voting-power";

const compactSortOptions: Array<{ value: VoterSortMode; label: string }> = [
  { value: "votes-cast", label: "Sort by votes cast" },
  { value: "current-voting-power", label: "Sort by current voting power" },
];

const expandedSortOptions: Array<{ value: VoterSortMode; label: string }> = [
  { value: "most-revoted", label: "Most revoted" },
  {
    value: "passed-authored-sponsored",
    label: "Most passed authored/sponsored proposals",
  },
  { value: "votes-cast", label: "Most votes cast" },
  { value: "votes-cast-with-reason", label: "Most votes cast with reason" },
  { value: "total-votes-cast", label: "Total votes cast" },
  { value: "total-votes-cast-with-reason", label: "Total votes cast with reason" },
  { value: "current-voting-power", label: "Voting power" },
];

function formatCompactNumber(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function formatShortAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function pluralize(value: number, singular: string, plural = `${singular}s`) {
  return `${formatCompactNumber(value)} ${value === 1 ? singular : plural}`;
}

function getCurrentVotingPower(
  voter: VoterProfile,
  tokenStatsByAddress?: Map<string, VoterTokenStats>,
) {
  return tokenStatsByAddress?.get(voter.address.toLowerCase())?.currentVotingPower ?? 0;
}

function getPassedAuthoredOrSponsoredCount(
  voter: VoterProfile,
  passedAuthoredOrSponsoredCountsByAddress?: Map<string, number>,
) {
  return passedAuthoredOrSponsoredCountsByAddress?.get(voter.address.toLowerCase()) ?? 0;
}

function sortVoters(
  voters: VoterProfile[],
  sortMode: VoterSortMode,
  tokenStatsByAddress?: Map<string, VoterTokenStats>,
  passedAuthoredOrSponsoredCountsByAddress?: Map<string, number>,
) {
  return [...voters].sort((a, b) => {
    const sortDelta = (() => {
      switch (sortMode) {
        case "most-revoted":
          return b.revotesCount - a.revotesCount;
        case "passed-authored-sponsored":
          return (
            getPassedAuthoredOrSponsoredCount(
              b,
              passedAuthoredOrSponsoredCountsByAddress,
            ) -
            getPassedAuthoredOrSponsoredCount(
              a,
              passedAuthoredOrSponsoredCountsByAddress,
            )
          );
        case "votes-cast-with-reason":
          return b.votesWithReasonCount - a.votesWithReasonCount;
        case "total-votes-cast":
          return b.totalVotes - a.totalVotes;
        case "total-votes-cast-with-reason":
          return b.totalVotesWithReason - a.totalVotesWithReason;
        case "current-voting-power":
          return (
            getCurrentVotingPower(b, tokenStatsByAddress) -
            getCurrentVotingPower(a, tokenStatsByAddress)
          );
        case "votes-cast":
        default:
          return b.votesPlacedCount - a.votesPlacedCount;
      }
    })();

    if (sortDelta !== 0) {
      return sortDelta;
    }

    if (b.votesPlacedCount !== a.votesPlacedCount) {
      return b.votesPlacedCount - a.votesPlacedCount;
    }

    if (b.proposalsVotedCount !== a.proposalsVotedCount) {
      return b.proposalsVotedCount - a.proposalsVotedCount;
    }

    return b.totalVotes - a.totalVotes;
  });
}

export function VoterCard({
  voter,
  tokenStats,
  submittedProposalCount = 0,
  compact = false,
}: {
  voter: VoterProfile;
  tokenStats?: VoterTokenStats;
  submittedProposalCount?: number;
  compact?: boolean;
}) {
  const representedCount = tokenStats?.currentVotingPower ?? 0;

  return (
    <Link
      to={`/voters/${voter.address}`}
      className={cn(
        "group flex w-full items-center gap-4 rounded-[8px] border border-border-secondary bg-white p-3 transition-colors hover:border-border-primary hover:bg-background-secondary",
        compact && "rounded-none border-x-0 border-t-0 px-0 py-3",
      )}
    >
      <EnsAvatar address={voter.address as Address} size={compact ? 38 : 52} />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <EnsName
            address={voter.address as Address}
            className="truncate text-[16px] font-bold leading-tight text-content-primary"
          />
          <span className="shrink-0 text-[15px] font-bold text-content-secondary">
            ({tokenStats?.isLoading ? "..." : formatCompactNumber(representedCount)})
          </span>
        </div>
        <p className="mt-0.5 truncate text-[14px] text-content-secondary">
          {formatShortAddress(voter.address)} - {pluralize(voter.votesPlacedCount, "vote")} (
          {pluralize(submittedProposalCount, "proposal")})
        </p>
      </div>
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full text-content-secondary transition-colors group-hover:bg-background-primary group-hover:text-content-primary">
        <MoreHorizontal className="size-5" aria-hidden="true" />
      </span>
    </Link>
  );
}

export function VoterList({
  voters,
  tokenStatsByAddress,
  submittedProposalCountsByAddress,
  passedAuthoredOrSponsoredCountsByAddress,
  limit,
  compact = false,
  fillHeight = false,
  expandedSort = false,
  emptyLabel = "No voters found.",
  showSort = true,
  sortMode,
  onSortModeChange,
}: {
  voters: VoterProfile[];
  tokenStatsByAddress?: Map<string, VoterTokenStats>;
  submittedProposalCountsByAddress?: Map<string, number>;
  passedAuthoredOrSponsoredCountsByAddress?: Map<string, number>;
  limit?: number;
  compact?: boolean;
  fillHeight?: boolean;
  expandedSort?: boolean;
  emptyLabel?: string;
  showSort?: boolean;
  sortMode?: VoterSortMode;
  onSortModeChange?: (sortMode: VoterSortMode) => void;
}) {
  const sortOptions = expandedSort ? expandedSortOptions : compactSortOptions;
  const activeSortMode =
    sortOptions.find((option) => option.value === sortMode)?.value ?? sortOptions[0].value;
  const sortedVoters = sortVoters(
    voters,
    activeSortMode,
    tokenStatsByAddress,
    passedAuthoredOrSponsoredCountsByAddress,
  );
  const visibleVoters =
    typeof limit === "number" ? sortedVoters.slice(0, limit) : sortedVoters;

  if (visibleVoters.length === 0) {
    return <p className="text-[15px] text-content-secondary">{emptyLabel}</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {showSort && (
        <div className="flex justify-end">
          <label className="sr-only" htmlFor="voter-sort">
            Sort voters
          </label>
          <select
            id="voter-sort"
            value={activeSortMode}
            onChange={(event) =>
              onSortModeChange?.(event.target.value as VoterSortMode)
            }
            className="h-10 rounded-[8px] border border-border-secondary bg-background-primary px-3 text-[14px] font-semibold text-content-primary outline-none transition-colors hover:border-border-primary focus:border-border-primary"
          >
            {sortOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      )}

      <div
        className={cn(
          "flex flex-col",
          fillHeight && "max-h-[calc(100vh-245px)] overflow-y-auto pr-1",
        )}
      >
        {visibleVoters.map((voter) => (
          <VoterCard
            key={voter.address}
            voter={voter}
            tokenStats={tokenStatsByAddress?.get(voter.address.toLowerCase())}
            submittedProposalCount={
              submittedProposalCountsByAddress?.get(voter.address.toLowerCase()) ?? 0
            }
            compact={compact}
          />
        ))}
      </div>
    </div>
  );
}
