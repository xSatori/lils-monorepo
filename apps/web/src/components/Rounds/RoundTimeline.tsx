import { Check, Timer } from "lucide-react";
import { twMerge } from "tailwind-merge";
import { Round } from "@/data/rounds/types";
import { getRoundState } from "@/data/rounds/roundState";

function formatDate(date: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(date));
}

function clamp(value: number) {
  return Math.min(Math.max(value, 0), 100);
}

function Marker({ status }: { status: "upcoming" | "active" | "complete" }) {
  if (status === "complete") {
    return (
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-semantic-positive text-white">
        <Check className="h-4 w-4" />
      </div>
    );
  }

  if (status === "active") {
    return (
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-semantic-accent text-white">
        <Timer className="h-4 w-4" />
      </div>
    );
  }

  return (
    <div className="h-8 w-8 shrink-0 rounded-full border-2 border-dotted border-gray-400 bg-white" />
  );
}

export default function RoundTimeline({ round }: { round: Round }) {
  const state = getRoundState(round);
  const now = new Date().getTime();
  const start = new Date(round.start).getTime();
  const votingStart = new Date(round.votingStart).getTime();
  const end = new Date(round.end).getTime();

  const proposingProgress = clamp(((now - start) / (votingStart - start)) * 100);
  const votingProgress = clamp(((now - votingStart) / (end - votingStart)) * 100);

  const firstMarker = state === "Upcoming" ? "upcoming" : "complete";
  const secondMarker =
    state === "Upcoming" || state === "Proposing"
      ? state === "Proposing"
        ? "active"
        : "upcoming"
      : "complete";
  const thirdMarker =
    state === "Ended" ? "complete" : state === "Voting" ? "active" : "upcoming";

  return (
    <div className="flex w-full flex-col gap-3 rounded-[16px] border bg-white p-5">
      <div className="grid grid-cols-3 text-content-secondary label-sm">
        <span>{state === "Upcoming" ? "Round Starts" : "Round Started"}</span>
        <span className="text-center">
          {state === "Upcoming" || state === "Proposing"
            ? "Voting Starts"
            : "Voting Started"}
        </span>
        <span className="text-right">{state === "Ended" ? "Round Ended" : "Round Ends"}</span>
      </div>

      <div className="flex items-center">
        <Marker status={firstMarker} />
        <div className="relative h-1 w-full bg-background-secondary">
          {state !== "Upcoming" && (
            <div
              className={twMerge(
                "absolute h-1",
                state === "Proposing" ? "bg-semantic-accent" : "bg-semantic-positive",
              )}
              style={{ width: state === "Proposing" ? `${proposingProgress}%` : "100%" }}
            />
          )}
        </div>
        <Marker status={secondMarker} />
        <div className="relative h-1 w-full bg-background-secondary">
          {(state === "Voting" || state === "Ended") && (
            <div
              className={twMerge(
                "absolute h-1",
                state === "Voting" ? "bg-semantic-accent" : "bg-semantic-positive",
              )}
              style={{ width: state === "Voting" ? `${votingProgress}%` : "100%" }}
            />
          )}
        </div>
        <Marker status={thirdMarker} />
      </div>

      <div className="grid grid-cols-3 text-content-primary paragraph-sm">
        <span>{formatDate(round.start)}</span>
        <span className="text-center">{formatDate(round.votingStart)}</span>
        <span className="text-right">{formatDate(round.end)}</span>
      </div>
    </div>
  );
}
