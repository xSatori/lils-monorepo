import { X } from "lucide-react";
import type { Address, Hex, TypedDataDefinition } from "viem";

import { Button } from "@/components/ui/button";
import Dialog from "@/components/ui/dialog";

import {
  downloadCsv,
  roundSubmissionsCsv,
  roundVoteActivityCsv,
} from "./export";
import {
  AdminPanel,
  ArchiveRoundAction,
  type RoundAction,
} from "./RoundActions";
import {
  PrizeVaultPanel,
  type PrizeAssetApproval,
  type PrizeClaimTo,
  type PrizeVaultAction,
} from "./PrizeVaultPanel";
import { SubmissionImageAdmin } from "./SubmissionImageAdmin";
import { RoundsStatus } from "./RoundsStatus";
import { RoundScheduleAdmin } from "./RoundScheduleAdmin";
import type { RoundView } from "./types";

export function RoundAdminDialog({
  isOpen,
  onClose,
  round,
  chainId,
  testMode,
  account,
  isRoundAdmin,
  canApproveMedia,
  isPending,
  onAction,
  onVaultAction,
  onApprovePrizeAsset,
  onClaimPrizeTo,
  signTypedData,
  promptFunding = false,
}: {
  isOpen: boolean;
  onClose: () => void;
  round: RoundView;
  chainId: number;
  testMode: boolean;
  account?: Address;
  isRoundAdmin: boolean;
  canApproveMedia: boolean;
  isPending: boolean;
  onAction: RoundAction;
  onVaultAction?: PrizeVaultAction;
  onApprovePrizeAsset?: PrizeAssetApproval;
  onClaimPrizeTo?: PrizeClaimTo;
  signTypedData?: (data: TypedDataDefinition) => Promise<Hex>;
  promptFunding?: boolean;
}) {
  return (
    <Dialog
      isOpen={isOpen}
      onRequestClose={onClose}
      width="64rem"
      className="overflow-hidden"
    >
      {({ titleProps }) => (
        <div className="flex max-h-[85vh] flex-col bg-background-primary">
          <header className="flex shrink-0 items-start justify-between gap-4 border-b bg-white px-4 py-4 md:px-8">
            <div>
              <h2 {...titleProps} className="heading-5">
                Round administration
              </h2>
              <p className="mt-1 max-w-[760px] text-content-secondary paragraph-sm">
                {round.implementationVersion >= 6
                  ? "First fund every prize in the vault, then seal it. Finally, set the submission and review schedule before submissions open."
                  : "Contract permissions remain authoritative. Controls below stay unavailable when this account lacks the required role."}
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Close round administration"
              onClick={onClose}
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </Button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto grid w-full max-w-[1200px] gap-6 px-4 py-6 md:px-8 md:py-8">
              {promptFunding && round.prizeVault && (
                <RoundsStatus kind="info">
                  <strong>Fund the prize vault now.</strong> Fund every prize
                  and seal the vault.
                  {round.implementationVersion >= 6
                    ? " Then set the submission and review schedule."
                    : " Do this before the scheduled submission start."}{" "}
                  The round cannot accept entries while the vault is unfunded.
                </RoundsStatus>
              )}
              <PrizeVaultPanel
                chainId={chainId}
                round={round}
                account={account}
                isPending={isPending}
                onAction={onVaultAction}
                onApprove={onApprovePrizeAsset}
                onClaimTo={onClaimPrizeTo}
              />

              {round.implementationVersion >= 6 && (
                <RoundScheduleAdmin
                  round={round}
                  isAdmin={Boolean(
                    isRoundAdmin ||
                      account?.toLowerCase() === round.creator.toLowerCase(),
                  )}
                  testMode={testMode}
                  isPending={isPending}
                  onAction={onAction}
                />
              )}

              <AdminPanel
                round={round}
                account={account}
                isAdmin={isRoundAdmin}
                isPending={isPending}
                onAction={onAction}
              />

              <ArchiveRoundAction
                round={round}
                isAdmin={isRoundAdmin}
                isPending={isPending}
                onAction={onAction}
              />

              {round.implementationVersion >= 5 && (
                <SubmissionImageAdmin
                  round={round}
                  chainId={chainId}
                  account={account}
                  canApprove={canApproveMedia}
                  isPending={isPending}
                  signTypedData={signTypedData}
                  onAction={onAction}
                />
              )}

              <section
                aria-labelledby="admin-exports-title"
                className="rounded-[16px] border bg-white p-5"
              >
                <h3 id="admin-exports-title" className="heading-6">
                  Onchain exports
                </h3>
                <p className="mt-1 text-content-secondary paragraph-sm">
                  CSV files are derived from direct RPC state and rebuildable
                  events; they are not protocol authority.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() =>
                      downloadCsv(
                        `round-${round.round}-submissions.csv`,
                        roundSubmissionsCsv(round),
                      )
                    }
                  >
                    Export onchain submissions CSV
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() =>
                      downloadCsv(
                        `round-${round.round}-vote-events.csv`,
                        roundVoteActivityCsv(round),
                      )
                    }
                  >
                    Export vote events CSV
                  </Button>
                </div>
              </section>
            </div>
          </div>
        </div>
      )}
    </Dialog>
  );
}
