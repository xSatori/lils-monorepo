import { Link } from "react-router-dom";
import { CalendarClock } from "lucide-react";
import { twMerge } from "tailwind-merge";
import { Round } from "@/data/rounds/types";
import { getRoundState, getRoundTargetDate } from "@/data/rounds/roundState";

function formatTargetDate(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export default function RoundCard({
  round,
  className,
}: {
  round: Round;
  className?: string;
}) {
  const state = getRoundState(round);
  const targetDate = getRoundTargetDate(round);
  const label =
    state === "Upcoming"
      ? "Round starts"
      : state === "Proposing"
        ? "Voting starts"
        : state === "Voting"
          ? "Voting ends"
          : "Round ended";

  return (
    <Link
      to={`/rounds/${round.handle}`}
      className={twMerge(
        "group flex min-h-[420px] flex-col overflow-hidden rounded-[16px] border bg-white transition-all hover:-translate-y-0.5 hover:border-gray-500 hover:shadow-overlay",
        className,
      )}
    >
      <div className="h-[170px] w-full overflow-hidden bg-background-secondary">
        <img
          src={round.image}
          alt={round.name}
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          loading="lazy"
        />
      </div>

      <div className="flex flex-1 flex-col gap-5 p-5">
        <div className="flex items-center justify-between gap-3">
          <span className="rounded-full bg-background-secondary px-3 py-1 label-sm">
            {state}
          </span>
          <span className="text-content-secondary label-sm">{round.funds}</span>
        </div>

        <div className="flex flex-1 flex-col gap-3">
          <h3 className="heading-4 line-clamp-2">{round.name}</h3>
          <p className="line-clamp-3 text-content-secondary paragraph-sm">
            {round.summary}
          </p>
        </div>

        <div className="flex items-center gap-2 text-content-secondary paragraph-sm">
          <CalendarClock className="h-4 w-4" />
          <span>{label}</span>
          <span className="text-content-primary">{formatTargetDate(targetDate)}</span>
        </div>

        <div className="flex items-center gap-2">
          <img
            src={round.community.image}
            alt={round.community.name}
            className="h-6 w-6 rounded-full object-cover"
            loading="lazy"
          />
          <span className="truncate label-sm">{round.community.name}</span>
        </div>
      </div>
    </Link>
  );
}
