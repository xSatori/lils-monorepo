import { useState } from "react";
import { ProposalIdea } from "@/data/goldsky/governance/ideaTypes";
import { EnsAvatar } from "../EnsAvatar";
import { EnsName } from "../EnsName";
import { getAddress } from "viem";
import { useAccount } from "wagmi";
import TransactionButton from "@/components/TransactionButton";
import { TransactionState } from "@/hooks/transactions/types";
import { useCanPromoteCandidate } from "@/hooks/useCanPromoteCandidate";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Link } from "react-router-dom";
import { CandidatePromoteDialog } from "./CandidatePromoteDialog";

interface CandidateSidebarProps {
  candidate: ProposalIdea;
  proposalThreshold: number;
  proposerVotingPower: number;
  onSponsor?: () => void;
  onPromote?: (mode?: "signatures" | "tokens") => void;
  promoteState?: TransactionState;
  promoteError?: Error | null;
  onCancel?: () => void;
  cancelState?: TransactionState;
  cancelError?: Error | null;
}

export default function CandidateSidebar({
  candidate,
  proposalThreshold,
  proposerVotingPower,
  onPromote,
  promoteState = "idle",
  promoteError,
  onCancel,
  cancelState = "idle",
  cancelError,
}: CandidateSidebarProps) {
  const { address } = useAccount();
  const [isPromoteDialogOpen, setPromoteDialogOpen] = useState(false);
  const normalizedProposer = candidate.proposerAddress.toLowerCase();
  const proposerMeetsThreshold = proposerVotingPower >= proposalThreshold;
  const isProposer = address?.toLowerCase() === normalizedProposer;
  
  // Check if user can promote (validates threshold, active proposals, etc.)
  const { canPromote, reason: canPromoteReason, isLoading: isLoadingCanPromote } = useCanPromoteCandidate(candidate);

  // Get valid sponsors (from latest version or direct sponsors array)
  const timestamp = Math.floor(Date.now() / 1000);
  const sponsors = candidate.latestVersion.contentSignatures || candidate.sponsors || [];
  const validSponsors = sponsors.filter(
    s => !s.canceled && s.expirationTimestamp > timestamp
  );

  // Deduplicate sponsors by signer and capture their vote weight once
  const uniqueSponsorByAddress = new Map<string, typeof validSponsors[number]>();
  validSponsors.forEach((sponsor) => {
    const signerAddress = getAddress(sponsor.signer.id).toLowerCase();
    if (!uniqueSponsorByAddress.has(signerAddress)) {
      uniqueSponsorByAddress.set(signerAddress, sponsor);
    }
  });
  const uniqueValidSponsors = Array.from(uniqueSponsorByAddress.values());

  // Calculate signature voting power by signer (count each signer once)
  const signatureVotesBySigner = uniqueValidSponsors.reduce((acc, sponsor) => {
    const signerAddress = getAddress(sponsor.signer.id).toLowerCase();
    const signerVotes = sponsor.signer.nounsRepresented?.length || 0;
    const existing = acc.get(signerAddress) || 0;
    acc.set(signerAddress, Math.max(existing, signerVotes));
    return acc;
  }, new Map<string, number>());

  const signatureVotesTotal = Array.from(signatureVotesBySigner.values()).reduce(
    (sum, votes) => sum + votes,
    0
  );

  const proposerSignatureVotes = signatureVotesBySigner.get(normalizedProposer) || 0;
  const otherSignatureVotes = Math.max(0, signatureVotesTotal - proposerSignatureVotes);
  const signatureVotesNeeded = Math.max(0, proposalThreshold - signatureVotesTotal);
  const signatureThresholdMet = signatureVotesNeeded === 0;
  const canPromoteWithTokens = isProposer && proposerVotingPower >= proposalThreshold;
  const canPromoteWithSignatures = isProposer && signatureVotesTotal >= proposalThreshold;

  // Calculate votes needed from sponsors
  const votesNeededFromSponsors = proposerMeetsThreshold 
    ? 0 
    : Math.max(0, proposalThreshold - proposerVotingPower);

  // Determine title display
  const getSponsorsTitle = () => {
    return `Signature votes (${signatureVotesTotal}/${proposalThreshold})`;
  };

  // Check if candidate has been promoted to a proposal
  const proposalId = candidate.latestVersion.proposalId;

  return (
    <div className="flex flex-col gap-6">
      {/* Sponsor List */}
      <div className="flex flex-col gap-4 rounded-[16px] border p-6">
        <h3 className="heading-6">{getSponsorsTitle()}</h3>

        {proposalId ? (
          <Link
            to={`/vote/${proposalId}`}
            className="flex flex-col gap-2 rounded-[12px] border border-semantic-positive bg-green-50 p-4 transition-all hover:bg-green-100"
          >
            <p className="text-sm font-medium text-content-primary">
              This candidate has been promoted to a proposal
            </p>
            <p className="text-xs text-content-secondary">
              View Proposal {proposalId} →
            </p>
          </Link>
        ) : (
          proposerMeetsThreshold && (
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium text-content-secondary">
                No sponsored votes needed
              </p>
              <p className="text-xs text-content-secondary">
                {isProposer ? "You have" : "Proposer has"} {proposerVotingPower}{" "}
                votes and {isProposer ? "meet" : "meets"} threshold
              </p>
              <p className="text-xs text-content-secondary">
                This candidate has met the required threshold, but voters can
                still add support until it's put onchain.
              </p>
            </div>
          )
        )}

        {isProposer ? (
          <div className="flex flex-col gap-3 rounded-[12px] bg-background-secondary p-3">
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium text-content-primary">
                Signature readiness
              </p>
              <p className="text-xs text-content-secondary">
                Counting each signer once. Creator signatures are counted
                separately from their ability to self-promote.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-2 text-xs text-content-secondary">
              <div className="flex items-center justify-between">
                <span>Total signature votes</span>
                <span className="font-semibold text-content-primary">
                  {signatureVotesTotal}/{proposalThreshold}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Creator signature</span>
                <span className="font-semibold text-content-primary">
                  {proposerSignatureVotes > 0
                    ? proposerSignatureVotes
                    : "No signature yet"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Other signatures</span>
                <span className="font-semibold text-content-primary">
                  {otherSignatureVotes}
                </span>
              </div>
            </div>
            {!signatureThresholdMet ? (
              <p className="text-xs text-content-secondary">
                {signatureVotesNeeded} more signature vote
                {signatureVotesNeeded === 1 ? "" : "s"} needed to promote via
                signatures.
              </p>
            ) : (
              <p className="text-xs font-semibold text-semantic-positive">
                Signature voting power is sufficient to promote onchain.
              </p>
            )}
            {proposerMeetsThreshold && (
              <div className="flex flex-col gap-1 rounded-[10px] border border-semantic-positive bg-green-50 p-3 text-xs text-content-secondary">
                <span className="font-semibold text-content-primary">
                  {isProposer ? "You" : "The creator"} have enough votes to
                  promote without more signatures.
                </span>
                <span>
                  Self-promotion uses creator voting power directly; their
                  signature (if provided) still counts once in the signature
                  tally.
                </span>
              </div>
            )}
          </div>
        ) : (
          <></>
        )}

        {uniqueValidSponsors.length > 0 ? (
          <div className="flex flex-col gap-3">
            {uniqueValidSponsors.map((sponsor, i) => (
              <div key={i} className="flex items-center gap-2">
                <EnsAvatar address={getAddress(sponsor.signer.id)} size={32} />
                <div className="flex flex-1 flex-col">
                  <EnsName
                    address={getAddress(sponsor.signer.id)}
                    className="paragraph-sm"
                  />
                  <span className="text-content-secondary paragraph-xs">
                    {sponsor.signer.nounsRepresented?.length || 0} votes
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          !proposerMeetsThreshold && (
            <p className="text-content-secondary paragraph-sm">
              No sponsors yet. {votesNeededFromSponsors} more votes needed from
              sponsors. Be the first to sponsor this candidate!
            </p>
          )
        )}
      </div>

      {/* Actions */}
      {!candidate.canceledTimestamp &&
        isProposer &&
        !candidate.latestVersion.proposalId && (
          <div className="flex flex-col gap-3">
            {onPromote && (
              <>
                {isLoadingCanPromote ? (
                  <TransactionButton
                    className="w-full"
                    disabled={true}
                    txnState="idle"
                  >
                    Checking...
                  </TransactionButton>
                ) : (
                  <Tooltip delayDuration={300}>
                    <TooltipTrigger asChild>
                      <div className="w-full">
                        <TransactionButton
                          onClick={() => setPromoteDialogOpen(true)}
                          className="w-full"
                          txnState={promoteState}
                          disabled={promoteState === "pending-txn"}
                        >
                          {promoteState === "pending-txn"
                            ? "Promoting..."
                            : "Choose promotion method"}
                        </TransactionButton>
                      </div>
                    </TooltipTrigger>
                    {!canPromote && canPromoteReason && (
                      <TooltipContent side="top" className="max-w-[300px]">
                        {canPromoteReason}
                      </TooltipContent>
                    )}
                  </Tooltip>
                )}
                {promoteError && (
                  <div className="max-h-[50px] w-full overflow-y-auto text-center text-semantic-negative paragraph-sm">
                    {promoteError.message}
                  </div>
                )}
              </>
            )}

            {onCancel && (
              <TransactionButton
                variant="negative"
                className="w-full"
                onClick={onCancel}
                txnState={cancelState}
              >
                {cancelState === "pending-txn"
                  ? "Cancelling..."
                  : "Cancel Candidate"}
              </TransactionButton>
            )}
            {cancelError && (
              <div className="max-h-[50px] w-full overflow-y-auto text-center text-semantic-negative paragraph-sm">
                {cancelError.message}
              </div>
            )}
          </div>
        )}

      {onPromote && (
        <CandidatePromoteDialog
          open={isPromoteDialogOpen}
          onOpenChange={setPromoteDialogOpen}
          proposalThreshold={proposalThreshold}
          signatureVotesTotal={signatureVotesTotal}
          proposerVotingPower={proposerVotingPower}
          canPromoteWithSignatures={canPromoteWithSignatures}
          canPromoteWithTokens={canPromoteWithTokens}
          onPromote={onPromote}
          promoteState={promoteState}
          promoteError={promoteError}
        />
      )}
    </div>
  );
}

