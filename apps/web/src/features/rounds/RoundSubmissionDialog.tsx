import { X } from "lucide-react";
import type { Address, Hex } from "viem";

import { Button } from "@/components/ui/button";
import Dialog from "@/components/ui/dialog";

import { SubmissionPanel, type RoundAction } from "./RoundActions";
import type { RoundView } from "./types";

export function RoundSubmissionDialog({
  isOpen,
  onClose,
  round,
  chainId,
  account,
  isPending,
  onAction,
  signMessage,
}: {
  isOpen: boolean;
  onClose: () => void;
  round: RoundView;
  chainId: number;
  account?: Address;
  isPending: boolean;
  onAction: RoundAction;
  signMessage?: (message: string) => Promise<Hex>;
}) {
  return (
    <Dialog
      isOpen={isOpen}
      onRequestClose={onClose}
      width="64rem"
      className="max-h-[90vh] overflow-hidden"
    >
      {({ titleProps }) => (
        <div className="flex max-h-[90vh] flex-col">
          <header className="flex items-start justify-between gap-4 border-b bg-white px-4 py-4 md:px-6">
            <div>
              <h2 {...titleProps} className="heading-5">
                Submit entry
              </h2>
              <p className="mt-1 text-content-secondary paragraph-sm">
                Review the current phase and onchain limits before submitting.
                Entries can only be submitted while submissions are open.
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Close submission form"
              onClick={onClose}
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </Button>
          </header>
          <div className="overflow-y-auto bg-background-primary p-4 md:p-6">
            <SubmissionPanel
              round={round}
              isPending={isPending}
              onAction={onAction}
              account={account}
              chainId={chainId}
              signMessage={signMessage}
            />
          </div>
        </div>
      )}
    </Dialog>
  );
}
