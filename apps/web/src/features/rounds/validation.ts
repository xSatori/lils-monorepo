export function resolveContentUri(uri: string): string {
  if (uri.startsWith("ipfs://")) return `https://ipfs.io/ipfs/${uri.slice(7)}`;
  if (uri.startsWith("ar://")) return `https://arweave.net/${uri.slice(5)}`;
  try {
    const parsed = new URL(uri);
    return parsed.protocol === "https:" || parsed.protocol === "http:"
      ? parsed.toString()
      : "about:blank";
  } catch {
    return "about:blank";
  }
}

export function resolveImageUri(uri: string): string {
  const cid = /^ipfs:\/\/([A-Za-z0-9]+)$/.exec(uri)?.[1];
  return cid
    ? `/api/rounds/uploads/image?cid=${encodeURIComponent(cid)}`
    : resolveContentUri(uri);
}

export const isContentAddressedUri = (uri: string) =>
  uri.startsWith("ipfs://") || uri.startsWith("ar://");

export type RoundSchedule = {
  submissionsOpen: number;
  submissionsClose: number;
  votingStart: number;
  votingEnd: number;
};

export const TEST_PHASE_SECONDS = 5 * 60;
export const PRODUCTION_REVIEW_SECONDS = 24 * 60 * 60;

export function getDefaultRoundSchedule(
  nowSeconds: number,
  testMode: boolean,
): RoundSchedule {
  const submissionsOpen = nowSeconds + (testMode ? 2 * 60 : 60 * 60);
  const submissionsClose =
    submissionsOpen + (testMode ? TEST_PHASE_SECONDS : 7 * 24 * 60 * 60);
  const votingStart =
    submissionsClose +
    (testMode ? TEST_PHASE_SECONDS : PRODUCTION_REVIEW_SECONDS);
  const votingEnd =
    votingStart + (testMode ? TEST_PHASE_SECONDS : 7 * 24 * 60 * 60);
  return { submissionsOpen, submissionsClose, votingStart, votingEnd };
}

export function validateRoundSchedule(
  schedule: RoundSchedule,
  testMode: boolean,
  nowSeconds = Math.floor(Date.now() / 1000),
): string | undefined {
  const values = Object.values(schedule);
  if (values.some((value) => !Number.isSafeInteger(value) || value < 0)) {
    return "Schedule values must be valid whole-second timestamps.";
  }
  if (
    !(
      schedule.submissionsOpen < schedule.submissionsClose &&
      schedule.submissionsClose < schedule.votingStart &&
      schedule.votingStart < schedule.votingEnd
    )
  ) {
    return "Schedule must be ordered: submissions open, submissions close, moderation review, voting starts, voting ends.";
  }
  if (schedule.votingEnd <= nowSeconds) {
    return "Voting must end in the future.";
  }
  if (
    testMode &&
    (schedule.submissionsClose - schedule.submissionsOpen !==
      TEST_PHASE_SECONDS ||
      schedule.votingStart - schedule.submissionsClose !== TEST_PHASE_SECONDS ||
      schedule.votingEnd - schedule.votingStart !== TEST_PHASE_SECONDS)
  ) {
    return "Test-mode submissions, moderation review, and voting must each last exactly five minutes.";
  }
}

export function validateAdminRoundSchedule(
  schedule: RoundSchedule,
  testMode: boolean,
  nowSeconds = Math.floor(Date.now() / 1000),
): string | undefined {
  if (schedule.submissionsOpen <= nowSeconds)
    return "Submissions must open in the future.";
  return validateRoundSchedule(schedule, testMode, nowSeconds);
}

export function validateSubmissionText(
  metadata: { title: string; description: string },
  limits: {
    minTitleLength: number;
    maxTitleLength: number;
    minDescriptionLength: number;
    maxDescriptionLength: number;
  },
): string | undefined {
  const titleLength = new TextEncoder().encode(metadata.title).length;
  const descriptionLength = new TextEncoder().encode(
    metadata.description,
  ).length;
  if (
    titleLength < limits.minTitleLength ||
    titleLength > limits.maxTitleLength
  ) {
    return `Title must be ${limits.minTitleLength}-${limits.maxTitleLength} UTF-8 bytes.`;
  }
  if (
    descriptionLength < limits.minDescriptionLength ||
    descriptionLength > limits.maxDescriptionLength
  ) {
    return `Description must be ${limits.minDescriptionLength}-${limits.maxDescriptionLength} UTF-8 bytes.`;
  }
}
