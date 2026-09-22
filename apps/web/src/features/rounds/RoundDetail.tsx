import { useEffect, useState } from "react";
import type { Address, Hex } from "viem";
import {
  ArrowLeft,
  ExternalLink,
  FilePlus2,
  Settings,
  ShieldCheck,
  X,
} from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";

import { Button } from "@/components/ui/button";
import Dialog from "@/components/ui/dialog";
import { resolveContentUri } from "./metadata";
import { isContentAddressedUri, resolveImageUri } from "./validation";
import { isYouTubeUrl } from "./media";
import {
  LifecycleActions,
  VotingPanel,
  type RoundAction,
} from "./RoundActions";
import { RoundAdminDialog } from "./RoundAdminDialog";
import { canOpenRoundAdmin, roundDetailVisibility } from "./round-detail-ui";
import { RoundsStatus, shortenAddress } from "./RoundsStatus";
import { RoundSubmissionDialog } from "./RoundSubmissionDialog";
import { RoundTimeline } from "./RoundTimeline";
import {
  type PrizeAssetApproval,
  type PrizeClaimTo,
  type PrizeVaultAction,
} from "./PrizeVaultPanel";
import {
  LifecycleState,
  PrizeVaultState,
  SubmissionStatus,
  lifecycleLabels,
  statusLabels,
  strategyLabels,
  type RoundView,
} from "./types";

export function submissionVoteHistory(round: RoundView, submissionId: bigint) {
  return round.voteActivity
    .map((vote, index) => ({ vote, index }))
    .filter(({ vote }) => vote.submissionId === submissionId)
    .sort(
      (a, b) =>
        Number((b.vote.blockNumber ?? 0n) - (a.vote.blockNumber ?? 0n)) ||
        b.vote.logIndex - a.vote.logIndex ||
        b.index - a.index,
    )
    .map(({ vote }) => vote);
}

type SubmissionMediaItem = {
  uri: string;
  type: "image" | "video" | "audio";
  alt?: string;
  poster?: string;
  adminAdded: boolean;
  signerA?: Address;
  signerB?: Address;
  revision?: bigint;
};

function submissionMedia(
  submission: RoundView["submissions"][number],
): SubmissionMediaItem[] {
  const metadata = submission.metadata;
  const legacyImages = (metadata?.images || []).map((uri) => ({
    uri,
    type: "image" as const,
    alt: metadata?.title,
    adminAdded: false,
  }));
  const richMedia = (metadata?.media || []).map((item) => ({
    ...item,
    adminAdded: false,
  }));
  const adminAdded = submission.adminAddedImages.map((image) => ({
    uri: image.uri,
    type: "image" as const,
    alt: `${metadata?.title || "Submission"} admin-added image`,
    adminAdded: true,
    signerA: image.signerA,
    signerB: image.signerB,
    revision: image.revision,
  }));
  return [...legacyImages, ...richMedia, ...adminAdded]
    .filter((item) => isContentAddressedUri(item.uri))
    .slice(0, 8);
}

export function RoundDetail({
  round,
  chainId,
  testMode,
  account,
  voter,
  isPending,
  onAction,
  onVaultAction,
  onApprovePrizeAsset,
  onClaimPrizeTo,
  signMessage,
  signTypedData,
  isGlobalAdmin = false,
  canApproveMedia = false,
}: {
  round: RoundView;
  chainId: number;
  testMode: boolean;
  account?: Address;
  voter?: {
    usedVotes: bigint;
    votingLimit: bigint;
    remainingVotes: bigint;
    isRoundAdmin: boolean;
  };
  isPending: boolean;
  onAction: RoundAction;
  onVaultAction?: PrizeVaultAction;
  onApprovePrizeAsset?: PrizeAssetApproval;
  onClaimPrizeTo?: PrizeClaimTo;
  signMessage?: (message: string) => Promise<Hex>;
  signTypedData?: (data: import("viem").TypedDataDefinition) => Promise<Hex>;
  isGlobalAdmin?: boolean;
  canApproveMedia?: boolean;
}) {
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [isSubmissionOpen, setIsSubmissionOpen] = useState(false);
  const [selectedSubmissionId, setSelectedSubmissionId] = useState<bigint>();
  const [searchParams, setSearchParams] = useSearchParams();
  const promptFunding = searchParams.get("admin") === "1";
  const etherscanBaseUrl =
    chainId === 1
      ? "https://etherscan.io"
      : chainId === 11155111
        ? "https://sepolia.etherscan.io"
        : undefined;
  const isRoundAdmin = Boolean(voter?.isRoundAdmin);
  const visibility = roundDetailVisibility(round.lifecycleState);
  const showAdmin = canOpenRoundAdmin({
    account,
    isGlobalAdmin,
    isRoundAdmin:
      isRoundAdmin || account?.toLowerCase() === round.creator.toLowerCase(),
  });
  const prizesReady =
    round.implementationVersion < 3 ||
    round.prizeVault?.state === PrizeVaultState.Sealed;
  const schedulePending =
    round.implementationVersion >= 6 && !round.scheduleConfigured;
  useEffect(() => {
    if (promptFunding && showAdmin) setIsAdminOpen(true);
  }, [promptFunding, showAdmin]);
  function closeAdmin() {
    setIsAdminOpen(false);
    if (promptFunding) {
      const next = new URLSearchParams(searchParams);
      next.delete("admin");
      setSearchParams(next, { replace: true });
    }
  }
  const winnerSet = new Set(round.winners.map(String));
  const selectedSubmission = round.submissions.find(
    (submission) => submission.id === selectedSubmissionId,
  );
  const selectedVotes = selectedSubmission
    ? submissionVoteHistory(round, selectedSubmission.id)
    : [];
  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 px-4 py-8 md:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          to="/rounds"
          className="flex min-h-11 w-fit items-center gap-2 rounded-xl px-2 font-semibold hover:bg-background-secondary focus-visible:ring-2"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          All rounds
        </Link>
        <div className="flex flex-wrap justify-end gap-2">
          <span className="rounded-full bg-background-secondary px-3 py-1 label-sm">
            {schedulePending
              ? "Schedule not set"
              : !prizesReady &&
                  round.lifecycleState === LifecycleState.SubmissionsOpen
                ? "Prize funding required"
                : lifecycleLabels[round.lifecycleState]}
          </span>
          {testMode && (
            <span className="rounded-full bg-yellow-100 px-3 py-1 text-yellow-950 label-sm">
              Sepolia test mode
            </span>
          )}
        </div>
      </div>
      <header className="overflow-hidden rounded-[24px] border-2 border-border-primary bg-white">
        {round.metadata?.image && (
          <img
            src={resolveImageUri(round.metadata.image)}
            alt=""
            className="max-h-[360px] w-full bg-background-ternary object-cover"
          />
        )}
        <div className="flex flex-col gap-5 p-5 md:p-8">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h1 className="heading-3">
                {round.metadata?.title ||
                  `Onchain Round ${shortenAddress(round.round)}`}
              </h1>
              <div className="flex flex-wrap justify-end gap-2">
                {visibility.showSubmissionEntry && prizesReady && (
                  <Button
                    type="button"
                    onClick={() => setIsSubmissionOpen(true)}
                  >
                    <FilePlus2 className="mr-2 h-4 w-4" aria-hidden="true" />
                    Submit entry
                  </Button>
                )}
                {showAdmin && (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setIsAdminOpen(true)}
                  >
                    <Settings className="mr-2 h-4 w-4" aria-hidden="true" />
                    Admin
                  </Button>
                )}
              </div>
            </div>
            <p className="mt-3 max-w-[800px] text-content-secondary paragraph-md">
              {round.metadata?.description ||
                "Rich content could not be loaded. The lifecycle, submissions, votes, and results below come directly from the contract."}
            </p>
          </div>
          {round.contentError && (
            <RoundsStatus kind="error">
              Content unavailable: {round.contentError} Authoritative onchain
              state is still shown.
            </RoundsStatus>
          )}
          {!prizesReady && (
            <RoundsStatus kind="info">
              {round.prizeVault?.state === PrizeVaultState.Canceled
                ? "The prize vault was canceled. This round cannot accept submissions."
                : "Prize funding is incomplete. Fund every prize and seal the vault before submissions can be accepted."}
            </RoundsStatus>
          )}
          {schedulePending && (
            <RoundsStatus kind="info">
              The round has no start date yet. After the prize vault is funded
              and sealed, an admin can set the submission and review schedule.
            </RoundsStatus>
          )}
          {round.lifecycleState === LifecycleState.ModerationPending && (
            <RoundsStatus kind="info">
              <strong>Moderation review is active.</strong> Submissions are
              closed, admins may finish reviewing pending entries, and voting
              opens when this buffer ends.
            </RoundsStatus>
          )}
          {!schedulePending && <RoundTimeline round={round} />}
          <LifecycleActions
            round={round}
            isPending={isPending}
            onAction={onAction}
          />
        </div>
      </header>

      <section
        aria-labelledby="rules-title"
        className="rounded-[16px] border bg-white p-5"
      >
        <h2 id="rules-title" className="heading-6">
          Onchain rules
        </h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-content-secondary label-sm">Strategy</dt>
            <dd className="mt-1 paragraph-sm">
              {strategyLabels[round.votingStrategy]}
            </dd>
          </div>
          <div>
            <dt className="text-content-secondary label-sm">Entry vote cap</dt>
            <dd className="mt-1 paragraph-sm">
              {round.maxVotesPerSubmission.toString()}
            </dd>
          </div>
          <div>
            <dt className="text-content-secondary label-sm">Submissions</dt>
            <dd className="mt-1 paragraph-sm">
              {round.submissions.length}/{round.maxSubmissions} ·{" "}
              {round.maxSubmissionsPerWallet} per wallet
            </dd>
          </div>
          <div>
            <dt className="text-content-secondary label-sm">
              Your voting power
            </dt>
            <dd className="mt-1 paragraph-sm">
              {account
                ? `${voter?.usedVotes.toString() || "0"} used / ${voter?.votingLimit.toString() || "0"} total`
                : "Connect wallet"}
            </dd>
          </div>
          <div>
            <dt className="text-content-secondary label-sm">Creator</dt>
            <dd className="mt-1 font-mono text-sm">
              {etherscanBaseUrl ? (
                <a
                  href={`${etherscanBaseUrl}/address/${round.creator}`}
                  target="_blank"
                  rel="noreferrer"
                  className="underline"
                >
                  {shortenAddress(round.creator)}
                  <span className="sr-only"> (view creator on Etherscan)</span>
                </a>
              ) : (
                shortenAddress(round.creator)
              )}
            </dd>
          </div>
          <div>
            <dt className="text-content-secondary label-sm">Contract</dt>
            <dd className="mt-1 font-mono text-sm">
              {etherscanBaseUrl ? (
                <a
                  href={`${etherscanBaseUrl}/address/${round.round}`}
                  target="_blank"
                  rel="noreferrer"
                  className="underline"
                >
                  {shortenAddress(round.round)}
                  <span className="sr-only">
                    {" "}
                    (view round contract on Etherscan)
                  </span>
                </a>
              ) : (
                shortenAddress(round.round)
              )}
            </dd>
          </div>
          <div>
            <dt className="text-content-secondary label-sm">Prize vault</dt>
            <dd className="mt-1 font-mono text-sm">
              {round.prizeVault && etherscanBaseUrl ? (
                <a
                  href={`${etherscanBaseUrl}/address/${round.prizeVault.address}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 underline"
                >
                  {shortenAddress(round.prizeVault.address)}
                  <ExternalLink className="h-4 w-4" aria-hidden="true" />
                </a>
              ) : round.prizeVault ? (
                shortenAddress(round.prizeVault.address)
              ) : (
                "No prize vault"
              )}
            </dd>
          </div>
        </dl>
      </section>

      <section aria-labelledby="entries-title">
        <div className="mb-4">
          <h2 id="entries-title" className="heading-5">
            Submissions
          </h2>
        </div>
        {!round.submissions.length ? (
          <RoundsStatus kind="info">
            No submissions have been created.
          </RoundsStatus>
        ) : (
          <ul className="grid gap-4 md:grid-cols-2">
            {[...round.submissions]
              .sort((a, b) => Number(b.votes - a.votes) || Number(a.id - b.id))
              .map((submission) => {
                const thumbnail = submissionMedia(submission).find(
                  (item) => item.type === "image",
                );
                return (
                  <li
                    key={submission.id.toString()}
                    className={`overflow-hidden rounded-[16px] border-2 bg-white ${winnerSet.has(submission.id.toString()) ? "border-semantic-positive" : "border-border-primary"}`}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedSubmissionId(submission.id)}
                      aria-label={`View submission ${submission.id.toString()}: ${submission.metadata?.title || "Content unavailable"}`}
                      className="relative block w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-black"
                    >
                      {thumbnail && (
                        <img
                          src={resolveImageUri(thumbnail.uri)}
                          alt=""
                          loading="lazy"
                          className="h-44 w-full bg-background-ternary object-cover"
                        />
                      )}
                      <span
                        aria-label={`${submission.votes.toString()} votes`}
                        className="absolute right-4 top-4 flex h-14 w-14 items-center justify-center rounded-full border-2 border-border-primary bg-white text-sm font-semibold shadow-sm"
                      >
                        {new Intl.NumberFormat("en", {
                          notation: "compact",
                          maximumFractionDigits: 1,
                        }).format(submission.votes)}
                      </span>
                      <span className="block p-5 pr-20">
                        {(submission.status !== SubmissionStatus.Approved ||
                          winnerSet.has(submission.id.toString())) && (
                          <span className="mb-3 flex flex-wrap gap-2">
                            {submission.status !==
                              SubmissionStatus.Approved && (
                              <span className="rounded-full bg-background-secondary px-2 py-1 label-sm">
                                {statusLabels[submission.status]}
                              </span>
                            )}
                            {winnerSet.has(submission.id.toString()) && (
                              <span className="flex items-center gap-1 rounded-full bg-semantic-positive/10 px-2 py-1 text-semantic-positive label-sm">
                                <ShieldCheck
                                  className="h-3 w-3"
                                  aria-hidden="true"
                                />
                                Winner
                              </span>
                            )}
                          </span>
                        )}
                        <span className="flex items-center gap-4">
                          <span className="shrink-0 text-content-secondary heading-6">
                            #{submission.id.toString()}
                          </span>
                          <span className="min-w-0">
                            <span className="block heading-6">
                              {submission.metadata?.title ||
                                "Content unavailable"}
                            </span>
                            <span className="mt-2 block line-clamp-2 text-content-secondary paragraph-sm">
                              {submission.metadata?.description ||
                                submission.contentError ||
                                "Referenced metadata could not be loaded."}
                            </span>
                          </span>
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
          </ul>
        )}
      </section>

      <Dialog
        isOpen={Boolean(selectedSubmission)}
        onRequestClose={() => setSelectedSubmissionId(undefined)}
        width="48rem"
        className="max-h-[90vh] overflow-hidden"
      >
        {({ titleProps }) =>
          selectedSubmission ? (
            <div className="flex max-h-[90vh] flex-col">
              <header className="flex items-start justify-between gap-4 border-b bg-white p-4 md:p-6">
                <div className="min-w-0">
                  <p className="text-content-secondary label-sm">
                    Submission #{selectedSubmission.id.toString()} ·{" "}
                    {selectedSubmission.votes.toString()} votes
                  </p>
                  <h2 {...titleProps} className="mt-1 heading-5">
                    {selectedSubmission.metadata?.title ||
                      "Content unavailable"}
                  </h2>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Close submission details"
                  onClick={() => setSelectedSubmissionId(undefined)}
                >
                  <X className="h-5 w-5" aria-hidden="true" />
                </Button>
              </header>
              <div className="min-h-0 overflow-y-auto p-4 md:p-6">
                <p className="whitespace-pre-wrap text-content-secondary paragraph-md">
                  {selectedSubmission.metadata?.description ||
                    selectedSubmission.contentError ||
                    "Referenced metadata could not be loaded."}
                </p>
                {submissionMedia(selectedSubmission).length > 0 && (
                  <div
                    className="mt-5 grid gap-4"
                    aria-label="Submission media"
                  >
                    {submissionMedia(selectedSubmission).map((item, index) => {
                      const src = resolveContentUri(item.uri);
                      if (item.type === "video") {
                        return (
                          <video
                            key={`${item.uri}-${index}`}
                            controls
                            preload="metadata"
                            poster={
                              item.poster && isContentAddressedUri(item.poster)
                                ? resolveImageUri(item.poster)
                                : undefined
                            }
                            className="max-h-[420px] w-full rounded-xl bg-black"
                          >
                            <source src={src} />
                            This browser cannot play the referenced video.
                          </video>
                        );
                      }
                      if (item.type === "audio") {
                        return (
                          <audio
                            key={`${item.uri}-${index}`}
                            controls
                            preload="metadata"
                            className="w-full"
                          >
                            <source src={src} />
                            This browser cannot play the referenced audio.
                          </audio>
                        );
                      }
                      return (
                        <figure key={`${item.uri}-${index}`}>
                          <img
                            src={resolveImageUri(item.uri)}
                            alt={
                              item.alt ||
                              `${selectedSubmission.metadata?.title || "Submission"} media ${index + 1}`
                            }
                            loading="lazy"
                            className="max-h-[420px] w-full rounded-xl bg-background-ternary object-contain"
                          />
                          {item.adminAdded &&
                            item.signerA &&
                            item.signerB &&
                            item.revision !== undefined && (
                              <figcaption className="mt-1 text-content-secondary paragraph-sm">
                                Admin added · revision{" "}
                                {item.revision.toString()} · approved by{" "}
                                {shortenAddress(item.signerA)} and{" "}
                                {shortenAddress(item.signerB)}
                              </figcaption>
                            )}
                        </figure>
                      );
                    })}
                  </div>
                )}
                {selectedSubmission.metadata?.youtubeUrls?.some(
                  isYouTubeUrl,
                ) && (
                  <section className="mt-5" aria-label="External video links">
                    <h3 className="label-md">External video links</h3>
                    <ul className="mt-2 grid gap-2">
                      {selectedSubmission.metadata.youtubeUrls
                        .filter(isYouTubeUrl)
                        .map((url) => (
                          <li key={url}>
                            <a
                              className="inline-flex min-h-11 items-center gap-2 break-all underline"
                              href={url}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {url}{" "}
                              <ExternalLink
                                className="h-4 w-4 shrink-0"
                                aria-hidden="true"
                              />
                            </a>
                          </li>
                        ))}
                    </ul>
                  </section>
                )}
                <div className="mt-5 flex flex-wrap items-center gap-4 text-sm">
                  <span>
                    Submitted by {shortenAddress(selectedSubmission.owner)}
                  </span>
                  <a
                    href={resolveContentUri(selectedSubmission.metadataURI)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex min-h-11 items-center gap-2 underline"
                  >
                    Open metadata{" "}
                    <ExternalLink className="h-4 w-4" aria-hidden="true" />
                  </a>
                </div>
                <section
                  className="mt-6 border-t pt-5"
                  aria-labelledby="submission-votes-title"
                >
                  <h3 id="submission-votes-title" className="heading-6">
                    Vote history
                  </h3>
                  {round.activityUnavailable && (
                    <p className="mt-2 text-content-secondary paragraph-sm">
                      Vote event history is temporarily unavailable; the onchain
                      vote total above is still authoritative.
                    </p>
                  )}
                  {selectedVotes.length ? (
                    <ol
                      className="mt-3 grid gap-2"
                      aria-label="Votes for this submission, newest first"
                    >
                      {selectedVotes.map((vote, index) => (
                        <li
                          key={`${vote.transactionHash || "vote"}-${vote.logIndex}-${index}`}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-background-ternary p-3 text-sm"
                        >
                          <span className="font-mono">
                            {shortenAddress(vote.voter)}
                          </span>
                          <span>
                            +{vote.amount.toString()} vote
                            {vote.amount === 1n ? "" : "s"}
                          </span>
                          {etherscanBaseUrl && vote.transactionHash && (
                            <a
                              href={`${etherscanBaseUrl}/tx/${vote.transactionHash}`}
                              target="_blank"
                              rel="noreferrer"
                              className="underline"
                            >
                              Transaction{" "}
                              <span className="sr-only">
                                for vote #{index + 1}
                              </span>
                            </a>
                          )}
                        </li>
                      ))}
                    </ol>
                  ) : !round.activityUnavailable ? (
                    <p className="mt-2 text-content-secondary paragraph-sm">
                      No vote events for this submission yet.
                    </p>
                  ) : null}
                </section>
              </div>
            </div>
          ) : null
        }
      </Dialog>

      {visibility.showVotingPanel && (
        <VotingPanel
          round={round}
          account={account}
          remainingVotes={voter?.remainingVotes || 0n}
          isPending={isPending}
          onAction={onAction}
        />
      )}
      <section
        aria-labelledby="activity-title"
        className="rounded-[16px] border bg-white p-5"
      >
        <h2 id="activity-title" className="heading-5">
          Public activity
        </h2>
        <p className="mt-2 text-content-secondary paragraph-sm">
          Rebuilt from contract events. Totals and limits above are hydrated
          directly from contract storage.
        </p>
        {round.activityUnavailable && (
          <div className="mt-4">
            <RoundsStatus kind="error">
              Event activity is unavailable or stale from the current RPC.
              Direct onchain totals, limits, submissions, and results remain
              authoritative above; an empty event view is not proof of no
              activity.
            </RoundsStatus>
          </div>
        )}
        <div className="mt-4 grid gap-5 lg:grid-cols-[240px_1fr]">
          <div>
            <h3 className="label-md">Current round admins</h3>
            <ul className="mt-2 grid gap-2">
              {round.admins.map((admin) => (
                <li key={admin} className="font-mono text-sm">
                  {shortenAddress(admin)}
                  {admin.toLowerCase() === round.creator.toLowerCase()
                    ? " · creator"
                    : ""}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="label-md">Vote allocations</h3>
            {round.voteActivity.length ? (
              <ul
                className="mt-2 grid max-h-72 gap-2 overflow-y-auto"
                aria-label="Vote activity"
              >
                {[...round.voteActivity].reverse().map((vote, index) => (
                  <li
                    key={`${vote.transactionHash}-${vote.logIndex}-${index}`}
                    className="grid gap-1 rounded-xl bg-background-ternary p-3 paragraph-sm sm:grid-cols-[110px_1fr_auto]"
                  >
                    <span className="font-mono">
                      {shortenAddress(vote.voter)}
                    </span>
                    <span>
                      added {vote.amount.toString()} to submission #
                      {vote.submissionId.toString()}
                    </span>
                    <span>{vote.submissionTotal.toString()} total</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-content-secondary paragraph-sm">
                No indexed vote events yet, or the RPC event view is temporarily
                unavailable.
              </p>
            )}
          </div>
        </div>
      </section>
      {round.finalized && (
        <section
          aria-labelledby="results-title"
          className="rounded-[16px] border bg-white p-5"
        >
          <h2 id="results-title" className="heading-5">
            Finalized results
          </h2>
          <p className="mt-2 text-content-secondary paragraph-sm">
            Winners are deterministic by vote total, then earlier submission ID.
            {round.prizeVault
              ? " Registered prizes are held and released by the round's onchain vault."
              : " Awards below are descriptive metadata only."}
          </p>
          <ol className="mt-4 grid gap-3">
            {round.winners.map((winner, index) => {
              const submission = round.submissions[Number(winner)];
              return (
                <li
                  key={winner.toString()}
                  className="rounded-xl bg-background-ternary p-4"
                >
                  <strong>
                    #{index + 1} ·{" "}
                    {submission?.metadata?.title || `Submission ${winner}`}
                  </strong>
                  {round.metadata?.awards?.[index] && (
                    <span className="ml-2 text-content-secondary">
                      {round.metadata.awards[index].label}
                      {round.metadata.awards[index].value
                        ? ` · ${round.metadata.awards[index].value}`
                        : ""}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      )}
      {visibility.showSubmissionEntry && prizesReady && (
        <RoundSubmissionDialog
          isOpen={isSubmissionOpen}
          onClose={() => setIsSubmissionOpen(false)}
          round={round}
          chainId={chainId}
          account={account}
          isPending={isPending}
          onAction={onAction}
          signMessage={signMessage}
        />
      )}
      {showAdmin && (
        <RoundAdminDialog
          isOpen={isAdminOpen}
          onClose={closeAdmin}
          promptFunding={promptFunding}
          round={round}
          chainId={chainId}
          testMode={testMode}
          account={account}
          isRoundAdmin={isRoundAdmin}
          canApproveMedia={canApproveMedia}
          isPending={isPending}
          onAction={onAction}
          onVaultAction={onVaultAction}
          onApprovePrizeAsset={onApprovePrizeAsset}
          onClaimPrizeTo={onClaimPrizeTo}
          signTypedData={signTypedData}
        />
      )}
    </div>
  );
}
