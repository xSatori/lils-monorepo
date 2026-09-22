import { useState } from "react";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useQueryClient } from "@tanstack/react-query";
import { Helmet } from "react-helmet-async";
import { useNavigate, useParams } from "react-router-dom";
import type { Abi, Address } from "viem";
import {
  CircleCheckBig,
  CircleHelp,
  FileText,
  Plus,
  Trophy,
  Vote,
  type LucideIcon,
} from "lucide-react";
import {
  useAccount,
  useChainId,
  usePublicClient,
  useSignMessage,
  useSignTypedData,
  useWriteContract,
} from "wagmi";

import { CHAIN_CONFIG, CHAIN_SPECIFIC_CONFIGS } from "@/config";
import { Button } from "@/components/ui/button";

import { CreateRoundDialog } from "@/features/rounds/CreateRoundPanel";
import {
  getRoundsContracts,
  getRoundAbi,
  getRoundFactoryAbi,
  prizeVaultAbi,
  prizeErc20Abi,
  prizeErc721Abi,
  prizeErc1155Abi,
  type RoundConfigInput,
  type VaultConfigInput,
} from "@/features/rounds/contracts";
import { useRounds, useVoterView } from "@/features/rounds/hooks";
import { RoundCard } from "@/features/rounds/RoundCard";
import { RoundDetail } from "@/features/rounds/RoundDetail";
import { RoundsInfoDialog } from "@/features/rounds/RoundsInfoDialog";
import type {
  RoundActionName,
  RoundActionReceipt,
} from "@/features/rounds/RoundActions";
import { RoundsStatus } from "@/features/rounds/RoundsStatus";
import { buildClaimTypedData } from "@/features/rounds/prizes";
import {
  LifecycleState,
  PrizeAssetType,
  type PrizeAllocation,
  type RoundView,
} from "@/features/rounds/types";

function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
}) {
  return (
    <div className="flex min-h-[116px] flex-col justify-between rounded-[16px] border bg-white p-5">
      <div className="flex items-center justify-between gap-4 text-content-secondary label-sm">
        <span>{label}</span>
        <Icon className="h-5 w-5" aria-hidden="true" />
      </div>
      <p className="heading-4">{value}</p>
    </div>
  );
}

function RoundSection({
  title,
  rounds,
}: {
  title: string;
  rounds: RoundView[];
}) {
  if (!rounds.length) return null;
  const sectionId = `${title.toLowerCase().replace(/\s+/g, "-")}-title`;
  return (
    <section className="flex flex-col gap-4" aria-labelledby={sectionId}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 id={sectionId} className="heading-5">
          {title}
        </h2>
        <span className="text-content-secondary label-sm">
          {rounds.length} round{rounds.length === 1 ? "" : "s"}
        </span>
      </div>
      <ul className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
        {rounds.map((round) => (
          <RoundCard key={round.round} round={round} />
        ))}
      </ul>
    </section>
  );
}

export default function RoundsPage() {
  const { roundAddress } = useParams<{ roundAddress: string }>();
  const navigate = useNavigate();
  const account = useAccount();
  const walletChainId = useChainId();
  // Rounds are intentionally testnet-only until a separately approved mainnet
  // deployment exists. This lets the production site keep mainnet defaults for
  // the rest of Lil Nouns while the Rounds surface uses Sepolia.
  const configuredRoundsChainId = Number(import.meta.env.VITE_ROUNDS_CHAIN_ID);
  const roundsConfig =
    configuredRoundsChainId === 11_155_111
      ? CHAIN_SPECIFIC_CONFIGS[configuredRoundsChainId]!
      : CHAIN_CONFIG;
  const roundsChainId = roundsConfig.chain.id;
  const client = usePublicClient({ chainId: roundsChainId });
  const queryClient = useQueryClient();
  const writer = useWriteContract();
  const typedDataSigner = useSignTypedData();
  const messageSigner = useSignMessage();
  const { openConnectModal } = useConnectModal();
  const contracts = getRoundsContracts(
    roundsChainId,
    import.meta.env.VITE_SEPOLIA_ROUNDS_FACTORY_V7,
  );
  const query = useRounds(
    roundsChainId,
    contracts.factory,
    contracts.factoryGeneration,
    contracts.legacyFactories,
  );
  const round = query.data?.rounds.find(
    (item) => item.round.toLowerCase() === roundAddress?.toLowerCase(),
  );
  const voter = useVoterView(
    round?.round,
    account.address,
    Boolean(round?.snapshotCaptured),
  );
  const [transactionError, setTransactionError] = useState("");
  const [lastTransaction, setLastTransaction] = useState<`0x${string}`>();
  const [transactionState, setTransactionState] = useState<
    "idle" | "pending" | "confirmed"
  >("idle");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const correctChain =
    !account.isConnected || walletChainId === roundsChainId;

  function errorMessage(cause: unknown) {
    if (!(cause instanceof Error)) return "Transaction was rejected.";
    const withShortMessage = cause as Error & { shortMessage?: string };
    return withShortMessage.shortMessage || cause.message;
  }

  async function transact(
    address: Address,
    abi: Abi,
    functionName: string,
    args?: readonly unknown[],
    value?: bigint,
  ) {
    if (!account.address)
      throw new Error("Connect a wallet before sending a transaction.");
    if (!correctChain)
      throw new Error(`Switch your wallet to ${roundsConfig.chain.name}.`);
    if (!client) throw new Error("RPC client is unavailable.");
    setTransactionError("");
    setLastTransaction(undefined);
    setTransactionState("pending");
    try {
      const simulation = await client.simulateContract({
        address,
        abi,
        functionName,
        args,
        value,
        account: account.address,
      });
      const hash = await writer.writeContractAsync(simulation.request);
      setLastTransaction(hash);
      const receipt = await client.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success")
        throw new Error("The transaction reverted.");
      await queryClient.invalidateQueries({
        queryKey: ["onchain-rounds", roundsChainId],
      });
      if (round)
        await queryClient.invalidateQueries({
          queryKey: ["onchain-round-voter", round.round],
        });
      setTransactionState("confirmed");
      return {
        transactionHash: receipt.transactionHash,
        logs: receipt.logs,
      } satisfies RoundActionReceipt;
    } catch (cause) {
      const message = errorMessage(cause);
      setTransactionError(message);
      setTransactionState("idle");
      throw new Error(message);
    }
  }

  async function createRound(
    config: RoundConfigInput,
    salt: `0x${string}`,
    vaultConfig?: VaultConfigInput,
  ) {
    if (!contracts.factory || !query.data)
      throw new Error("Factory is not configured.");
    if (
      contracts.factoryGeneration !== 2 &&
      (!contracts.factoryGeneration || contracts.factoryGeneration < 3)
    )
      throw new Error(
        "This factory generation remains readable, but new round creation is unsupported.",
      );
    if (contracts.factoryGeneration >= 3 && !vaultConfig)
      throw new Error(
        "Prize vault configuration is required for this factory.",
      );
    return await transact(
      contracts.factory,
      getRoundFactoryAbi(contracts.factoryGeneration) as Abi,
      "createRound",
      contracts.factoryGeneration >= 3
        ? [config, vaultConfig, salt]
        : [config, salt],
      query.data.factory.creationFee,
    );
  }

  async function roundAction(
    name: RoundActionName,
    args: readonly unknown[] = [],
  ) {
    if (!round) throw new Error("Round is unavailable.");
    await transact(
      round.round,
      getRoundAbi(round.implementationVersion) as Abi,
      name,
      args,
    );
  }

  async function vaultAction(
    name: string,
    args: readonly unknown[] = [],
    value?: bigint,
  ) {
    if (!round?.prizeVault) throw new Error("Prize vault is unavailable.");
    await transact(
      round.prizeVault.address,
      prizeVaultAbi as Abi,
      name,
      args,
      value,
    );
  }

  async function approvePrizeAsset(
    allocation: PrizeAllocation,
    amount: bigint,
  ) {
    if (!round?.prizeVault) throw new Error("Prize vault is unavailable.");
    if (allocation.assetType === PrizeAssetType.Erc20) {
      await transact(allocation.token, prizeErc20Abi as Abi, "approve", [
        round.prizeVault.address,
        amount,
      ]);
    } else if (allocation.assetType === PrizeAssetType.Erc721) {
      await transact(allocation.token, prizeErc721Abi as Abi, "approve", [
        round.prizeVault.address,
        allocation.tokenId,
      ]);
    } else if (allocation.assetType === PrizeAssetType.Erc1155) {
      await transact(
        allocation.token,
        prizeErc1155Abi as Abi,
        "setApprovalForAll",
        [round.prizeVault.address, true],
      );
    } else {
      throw new Error("ETH prizes do not use token approval.");
    }
  }

  async function claimPrizeTo(allocation: PrizeAllocation, recipient: Address) {
    if (!round?.prizeVault || !account.address || !client)
      throw new Error("Connect the winner wallet before signing a redirect.");
    const nonce = (await client.readContract({
      address: round.prizeVault.address,
      abi: prizeVaultAbi,
      functionName: "claimNonces",
      args: [account.address],
    })) as bigint;
    const deadline = Math.floor(Date.now() / 1_000) + 20 * 60;
    const signature = await typedDataSigner.signTypedDataAsync(
      buildClaimTypedData({
        chainId: roundsChainId,
        vault: round.prizeVault.address,
        round: round.round,
        prizePlanHash: round.prizeVault.prizePlanHash,
        allocationId: allocation.id,
        assetType: allocation.assetType,
        token: allocation.token,
        tokenId: allocation.tokenId,
        amount: allocation.amount,
        recipient,
        nonce,
        deadline,
        domainVersion:
          round.implementationVersion >= 8
            ? "3"
            : round.implementationVersion >= 4
              ? "2"
              : "1",
      }),
    );
    await vaultAction("claimTo", [
      allocation.id,
      recipient,
      deadline,
      signature,
    ]);
  }

  const explorer = roundsConfig.chain.blockExplorers?.default.url;
  const rounds = query.data?.rounds || [];
  const upcomingRounds = rounds.filter(
    (item) => item.lifecycleState === LifecycleState.Upcoming,
  );
  const activeRounds = rounds.filter((item) =>
    [
      LifecycleState.SubmissionsOpen,
      LifecycleState.ModerationPending,
      LifecycleState.VotingOpen,
    ].includes(item.lifecycleState),
  );
  const completedRounds = rounds.filter((item) =>
    [
      LifecycleState.Ended,
      LifecycleState.Finalized,
      LifecycleState.Archived,
    ].includes(item.lifecycleState),
  );
  const submissionCount = rounds.reduce(
    (total, item) => total + item.submissions.length,
    0,
  );
  const voteCount = rounds.reduce(
    (total, item) =>
      total +
      item.submissions.reduce((sum, submission) => sum + submission.votes, 0n),
    0n,
  );
  const finalizedCount = rounds.filter((item) => item.finalized).length;
  return (
    <>
      <Helmet>
        <title>Onchain Rounds · Lil Nouns</title>
        <meta
          name="description"
          content="Create, submit to, moderate, vote in, and finalize Lil Nouns Rounds onchain."
        />
      </Helmet>
      <div id="main-content" className="min-h-screen bg-background-primary">
        {!contracts.factory ? (
          <div className="mx-auto flex max-w-[900px] flex-col gap-5 px-4 py-12 md:px-8">
            <h1 className="heading-3">Onchain Rounds</h1>
            <RoundsStatus kind="info">
              Rounds are not deployed or configured on {roundsConfig.chain.name}
              . An empty address is treated as unavailable, never as proof that
              no rounds exist.
            </RoundsStatus>
          </div>
        ) : query.isLoading ? (
          <div className="mx-auto max-w-[900px] px-4 py-12">
            <RoundsStatus kind="loading">
              Reading the factory and round contracts directly from{" "}
              {roundsConfig.chain.name}…
            </RoundsStatus>
          </div>
        ) : query.error ? (
          <div className="mx-auto flex max-w-[900px] flex-col gap-4 px-4 py-12">
            <h1 className="heading-3">Onchain Rounds</h1>
            <RoundsStatus kind="error">
              RPC read failed: {query.error.message} No empty-state conclusion
              has been inferred from the failed read.
            </RoundsStatus>
            <button
              className="min-h-11 w-fit rounded-xl border-2 px-4 font-semibold"
              onClick={() => query.refetch()}
            >
              Retry direct RPC
            </button>
          </div>
        ) : roundAddress ? (
          round ? (
            <>
              {transactionError && (
                <div className="mx-auto max-w-[1200px] px-4 pt-6">
                  <RoundsStatus kind="error">{transactionError}</RoundsStatus>
                </div>
              )}
              {lastTransaction &&
                explorer &&
                transactionState === "pending" && (
                  <div className="mx-auto max-w-[1200px] px-4 pt-6">
                    <RoundsStatus kind="loading">
                      Transaction submitted. Waiting for confirmation —
                      <a
                        className="ml-1 underline"
                        target="_blank"
                        rel="noreferrer"
                        href={`${explorer}/tx/${lastTransaction}`}
                      >
                        view on explorer
                      </a>
                      .
                    </RoundsStatus>
                  </div>
                )}
              {lastTransaction &&
                explorer &&
                transactionState === "confirmed" && (
                  <div className="mx-auto max-w-[1200px] px-4 pt-6">
                    <RoundsStatus kind="success">
                      Transaction confirmed.{" "}
                      <a
                        className="underline"
                        target="_blank"
                        rel="noreferrer"
                        href={`${explorer}/tx/${lastTransaction}`}
                      >
                        View on explorer
                      </a>
                      .
                    </RoundsStatus>
                  </div>
                )}
              {!correctChain && (
                <div className="mx-auto max-w-[1200px] px-4 pt-6">
                  <RoundsStatus kind="error">
                    Wallet is on the wrong network. Switch to{" "}
                    {roundsConfig.chain.name}; reads remain available.
                  </RoundsStatus>
                </div>
              )}
              <RoundDetail
                round={round}
                chainId={roundsChainId}
                testMode={Boolean(query.data?.factory.testMode)}
                account={account.address}
                voter={voter.data}
                isPending={writer.isPending || transactionState === "pending"}
                onAction={roundAction}
                onVaultAction={vaultAction}
                onApprovePrizeAsset={approvePrizeAsset}
                onClaimPrizeTo={claimPrizeTo}
                signMessage={
                  correctChain
                    ? (message) => messageSigner.signMessageAsync({ message })
                    : undefined
                }
                signTypedData={
                  correctChain
                    ? (data) => typedDataSigner.signTypedDataAsync(data)
                    : undefined
                }
                isGlobalAdmin={Boolean(
                  account.address &&
                    query.data?.factory.globalAdmins.some(
                      (admin) =>
                        admin.toLowerCase() === account.address?.toLowerCase(),
                    ),
                )}
                canApproveMedia={Boolean(
                  account.address &&
                    (round.admins.some(
                      (admin) =>
                        admin.toLowerCase() === account.address?.toLowerCase(),
                    ) ||
                      query.data?.factory.globalAdmins.some(
                        (admin) =>
                          admin.toLowerCase() ===
                          account.address?.toLowerCase(),
                      )),
                )}
              />
            </>
          ) : (
            <div className="mx-auto max-w-[900px] px-4 py-12">
              <RoundsStatus kind="error">
                This address is not in the factory’s onchain registry.
              </RoundsStatus>
            </div>
          )
        ) : (
          <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-10 px-4 py-8 pb-24 md:px-10 md:py-10">
            <header className="grid gap-8 lg:grid-cols-[1fr_520px] lg:items-start">
              <div className="flex min-w-0 flex-col gap-4">
                <h1 className="heading-2">Onchain Rounds</h1>
                <p className="max-w-[760px] text-content-secondary paragraph-lg">
                  Create focused community Rounds - art contests, local public
                  goods, irl activations, and more. All fully onchain.
                </p>
                <div className="grid grid-cols-2 gap-2 pt-2 sm:flex sm:items-center sm:gap-3">
                  <Button type="button" className="min-w-0 px-2 text-xs sm:px-4 sm:text-sm" onClick={() => setIsCreateOpen(true)}>
                    <Plus className="mr-1 h-4 w-4 shrink-0 sm:mr-2" aria-hidden="true" />
                    Create round
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    className="min-w-0 px-2 text-xs sm:px-4 sm:text-sm"
                    onClick={() => setIsInfoOpen(true)}
                  >
                    <CircleHelp className="mr-1 h-4 w-4 shrink-0 sm:mr-2" aria-hidden="true" />
                    How rounds work
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <StatCard
                  label="Rounds created"
                  value={String(rounds.length)}
                  icon={Trophy}
                />
                <StatCard
                  label="Onchain submissions"
                  value={String(submissionCount)}
                  icon={FileText}
                />
                <StatCard
                  label="Votes allocated"
                  value={voteCount.toString()}
                  icon={Vote}
                />
                <StatCard
                  label="Finalized rounds"
                  value={String(finalizedCount)}
                  icon={CircleCheckBig}
                />
              </div>
            </header>
            {query.data?.factory.testMode && (
              <RoundsStatus kind="info">
                <strong>Sepolia test mode.</strong> These contracts enforce
                five-minute submission, moderation-review, and voting phases.
                All fees, roles, snapshots, and voting limits remain active.
              </RoundsStatus>
            )}
            {query.data && contracts.factoryGeneration === 1 && (
              <RoundsStatus kind="info">
                <strong>Legacy v1 factory.</strong> Existing rounds remain
                readable and interactive. New round creation is disabled until a
                generation-2 factory with the moderation-review initializer
                schema is configured.
              </RoundsStatus>
            )}
            {!correctChain && (
              <RoundsStatus kind="error">
                Wallet is on the wrong network. Switch to{" "}
                {roundsConfig.chain.name} before sending transactions.
              </RoundsStatus>
            )}
            {transactionError && (
              <RoundsStatus kind="error">{transactionError}</RoundsStatus>
            )}
            {rounds.length ? (
              <>
                <RoundSection title="Happening now" rounds={activeRounds} />
                <RoundSection title="Starting soon" rounds={upcomingRounds} />
                <RoundSection title="Completed" rounds={completedRounds} />
              </>
            ) : !query.error && !query.isLoading && contracts.factory ? (
              <RoundsStatus kind="info">
                The factory’s authoritative registry is empty. Create its first
                paid round.
              </RoundsStatus>
            ) : null}
            {query.data && (
              <CreateRoundDialog
                isOpen={isCreateOpen}
                onClose={() => setIsCreateOpen(false)}
                factory={query.data.factory}
                factoryAddress={contracts.factory}
                factoryGeneration={contracts.factoryGeneration}
                chainId={roundsChainId}
                votingPowerAdapter={query.data.factory.votingPowerAdapter}
                isConnected={account.isConnected}
                onConnect={openConnectModal}
                isCorrectChain={correctChain}
                isPending={writer.isPending || transactionState === "pending"}
                onCreate={createRound}
                onComplete={(createdRound) =>
                  navigate(`/rounds/${createdRound}?admin=1`)
                }
                account={account.address}
              />
            )}
          </div>
        )}
      </div>
      {contracts.factory && (
        <RoundsInfoDialog
          isOpen={isInfoOpen}
          onClose={() => setIsInfoOpen(false)}
          explorerUrl={explorer}
          factoryAddress={contracts.factory}
          factoryGeneration={contracts.factoryGeneration}
          factory={query.data?.factory}
        />
      )}
    </>
  );
}
