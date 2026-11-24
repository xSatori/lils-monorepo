import type { Address } from "viem";
import {
  CircleDollarSign,
  Database,
  ExternalLink,
  FileCheck2,
  GitBranch,
  ShieldCheck,
  Vote,
  X,
} from "lucide-react";

import Dialog from "@/components/ui/dialog";

import type { FactoryView } from "./rpc";
import { shortenAddress } from "./RoundsStatus";

const SOURCE_URL = "https://github.com/lilnounsDAO/lils-monorepo";

export function votingLifecycleDescription(implementationVersion?: number) {
  if ((implementationVersion ?? 0) >= 8) {
    return "Historical voting power is fixed at round creation; acquiring or delegating votes after creation does not add power to this round. Votes are additive and cannot be moved. Self-voting blocks only the submission owner wallet, not alternate wallets controlled by the same person. Wallet-based limits can be gamed by splitting wallets before creation. Anyone can finalize results in permissionless batches after voting ends.";
  }
  return "An immutable historical voting-power snapshot gates additive votes. Votes cannot be moved or edited. Self-voting blocks the submission owner wallet, not alternate wallets controlled by the same person. Anyone can finalize deterministic winners after voting ends.";
}

function addressUrl(explorerUrl: string | undefined, address: Address) {
  return explorerUrl
    ? `${explorerUrl.replace(/\/$/, "")}/address/${address}`
    : undefined;
}

function ContractLink({
  label,
  address,
  explorerUrl,
  detail,
}: {
  label: string;
  address?: Address;
  explorerUrl?: string;
  detail?: string;
}) {
  const href = address ? addressUrl(explorerUrl, address) : undefined;
  return (
    <li className="flex min-w-0 flex-col gap-1 rounded-xl border bg-white p-3">
      <span className="text-content-secondary label-sm">{label}</span>
      {address && href ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="flex min-h-11 items-center justify-between gap-3 rounded-lg font-mono text-sm underline focus-visible:outline-none focus-visible:ring-2"
        >
          <span className="truncate">{shortenAddress(address)}</span>
          <ExternalLink className="h-4 w-4 shrink-0" aria-hidden="true" />
        </a>
      ) : address ? (
        <span className="break-all font-mono text-sm">{address}</span>
      ) : (
        <span className="text-content-secondary paragraph-sm">
          Live address unavailable
        </span>
      )}
      {detail && (
        <span className="text-content-secondary paragraph-sm">{detail}</span>
      )}
    </li>
  );
}

const lifecycle = [
  {
    title: "Create",
    text: "Anyone can pay the factory’s exact ETH fee. It forwards the fee to the configured treasury and deploys an isolated round; the creator becomes its first admin.",
    icon: CircleDollarSign,
  },
  {
    title: "Submit",
    text: "Wallets submit directly onchain within the round’s limits. Titles, descriptions, owners, content hashes, status, and content-addressed metadata references are committed by the contract.",
    icon: FileCheck2,
  },
  {
    title: "Review",
    text: "Round admins may moderate only before voting. The eligible set freezes when voting begins, so entries cannot be changed underneath voters.",
    icon: ShieldCheck,
  },
  {
    title: "Vote and finalize",
    text: "",
    icon: Vote,
  },
] as const;

export function RoundsInfoDialog({
  isOpen,
  onClose,
  explorerUrl,
  factoryAddress,
  factoryGeneration,
  factory,
}: {
  isOpen: boolean;
  onClose: () => void;
  explorerUrl?: string;
  factoryAddress: Address;
  factoryGeneration?: number;
  factory?: FactoryView;
}) {
  return (
    <Dialog
      isOpen={isOpen}
      onRequestClose={onClose}
      width="52rem"
      className="overflow-hidden"
    >
      {({ titleProps }) => (
        <div className="flex max-h-[85vh] flex-col">
          <header className="flex items-start justify-between gap-4 border-b p-5 md:p-6">
            <div>
              <h2 {...titleProps} className="heading-4">
                How onchain Rounds work
              </h2>
              <p className="mt-2 max-w-[680px] text-content-secondary paragraph-sm">
                Rounds are factory-created, independent smart contracts. The
                chain—not an API, database, or indexer—enforces their schedule,
                roles, submissions, voting, and final results.
              </p>
            </div>
            <button
              type="button"
              aria-label="Close Rounds information"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl hover:bg-background-secondary focus-visible:outline-none focus-visible:ring-2"
              onClick={onClose}
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </header>

          <div className="overflow-y-auto p-5 md:p-6">
            <section aria-labelledby="rounds-lifecycle-title">
              <h3 id="rounds-lifecycle-title" className="heading-6">
                Lifecycle and participant workflow
              </h3>
              <ol className="mt-4 grid list-none gap-3 sm:grid-cols-2">
                {lifecycle.map(({ title, text, icon: Icon }, index) => (
                  <li
                    key={title}
                    className="rounded-xl border bg-background-ternary p-4"
                  >
                    <div className="flex items-center gap-2 font-semibold">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full border bg-white label-sm">
                        {index + 1}
                      </span>
                      <span>{title}</span>
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </div>
                    <p className="mt-3 text-content-secondary paragraph-sm">
                      {title === "Vote and finalize"
                        ? votingLifecycleDescription(
                            factory?.activeImplementationVersion,
                          )
                        : text}
                    </p>
                  </li>
                ))}
              </ol>
            </section>

            <section
              aria-labelledby="rounds-authority-title"
              className="mt-6 rounded-xl border-2 border-dashed p-4"
            >
              <div className="flex items-center gap-2">
                <Database className="h-5 w-5" aria-hidden="true" />
                <h3 id="rounds-authority-title" className="heading-6">
                  What stays offchain
                </h3>
              </div>
              <p className="mt-3 text-content-secondary paragraph-sm">
                Images and long-form content use IPFS. With your own pinning service,
                import the CAR files and the app verifies their contents before
                submitting the transaction. A configured sponsor can pin the
                same content after the transaction confirms.
              </p>
              {factory && factory.activeImplementationVersion >= 5 && (
                <p className="mt-3 text-content-secondary paragraph-sm">
                  This contract commits deterministic media onchain before the host
                  can pin it. The stateless upload route reads that commitment
                  directly and never uses PostgreSQL challenges or sessions.
                  Ordered admin-assisted images need two distinct current global
                  or round admins, are permanent and publicly attributed, and
                  freeze when voting starts.
                </p>
              )}
            </section>

            <section aria-labelledby="rounds-contracts-title" className="mt-6">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 id="rounds-contracts-title" className="heading-6">
                  Current contracts
                </h3>
                <span className="text-content-secondary label-sm">
                  Onchain Rounds 0.1.0
                </span>
              </div>
              <ul className="mt-3 grid gap-3 sm:grid-cols-2">
                <ContractLink
                  label="Rounds factory"
                  address={factoryAddress}
                  explorerUrl={explorerUrl}
                />
                <ContractLink
                  label="Active round implementation"
                  address={factory?.activeImplementation}
                  explorerUrl={explorerUrl}
                />
                <ContractLink
                  label="Active prize-vault implementation"
                  address={factory?.activeVaultImplementation}
                  explorerUrl={explorerUrl}
                  detail={
                    factoryGeneration && factoryGeneration < 3
                      ? "This factory generation does not expose a separate prize-vault implementation."
                      : undefined
                  }
                />
                <ContractLink
                  label="Fee treasury"
                  address={factory?.treasury}
                  explorerUrl={explorerUrl}
                />
                <ContractLink
                  label="Voting-power adapter"
                  address={factory?.votingPowerAdapter}
                  explorerUrl={explorerUrl}
                />
                <ContractLink
                  label="Voting token"
                  address={factory?.votingToken}
                  explorerUrl={explorerUrl}
                />
              </ul>
            </section>

            <footer className="mt-6 flex flex-wrap gap-3 border-t pt-5">
              <a
                href={SOURCE_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-11 items-center gap-2 rounded-xl border-2 px-4 font-semibold hover:bg-background-secondary focus-visible:outline-none focus-visible:ring-2"
              >
                <GitBranch className="h-4 w-4" aria-hidden="true" />
                Source repository
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
              </a>
              <p className="basis-full text-content-secondary paragraph-sm">
                Protocol design and security documentation live under{" "}
                <code>docs/rounds-onchain/</code> in the source repository when
                published.
              </p>
            </footer>
          </div>
        </div>
      )}
    </Dialog>
  );
}
