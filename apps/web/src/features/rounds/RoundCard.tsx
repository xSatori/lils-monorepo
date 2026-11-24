import { Link } from "react-router-dom";
import { CalendarClock, UserRound } from "lucide-react";

import {
  LifecycleState,
  PrizeVaultState,
  lifecycleLabels,
  type RoundView,
} from "./types";
import { resolveImageUri } from "./validation";
import { shortenAddress } from "./RoundsStatus";

function dateLabel(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(timestamp * 1000);
}

function target(round: RoundView) {
  switch (round.lifecycleState) {
    case LifecycleState.Upcoming:
      return { label: "Submissions open", timestamp: round.submissionsOpen };
    case LifecycleState.SubmissionsOpen:
      return { label: "Submissions close", timestamp: round.submissionsClose };
    case LifecycleState.ModerationPending:
      return { label: "Voting starts", timestamp: round.votingStart };
    case LifecycleState.VotingOpen:
      return { label: "Voting ends", timestamp: round.votingEnd };
    default:
      return { label: "Voting ended", timestamp: round.votingEnd };
  }
}

export function RoundCard({ round }: { round: RoundView }) {
  const title = round.metadata?.title || `Round ${shortenAddress(round.round)}`;
  const boundary = target(round);
  const schedulePending =
    round.implementationVersion >= 6 && !round.scheduleConfigured;
  return (
    <li className="h-full">
      <Link
        to={`/rounds/${round.round}`}
        aria-label={`View ${title}`}
        className="group flex min-h-[420px] h-full flex-col overflow-hidden rounded-[16px] border bg-white transition-all hover:-translate-y-0.5 hover:border-gray-500 hover:shadow-overlay focus-visible:outline-none focus-visible:ring-2"
      >
        <div className="h-[170px] w-full overflow-hidden bg-background-secondary">
          {round.metadata?.image ? (
            <img
              src={resolveImageUri(round.metadata.image)}
              alt={`${title} cover`}
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
              loading="lazy"
            />
          ) : (
            <div
              className="flex h-full items-center justify-center bg-background-ternary text-content-secondary label-sm"
              aria-hidden="true"
            >
              Onchain round
            </div>
          )}
        </div>
        <div className="flex flex-1 flex-col gap-5 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-background-secondary px-3 py-1 label-sm">
              {round.lifecycleState === LifecycleState.SubmissionsOpen &&
              round.prizeVault?.state === PrizeVaultState.Funding
                ? "Prize funding required"
                : schedulePending
                  ? "Schedule not set"
                  : lifecycleLabels[round.lifecycleState]}
            </span>
            {round.lifecycleState !== LifecycleState.SubmissionsOpen &&
              round.prizeVault?.state === PrizeVaultState.Funding && (
                <span className="rounded-full bg-yellow-100 px-3 py-1 text-yellow-950 label-sm">
                  Prize funding required
                </span>
              )}
            {round.prizeVault?.state === PrizeVaultState.Canceled && (
              <span className="rounded-full bg-background-secondary px-3 py-1 label-sm">
                Prize vault canceled
              </span>
            )}
          </div>
          <div className="flex flex-1 flex-col gap-3">
            <h2 className="heading-4 line-clamp-2">{title}</h2>
            <p className="line-clamp-3 text-content-secondary paragraph-sm">
              {round.metadata?.description ||
                "Metadata content is unavailable. Onchain state remains readable."}
            </p>
          </div>
          <div className="flex items-center gap-2 text-content-secondary paragraph-sm">
            <CalendarClock className="h-4 w-4" aria-hidden="true" />
            <span>{schedulePending ? "Start date" : boundary.label}</span>
            <span className="text-content-primary">
              {schedulePending
                ? "Not scheduled"
                : dateLabel(boundary.timestamp)}
            </span>
          </div>
          <div className="flex items-center gap-2 border-t pt-4 text-content-secondary label-sm">
            <UserRound className="h-4 w-4" aria-hidden="true" />
            <span>Created by {shortenAddress(round.creator)}</span>
          </div>
        </div>
      </Link>
    </li>
  );
}
