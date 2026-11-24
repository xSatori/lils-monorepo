import { configuredRoundsUploadBase } from "./upload-service";
import { useManualPins, ManualPinFiles } from "./ManualPinFiles";
import { pinFiles } from "./manual-pins";
import { useMemo, useState, type FormEvent } from "react";
import { type Address, type Hex } from "viem";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import { validateSubmissionText } from "./metadata";
import {
  parseYouTubeUrls,
  committedSubmissionIdFromLogs,
  pinCommittedSubmission,
  prepareDeterministicSubmission,
  prepareHostedSubmission,
  type DeterministicSubmissionBuild,
  validateImageFiles,
} from "./media";
import { SubmissionMediaUpload } from "./SubmissionMediaUpload";
import { RoundsStatus } from "./RoundsStatus";
import { resolveEnsAddress } from "@/utils/ensResolution";
import {
  LifecycleState,
  SubmissionStatus,
  SubmissionType,
  statusLabels,
  type RoundView,
} from "./types";

export type RoundActionName =
  | "submit"
  | "moderateSubmission"
  | "grantRoundAdmin"
  | "revokeRoundAdmin"
  | "captureSnapshot"
  | "castVotes"
  | "finalize"
  | "finalizeBatch"
  | "archive"
  | "appendSubmissionImage"
  | "setSchedule";
export type RoundActionReceipt = {
  transactionHash: Hex;
  logs: readonly {
    address: Address;
    data: Hex;
    topics: readonly Hex[];
  }[];
};
export type RoundAction = (
  name: RoundActionName,
  args?: readonly unknown[],
) => Promise<RoundActionReceipt | void>;

type Common = { round: RoundView; isPending: boolean; onAction: RoundAction };

export function SubmissionPanel({
  round,
  isPending,
  onAction,
  account,
  chainId,
  signMessage,
}: Common & {
  account?: Address;
  chainId: number;
  signMessage?: (message: string) => Promise<Hex>;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const type = SubmissionType.Project;
  const [error, setError] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [youtubeLinks, setYouTubeLinks] = useState("");
  const manual = useManualPins();
  const sponsored = Boolean(configuredRoundsUploadBase());
  const [uploadStatus, setUploadStatus] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [commitLocked, setCommitLocked] = useState(false);
  const [pendingPin, setPendingPin] = useState<{
    submissionId: bigint;
    prepared: DeterministicSubmissionBuild;
  }>();
  const open = round.lifecycleState === LifecycleState.SubmissionsOpen;

  async function pinPreparedSubmission(
    submissionId: bigint,
    prepared: DeterministicSubmissionBuild,
  ) {
    setIsUploading(true);
    setError("");
    try {
      await pinCommittedSubmission({
        chainId,
        round: round.round,
        submissionId,
        prepared,
        onStatus: setUploadStatus,
      });
      setPendingPin(undefined);
      setCommitLocked(false);
      setFiles([]);
      setTitle("");
      setDescription("");
      setYouTubeLinks("");
    } catch (cause) {
      setPendingPin({ submissionId, prepared });
      setError(
        `Submission #${submissionId.toString()} is confirmed onchain, but its exact media is not yet pinned. ${
          cause instanceof Error
            ? cause.message
            : "Retry the same recovery bundle."
        } Do not create another submission.`,
      );
    } finally {
      setIsUploading(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setUploadStatus("");
    const textError = validateSubmissionText({ title, description }, round);
    if (textError) return setError(textError);
    try {
      let metadataUri: string;
      let metadataHash: Hex;
      let originalImageCount = 0;
      let deterministic: DeterministicSubmissionBuild | undefined;
      if (!account) {
        return setError(
          "Connect a wallet on this app’s configured network to submit.",
        );
      }
      const fileError = validateImageFiles(files);
      if (fileError) return setError(fileError);
      const youtubeUrls = parseYouTubeUrls(youtubeLinks);
      setIsUploading(true);
      if (round.implementationVersion >= 5 || !sponsored) {
        setUploadStatus(
          "Building deterministic content IDs before the transaction…",
        );
        deterministic = await prepareDeterministicSubmission({
          files,
          title,
          description,
          youtubeUrls,
        });
        metadataUri = deterministic.uri;
        metadataHash = deterministic.hash;
        originalImageCount = deterministic.originalImageCount;
      } else {
        if (!signMessage) {
          return setError(
            "This historical round requires a wallet upload signature.",
          );
        }
        const hosted = await prepareHostedSubmission({
          wallet: account,
          round: round.round,
          chainId,
          files,
          title,
          description,
          youtubeUrls,
          signMessage,
          onStatus: setUploadStatus,
        });
        metadataUri = hosted.uri;
        metadataHash = hosted.hash;
        originalImageCount = files.length;
      }
      if (!sponsored && deterministic && !(await manual.prepareOrVerify(pinFiles(deterministic)))) {
        setUploadStatus("The entry files are ready to pin.");
        return;
      }
      const receipt = await onAction(
        "submit",
        round.implementationVersion >= 5
          ? [
              {
                submissionType: type,
                title,
                description,
                metadataURI: metadataUri,
                metadataHash,
                originalImageCount,
              },
            ]
          : [type, title, description, metadataUri, metadataHash],
      );
      if (!sponsored) {
        manual.clear();
        setFiles([]); setTitle(""); setDescription(""); setYouTubeLinks("");
        setUploadStatus("Submission confirmed.");
      } else if (deterministic) {
        setCommitLocked(true);
        if (!receipt) {
          throw new Error(
            "The confirmed submission receipt is unavailable for media recovery.",
          );
        }
        const submissionId = committedSubmissionIdFromLogs({
          logs: receipt.logs,
          round: round.round,
          metadataHash: deterministic.hash,
        });
        setPendingPin({ submissionId, prepared: deterministic });
        await pinPreparedSubmission(submissionId, deterministic);
      }
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Submission was rejected.",
      );
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <section
      aria-labelledby="submit-title"
      className="rounded-[16px] border bg-white p-5"
    >
      <h2 id="submit-title" className="heading-6">
        Submit an entry
      </h2>
      <p className="mt-1 text-content-secondary paragraph-sm">
        Add a title, description, and any images for your entry. It will be
        included automatically unless an admin removes it before voting.
      </p>
      <form onSubmit={submit} className="mt-4 grid gap-4">
        <label className="grid gap-2 label-sm">
          Title ({round.minTitleLength}-{round.maxTitleLength} characters)
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="grid gap-2 label-sm">
          Description ({round.minDescriptionLength}-{round.maxDescriptionLength}{" "}
          characters)
          <Textarea
            className="min-h-28 rounded-xl border-2 text-base"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <SubmissionMediaUpload
          commitFirst={round.implementationVersion >= 5}
          files={files}
          onFilesChange={setFiles}
          youtubeLinks={youtubeLinks}
          onYouTubeLinksChange={setYouTubeLinks}
        />
        {!open && (
          <RoundsStatus kind="info">
            {round.lifecycleState === LifecycleState.ModerationPending
              ? "Submissions are closed. Round admins are reviewing entries before voting starts."
              : "Submissions are not currently open."}
          </RoundsStatus>
        )}
        {error && <RoundsStatus kind="error">{error}</RoundsStatus>}
        <ManualPinFiles files={manual.files} />
        {uploadStatus && !error && (
          <RoundsStatus kind={isUploading ? "loading" : "info"}>{uploadStatus}</RoundsStatus>
        )}
        <Button
          type="submit"
          disabled={
            !open ||
            isPending ||
            isUploading ||
            Boolean(pendingPin) ||
            commitLocked
          }
          aria-disabled={commitLocked || undefined}
        >
          {isPending
            ? "Submitting onchain…"
            : isUploading
              ? "Preparing metadata…"
              : !sponsored && !manual.files.length ? "Prepare entry files" : "Submit entry"}
        </Button>
        {commitLocked && !pendingPin && error && (
          <RoundsStatus kind="info">
            The onchain commitment is confirmed. This form remains locked to
            prevent an accidental duplicate submission; use the confirmed
            transaction evidence to recover the exact pin.
          </RoundsStatus>
        )}
        {pendingPin && (
          <Button
            type="button"
            variant="secondary"
            disabled={isUploading}
            onClick={() =>
              pinPreparedSubmission(
                pendingPin.submissionId,
                pendingPin.prepared,
              )
            }
          >
            Retry exact pin for submission #{pendingPin.submissionId.toString()}
          </Button>
        )}
      </form>
    </section>
  );
}

export function AdminPanel({
  round,
  isPending,
  onAction,
  account,
  isAdmin,
}: Common & { account?: string; isAdmin: boolean }) {
  const [admin, setAdmin] = useState("");
  const [error, setError] = useState("");
  const [isResolvingAdmin, setIsResolvingAdmin] = useState(false);
  const creator = account?.toLowerCase() === round.creator.toLowerCase();
  const moderationOpen = Date.now() / 1000 < round.votingStart;

  async function adminAction(name: "grantRoundAdmin" | "revokeRoundAdmin") {
    setError("");
    const input = admin.trim();
    if (!input) return setError("Enter an admin wallet address or ENS name.");
    setIsResolvingAdmin(true);
    try {
      const address = await resolveEnsAddress(input);
      await onAction(name, [address]);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not update this admin.",
      );
    } finally {
      setIsResolvingAdmin(false);
    }
  }

  if (!isAdmin && !creator) return null;
  return (
    <section
      aria-labelledby="admin-title"
      className="rounded-[16px] border bg-white p-5"
    >
      <h2 id="admin-title" className="heading-6">
        Round administration
      </h2>
      <p className="mt-1 text-content-secondary paragraph-sm">
        Moderation remains available through the review buffer and freezes when
        voting starts. New v4 entries begin approved; use reject or hide only
        when moderation requires it. Only the creator can manage round admins.
      </p>
      {creator && (
        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <Input
            aria-label="Round admin wallet address or ENS name"
            value={admin}
            onChange={(e) => setAdmin(e.target.value)}
            placeholder="0x… or name.eth"
          />
          <Button
            type="button"
            disabled={isPending || isResolvingAdmin}
            onClick={() => adminAction("grantRoundAdmin")}
          >
            {isResolvingAdmin ? "Resolving…" : "Add admin"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={isPending || isResolvingAdmin}
            onClick={() => adminAction("revokeRoundAdmin")}
          >
            Remove
          </Button>
        </div>
      )}
      <ul className="mt-5 grid gap-3" aria-label="Submission moderation">
        {round.submissions.map((submission) => (
          <li
            key={submission.id.toString()}
            className="flex flex-col gap-3 rounded-xl bg-background-ternary p-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <span className="paragraph-sm">
              #{submission.id.toString()} ·{" "}
              {submission.metadata?.title || "Content unavailable"} ·{" "}
              {statusLabels[submission.status]}
            </span>
            <div className="flex flex-wrap gap-2">
              {[
                SubmissionStatus.Approved,
                SubmissionStatus.Rejected,
                SubmissionStatus.Hidden,
              ].map((status) => (
                <Button
                  key={status}
                  type="button"
                  size="icon-slim"
                  variant="secondary"
                  disabled={
                    !moderationOpen || isPending || submission.status === status
                  }
                  onClick={() =>
                    onAction("moderateSubmission", [submission.id, status])
                  }
                >
                  {statusLabels[status]}
                </Button>
              ))}
            </div>
          </li>
        ))}
      </ul>
      {!moderationOpen && (
        <div className="mt-4">
          <RoundsStatus kind="info">
            The eligible submission set is frozen.
          </RoundsStatus>
        </div>
      )}
      {error && (
        <div className="mt-4">
          <RoundsStatus kind="error">{error}</RoundsStatus>
        </div>
      )}
    </section>
  );
}

export function VotingPanel({
  round,
  account,
  remainingVotes,
  isPending,
  onAction,
}: Common & { account?: string; remainingVotes: bigint }) {
  const eligible = round.submissions.filter(
    (submission) => submission.status === SubmissionStatus.Approved,
  );
  const [allocations, setAllocations] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const isOpen =
    round.lifecycleState === LifecycleState.VotingOpen &&
    round.snapshotCaptured;
  const total = useMemo(
    () =>
      Object.values(allocations).reduce(
        (sum, value) => sum + BigInt(value || 0),
        0n,
      ),
    [allocations],
  );

  async function vote(event: FormEvent) {
    event.preventDefault();
    setError("");
    const entries = Object.entries(allocations).filter(
      ([, value]) => BigInt(value || 0) > 0n,
    );
    if (!entries.length) return setError("Allocate at least one vote.");
    if (total > remainingVotes)
      return setError(
        `Allocation exceeds your ${remainingVotes.toString()} remaining votes.`,
      );
    if (
      entries.some(([, value]) => BigInt(value) > round.maxVotesPerSubmission)
    )
      return setError(
        `An entry cannot receive more than ${round.maxVotesPerSubmission.toString()} votes from one wallet.`,
      );
    try {
      await onAction("castVotes", [
        entries.map(([id]) => BigInt(id)),
        entries.map(([, amount]) => BigInt(amount)),
      ]);
      setAllocations({});
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Vote was rejected.");
    }
  }

  return (
    <section
      aria-labelledby="vote-title"
      className="rounded-[16px] border bg-white p-5"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="vote-title" className="heading-6">
          Allocate votes
        </h2>
        <p className="label-md">{remainingVotes.toString()} remaining</p>
      </div>
      {!round.snapshotCaptured && (
        <div className="mt-4">
          <RoundsStatus kind="info">
            {round.implementationVersion >= 8
              ? "The creation-time voting snapshot is unavailable. Voting cannot proceed; contact a round admin."
              : "Snapshot pending. Voting remains unavailable until anyone captures the immutable snapshot."}
          </RoundsStatus>
        </div>
      )}
      {round.implementationVersion >= 8 && (
        <p className="mt-3 text-content-secondary paragraph-sm">
          Voting power was fixed at round creation. Later acquisitions or
          delegations do not add power to this round. Self-voting is blocked
          only for the submission owner wallet.
        </p>
      )}
      <form className="mt-4 grid gap-3" onSubmit={vote}>
        {eligible.map((submission) => {
          const self =
            account?.toLowerCase() === submission.owner.toLowerCase();
          return (
            <label
              key={submission.id.toString()}
              className="grid grid-cols-[1fr_110px] items-center gap-3 rounded-xl bg-background-ternary p-3"
            >
              <span>
                <span className="block font-semibold">
                  {submission.metadata?.title || `Submission #${submission.id}`}
                </span>
                <span className="text-content-secondary paragraph-sm">
                  {submission.votes.toString()} total votes
                  {self ? " · Your submission" : ""}
                </span>
              </span>
              <Input
                aria-label={`Votes for submission ${submission.id}`}
                type="number"
                min="0"
                max={round.maxVotesPerSubmission.toString()}
                disabled={self || !isOpen}
                value={allocations[submission.id.toString()] || ""}
                onChange={(e) =>
                  setAllocations((current) => ({
                    ...current,
                    [submission.id.toString()]: e.target.value,
                  }))
                }
              />
            </label>
          );
        })}
        {!eligible.length && (
          <RoundsStatus kind="info">
            No approved submissions are eligible to receive votes.
          </RoundsStatus>
        )}
        {error && <RoundsStatus kind="error">{error}</RoundsStatus>}
        <Button
          type="submit"
          disabled={!isOpen || !eligible.length || isPending}
        >
          {isPending
            ? "Confirming…"
            : `Cast ${total.toString()} additive votes`}
        </Button>
      </form>
    </section>
  );
}

export function LifecycleActions({ round, isPending, onAction }: Common) {
  const now = Date.now() / 1000;
  const isV8 = round.implementationVersion >= 8;
  const processed = round.finalizationCursor ?? 0n;
  const total = BigInt(round.submissions?.length ?? 0);
  const remaining = total > processed ? total - processed : 0n;
  const batchSize = total === 0n ? 50n : remaining < 50n ? remaining : 50n;
  return (
    <div className="flex flex-col items-center gap-3">
      {!isV8 &&
        !round.snapshotCaptured &&
        now >= round.votingStart &&
        now < round.votingEnd && (
          <Button
            type="button"
            disabled={isPending}
            onClick={() => onAction("captureSnapshot")}
          >
            Capture voting snapshot
          </Button>
        )}
      {isV8 &&
        round.lifecycleState === LifecycleState.Ended &&
        !round.finalized && (
          <div className="w-full max-w-md text-center" aria-live="polite">
            <p className="text-content-secondary paragraph-sm">
              {processed.toString()} of {total.toString()} submissions processed
            </p>
            <div
              role="progressbar"
              aria-label="Finalization progress"
              aria-valuemin={0}
              aria-valuemax={Number(total)}
              aria-valuenow={Number(processed)}
              className="mt-2 h-2 overflow-hidden rounded-full bg-background-secondary"
            >
              <div
                className="h-full bg-semantic-positive"
                style={{
                  width: `${total > 0n ? Number((processed * 100n) / total) : 0}%`,
                }}
              />
            </div>
            <Button
              type="button"
              disabled={isPending || batchSize === 0n}
              onClick={() => onAction("finalizeBatch", [batchSize])}
              className="mt-3"
            >
              {isPending
                ? "Confirming batch…"
                : processed > 0n
                  ? "Continue finalization"
                  : "Start finalization"}
            </Button>
          </div>
        )}
      {!isV8 &&
        round.lifecycleState === LifecycleState.Ended &&
        !round.finalized && (
          <Button
            type="button"
            disabled={isPending}
            onClick={() => onAction("finalize")}
          >
            Finalize deterministic results
          </Button>
        )}
    </div>
  );
}

export function ArchiveRoundAction({
  round,
  isPending,
  onAction,
  isAdmin,
}: Common & { isAdmin: boolean }) {
  if (!round.finalized || !isAdmin || round.archived) return null;
  return (
    <section className="rounded-[16px] border bg-white p-5">
      <h3 className="heading-6">Round archive</h3>
      <p className="mt-1 text-content-secondary paragraph-sm">
        Archiving changes the round label after finalization. It does not alter
        submissions, votes, prizes, or deterministic results.
      </p>
      <Button
        className="mt-4"
        type="button"
        variant="secondary"
        disabled={isPending}
        onClick={() => onAction("archive")}
      >
        Archive round
      </Button>
    </section>
  );
}
