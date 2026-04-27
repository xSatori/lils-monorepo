import { RoundState } from "./types";

export function getRoundState(props: {
  start: Date | string;
  votingStart: Date | string;
  end: Date | string;
}): RoundState {
  const now = new Date().getTime();
  const roundStart = new Date(props.start).getTime();
  const votingStart = new Date(props.votingStart).getTime();
  const roundEnd = new Date(props.end).getTime();

  if (now < roundStart) return "Upcoming";
  if (now < votingStart) return "Proposing";
  if (now < roundEnd) return "Voting";
  return "Ended";
}

export function getRoundTargetDate(round: {
  start: string;
  votingStart: string;
  end: string;
}) {
  const state = getRoundState(round);

  if (state === "Upcoming") return new Date(round.start);
  if (state === "Proposing") return new Date(round.votingStart);
  return new Date(round.end);
}
