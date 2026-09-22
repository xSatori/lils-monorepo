import { useEffect, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import type { RoundAction } from "./RoundActions";
import { RoundsStatus } from "./RoundsStatus";
import { PrizeVaultState, type RoundView } from "./types";
import {
  getDefaultRoundSchedule,
  validateAdminRoundSchedule,
} from "./validation";

const localDateTime = (timestamp: number) => {
  const date = new Date(timestamp * 1_000);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
};

export function RoundScheduleAdmin({
  round,
  isAdmin,
  testMode,
  isPending,
  onAction,
}: {
  round: RoundView;
  isAdmin: boolean;
  testMode: boolean;
  isPending: boolean;
  onAction: RoundAction;
}) {
  const initial = round.scheduleConfigured
    ? round
    : getDefaultRoundSchedule(Math.floor(Date.now() / 1_000), testMode);
  const [open, setOpen] = useState(localDateTime(initial.submissionsOpen));
  const [close, setClose] = useState(localDateTime(initial.submissionsClose));
  const [vote, setVote] = useState(localDateTime(initial.votingStart));
  const [end, setEnd] = useState(localDateTime(initial.votingEnd));
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const sealed = round.prizeVault?.state === PrizeVaultState.Sealed;
  const openingPassed = Boolean(
    round.scheduleConfigured && Date.now() / 1_000 >= round.submissionsOpen,
  );
  const canSet = isAdmin && sealed && !openingPassed;

  useEffect(() => {
    if (!sealed || round.scheduleConfigured) return;
    const next = getDefaultRoundSchedule(
      Math.floor(Date.now() / 1_000),
      testMode,
    );
    setOpen(localDateTime(next.submissionsOpen));
    setClose(localDateTime(next.submissionsClose));
    setVote(localDateTime(next.votingStart));
    setEnd(localDateTime(next.votingEnd));
  }, [sealed, round.scheduleConfigured, testMode]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setSuccess(false);
    if (!canSet) return;
    const schedule = {
      submissionsOpen: Math.floor(new Date(open).getTime() / 1_000),
      submissionsClose: Math.floor(new Date(close).getTime() / 1_000),
      votingStart: Math.floor(new Date(vote).getTime() / 1_000),
      votingEnd: Math.floor(new Date(end).getTime() / 1_000),
    };
    const invalid = validateAdminRoundSchedule(schedule, testMode);
    if (invalid) return setError(invalid);
    try {
      await onAction("setSchedule", [
        schedule.submissionsOpen,
        schedule.submissionsClose,
        schedule.votingStart,
        schedule.votingEnd,
      ]);
      setSuccess(true);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Scheduling was rejected.",
      );
    }
  }

  return (
    <section
      aria-labelledby="admin-schedule-title"
      className="rounded-[16px] border bg-white p-5"
    >
      <h3 id="admin-schedule-title" className="heading-6">
        Submission and review schedule
      </h3>
      <p className="mt-1 text-content-secondary paragraph-sm">
        After sealing the prize vault, admins can set or change this schedule
        until submissions open.
      </p>
      {!sealed ? (
        <RoundsStatus kind="info">
          Seal the fully funded prize vault before setting the schedule.
        </RoundsStatus>
      ) : openingPassed ? (
        <RoundsStatus kind="info">
          Submissions have opened. This schedule can no longer be changed.
        </RoundsStatus>
      ) : !isAdmin ? (
        <RoundsStatus kind="info">
          Only a round admin can set the schedule.
        </RoundsStatus>
      ) : (
        <form onSubmit={submit} className="mt-4 grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {(
              [
                ["Submissions open", open, setOpen],
                ["Submissions close / review starts", close, setClose],
                ["Voting starts", vote, setVote],
                ["Voting ends", end, setEnd],
              ] as const
            ).map(([label, value, update]) => (
              <label key={label} className="grid gap-2 label-sm">
                <span>{label}</span>
                <Input
                  required
                  type="datetime-local"
                  value={value}
                  onChange={(event) => update(event.target.value)}
                />
              </label>
            ))}
          </div>
          <p className="text-content-secondary paragraph-sm">
            {testMode
              ? "Test mode requires exactly five minutes each for submissions, moderation review, and voting."
              : "Submissions must open in the future. The moderation review interval must be positive."}
          </p>
          {error && <RoundsStatus kind="error">{error}</RoundsStatus>}
          {success && (
            <RoundsStatus kind="success">
              Schedule confirmed onchain.
            </RoundsStatus>
          )}
          <Button type="submit" disabled={isPending}>
            {isPending
              ? "Confirming…"
              : round.scheduleConfigured
                ? "Update schedule"
                : "Set schedule"}
          </Button>
        </form>
      )}
    </section>
  );
}
