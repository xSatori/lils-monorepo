import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import {
  formatEther,
  isAddress,
  parseEther,
  type Address,
  type Hex,
} from "viem";
import { useSignTypedData } from "wagmi";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CHAIN_CONFIG } from "@/config";

import {
  buildRecoveryCancellationTypedData,
  freezeRecoveryDraft,
  outstandingPrizeGroups,
  prizeFundingStatus,
} from "./prizes";
import { RoundsStatus, shortenAddress } from "./RoundsStatus";
import { PrizeVaultSafetyV4 } from "./PrizeVaultSafetyV4";
import {
  PrizeAssetType,
  PrizeVaultState,
  type PrizeAllocation,
  type RoundView,
} from "./types";

export type PrizeVaultAction = (
  name: string,
  args?: readonly unknown[],
  value?: bigint,
) => Promise<void>;
export type PrizeAssetApproval = (
  allocation: PrizeAllocation,
  amount: bigint,
) => Promise<void>;
export type PrizeClaimTo = (
  allocation: PrizeAllocation,
  recipient: Address,
) => Promise<void>;

const assetLabels = ["ETH", "ERC-20", "ERC-721", "ERC-1155"] as const;
const stateLabels = ["Funding", "Sealed", "Canceled"] as const;
type RecoveryDraft = ReturnType<typeof freezeRecoveryDraft>;
type CancellationDraft = {
  actionId: Hex;
  deadline: number;
  typedData: ReturnType<typeof buildRecoveryCancellationTypedData>;
};

function parseAssetAmount(allocation: PrizeAllocation, value: string) {
  if (allocation.assetType === PrizeAssetType.Native)
    return parseEther(value || "0");
  if (allocation.assetType === PrizeAssetType.Erc721) return 1n;
  return BigInt(value || "0");
}

export function PrizeVaultPanel({
  round,
  account,
  isPending,
  onAction,
  onApprove,
  onClaimTo,
}: {
  round: RoundView;
  account?: string;
  isPending: boolean;
  onAction?: PrizeVaultAction;
  onApprove?: PrizeAssetApproval;
  onClaimTo?: PrizeClaimTo;
}) {
  const vault = round.prizeVault!;
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [redirects, setRedirects] = useState<Record<string, string>>({});
  const [recoveryKind, setRecoveryKind] = useState("0");
  const [recoveryAllocationId, setRecoveryAllocationId] = useState("0");
  const [recoveryAmount, setRecoveryAmount] = useState("0");
  const [recoveryRecipient, setRecoveryRecipient] = useState(
    vault?.recoveryRecipient ?? "",
  );
  const [signerOne, setSignerOne] = useState(account || "");
  const [signatureOne, setSignatureOne] = useState<Hex | "">("");
  const [signerTwo, setSignerTwo] = useState("");
  const [signatureTwo, setSignatureTwo] = useState<Hex | "">("");
  const [recoveryDraft, setRecoveryDraft] = useState<RecoveryDraft>();
  const [queuedRecovery, setQueuedRecovery] = useState<{
    actionId: Hex;
    executeAfter: number;
  }>();
  const [batchToken, setBatchToken] = useState("");
  const [batchTokenIds, setBatchTokenIds] = useState("");
  const [batchAmounts, setBatchAmounts] = useState("");
  const [cancelActionId, setCancelActionId] = useState("");
  const [cancelSignerOne, setCancelSignerOne] = useState(account || "");
  const [cancelSignatureOne, setCancelSignatureOne] = useState<Hex | "">("");
  const [cancelSignerTwo, setCancelSignerTwo] = useState("");
  const [cancelSignatureTwo, setCancelSignatureTwo] = useState<Hex | "">("");
  const [cancellationDraft, setCancellationDraft] =
    useState<CancellationDraft>();
  const recoverySigner = useSignTypedData();
  const [error, setError] = useState("");
  if (!vault) return null;
  const fundingGroups = outstandingPrizeGroups(vault.allocations);

  async function act(
    name: string,
    args: readonly unknown[] = [],
    value?: bigint,
  ) {
    setError("");
    if (!onAction) {
      setError("Prize-vault writes are unavailable on this network.");
      return false;
    }
    try {
      await onAction(name, args, value);
      return true;
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Prize transaction was rejected.",
      );
      return false;
    }
  }

  async function approve(allocation: PrizeAllocation, amount: bigint) {
    setError("");
    if (!onApprove)
      return setError("Token approvals are unavailable on this network.");
    try {
      await onApprove(allocation, amount);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Token approval was rejected.",
      );
    }
  }

  async function redirect(allocation: PrizeAllocation) {
    const recipient = redirects[allocation.id.toString()] || "";
    if (!isAddress(recipient))
      return setError("Enter a valid alternate recipient address.");
    if (!onClaimTo)
      return setError(
        "Winner-signed redirects are unavailable on this network.",
      );
    setError("");
    try {
      await onClaimTo(allocation, recipient);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Signature or redirect transaction was rejected.",
      );
    }
  }

  function invalidateRecoveryDraft() {
    setRecoveryDraft(undefined);
    setSignatureOne("");
    setSignatureTwo("");
    setQueuedRecovery(undefined);
  }

  function buildRecoveryDraft() {
    if (!isAddress(recoveryRecipient)) {
      setError("Enter a valid recovery recipient.");
      return;
    }
    const allocationId = /^\d+$/.test(recoveryAllocationId)
      ? BigInt(recoveryAllocationId)
      : 0n;
    const requestedAmount = /^\d+$/.test(recoveryAmount)
      ? BigInt(recoveryAmount)
      : 0n;
    const allocation = vault.allocations.find(
      (item) => item.id === allocationId,
    );
    const kind = Number(recoveryKind);
    const now = Math.floor(Date.now() / 1_000);
    const updateRecipient = kind === 2;
    if (!updateRecipient && !allocation) {
      setError("Choose an existing allocation before freezing the action.");
      return;
    }
    const draft = freezeRecoveryDraft({
      chainId: CHAIN_CONFIG.chain.id,
      vault: vault.address,
      round: round.round,
      prizePlanHash: vault.prizePlanHash,
      kind,
      assetType: updateRecipient ? 0 : allocation!.assetType,
      token: updateRecipient
        ? "0x0000000000000000000000000000000000000000"
        : allocation!.token,
      tokenId: updateRecipient ? 0n : allocation!.tokenId,
      amount: updateRecipient ? 0n : requestedAmount,
      recipient: recoveryRecipient,
      allocationId: updateRecipient ? 0n : allocation!.id,
      nonce: vault.recoveryNonce,
      validAfter: now,
      deadline: now + vault.recoveryDelay + 24 * 60 * 60,
    });
    setRecoveryDraft(draft);
    setError("");
  }

  async function signRecovery() {
    if (!account)
      return setError("Connect one authorized signer wallet first.");
    if (!recoveryDraft)
      return setError("Freeze the recovery action before signing it.");
    try {
      const signature = await recoverySigner.signTypedDataAsync(
        recoveryDraft.typedData,
      );
      setSignerOne(account);
      setSignatureOne(signature);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Recovery signature was rejected.",
      );
    }
  }

  async function queueRecovery() {
    if (!recoveryDraft)
      return setError("Freeze the recovery action before queueing it.");
    if (
      !isAddress(signerOne) ||
      !isAddress(signerTwo) ||
      !signatureOne ||
      !signatureTwo
    ) {
      return setError("Two signer addresses and two signatures are required.");
    }
    if (
      await act("queueRecovery", [
        recoveryDraft.action,
        signerOne,
        signatureOne,
        signerTwo,
        signatureTwo,
      ])
    ) {
      setQueuedRecovery({
        actionId: recoveryDraft.actionId,
        executeAfter: Math.floor(Date.now() / 1_000) + vault.recoveryDelay,
      });
      setCancelActionId(recoveryDraft.actionId);
    }
  }

  async function fundErc1155Batch() {
    if (!isAddress(batchToken))
      return setError("Enter a valid ERC-1155 token address.");
    try {
      const tokenIds = batchTokenIds
        .split(",")
        .map((value) => BigInt(value.trim()));
      const batchValues = batchAmounts
        .split(",")
        .map((value) => BigInt(value.trim()));
      if (!tokenIds.length || tokenIds.length !== batchValues.length)
        throw new Error(
          "Token IDs and amounts must have the same non-zero length.",
        );
      if (
        new Set(tokenIds.map(String)).size !== tokenIds.length ||
        batchValues.some((value) => value <= 0n)
      )
        throw new Error(
          "Batch IDs must be unique and every amount must be positive.",
        );
      await act("fundERC1155Batch", [batchToken, tokenIds, batchValues]);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Invalid ERC-1155 batch.",
      );
    }
  }

  function buildCancellationDraft() {
    if (!/^0x[0-9a-fA-F]{64}$/.test(cancelActionId))
      return setError("Enter a valid queued recovery action ID.");
    const deadline = Math.floor(Date.now() / 1_000) + 24 * 60 * 60;
    setCancellationDraft({
      actionId: cancelActionId as Hex,
      deadline,
      typedData: buildRecoveryCancellationTypedData({
        chainId: CHAIN_CONFIG.chain.id,
        vault: vault.address,
        round: round.round,
        prizePlanHash: vault.prizePlanHash,
        actionId: cancelActionId as Hex,
        nonce: vault.cancellationNonce,
        deadline,
      }),
    });
    setCancelSignatureOne("");
    setCancelSignatureTwo("");
    setError("");
  }

  async function signCancellation() {
    if (!account || !cancellationDraft)
      return setError(
        "Freeze a cancellation and connect an authorized signer first.",
      );
    try {
      const signature = await recoverySigner.signTypedDataAsync(
        cancellationDraft.typedData,
      );
      setCancelSignerOne(account);
      setCancelSignatureOne(signature);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Cancellation signature was rejected.",
      );
    }
  }

  async function cancelRecovery() {
    if (!cancellationDraft)
      return setError("Freeze the cancellation before submitting it.");
    if (
      !isAddress(cancelSignerOne) ||
      !isAddress(cancelSignerTwo) ||
      !cancelSignatureOne ||
      !cancelSignatureTwo
    )
      return setError(
        "Two cancellation signer addresses and signatures are required.",
      );
    await act("cancelRecovery", [
      cancellationDraft.actionId,
      cancellationDraft.deadline,
      cancelSignerOne,
      cancelSignatureOne,
      cancelSignerTwo,
      cancelSignatureTwo,
    ]);
  }

  return (
    <section
      aria-labelledby="prize-vault-title"
      className="rounded-[16px] border bg-white p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="prize-vault-title" className="heading-5">
            Onchain prize vault
          </h2>
          <p className="mt-1 text-content-secondary paragraph-sm">
            {shortenAddress(vault.address)} ·{" "}
            {stateLabels[vault.state] || "Unknown"} · recovery delay{" "}
            {vault.recoveryDelay}s
          </p>
        </div>
        <span className="rounded-full bg-background-secondary px-3 py-1 label-sm">
          {vault.allocations.length} allocation
          {vault.allocations.length === 1 ? "" : "s"}
        </span>
      </div>

      {vault.state === PrizeVaultState.Funding && (
        <div className="mt-4 rounded-xl border bg-background-ternary p-3">
          <h3 className="font-semibold">Outstanding prize funding</h3>
          <ul
            className="mt-2 grid gap-2"
            aria-label="Outstanding funding by prize type"
          >
            {fundingGroups.map((group) => (
              <li
                key={group.assetType}
                className="flex items-start justify-between gap-3 rounded-lg bg-white p-3"
              >
                <div className="min-w-0">
                  <p className="font-semibold">
                    {assetLabels[group.assetType]}
                  </p>
                  {group.assetType === PrizeAssetType.Erc721 && (
                    <p className="text-content-secondary paragraph-sm">
                      {group.totalRemaining.toString()} NFT
                      {group.totalRemaining === 1n ? "" : "s"} outstanding
                    </p>
                  )}
                  {group.assetType === PrizeAssetType.Native ? (
                    <p className="text-content-secondary paragraph-sm">
                      {formatEther(group.totalRemaining)} ETH outstanding
                    </p>
                  ) : (
                    <ul className="text-content-secondary paragraph-sm">
                      {group.items.map((item) => (
                        <li
                          key={`${item.token}:${item.tokenId}`}
                          className="break-words"
                        >
                          {shortenAddress(item.token)}
                          {group.assetType >= PrizeAssetType.Erc721
                            ? ` · token ID ${item.tokenId}`
                            : ""}
                          {` · ${item.remaining} ${group.assetType === PrizeAssetType.Erc721 ? "NFT" : "base units"} outstanding`}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                {group.complete && (
                  <CheckCircle2
                    role="img"
                    aria-label={`${assetLabels[group.assetType]} fully funded`}
                    className="h-5 w-5 shrink-0 text-semantic-positive"
                  />
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {vault.state === PrizeVaultState.Funding && (
        <div className="mt-4 grid gap-3">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={isPending}
              onClick={() => act("seal")}
            >
              Seal when fully funded
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={isPending}
              onClick={() => act("cancelUnfunded")}
            >
              Cancel after funding deadline
            </Button>
          </div>
          {vault.allocations.some(
            (allocation) => allocation.assetType === PrizeAssetType.Erc1155,
          ) && (
            <div className="grid gap-2 rounded-xl bg-background-ternary p-3">
              <p className="font-semibold">ERC-1155 batch funding</p>
              <div className="grid gap-2 sm:grid-cols-3">
                <Input
                  aria-label="Batch ERC-1155 token"
                  value={batchToken}
                  onChange={(event) => setBatchToken(event.target.value)}
                  placeholder="0x token contract"
                />
                <Input
                  aria-label="Batch ERC-1155 token IDs"
                  value={batchTokenIds}
                  onChange={(event) => setBatchTokenIds(event.target.value)}
                  placeholder="Token IDs: 1,2,3"
                />
                <Input
                  aria-label="Batch ERC-1155 amounts"
                  value={batchAmounts}
                  onChange={(event) => setBatchAmounts(event.target.value)}
                  placeholder="Amounts: 5,5,10"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={isPending || !account || !isAddress(batchToken)}
                  onClick={() => {
                    const allocation = vault.allocations.find(
                      (item) =>
                        item.assetType === PrizeAssetType.Erc1155 &&
                        item.token.toLowerCase() === batchToken.toLowerCase(),
                    );
                    if (!allocation)
                      return setError(
                        "The batch token is not registered in this prize plan.",
                      );
                    return approve(allocation, 1n);
                  }}
                >
                  Approve token operator
                </Button>
                <Button
                  type="button"
                  disabled={isPending || !account}
                  onClick={fundErc1155Batch}
                >
                  Fund batch
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      <ul className="mt-4 grid gap-3" aria-label="Prize allocations">
        {vault.allocations.map((allocation) => {
          const key = allocation.id.toString();
          const remaining =
            allocation.liability > allocation.funded
              ? allocation.liability - allocation.funded
              : 0n;
          const rawAmount =
            amounts[key] ??
            (allocation.assetType === PrizeAssetType.Native
              ? formatEther(remaining)
              : remaining.toString());
          let parsedAmount = 0n;
          try {
            parsedAmount = parseAssetAmount(allocation, rawAmount);
          } catch {
            parsedAmount = 0n;
          }
          const status = prizeFundingStatus(
            allocation.liability,
            allocation.funded,
            allocation.claimed,
          );
          return (
            <li
              key={key}
              className="grid gap-3 rounded-xl bg-background-ternary p-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">
                    Rank {allocation.winnerRank + 1} ·{" "}
                    {assetLabels[allocation.assetType]}
                  </p>
                  <p className="text-content-secondary paragraph-sm">
                    Planned{" "}
                    {allocation.assetType === PrizeAssetType.Native
                      ? `${formatEther(allocation.amount)} ETH`
                      : allocation.amount.toString()}
                    {allocation.assetType !== PrizeAssetType.Native
                      ? ` · ${shortenAddress(allocation.token)}`
                      : ""}
                    {allocation.assetType >= PrizeAssetType.Erc721
                      ? ` · token ${allocation.tokenId}`
                      : ""}
                  </p>
                  {round.implementationVersion >= 4 && (
                    <p className="mt-1 text-content-secondary paragraph-sm">
                      {allocation.reclaimed
                        ? "Reclaimed to the fixed recovery recipient"
                        : allocation.held
                          ? `Distribution held since ${new Date(allocation.heldAt * 1_000).toLocaleString()}`
                          : round.finalized &&
                              vault.distributionAvailableAt >
                                Math.floor(Date.now() / 1_000)
                            ? `Public release opens ${new Date(vault.distributionAvailableAt * 1_000).toLocaleString()}`
                            : "Anyone may execute release; the vault always pays the winner"}
                    </p>
                  )}
                </div>
                {status === "funded" ? (
                  <CheckCircle2
                    role="img"
                    aria-label={`Prize ${allocation.id} fully funded`}
                    className="h-5 w-5 shrink-0 text-semantic-positive"
                  />
                ) : (
                  <span className="rounded-full bg-white px-2 py-1 label-sm">
                    {status}
                  </span>
                )}
              </div>
              <p className="text-content-secondary paragraph-sm">
                Received{" "}
                {allocation.assetType === PrizeAssetType.Native
                  ? `${formatEther(allocation.funded)} ETH`
                  : allocation.funded.toString()}{" "}
                · outstanding{" "}
                {allocation.assetType === PrizeAssetType.Native
                  ? `${formatEther(remaining)} ETH`
                  : remaining.toString()}{" "}
                · recoverable excess{" "}
                {allocation.assetType === PrizeAssetType.Native
                  ? `${formatEther(allocation.recoverableExcess)} ETH`
                  : allocation.recoverableExcess.toString()}
              </p>

              {vault.state === PrizeVaultState.Funding && remaining > 0n && (
                <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
                  <Input
                    aria-label={`Funding amount for allocation ${key}`}
                    value={rawAmount}
                    disabled={allocation.assetType === PrizeAssetType.Erc721}
                    onChange={(event) =>
                      setAmounts((current) => ({
                        ...current,
                        [key]: event.target.value,
                      }))
                    }
                    placeholder={
                      allocation.assetType === PrizeAssetType.Native
                        ? "ETH amount"
                        : "Base units"
                    }
                  />
                  {allocation.assetType !== PrizeAssetType.Native && (
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={isPending || !account || parsedAmount <= 0n}
                      onClick={() => approve(allocation, parsedAmount)}
                    >
                      Approve
                    </Button>
                  )}
                  <Button
                    type="button"
                    disabled={isPending || !account || parsedAmount <= 0n}
                    onClick={() => {
                      if (allocation.assetType === PrizeAssetType.Native)
                        return act("fundNative", [], parsedAmount);
                      if (allocation.assetType === PrizeAssetType.Erc20)
                        return act("fundERC20", [
                          allocation.token,
                          parsedAmount,
                        ]);
                      if (allocation.assetType === PrizeAssetType.Erc721)
                        return act("fundERC721", [
                          allocation.token,
                          allocation.tokenId,
                        ]);
                      return act("fundERC1155", [
                        allocation.token,
                        allocation.tokenId,
                        parsedAmount,
                      ]);
                    }}
                  >
                    Fund
                  </Button>
                </div>
              )}

              {(vault.state === PrizeVaultState.Funding ||
                vault.state === PrizeVaultState.Canceled) &&
                allocation.funded > 0n && (
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={isPending || !account || parsedAmount <= 0n}
                    onClick={() =>
                      act("refundContribution", [
                        allocation.assetType,
                        allocation.token,
                        allocation.tokenId,
                        parsedAmount,
                      ])
                    }
                  >
                    Refund my recorded contribution
                  </Button>
                )}

              {round.finalized &&
                !allocation.claimed &&
                vault.state === PrizeVaultState.Sealed && (
                  <div className="grid gap-2">
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={
                          isPending ||
                          allocation.held ||
                          (round.implementationVersion >= 4 &&
                            Math.floor(Date.now() / 1_000) <
                              vault.distributionAvailableAt)
                        }
                        onClick={() => act("release", [allocation.id])}
                      >
                        Execute winner distribution
                      </Button>
                      <Button
                        type="button"
                        disabled={isPending || !account}
                        onClick={() => act("claim", [allocation.id])}
                      >
                        Claim as winner
                      </Button>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                      <Input
                        aria-label={`Alternate recipient for allocation ${key}`}
                        value={redirects[key] || ""}
                        onChange={(event) =>
                          setRedirects((current) => ({
                            ...current,
                            [key]: event.target.value,
                          }))
                        }
                        placeholder="0x alternate recipient"
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={isPending || !account}
                        onClick={() => redirect(allocation)}
                      >
                        Sign and claim to address
                      </Button>
                    </div>
                  </div>
                )}
            </li>
          );
        })}
      </ul>
      {!vault.allocations.length && (
        <div className="mt-4">
          <RoundsStatus kind="info">
            This round sealed an empty onchain prize plan.
          </RoundsStatus>
        </div>
      )}
      {vault.projectionErrors.map((message) => (
        <div className="mt-4" key={message}>
          <RoundsStatus kind="error">
            {message}. Other allocations remain usable.
          </RoundsStatus>
        </div>
      ))}

      {round.implementationVersion >= 4 && (
        <PrizeVaultSafetyV4
          round={round}
          account={account}
          isPending={isPending}
          onAction={onAction}
        />
      )}

      {round.implementationVersion < 4 && (
        <div className="mt-5 grid gap-3 rounded-xl border bg-white p-4">
          <div>
            <h3 className="font-semibold">Delayed two-signature recovery</h3>
            <p className="text-content-secondary paragraph-sm">
              Build the typed action, sign with one connected wallet, then
              import a second independently reviewed signature. The contract
              checks both live roles again at execution.
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <select
              className="min-h-11 rounded-xl border px-3"
              aria-label="Recovery kind"
              value={recoveryKind}
              onChange={(event) => {
                setRecoveryKind(event.target.value);
                invalidateRecoveryDraft();
              }}
            >
              <option value="0">Recover excess</option>
              <option value="1">Recover expired allocation</option>
              <option value="2">Rotate recovery recipient</option>
            </select>
            <Input
              aria-label="Recovery allocation ID"
              value={recoveryAllocationId}
              onChange={(event) => {
                setRecoveryAllocationId(event.target.value);
                invalidateRecoveryDraft();
              }}
              disabled={recoveryKind === "2"}
              placeholder="Allocation ID"
            />
            <Input
              aria-label="Recovery amount"
              value={recoveryAmount}
              onChange={(event) => {
                setRecoveryAmount(event.target.value);
                invalidateRecoveryDraft();
              }}
              disabled={recoveryKind === "2"}
              placeholder="Base-unit amount"
            />
          </div>
          <Input
            aria-label="Recovery recipient"
            value={recoveryRecipient}
            onChange={(event) => {
              setRecoveryRecipient(event.target.value as Address);
              invalidateRecoveryDraft();
            }}
            placeholder="0x recovery recipient"
          />
          <Button
            type="button"
            variant="secondary"
            disabled={isPending}
            onClick={buildRecoveryDraft}
          >
            Freeze exact typed action
          </Button>
          {recoveryDraft ? (
            <details open>
              <summary className="cursor-pointer font-semibold">
                Review/export frozen typed data
              </summary>
              <pre className="mt-2 max-h-72 overflow-auto rounded-xl bg-background-ternary p-3 text-xs">
                {JSON.stringify(
                  recoveryDraft.typedData,
                  (_, value) =>
                    typeof value === "bigint" ? value.toString() : value,
                  2,
                )}
              </pre>
              <p className="mt-2 break-all text-content-secondary paragraph-sm">
                Exact action ID: {recoveryDraft.actionId}
              </p>
            </details>
          ) : (
            <RoundsStatus kind="info">
              Freeze the action before collecting signatures. Editing any action
              field invalidates the prior payload and signatures.
            </RoundsStatus>
          )}
          <div className="grid gap-2 sm:grid-cols-2">
            <Input
              aria-label="First recovery signer"
              value={signerOne}
              onChange={(event) => setSignerOne(event.target.value)}
              placeholder="Signer one address"
            />
            <Input
              aria-label="First recovery signature"
              value={signatureOne}
              onChange={(event) => setSignatureOne(event.target.value as Hex)}
              placeholder="0x signature one"
            />
            <Input
              aria-label="Second recovery signer"
              value={signerTwo}
              onChange={(event) => setSignerTwo(event.target.value)}
              placeholder="Signer two address"
            />
            <Input
              aria-label="Second recovery signature"
              value={signatureTwo}
              onChange={(event) => setSignatureTwo(event.target.value as Hex)}
              placeholder="0x signature two"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={isPending || !account}
              onClick={signRecovery}
            >
              Sign typed action
            </Button>
            <Button type="button" disabled={isPending} onClick={queueRecovery}>
              Queue recovery
            </Button>
            {queuedRecovery && (
              <Button
                type="button"
                variant="secondary"
                disabled={
                  isPending ||
                  Math.floor(Date.now() / 1_000) < queuedRecovery.executeAfter
                }
                onClick={() =>
                  act("executeRecovery", [queuedRecovery.actionId])
                }
              >
                Execute after delay
              </Button>
            )}
          </div>
          {queuedRecovery && (
            <RoundsStatus kind="info">
              Queued in this session: {queuedRecovery.actionId}. Executable
              after{" "}
              {new Date(queuedRecovery.executeAfter * 1_000).toLocaleString()}.
              Refresh direct RPC state before execution; role changes invalidate
              authorization.
            </RoundsStatus>
          )}

          <div className="mt-2 grid gap-2 border-t pt-4">
            <h4 className="font-semibold">
              Cancel, execute, or expire a queued action
            </h4>
            <Input
              aria-label="Queued recovery action ID"
              value={cancelActionId}
              onChange={(event) => {
                setCancelActionId(event.target.value);
                setCancellationDraft(undefined);
                setCancelSignatureOne("");
                setCancelSignatureTwo("");
              }}
              placeholder="0x action ID"
            />
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                disabled={isPending}
                onClick={buildCancellationDraft}
              >
                Freeze cancellation typed data
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={
                  isPending || !/^0x[0-9a-fA-F]{64}$/.test(cancelActionId)
                }
                onClick={() => act("executeRecovery", [cancelActionId])}
              >
                Execute ready action
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={
                  isPending || !/^0x[0-9a-fA-F]{64}$/.test(cancelActionId)
                }
                onClick={() => act("expireRecovery", [cancelActionId])}
              >
                Mark expired after deadline
              </Button>
            </div>
            {cancellationDraft && (
              <details open>
                <summary className="cursor-pointer font-semibold">
                  Review/export cancellation typed data
                </summary>
                <pre className="mt-2 max-h-72 overflow-auto rounded-xl bg-background-ternary p-3 text-xs">
                  {JSON.stringify(
                    cancellationDraft.typedData,
                    (_, value) =>
                      typeof value === "bigint" ? value.toString() : value,
                    2,
                  )}
                </pre>
              </details>
            )}
            <div className="grid gap-2 sm:grid-cols-2">
              <Input
                aria-label="First cancellation signer"
                value={cancelSignerOne}
                onChange={(event) => setCancelSignerOne(event.target.value)}
                placeholder="Signer one address"
              />
              <Input
                aria-label="First cancellation signature"
                value={cancelSignatureOne}
                onChange={(event) =>
                  setCancelSignatureOne(event.target.value as Hex)
                }
                placeholder="0x signature one"
              />
              <Input
                aria-label="Second cancellation signer"
                value={cancelSignerTwo}
                onChange={(event) => setCancelSignerTwo(event.target.value)}
                placeholder="Signer two address"
              />
              <Input
                aria-label="Second cancellation signature"
                value={cancelSignatureTwo}
                onChange={(event) =>
                  setCancelSignatureTwo(event.target.value as Hex)
                }
                placeholder="0x signature two"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                disabled={isPending || !account || !cancellationDraft}
                onClick={signCancellation}
              >
                Sign cancellation
              </Button>
              <Button
                type="button"
                disabled={isPending || !cancellationDraft}
                onClick={cancelRecovery}
              >
                Cancel with two signatures
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="mt-5 rounded-xl border bg-white p-4">
        <h3 className="font-semibold">Onchain vault activity</h3>
        <p className="mt-1 text-content-secondary paragraph-sm">
          Rebuilt from vault events. Direct contract reads above remain
          authoritative if the event provider is stale or unavailable.
        </p>
        {vault.activity.length ? (
          <ol className="mt-3 grid gap-2">
            {vault.activity
              .slice()
              .reverse()
              .map((item) => (
                <li
                  key={`${item.transactionHash}-${item.logIndex}`}
                  className="rounded-lg bg-background-ternary p-3 paragraph-sm"
                >
                  <strong>{item.kind}</strong>
                  {item.allocationId !== undefined
                    ? ` · allocation ${item.allocationId}`
                    : ""}
                  {item.amount !== undefined ? ` · amount ${item.amount}` : ""}
                  {item.account ? ` · ${shortenAddress(item.account)}` : ""}
                  {item.actionId ? (
                    <span className="mt-1 block break-all text-content-secondary">
                      {item.actionId}
                    </span>
                  ) : null}
                </li>
              ))}
          </ol>
        ) : (
          <RoundsStatus kind={vault.activityUnavailable ? "error" : "info"}>
            {vault.activityUnavailable
              ? "Prize activity logs are temporarily unavailable."
              : "No vault events have been indexed yet."}
          </RoundsStatus>
        )}
      </div>
      <p className="mt-4 text-content-secondary paragraph-sm">
        Recovery recipient: {shortenAddress(vault.recoveryRecipient)}. Recovery
        requires two currently eligible signatures, a public delay, and cannot
        consume recorded refunds or active winner liabilities.
      </p>
      <p className="mt-2 text-content-secondary paragraph-sm">
        Fee-on-transfer and rebasing tokens may not deliver the displayed
        amount. Use standard token contracts for exact-value awards.
      </p>
      {error && (
        <div className="mt-4">
          <RoundsStatus kind="error">{error}</RoundsStatus>
        </div>
      )}
    </section>
  );
}
