import { LifecycleState } from "./types";

export function roundDetailVisibility(lifecycleState: LifecycleState) {
  return {
    showSubmissionEntry: lifecycleState === LifecycleState.SubmissionsOpen,
    showVotingPanel: lifecycleState === LifecycleState.VotingOpen,
  };
}

export function canOpenRoundAdmin({
  account,
  isGlobalAdmin,
  isRoundAdmin,
}: {
  account?: string;
  isGlobalAdmin: boolean;
  isRoundAdmin: boolean;
}) {
  return Boolean(account && (isGlobalAdmin || isRoundAdmin));
}
