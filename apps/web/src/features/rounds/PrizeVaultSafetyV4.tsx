import { useState } from "react";
import { isAddress, type Address, type Hex } from "viem";
import { useSignTypedData } from "wagmi";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CHAIN_CONFIG } from "@/config";

import {
  buildSafetyCancellationTypedData,
  freezeAllocationAction,
  freezeSafetyAction,
} from "./prizes";
import { RoundsStatus } from "./RoundsStatus";
import { PrizeAssetType, type RoundView } from "./types";
import type { PrizeVaultAction } from "./PrizeVaultPanel";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const allocationActionNames = ["hold", "unhold", "reclaim"] as const;

function signatureReady(signer: string, signature: string) {
  return isAddress(signer) && /^0x[0-9a-fA-F]+$/.test(signature);
}

export function PrizeVaultSafetyV4({
  round,
  account,
  isPending,
  onAction,
}: {
  round: RoundView;
  account?: string;
  isPending: boolean;
  onAction?: PrizeVaultAction;
}) {
  const vault = round.prizeVault!;
  const signer = useSignTypedData();
  const [allocationId, setAllocationId] = useState("0");
  const [allocationAction, setAllocationAction] = useState("0");
  const [allocationDraft, setAllocationDraft] =
    useState<ReturnType<typeof freezeAllocationAction>>();
  const [allocationSignerOne, setAllocationSignerOne] = useState(account || "");
  const [allocationSignatureOne, setAllocationSignatureOne] = useState<
    Hex | ""
  >("");
  const [allocationSignerTwo, setAllocationSignerTwo] = useState("");
  const [allocationSignatureTwo, setAllocationSignatureTwo] = useState<
    Hex | ""
  >("");

  const [safetyKind, setSafetyKind] = useState("0");
  const [safetyAllocationId, setSafetyAllocationId] = useState("0");
  const [safetyAmount, setSafetyAmount] = useState("0");
  const [safetyRecipient, setSafetyRecipient] = useState(
    vault.recoveryRecipient,
  );
  const [safetyDraft, setSafetyDraft] =
    useState<ReturnType<typeof freezeSafetyAction>>();
  const [safetySignerOne, setSafetySignerOne] = useState(account || "");
  const [safetySignatureOne, setSafetySignatureOne] = useState<Hex | "">("");
  const [safetySignerTwo, setSafetySignerTwo] = useState("");
  const [safetySignatureTwo, setSafetySignatureTwo] = useState<Hex | "">("");
  const [queuedAction, setQueuedAction] = useState<{
    id: Hex;
    executeAfter: number;
  }>();
  const [executeActionId, setExecuteActionId] = useState("");
  const [cancelActionId, setCancelActionId] = useState("");
  const [cancelDraft, setCancelDraft] = useState<{
    typedData: ReturnType<typeof buildSafetyCancellationTypedData>;
    deadline: number;
  }>();
  const [cancelSignerOne, setCancelSignerOne] = useState(account || "");
  const [cancelSignatureOne, setCancelSignatureOne] = useState<Hex | "">("");
  const [cancelSignerTwo, setCancelSignerTwo] = useState("");
  const [cancelSignatureTwo, setCancelSignatureTwo] = useState<Hex | "">("");
  const [error, setError] = useState("");

  async function act(name: string, args: readonly unknown[]) {
    setError("");
    if (!onAction)
      return setError("Prize-vault writes are unavailable on this network.");
    try {
      await onAction(name, args);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Prize safety transaction was rejected.",
      );
      throw cause;
    }
  }

  function invalidateAllocationDraft() {
    setAllocationDraft(undefined);
    setAllocationSignatureOne("");
    setAllocationSignatureTwo("");
  }

  function buildAllocationDraft() {
    const parsedId = /^\d+$/.test(allocationId) ? BigInt(allocationId) : -1n;
    const allocation = vault.allocations.find((item) => item.id === parsedId);
    if (!allocation) return setError("Choose an existing prize allocation.");
    const now = Math.floor(Date.now() / 1_000);
    setAllocationDraft(
      freezeAllocationAction({
        chainId: CHAIN_CONFIG.chain.id,
        vault: vault.address,
        round: round.round,
        prizePlanHash: vault.prizePlanHash,
        action: Number(allocationAction),
        allocationId: allocation.id,
        recoveryRecipient: vault.recoveryRecipient,
        recoveryDelay: vault.recoveryDelay,
        nonce: allocation.nonce,
        deadline: now + vault.recoveryDelay + 24 * 60 * 60,
        assetType: allocation.assetType,
        token: allocation.token,
        tokenId: allocation.tokenId,
        amount: allocation.amount,
        domainVersion: round.implementationVersion >= 8 ? "3" : "2",
      }),
    );
    setError("");
  }

  async function signAllocationAction() {
    if (!account || !allocationDraft)
      return setError(
        "Freeze the action and connect an authorized signer first.",
      );
    try {
      const signature = await signer.signTypedDataAsync(
        allocationDraft.typedData,
      );
      setAllocationSignerOne(account);
      setAllocationSignatureOne(signature);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Signature was rejected.",
      );
    }
  }

  async function submitAllocationAction() {
    if (!allocationDraft)
      return setError("Freeze the exact allocation action first.");
    if (
      !signatureReady(allocationSignerOne, allocationSignatureOne) ||
      !signatureReady(allocationSignerTwo, allocationSignatureTwo)
    )
      return setError(
        "Two distinct authorized signer addresses and signatures are required.",
      );
    const name = allocationActionNames[Number(allocationAction)];
    if (!name) return setError("Invalid allocation action.");
    await act(name, [
      BigInt(allocationId),
      allocationDraft.deadline,
      allocationSignerOne,
      allocationSignatureOne,
      allocationSignerTwo,
      allocationSignatureTwo,
    ]);
  }

  function invalidateSafetyDraft() {
    setSafetyDraft(undefined);
    setSafetySignatureOne("");
    setSafetySignatureTwo("");
  }

  function buildSafetyDraft() {
    if (!isAddress(safetyRecipient))
      return setError("Enter a valid safety recipient.");
    const rotate = safetyKind === "1";
    const parsedId = /^\d+$/.test(safetyAllocationId)
      ? BigInt(safetyAllocationId)
      : -1n;
    const allocation = vault.allocations.find((item) => item.id === parsedId);
    if (!rotate && !allocation)
      return setError("Choose an allocation whose asset has excess balance.");
    const amount = rotate ? 0n : BigInt(safetyAmount || "0");
    if (!rotate && amount <= 0n)
      return setError("Recovery amount must be positive.");
    const now = Math.floor(Date.now() / 1_000);
    const draft = freezeSafetyAction({
      chainId: CHAIN_CONFIG.chain.id,
      vault: vault.address,
      round: round.round,
      prizePlanHash: vault.prizePlanHash,
      kind: Number(safetyKind),
      assetType: rotate ? PrizeAssetType.Native : allocation!.assetType,
      token: rotate ? ZERO_ADDRESS : allocation!.token,
      tokenId: rotate ? 0n : allocation!.tokenId,
      amount,
      recipient: safetyRecipient,
      expectedRecoveryRecipient: vault.recoveryRecipient,
      nonce: vault.safetyNonce,
      deadline: now + vault.recoveryDelay + 24 * 60 * 60,
      domainVersion: round.implementationVersion >= 8 ? "3" : "2",
    });
    setSafetyDraft(draft);
    setError("");
  }

  async function signSafetyAction() {
    if (!account || !safetyDraft)
      return setError(
        "Freeze the safety action and connect an authorized signer first.",
      );
    try {
      const signature = await signer.signTypedDataAsync(safetyDraft.typedData);
      setSafetySignerOne(account);
      setSafetySignatureOne(signature);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Signature was rejected.",
      );
    }
  }

  async function queueSafetyAction() {
    if (!safetyDraft) return setError("Freeze the exact safety action first.");
    if (
      !signatureReady(safetySignerOne, safetySignatureOne) ||
      !signatureReady(safetySignerTwo, safetySignatureTwo)
    )
      return setError(
        "Two distinct authorized signer addresses and signatures are required.",
      );
    await act("queueSafetyAction", [
      safetyDraft.action,
      safetySignerOne,
      safetySignatureOne,
      safetySignerTwo,
      safetySignatureTwo,
    ]);
    const executeAfter = Math.floor(Date.now() / 1_000) + vault.recoveryDelay;
    setQueuedAction({ id: safetyDraft.actionId, executeAfter });
    setExecuteActionId(safetyDraft.actionId);
  }

  function buildCancelDraft() {
    if (!/^0x[0-9a-fA-F]{64}$/.test(cancelActionId))
      return setError("Enter a valid queued safety action ID.");
    const deadline = Math.floor(Date.now() / 1_000) + 24 * 60 * 60;
    setCancelDraft({
      typedData: buildSafetyCancellationTypedData({
        chainId: CHAIN_CONFIG.chain.id,
        vault: vault.address,
        round: round.round,
        prizePlanHash: vault.prizePlanHash,
        actionId: cancelActionId as Hex,
        deadline,
        domainVersion: "3",
      }),
      deadline,
    });
    setCancelSignatureOne("");
    setCancelSignatureTwo("");
    setError("");
  }

  async function signCancelDraft() {
    if (!account || !cancelDraft)
      return setError(
        "Freeze a cancellation and connect an authorized signer first.",
      );
    try {
      const signature = await signer.signTypedDataAsync(cancelDraft.typedData);
      setCancelSignerOne(account);
      setCancelSignatureOne(signature);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Signature was rejected.",
      );
    }
  }

  async function cancelSafetyAction() {
    if (!cancelDraft)
      return setError("Freeze the cancellation before submitting it.");
    if (
      !signatureReady(cancelSignerOne, cancelSignatureOne) ||
      !signatureReady(cancelSignerTwo, cancelSignatureTwo)
    )
      return setError(
        "The global multisig and one eligible recovery round admin must sign.",
      );
    await act("cancelSafetyAction", [
      cancelActionId,
      cancelDraft.deadline,
      cancelSignerOne,
      cancelSignatureOne,
      cancelSignerTwo,
      cancelSignatureTwo,
    ]);
  }

  return (
    <div className="mt-5 grid gap-4 rounded-xl border bg-white p-4">
      <div>
        <h3 className="font-semibold">Two-signature prize safety</h3>
        <p className="text-content-secondary paragraph-sm">
          {round.implementationVersion >= 8
            ? "Every privileged action needs two distinct signers: the global-admin multisig and one currently eligible recovery round admin, in either order. Reclaim needs a fresh quorum after the hold delay and can only pay the fixed recovery recipient."
            : "Two current global/round admins, in any approved mix, can hold one unclaimed prize. Reclaim needs a fresh quorum after the hold delay and can only pay the fixed recovery recipient."}
        </p>
        {round.implementationVersion >= 8 && (
          <p className="text-content-secondary paragraph-sm mt-2">
            On Sepolia, the global-admin contract requires both of its owners to
            sign the frozen typed data. Enter the global-admin contract as one
            signer and concatenate the two owner signatures (owner one, then
            owner two, removing the second 0x) in its signature field. The other
            signer is an eligible round-admin wallet. A single owner&apos;s
            signature is not sufficient.
          </p>
        )}
      </div>

      <div className="grid gap-3 rounded-xl bg-background-ternary p-3">
        <h4 className="font-semibold">
          Hold, unhold, or reclaim one allocation
        </h4>
        <div className="grid gap-2 sm:grid-cols-2">
          <select
            className="min-h-11 rounded-xl border px-3"
            value={allocationAction}
            onChange={(event) => {
              setAllocationAction(event.target.value);
              invalidateAllocationDraft();
            }}
          >
            <option value="0">Hold</option>
            <option value="1">Unhold</option>
            <option value="2">Reclaim held prize</option>
          </select>
          <Input
            aria-label="Safety allocation ID"
            value={allocationId}
            onChange={(event) => {
              setAllocationId(event.target.value);
              invalidateAllocationDraft();
            }}
          />
        </div>
        <Button
          type="button"
          variant="secondary"
          disabled={isPending}
          onClick={buildAllocationDraft}
        >
          Freeze exact allocation action
        </Button>
        {allocationDraft && (
          <pre className="max-h-64 overflow-auto rounded-xl bg-white p-3 text-xs">
            {JSON.stringify(
              allocationDraft.typedData,
              (_, value) =>
                typeof value === "bigint" ? value.toString() : value,
              2,
            )}
          </pre>
        )}
        <div className="grid gap-2 sm:grid-cols-2">
          <Input
            value={allocationSignerOne}
            onChange={(e) => setAllocationSignerOne(e.target.value)}
            placeholder="Signer one address"
          />
          <Input
            value={allocationSignatureOne}
            onChange={(e) => setAllocationSignatureOne(e.target.value as Hex)}
            placeholder="0x signature one"
          />
          <Input
            value={allocationSignerTwo}
            onChange={(e) => setAllocationSignerTwo(e.target.value)}
            placeholder="Signer two address"
          />
          <Input
            value={allocationSignatureTwo}
            onChange={(e) => setAllocationSignatureTwo(e.target.value as Hex)}
            placeholder="0x signature two"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={isPending || !account || !allocationDraft}
            onClick={signAllocationAction}
          >
            Sign action
          </Button>
          <Button
            type="button"
            disabled={isPending || !allocationDraft}
            onClick={submitAllocationAction}
          >
            Submit two-signature action
          </Button>
        </div>
      </div>

      <div className="grid gap-3 rounded-xl bg-background-ternary p-3">
        <h4 className="font-semibold">Delayed no-stuck safety action</h4>
        <p className="text-content-secondary paragraph-sm">
          Recover only balance above all liabilities, or rotate the fixed
          recovery recipient. Both require two signatures plus the public delay.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          <select
            className="min-h-11 rounded-xl border px-3"
            value={safetyKind}
            onChange={(event) => {
              setSafetyKind(event.target.value);
              invalidateSafetyDraft();
            }}
          >
            <option value="0">Recover excess asset</option>
            <option value="1">Rotate recovery recipient</option>
          </select>
          <Input
            value={safetyAllocationId}
            disabled={safetyKind === "1"}
            onChange={(event) => {
              setSafetyAllocationId(event.target.value);
              invalidateSafetyDraft();
            }}
            placeholder="Allocation ID / asset"
          />
          <Input
            value={safetyAmount}
            disabled={safetyKind === "1"}
            onChange={(event) => {
              setSafetyAmount(event.target.value);
              invalidateSafetyDraft();
            }}
            placeholder="Base-unit amount"
          />
          <Input
            value={safetyRecipient}
            onChange={(event) => {
              setSafetyRecipient(event.target.value as Address);
              invalidateSafetyDraft();
            }}
            placeholder="Recovery recipient"
          />
        </div>
        <Button
          type="button"
          variant="secondary"
          disabled={isPending}
          onClick={buildSafetyDraft}
        >
          Freeze exact delayed action
        </Button>
        {safetyDraft && (
          <pre className="max-h-64 overflow-auto rounded-xl bg-white p-3 text-xs">
            {JSON.stringify(
              safetyDraft.typedData,
              (_, value) =>
                typeof value === "bigint" ? value.toString() : value,
              2,
            )}
          </pre>
        )}
        <div className="grid gap-2 sm:grid-cols-2">
          <Input
            value={safetySignerOne}
            onChange={(e) => setSafetySignerOne(e.target.value)}
            placeholder="Signer one address"
          />
          <Input
            value={safetySignatureOne}
            onChange={(e) => setSafetySignatureOne(e.target.value as Hex)}
            placeholder="0x signature one"
          />
          <Input
            value={safetySignerTwo}
            onChange={(e) => setSafetySignerTwo(e.target.value)}
            placeholder="Signer two address"
          />
          <Input
            value={safetySignatureTwo}
            onChange={(e) => setSafetySignatureTwo(e.target.value as Hex)}
            placeholder="0x signature two"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={isPending || !account || !safetyDraft}
            onClick={signSafetyAction}
          >
            Sign delayed action
          </Button>
          <Button
            type="button"
            disabled={isPending || !safetyDraft}
            onClick={queueSafetyAction}
          >
            Queue delayed action
          </Button>
        </div>
        <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
          <Input
            value={executeActionId}
            onChange={(e) => setExecuteActionId(e.target.value)}
            placeholder="0x queued action ID"
          />
          <Button
            type="button"
            variant="secondary"
            disabled={isPending || !/^0x[0-9a-fA-F]{64}$/.test(executeActionId)}
            onClick={() => act("executeSafetyAction", [executeActionId])}
          >
            Execute ready action
          </Button>
        </div>
        {queuedAction && (
          <RoundsStatus kind="info">
            Queued {queuedAction.id}. Public execution opens after{" "}
            {new Date(queuedAction.executeAfter * 1_000).toLocaleString()}.
          </RoundsStatus>
        )}
        {round.implementationVersion >= 8 && (
          <div className="mt-3 grid gap-3 rounded-xl border bg-white p-3">
            <h5 className="font-semibold">Cancel queued safety action</h5>
            <Input
              aria-label="Queued safety action ID to cancel"
              value={cancelActionId}
              onChange={(event) => {
                setCancelActionId(event.target.value);
                setCancelDraft(undefined);
                setCancelSignatureOne("");
                setCancelSignatureTwo("");
              }}
              placeholder="0x queued action ID"
            />
            <Button
              type="button"
              variant="secondary"
              disabled={isPending}
              onClick={buildCancelDraft}
            >
              Freeze cancellation typed data
            </Button>
            {cancelDraft && (
              <pre className="max-h-64 overflow-auto rounded-xl bg-background-ternary p-3 text-xs">
                {JSON.stringify(cancelDraft.typedData, null, 2)}
              </pre>
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
                disabled={isPending || !account || !cancelDraft}
                onClick={signCancelDraft}
              >
                Sign cancellation
              </Button>
              <Button
                type="button"
                disabled={isPending || !cancelDraft}
                onClick={cancelSafetyAction}
              >
                Cancel with two signatures
              </Button>
            </div>
          </div>
        )}
      </div>
      {error && <RoundsStatus kind="error">{error}</RoundsStatus>}
    </div>
  );
}
