"use client";

import { useState, useEffect } from "react";
import { useAccount } from "wagmi";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { SnapshotProposal, SnapshotVote } from "@/data/snapshot/getSnapshotProposals";
import Icon from "@/components/ui/Icon";
import { Check, CheckCircle2 } from "lucide-react";
import clsx from "clsx";

interface SnapshotVoteFormProps {
  snapshotProposal: SnapshotProposal;
  onVote: (choice: number, reason?: string) => Promise<void>;
  isLoading?: boolean;
  hasVoted?: boolean;
  userVote?: SnapshotVote;
}

export function SnapshotVoteForm({ snapshotProposal, onVote, isLoading, hasVoted = false, userVote }: SnapshotVoteFormProps) {
  const { isConnected } = useAccount();
  
  // Map choice numbers to labels
  const choiceLabels: Record<number, string> = {
    1: "For",
    2: "Against",
    3: "Abstain",
  };
  
  // Initialize form with user's existing vote if they've voted
  const [selectedChoice, setSelectedChoice] = useState<number | null>(
    userVote?.choice || null
  );
  const [reason, setReason] = useState(userVote?.reason || "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  
  // Update form when userVote changes
  useEffect(() => {
    if (userVote) {
      setSelectedChoice(userVote.choice);
      setReason(userVote.reason || "");
    }
  }, [userVote]);

  const handleVote = async () => {
    if (selectedChoice === null) return;

    setIsSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(false);
    try {
      await onVote(selectedChoice, reason || undefined);
      setSubmitSuccess(true);
    } catch (error) {
      console.error("Failed to vote:", error);
      setSubmitError(
        error instanceof Error
          ? error.message
          : "Snapshot rejected the vote. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const choices = snapshotProposal.choices || ["For", "Against", "Abstain"];
  const isVoteDisabled = isLoading || isSubmitting;

  return (
    <div className="flex w-full flex-col gap-4 rounded-[16px] border p-6">
      <div className="flex items-center gap-2">
        <Icon icon="vote" size={20} className="fill-semantic-accent" />
        <h3 className="heading-6">Lil Nouns Vote</h3>
      </div>

      <p className="text-content-secondary paragraph-sm">
        Vote on this Nouns DAO proposal using Snapshot. Your vote will be recorded off-chain.
      </p>

      {/* Show indicator if user has already voted */}
      {hasVoted && userVote && (
        <div className="flex flex-col gap-2 rounded-[12px] border border-green-200 bg-green-50 p-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={18} className="text-green-600" />
            <p className="text-sm font-medium text-green-800">
              You've already voted: {choiceLabels[userVote.choice] || `Choice ${userVote.choice}`}
            </p>
          </div>
          <p className="text-xs text-green-700">
            You can update your vote and reason below.
          </p>
        </div>
      )}

      {snapshotProposal.state === "active" ? (
        <>
          {!isConnected ? (
            <div className="flex flex-col gap-3 rounded-[12px] border border-semantic-warning bg-yellow-50 p-4">
              <p className="text-sm text-content-secondary">
                Connect your wallet to vote on this proposal
              </p>
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-2">
                {choices.map((choice, index) => {
                  const choiceNum = index + 1;
                  const isSelected = selectedChoice === choiceNum;
                  
                  return (
                    <button
                      key={choiceNum}
                      onClick={() => {
                        setSelectedChoice(choiceNum);
                        setSubmitError(null);
                        setSubmitSuccess(false);
                      }}
                      disabled={isVoteDisabled}
                      className={clsx(
                        "flex items-center gap-3 rounded-[12px] border p-4 text-left transition-all",
                        isSelected
                          ? "border-semantic-accent bg-blue-50"
                          : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                      )}
                    >
                      <div className={clsx(
                        "flex h-8 w-8 items-center justify-center rounded-full border-2",
                        isSelected 
                          ? "border-semantic-accent bg-white" 
                          : "border-gray-300"
                      )}>
                        {isSelected && (
                          <Check size={20} className="text-semantic-accent" />
                        )}
                      </div>
                      <span className="label-md">{choice}</span>
                    </button>
                  );
                })}
              </div>

              <div className="flex flex-col gap-2">
                <label className="label-sm text-content-secondary">
                  Reason (optional)
                </label>
                <Textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Share your reasoning for this vote..."
                  rows={4}
                  disabled={isVoteDisabled}
                  className="resize-none"
                />
              </div>

              {submitError && (
                <div className="rounded-[12px] border border-red-200 bg-red-50 p-3">
                  <p className="text-sm text-red-700">{submitError}</p>
                </div>
              )}

              {submitSuccess && (
                <div className="rounded-[12px] border border-green-200 bg-green-50 p-3">
                  <p className="text-sm text-green-700">
                    Vote submitted to Snapshot. It may take a few seconds to appear.
                  </p>
                </div>
              )}

              <Button
                onClick={handleVote}
                disabled={selectedChoice === null || isVoteDisabled}
                className="w-full"
              >
                {isSubmitting
                  ? "Submitting vote..." 
                  : isLoading
                  ? "Loading Snapshot votes..."
                  : hasVoted 
                  ? "Update Vote" 
                  : "Submit Vote"}
              </Button>
            </>
          )}
        </>
      ) : snapshotProposal.state === "closed" ? (
        <div className="flex flex-col gap-2 rounded-[12px] border border-gray-200 bg-gray-50 p-4">
          <p className="text-sm text-content-secondary">
            This Snapshot vote has ended. Nouns DAO voting is now active.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2 rounded-[12px] border border-gray-200 bg-gray-50 p-4">
          <p className="text-sm text-content-secondary">
            This Snapshot vote has not started yet.
          </p>
        </div>
      )}
    </div>
  );
}

