import { ProposalOverview } from "@/data/goldsky/governance/common";
import { SnapshotProposal } from "@/data/snapshot/getSnapshotProposals";
import { formatTimeLeft } from "@/utils/format";
import clsx from "clsx";
import { truncate } from "lodash";
import { Link } from "react-router-dom";
import Icon from "../ui/Icon";
import { ProposalStateBadge } from "./ProposalStateBadge";
import { MetagovStatusBadge } from "./MetagovStatusBadge";

export function ProposalOverviewCard({
  proposalOverview,
  snapshotProposal,
  combinedState,
  isNounsDao = false,
}: {
  proposalOverview: ProposalOverview;
  snapshotProposal?: SnapshotProposal;
  combinedState?: ProposalOverview['state'];
  isNounsDao?: boolean;
}) {
  const displayState = combinedState || proposalOverview.state;
  const votes = (
    <div className="flex gap-3">
      <span>For: {proposalOverview.forVotes}</span>
      <span>Against: {proposalOverview.againstVotes}</span>
      <span>Abstain: {proposalOverview.abstainVotes}</span>
    </div>
  );

  const nowTimestamp = Math.floor(Date.now() / 1000);
  
  // For Nouns DAO proposals with Snapshot matches:
  // - If Snapshot vote is active, use Snapshot timestamps
  // - Otherwise, use Nouns DAO timestamps
  const isSnapshotActive = snapshotProposal && displayState === 'metagov_active';
  const isSnapshotClosed = snapshotProposal && displayState === 'metagov_closed';
  
  // Determine which timestamps to use
  let startTimestamp: number;
  let endTimestamp: number;
  
  if (isSnapshotActive && snapshotProposal) {
    // Use Snapshot timestamps when Snapshot vote is active
    startTimestamp = snapshotProposal.start;
    endTimestamp = snapshotProposal.end;
  } else {
    // Use Nouns DAO timestamps otherwise
    startTimestamp = proposalOverview.votingStartTimestamp;
    endTimestamp = proposalOverview.votingEndTimestamp;
  }
  
  const startTimeDelta = Math.max(startTimestamp - nowTimestamp, 0);
  const endTimeDelta = Math.max(endTimestamp - nowTimestamp, 0);

  const timeToVotingStartFormatted = formatTimeLeft(startTimeDelta, true);
  const timeToVotingEndFormatted = formatTimeLeft(endTimeDelta, true);

  // Determine the correct URL based on whether it's a Nouns DAO proposal
  const voteUrl = isNounsDao ? `/vote/nouns/${proposalOverview.id}` : `/vote/${proposalOverview.id}`;
  
  // Determine what to show in the left section (timing/votes)
  // IMPORTANT: Check actual Nouns DAO state (proposalOverview.state), not displayState
  // displayState can be "metagov_pending" even when Nouns DAO vote is active (just means no Snapshot found)
  const isActuallyPending = proposalOverview.state === "pending" || proposalOverview.state === "updatable";
  const isActuallyActive = proposalOverview.state === "active";
  
  // Determine what to show:
  // - If Nouns DAO is pending/updatable: show timing
  // - If Nouns DAO is active: show votes (even if displayState is metagov_pending)
  // - If Snapshot is active: use Snapshot timing, otherwise use Nouns DAO timing
  const showStartTime = isActuallyPending && startTimeDelta > 0;
  const showStartingSoon = isActuallyPending && startTimeDelta <= 0;
  
  // Show end time if:
  // - Nouns DAO is active, OR
  // - Metagov states indicate active voting (Snapshot active or closed but Nouns active)
  const showEndTime = (isActuallyActive || displayState === "metagov_active" || displayState === "metagov_closed") && endTimeDelta > 0;

  return (
    <Link
      to={voteUrl}
      className="flex w-full justify-between rounded-[16px] border p-4 transition-colors hover:bg-background-ternary"
    >
      <div className="flex w-full items-center gap-6">
        <div
          className={clsx(
            "flex h-12 w-12 shrink-0 items-center justify-center self-start rounded-[8px] label-md md:self-auto",
            {
              "bg-background-secondary text-semantic-accent":
                displayState === "active" || displayState === "metagov_active",
              "bg-semantic-positive text-white":
                displayState === "successful" ||
                displayState === "queued" ||
                displayState === "executed",
              "bg-semantic-negative text-white":
                displayState === "failed" ||
                displayState === "cancelled" ||
                displayState === "expired",
              "bg-semantic-warning text-content-primary":
                displayState === "vetoed",
              "bg-background-secondary text-content-secondary":
                displayState === "pending" || displayState === "metagov_pending",
              "bg-yellow-100 text-yellow-800":
                displayState === "metagov_closed",
            },
          )}
        >
          {proposalOverview.id}
        </div>
        <div className="flex h-full w-full min-w-0 flex-col justify-between gap-3">
          <div className="overflow-hidden label-lg md:text-ellipsis md:whitespace-nowrap">
            {truncate(proposalOverview.title, { length: 65 })}
          </div>

          <div className="flex flex-col justify-between gap-3 text-content-secondary label-sm md:flex-row">
            {/* Left section: Timing or votes */}
            {showStartTime ? (
              <div className="flex items-center gap-1">
                <Icon
                  icon="clock"
                  size={16}
                  className="fill-content-secondary"
                />
                <span>
                  {isSnapshotActive ? 'Snapshot vote starts in' : 'Starts in'} {timeToVotingStartFormatted}
                </span>
              </div>
            ) : showStartingSoon ? (
              <div className="flex items-center gap-1">
                <Icon
                  icon="clock"
                  size={16}
                  className="fill-content-secondary"
                />
                <span>{isSnapshotActive ? 'Snapshot vote starting soon' : 'Starting soon'}</span>
              </div>
            ) : (
              votes
            )}
            
            {/* Right section: Time remaining and badges */}
            <div className="flex flex-row-reverse justify-end gap-1 md:flex-row md:justify-start">
              {showEndTime && (
                <>
                  <div className="flex items-center gap-1">
                    <span className="block md:hidden">•</span>
                    <Icon
                      icon="clock"
                      size={16}
                      className="fill-content-secondary"
                    />
                    <span>
                      {timeToVotingEndFormatted} left
                      {isSnapshotActive && (
                        <span className="text-xs text-content-tertiary"> (Snapshot)</span>
                      )}
                      {isSnapshotClosed && (
                        <span className="text-xs text-content-tertiary"> (Nouns DAO)</span>
                      )}
                    </span>
                  </div>
                  <span className="hidden md:block">•</span>
                </>
              )}
              
              {/* Show badges: Nouns DAO state + Metagov voting status (if applicable) */}
              {isNounsDao ? (
                <div className="flex items-center gap-2">
                  {/* Nouns DAO state badge */}
                  <ProposalStateBadge 
                    state={proposalOverview.state} 
                    objectionPeriodEndBlock={proposalOverview.objectionPeriodEndBlock} 
                  />
                  {/* Metagov voting status indicator */}
                  {displayState === "metagov_active" && (
                    <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-green-50 border border-green-200">
                      <span className="text-green-700 text-xs font-medium">Metagov Voting Open</span>
                    </div>
                  )}
                  {displayState === "metagov_closed" && (
                    <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-gray-50 border border-gray-200">
                      <span className="text-gray-600 text-xs font-medium">Metagov Voting Closed</span>
                    </div>
                  )}
                  {displayState === "metagov_pending" && (
                    <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-yellow-50 border border-yellow-200" title={`No Snapshot match found. Hash: ${proposalOverview.createdTransactionHash || 'none'}, ID: ${proposalOverview.id}`}>
                      <span className="text-yellow-700 text-xs font-medium">Metagov Pending</span>
                    </div>
                  )}
                  {/* Debug indicator - shows when Nouns DAO is active but no snapshot match found */}
                  {/* This will always show alongside metagov_pending since that's the default when no match exists */}
                  {isNounsDao && proposalOverview.state === "active" && !snapshotProposal && (
                    <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-orange-50 border border-orange-200" title={`Debug: No Snapshot match found. Hash: ${proposalOverview.createdTransactionHash || 'MISSING'}, ID: ${proposalOverview.id}. Check console for matching details.`}>
                      <span className="text-orange-700 text-xs font-medium">⚠️ No Match</span>
                    </div>
                  )}
                </div>
              ) : snapshotProposal ? (
                <MetagovStatusBadge state={displayState} label="Lil Nouns" />
              ) : (
                <ProposalStateBadge 
                  state={proposalOverview.state} 
                  objectionPeriodEndBlock={proposalOverview.objectionPeriodEndBlock} 
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}

export function NoProposals({
  type,
  searchFilterActive,
}: {
  type: string;
  searchFilterActive: boolean;
}) {
  return (
    <div className="flex h-[85px] w-full items-center justify-center rounded-[16px] border bg-gray-100 p-4 text-center">
      There are no {type} proposals
      {searchFilterActive && " matching the search filter"}.
    </div>
  );
}
