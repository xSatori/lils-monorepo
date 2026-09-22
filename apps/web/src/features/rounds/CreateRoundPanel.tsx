import {
  cloneElement,
  useId,
  useMemo,
  useState,
  type FormEvent,
  type ReactElement,
} from "react";
import { formatEther, isAddress, parseEther, toHex, type Address } from "viem";
import { Info, ShieldCheck, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import Dialog from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import type { RoundConfigInput, VaultConfigInput } from "./contracts";
import {
  committedRoundAddressFromLogs,
  pinCommittedRound,
  prepareDeterministicRound,
  type DeterministicRoundBuild,
} from "./media";
import { encodePrizeAllocation, type PrizeAllocationDraft } from "./prizes";
import { getDefaultRoundSchedule, validateRoundSchedule } from "./validation";
import type { FactoryView } from "./rpc";
import type { RoundActionReceipt } from "./RoundActions";
import { RoundMediaUpload } from "./RoundMediaUpload";
import { RoundsStatus, shortenAddress } from "./RoundsStatus";

type Props = {
  factory: FactoryView;
  factoryAddress?: Address;
  factoryGeneration?: number;
  chainId?: number;
  votingPowerAdapter?: `0x${string}`;
  isConnected: boolean;
  isCorrectChain: boolean;
  isPending: boolean;
  onConnect?: () => void;
  onCreate: (
    config: RoundConfigInput,
    salt: `0x${string}`,
    vaultConfig?: VaultConfigInput,
  ) => Promise<RoundActionReceipt>;
  account?: Address;
  embedded?: boolean;
  onComplete?: (round: Address) => void;
  onRecoveryChange?: (pending: boolean) => void;
};

function Field({
  label,
  hint,
  info,
  className,
  children,
}: {
  label: string;
  hint?: string;
  info?: string;
  className?: string;
  children: ReactElement<{ id?: string }>;
}) {
  const inputId = useId();
  return (
    <div className={`flex min-w-0 flex-col gap-2 ${className || ""}`}>
      <span className="flex items-center gap-1.5 label-sm">
        <label htmlFor={inputId}>{label}</label>
        {info && (
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  aria-label={`Information about ${label.toLowerCase()}`}
                  className="inline-flex cursor-help text-content-secondary focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2"
                  type="button"
                >
                  <Info className="h-4 w-4" aria-hidden="true" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">{info}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </span>
      {cloneElement(children, { id: inputId })}
      {hint && (
        <span className="text-content-secondary paragraph-sm">{hint}</span>
      )}
    </div>
  );
}

const unix = (value: string) => Math.floor(new Date(value).getTime() / 1000);
const localDateTime = (date: Date) => {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
};

const newPrizeAllocation = (): PrizeAllocationDraft => ({
  winnerRank: "0",
  assetType: "0",
  token: "",
  tokenId: "0",
  amount: "",
});

export function buildOrderedPrizeAllocations(rows: PrizeAllocationDraft[]) {
  if (rows.length < 1) throw new Error("Add at least one prize.");
  if (rows.length > 20) throw new Error("Add no more than 20 prizes.");
  return rows.map((row, index) => {
    let amount = row.amount;
    if (row.assetType === "0") {
      const ethAmount = row.amount.trim();
      if (!/^\d+(?:\.\d{1,18})?$/.test(ethAmount))
        throw new Error(
          "ETH prize amount must be a valid amount in ETH with at most 18 decimal places.",
        );
      try {
        amount = parseEther(ethAmount).toString();
      } catch {
        throw new Error(
          "ETH prize amount must be a valid amount in ETH with at most 18 decimal places.",
        );
      }
    }
    return encodePrizeAllocation(
      { ...row, amount, winnerRank: String(index) },
      rows.length,
    );
  });
}

export const submissionLimitForVersion = (version: number) =>
  version >= 7 ? 1000 : 100;

export function baseOrFixedVotesForStrategy(strategy: number, value: string) {
  if (strategy !== 2 && strategy !== 3) return 0n;
  if (!/^\d+$/.test(value))
    throw new Error("Base or fixed votes must be a positive whole number.");
  const votes = BigInt(value);
  if (votes < 1n || votes > (1n << 96n) - 1n)
    throw new Error("Base or fixed votes must be a positive whole number.");
  return votes;
}

export function CreateRoundPanel({
  factory,
  factoryGeneration,
  votingPowerAdapter,
  isConnected,
  isCorrectChain,
  isPending,
  onConnect,
  onCreate,
  account,
  embedded = false,
  factoryAddress,
  chainId,
  onComplete,
  onRecoveryChange,
}: Props) {
  const scheduleDeferred = factory.activeImplementationVersion >= 6;
  const maxSubmissionCap = submissionLimitForVersion(
    factory.activeImplementationVersion,
  );
  const initialSchedule = getDefaultRoundSchedule(
    Math.floor(Date.now() / 1000),
    factory.testMode,
  );
  const [roundTitle, setRoundTitle] = useState("");
  const [roundDescription, setRoundDescription] = useState("");
  const [coverImage, setCoverImage] = useState<File>();
  const [mediaStatus, setMediaStatus] = useState("");
  const [isPreparingMedia, setIsPreparingMedia] = useState(false);
  const [pinRecovery, setPinRecovery] = useState<{
    round: Address;
    prepared: DeterministicRoundBuild;
  }>();
  const [creationConfirmed, setCreationConfirmed] = useState(false);
  const [submissionsOpen, setSubmissionsOpen] = useState(
    localDateTime(new Date(initialSchedule.submissionsOpen * 1000)),
  );
  const [submissionsClose, setSubmissionsClose] = useState(
    localDateTime(new Date(initialSchedule.submissionsClose * 1000)),
  );
  const [votingStart, setVotingStart] = useState(
    localDateTime(new Date(initialSchedule.votingStart * 1000)),
  );
  const [votingEnd, setVotingEnd] = useState(
    localDateTime(new Date(initialSchedule.votingEnd * 1000)),
  );
  const [strategy, setStrategy] = useState(1);
  const [baseVotes, setBaseVotes] = useState("1");
  const [entryCap, setEntryCap] = useState("25");
  const [walletCap, setWalletCap] = useState("2");
  const [submissionCap, setSubmissionCap] = useState(
    maxSubmissionCap === 1000 ? "1000" : "50",
  );
  const [titleMin, setTitleMin] = useState("3");
  const [titleMax, setTitleMax] = useState("100");
  const [descriptionMin, setDescriptionMin] = useState("20");
  const [descriptionMax, setDescriptionMax] = useState("2000");
  const [error, setError] = useState("");
  const [recoveryRecipient, setRecoveryRecipient] = useState(account || "");
  const [prizeRows, setPrizeRows] = useState<PrizeAllocationDraft[]>([
    newPrizeAllocation(),
  ]);

  const disabledReason = useMemo(() => {
    if (!factoryGeneration || factoryGeneration < 5)
      return "This factory remains readable, but sponsored round creation requires generation five or newer.";
    if (factory.paused) return "Round creation is paused by a global admin.";
    if (!votingPowerAdapter || !isAddress(votingPowerAdapter))
      return "Voting-power adapter is not configured for this chain.";
    if (!isConnected) return "Connect a wallet to create a round.";
    if (!isCorrectChain)
      return "Switch to the configured network before creating a round.";
  }, [
    factoryGeneration,
    factory.paused,
    isConnected,
    isCorrectChain,
    votingPowerAdapter,
  ]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pinRecovery || creationConfirmed) return;
    setError("");
    setMediaStatus("");
    if (!roundTitle.trim() || !roundDescription.trim() || !coverImage) {
      setError("Add a round title, description, and one cover image.");
      return;
    }
    let prepared: DeterministicRoundBuild;
    try {
      setIsPreparingMedia(true);
      setMediaStatus("Preparing deterministic round media IDs…");
      prepared = await prepareDeterministicRound({
        file: coverImage,
        title: roundTitle.trim(),
        description: roundDescription.trim(),
      });
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Round media is invalid.",
      );
      return;
    } finally {
      setIsPreparingMedia(false);
    }
    const open = unix(submissionsOpen);
    const close = unix(submissionsClose);
    const vote = unix(votingStart);
    const end = unix(votingEnd);
    const scheduleError = scheduleDeferred
      ? undefined
      : validateRoundSchedule(
          {
            submissionsOpen: open,
            submissionsClose: close,
            votingStart: vote,
            votingEnd: end,
          },
          factory.testMode,
        );
    if (scheduleError) return setError(scheduleError);
    const numeric = [
      walletCap,
      submissionCap,
      titleMin,
      titleMax,
      descriptionMin,
      descriptionMax,
    ].map(Number);
    if (numeric.some((value) => !Number.isSafeInteger(value) || value <= 0)) {
      setError("Limits must be positive whole numbers.");
      return;
    }
    const [
      perWallet,
      total,
      minTitle,
      maxTitle,
      minDescription,
      maxDescription,
    ] = numeric;
    const winners = prizeRows.length;
    if (
      perWallet > 10 ||
      total > maxSubmissionCap ||
      perWallet > total ||
      winners > 20 ||
      winners > total
    ) {
      setError(
        `Use at most 10 submissions per wallet, ${maxSubmissionCap} total submissions, and 20 winners; winners cannot exceed total submissions.`,
      );
      return;
    }
    if (
      minTitle > maxTitle ||
      maxTitle > 20_000 ||
      minDescription > maxDescription ||
      maxDescription > 20_000
    ) {
      setError(
        "Text bounds must be ordered and cannot exceed 20,000 UTF-8 bytes.",
      );
      return;
    }
    try {
      const configuredBaseVotes = baseOrFixedVotesForStrategy(
        strategy,
        baseVotes,
      );
      let vaultConfig: VaultConfigInput | undefined;
      if (factoryGeneration && factoryGeneration >= 3) {
        if (
          !isAddress(recoveryRecipient) ||
          /^0x0{40}$/i.test(recoveryRecipient)
        ) {
          return setError(
            "Enter a valid non-zero recovery recipient for the prize vault.",
          );
        }
        try {
          const allocations = buildOrderedPrizeAllocations(prizeRows);
          vaultConfig = {
            recoveryRecipient,
            claimPeriod: factory.testMode ? 5 * 60 : 180 * 24 * 60 * 60,
            recoveryDelay: factory.testMode ? 5 * 60 : 48 * 60 * 60,
            allocations,
          };
        } catch (cause) {
          return setError(
            cause instanceof Error ? cause.message : "Prize plan is invalid.",
          );
        }
      }
      const receipt = await onCreate(
        {
          metadataURI: prepared.uri,
          metadataHash: prepared.hash,
          roundStart: scheduleDeferred
            ? 0
            : Math.min(Math.floor(Date.now() / 1000), open),
          submissionsOpen: scheduleDeferred ? 0 : open,
          submissionsClose: scheduleDeferred ? 0 : close,
          votingStart: scheduleDeferred ? 0 : vote,
          votingEnd: scheduleDeferred ? 0 : end,
          votingPowerAdapter: votingPowerAdapter!,
          votingStrategy: strategy,
          snapshotMode: 0,
          customSnapshotBlock: 0n,
          baseOrFixedVotes: configuredBaseVotes,
          maxVotesPerSubmission: BigInt(entryCap || 0),
          maxSubmissionsPerWallet: perWallet,
          maxSubmissions: total,
          winnerCount: winners,
          minTitleLength: minTitle,
          maxTitleLength: maxTitle,
          minDescriptionLength: minDescription,
          maxDescriptionLength: maxDescription,
        },
        toHex(crypto.getRandomValues(new Uint8Array(32))),
        vaultConfig,
      );
      setCreationConfirmed(true);
      onRecoveryChange?.(true);
      if (!factoryAddress || !chainId)
        throw new Error(
          "Round media pinning is not configured for this chain.",
        );
      const round = committedRoundAddressFromLogs({
        factory: factoryAddress,
        factoryGeneration,
        logs: receipt.logs,
      });
      const recovery = { round, prepared };
      setPinRecovery(recovery);
      try {
        await pinCommittedRound({
          chainId,
          round,
          prepared,
          onStatus: setMediaStatus,
        });
        setPinRecovery(undefined);
        setCreationConfirmed(false);
        onRecoveryChange?.(false);
      } catch (cause) {
        setError(
          `${cause instanceof Error ? cause.message : "Media pinning failed."} The round is confirmed onchain; do not create another round. Retry pinning with the identical prepared files.`,
        );
        return;
      }
      onComplete?.(round);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Round creation was rejected.",
      );
    }
  }

  async function retryPinning() {
    if (!pinRecovery || !chainId) return;
    setError("");
    setIsPreparingMedia(true);
    try {
      await pinCommittedRound({
        chainId,
        round: pinRecovery.round,
        prepared: pinRecovery.prepared,
        onStatus: setMediaStatus,
      });
      setPinRecovery(undefined);
      setCreationConfirmed(false);
      onRecoveryChange?.(false);
      onComplete?.(pinRecovery.round);
    } catch (cause) {
      setError(
        `${cause instanceof Error ? cause.message : "Media pinning failed."} The round remains confirmed onchain; retry pinning instead of creating another round.`,
      );
    } finally {
      setIsPreparingMedia(false);
    }
  }

  return (
    <section
      aria-labelledby={embedded ? undefined : "create-round-title"}
      className={
        embedded
          ? "bg-white p-5 md:p-6"
          : "rounded-[20px] border-2 border-border-primary bg-white p-5 md:p-6"
      }
    >
      {!embedded && (
        <div className="flex flex-col gap-2 border-b pb-5">
          <h2 id="create-round-title" className="heading-5">
            Create an onchain round
          </h2>
          <p className="text-content-secondary paragraph-sm">
            The exact {formatEther(factory.creationFee)} ETH fee is sent
            atomically to {shortenAddress(factory.treasury)}.
            {factoryGeneration && factoryGeneration >= 3
              ? " A dedicated multi-asset prize vault is deployed with the round; its assets are funded afterward."
              : ""}
          </p>
        </div>
      )}
      {factory.testMode && (
        <div className="my-4 rounded-xl bg-yellow-100 p-3 font-semibold text-yellow-950">
          Sepolia test mode · five-minute submissions, moderation review, and
          voting phases
        </div>
      )}
      <form className="mt-5 flex flex-col gap-5" onSubmit={submit}>
        <RoundMediaUpload
          title={roundTitle}
          onTitleChange={setRoundTitle}
          description={roundDescription}
          onDescriptionChange={setRoundDescription}
          file={coverImage}
          onFileChange={setCoverImage}
        />
        {!scheduleDeferred && (
          <div className="rounded-[16px] border bg-background-ternary p-4">
            <div className="mb-4 flex items-start gap-3">
              <ShieldCheck
                className="mt-0.5 h-5 w-5 shrink-0 text-content-secondary"
                aria-hidden="true"
              />
              <div>
                <h3 className="label-md">Submission and review schedule</h3>
                <p className="mt-1 text-content-secondary paragraph-sm">
                  Submissions lock at the close time. Round admins can finish
                  moderation during the review buffer, then the eligible set
                  freezes when voting starts.
                </p>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Submissions open">
                <Input
                  required
                  type="datetime-local"
                  value={submissionsOpen}
                  onChange={(e) => setSubmissionsOpen(e.target.value)}
                />
              </Field>
              <Field label="Submissions close / review starts">
                <Input
                  required
                  type="datetime-local"
                  value={submissionsClose}
                  onChange={(e) => setSubmissionsClose(e.target.value)}
                />
              </Field>
              <Field label="Voting starts">
                <Input
                  required
                  type="datetime-local"
                  value={votingStart}
                  onChange={(e) => setVotingStart(e.target.value)}
                />
              </Field>
              <Field label="Voting ends">
                <Input
                  required
                  type="datetime-local"
                  value={votingEnd}
                  onChange={(e) => setVotingEnd(e.target.value)}
                />
              </Field>
            </div>
            <p className="mt-3 text-content-secondary paragraph-sm">
              {factory.testMode
                ? "Test deployments require exactly five minutes for each of the three phases."
                : "Default moderation review buffer: 24 hours. You may choose a different positive buffer."}
            </p>
          </div>
        )}
        <fieldset className="grid gap-4 rounded-xl border bg-background-ternary p-4">
          <legend className="px-2 font-semibold">Voting Details</legend>
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Voting strategy">
              <select
                className="h-12 rounded-xl border-2 bg-white px-3"
                value={strategy}
                onChange={(e) => setStrategy(Number(e.target.value))}
              >
                <option value={1}>Delegated NFT voting power</option>
                <option value={2}>Fixed per eligible wallet</option>
                <option value={3}>Base plus voting power</option>
              </select>
            </Field>
            {(strategy === 2 || strategy === 3) && (
              <Field
                label="Base or fixed votes"
                info="For fixed voting, each eligible wallet receives this many votes. For base plus voting power, this amount is added to its delegated voting power. Set fixed votes to 1 for one vote per wallet."
              >
                <Input
                  type="number"
                  min="1"
                  step="1"
                  value={baseVotes}
                  onChange={(e) => setBaseVotes(e.target.value)}
                />
              </Field>
            )}
            <Field
              label="Per-entry vote cap"
              info="Maximum votes one wallet can allocate to a single submission, even if it has more total voting power."
            >
              <Input
                type="number"
                min="1"
                value={entryCap}
                onChange={(e) => setEntryCap(e.target.value)}
              />
            </Field>
          </div>
          {factory.activeImplementationVersion >= 8 && (
            <p className="text-content-secondary paragraph-sm">
              Voting power is fixed when the round is created. Acquiring or
              delegating votes afterward does not add voting power to this
              round. Wallet-level limits cannot prevent someone from splitting
              votes across wallets before creation.
            </p>
          )}
        </fieldset>
        <fieldset className="grid gap-4 rounded-xl border bg-background-ternary p-4">
          <legend className="px-2 font-semibold">Submission Details</legend>
          <div className="grid gap-4 md:grid-cols-2">
            <Field
              label="Submissions per wallet"
              info="Maximum number of entries one wallet may submit to this round."
            >
              <Input
                type="number"
                min="1"
                max="10"
                value={walletCap}
                onChange={(e) => setWalletCap(e.target.value)}
              />
            </Field>
            <Field
              label="Total submissions"
              info="Maximum number of entries accepted across the whole round. The available maximum depends on the active contract version."
            >
              <Input
                type="number"
                min="1"
                max={maxSubmissionCap}
                value={submissionCap}
                onChange={(e) => setSubmissionCap(e.target.value)}
              />
            </Field>
            <Field label="Minimum title length">
              <Input
                type="number"
                min="1"
                value={titleMin}
                onChange={(e) => setTitleMin(e.target.value)}
              />
            </Field>
            <Field label="Maximum title length">
              <Input
                type="number"
                min="1"
                max="20000"
                value={titleMax}
                onChange={(e) => setTitleMax(e.target.value)}
              />
            </Field>
            <Field label="Minimum description length">
              <Input
                type="number"
                min="1"
                value={descriptionMin}
                onChange={(e) => setDescriptionMin(e.target.value)}
              />
            </Field>
            <Field label="Maximum description length">
              <Input
                type="number"
                min="1"
                max="20000"
                value={descriptionMax}
                onChange={(e) => setDescriptionMax(e.target.value)}
              />
            </Field>
          </div>
        </fieldset>
        {factoryGeneration && factoryGeneration >= 3 && (
          <fieldset className="grid gap-4 rounded-xl border bg-background-ternary p-4">
            <legend className="px-2 font-semibold">Onchain prize vault</legend>
            <p className="text-content-secondary paragraph-sm">
              Prize allocations are committed during creation. Assets are funded
              after round creation and before submissions open; creating the
              round does not deposit prizes.
            </p>
            <Field
              label="Recovery recipient"
              hint="Two authorized admins and the recovery delay are still required. Active winner liabilities cannot be withdrawn."
            >
              <Input
                required
                value={recoveryRecipient}
                onChange={(event) => setRecoveryRecipient(event.target.value)}
                placeholder="0x…"
              />
            </Field>
            {prizeRows.map((row, index) => {
              const assetType = Number(row.assetType);
              const needsToken = assetType !== 0;
              const needsTokenId = assetType === 2 || assetType === 3;
              return (
                <fieldset
                  key={index}
                  className="relative grid gap-3 rounded-xl border bg-white p-3 md:grid-cols-2 lg:grid-cols-12"
                >
                  <legend className="px-2 font-semibold">
                    Prize {index + 1} · winner {index + 1}
                  </legend>
                  {prizeRows.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-slim"
                      className="absolute right-2 top-0 flex h-9 w-9 items-center justify-center text-content-secondary"
                      aria-label={`Remove prize ${index + 1}`}
                      title={`Remove prize ${index + 1}`}
                      onClick={() =>
                        setPrizeRows((rows) =>
                          rows.filter((_, itemIndex) => itemIndex !== index),
                        )
                      }
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  )}
                  <Field label="Asset type" className="lg:col-span-2">
                    <select
                      aria-label={`Prize ${index + 1} asset type`}
                      className="h-12 rounded-xl border-2 bg-white px-3"
                      value={row.assetType}
                      onChange={(event) =>
                        setPrizeRows((rows) =>
                          rows.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, assetType: event.target.value }
                              : item,
                          ),
                        )
                      }
                    >
                      <option value="0">ETH</option>
                      <option value="1">ERC-20</option>
                      <option value="2">ERC-721</option>
                      <option value="3">ERC-1155</option>
                    </select>
                  </Field>
                  {needsToken && (
                    <Field label="Token contract" className="lg:col-span-6">
                      <Input
                        required
                        aria-label={`Prize ${index + 1} token address`}
                        value={row.token}
                        onChange={(event) =>
                          setPrizeRows((rows) =>
                            rows.map((item, itemIndex) =>
                              itemIndex === index
                                ? { ...item, token: event.target.value }
                                : item,
                            ),
                          )
                        }
                        placeholder="0x…"
                      />
                    </Field>
                  )}
                  {needsTokenId && (
                    <Field label="Token ID" className="lg:col-span-2">
                      <Input
                        required
                        aria-label={`Prize ${index + 1} token ID`}
                        type="number"
                        min="0"
                        step="1"
                        value={row.tokenId}
                        onChange={(event) =>
                          setPrizeRows((rows) =>
                            rows.map((item, itemIndex) =>
                              itemIndex === index
                                ? { ...item, tokenId: event.target.value }
                                : item,
                            ),
                          )
                        }
                      />
                    </Field>
                  )}
                  <Field
                    className={needsTokenId ? "lg:col-span-2" : "lg:col-span-4"}
                    label={
                      assetType === 0
                        ? "Amount (ETH)"
                        : assetType === 1
                          ? "Amount (base units)"
                          : "Quantity"
                    }
                  >
                    <Input
                      required
                      aria-label={`Prize ${index + 1} amount`}
                      type={assetType === 0 ? "text" : "number"}
                      inputMode={assetType === 0 ? "decimal" : "numeric"}
                      min={assetType === 0 ? undefined : "1"}
                      step={assetType === 0 ? undefined : "1"}
                      readOnly={assetType === 2}
                      value={assetType === 2 ? "1" : row.amount}
                      onChange={(event) =>
                        setPrizeRows((rows) =>
                          rows.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, amount: event.target.value }
                              : item,
                          ),
                        )
                      }
                    />
                  </Field>
                </fieldset>
              );
            })}
            <Button
              type="button"
              variant="secondary"
              disabled={prizeRows.length >= 20}
              onClick={() =>
                setPrizeRows((rows) => [...rows, newPrizeAllocation()])
              }
            >
              Add prize
            </Button>
          </fieldset>
        )}
        {disabledReason && (
          <RoundsStatus kind="info">{disabledReason}</RoundsStatus>
        )}
        {error && <RoundsStatus kind="error">{error}</RoundsStatus>}
        {mediaStatus && <RoundsStatus kind="info">{mediaStatus}</RoundsStatus>}
        {pinRecovery && (
          <RoundsStatus kind="info">
            Round {shortenAddress(pinRecovery.round)} is confirmed onchain but
            its media is not pinned yet. Creating another round is locked.
          </RoundsStatus>
        )}
        {scheduleDeferred && !pinRecovery && !creationConfirmed && (
          <RoundsStatus kind="info" iconClassName="text-semantic-negative">
            After creating the round, fund the prizes and seal the vault. Admins
            can then set the submission and review schedule before submissions
            open.
          </RoundsStatus>
        )}
        {pinRecovery ? (
          <Button
            type="button"
            onClick={retryPinning}
            disabled={isPreparingMedia}
          >
            {isPreparingMedia ? "Retrying pin…" : "Retry pinning"}
          </Button>
        ) : creationConfirmed ? (
          <Button type="button" disabled>
            Round confirmed · media recovery required
          </Button>
        ) : !isConnected ? (
          <Button type="button" onClick={onConnect} disabled={!onConnect}>
            Connect wallet
          </Button>
        ) : (
          <Button
            type="submit"
            disabled={Boolean(disabledReason) || isPending || isPreparingMedia}
          >
            {isPending || isPreparingMedia
              ? "Creating…"
              : `Create round · ${formatEther(factory.creationFee)} ETH`}
          </Button>
        )}
      </form>
    </section>
  );
}

export function CreateRoundDialog({
  isOpen,
  onClose,
  ...props
}: Props & { isOpen: boolean; onClose: () => void }) {
  const [hasPinRecovery, setHasPinRecovery] = useState(false);
  const requestClose = () => {
    if (!hasPinRecovery) onClose();
  };

  return (
    <Dialog
      isOpen={isOpen}
      onRequestClose={requestClose}
      width="64rem"
      className="overflow-hidden"
    >
      {({ titleProps }) => (
        <div className="flex max-h-[85vh] flex-col">
          <div className="flex items-start justify-between gap-4 border-b p-5 md:p-6">
            <div>
              <h2 {...titleProps} className="heading-4">
                Create an onchain round
              </h2>
              <p className="mt-2 max-w-[760px] text-content-secondary paragraph-sm">
                Pay the exact {formatEther(props.factory.creationFee)} ETH
                creation fee to {shortenAddress(props.factory.treasury)}. The
                treasury receives it atomically.
                {props.factoryGeneration && props.factoryGeneration >= 3
                  ? " A dedicated multi-asset prize vault is deployed with the round; its assets are funded afterward."
                  : ""}
              </p>
            </div>
            <button
              type="button"
              aria-label="Close create round dialog"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl hover:bg-background-secondary focus-visible:outline-none focus-visible:ring-2"
              onClick={requestClose}
              disabled={hasPinRecovery}
              title={
                hasPinRecovery ? "Retry pinning before closing" : undefined
              }
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
          <div className="overflow-y-auto">
            <CreateRoundPanel
              {...props}
              onComplete={(round) => {
                onClose();
                props.onComplete?.(round);
              }}
              onRecoveryChange={setHasPinRecovery}
              embedded
            />
          </div>
        </div>
      )}
    </Dialog>
  );
}
