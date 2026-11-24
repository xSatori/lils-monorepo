import { Check, Timer } from "lucide-react";

import type { RoundView } from "./types";

function formatDate(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(timestamp * 1000);
}

function progress(now: number, start: number, end: number) {
  if (end <= start) return now >= end ? 100 : 0;
  return Math.min(100, Math.max(0, ((now - start) / (end - start)) * 100));
}

function Marker({ status }: { status: "upcoming" | "active" | "complete" }) {
  if (status === "complete") {
    return (
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-semantic-positive text-white">
        <Check className="h-4 w-4" aria-hidden="true" />
      </span>
    );
  }
  if (status === "active") {
    return (
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-semantic-accent text-white">
        <Timer className="h-4 w-4" aria-hidden="true" />
      </span>
    );
  }
  return (
    <span className="h-8 w-8 shrink-0 rounded-full border-2 border-dotted border-gray-400 bg-white" />
  );
}

function Connector({ progress: connectorProgress }: { progress?: number }) {
  if (connectorProgress === undefined) {
    return <span className="h-1 flex-1" />;
  }
  return (
    <span className="relative h-1 flex-1 bg-background-secondary">
      <span
        className="absolute inset-y-0 left-0 bg-semantic-positive"
        style={{ width: `${connectorProgress}%` }}
      />
    </span>
  );
}

export function RoundTimeline({ round }: { round: RoundView }) {
  const now = Date.now() / 1000;
  const milestones = [
    { label: "Submissions open", timestamp: round.submissionsOpen },
    { label: "Review begins", timestamp: round.submissionsClose },
    { label: "Voting starts", timestamp: round.votingStart },
    { label: "Voting ends", timestamp: round.votingEnd },
  ];
  const currentIndex =
    now < round.submissionsOpen
      ? -1
      : now < round.submissionsClose
        ? 0
        : now < round.votingStart
          ? 1
          : now < round.votingEnd
            ? 2
            : 3;
  const segmentProgress = [
    progress(now, round.submissionsOpen, round.submissionsClose),
    progress(now, round.submissionsClose, round.votingStart),
    progress(now, round.votingStart, round.votingEnd),
  ];

  return (
    <div
      className="w-full rounded-[16px] border bg-white p-4 md:p-5"
      aria-label="Round timeline"
    >
      <ol className="grid list-none grid-cols-4 gap-0">
        {milestones.map((milestone, index) => {
          const status =
            currentIndex > index || (index === 3 && currentIndex === 3)
              ? "complete"
              : currentIndex === index
                ? "active"
                : "upcoming";
          const previousProgress =
            index > 0
              ? Math.max(0, (segmentProgress[index - 1] - 50) * 2)
              : undefined;
          const nextProgress =
            index < milestones.length - 1
              ? Math.min(100, segmentProgress[index] * 2)
              : undefined;
          return (
            <li
              key={milestone.label}
              className="relative flex min-w-0 flex-col items-center text-center"
            >
              <span className="flex min-h-10 items-end px-1 text-content-secondary label-sm">
                {milestone.label}
              </span>
              <span
                className="mt-3 flex w-full items-center"
                aria-hidden="true"
              >
                <Connector progress={previousProgress} />
                <Marker status={status} />
                <Connector progress={nextProgress} />
              </span>
              <time
                className="mt-3 px-1 paragraph-sm"
                dateTime={new Date(milestone.timestamp * 1000).toISOString()}
              >
                {formatDate(milestone.timestamp)}
              </time>
            </li>
          );
        })}
      </ol>

      <p className="mt-4 border-t pt-3 text-content-secondary paragraph-sm">
        {round.implementationVersion === 1
          ? "Legacy round: submissions close when voting starts, with no separate moderation-review window."
          : `Moderation review lasts ${Math.round((round.votingStart - round.submissionsClose) / 60)} minutes. No new submissions are accepted during this buffer.`}
      </p>
    </div>
  );
}
