"use client";

import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract, useBlockNumber } from "wagmi";
import { Button } from "@/components/ui/button";
import { DetailedProposal } from "@/data/goldsky/governance/common";
import { useState, useEffect } from "react";
import { useAddRecentTransaction } from "@rainbow-me/rainbowkit";
import { CHAIN_CONFIG } from "@/config";
import { encodeFunctionData } from "viem";
import { estimateGas, getBytecode } from "viem/actions";

/**
 * DAO Contract ABI for queue, execute, and cancel functions
 */
const DAO_ABI = [
  {
    name: "queue",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "proposalId", type: "uint256" }],
    outputs: [],
  },
  {
    name: "execute",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "proposalId", type: "uint256" }],
    outputs: [],
  },
  {
    name: "cancel",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "proposalId", type: "uint256" }],
    outputs: [],
  },
  {
    name: "proposalThreshold",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "proposals",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "proposalId", type: "uint256" }],
    outputs: [
      {
        components: [
          { name: "id", type: "uint256" },
          { name: "proposer", type: "address" },
          { name: "proposalThreshold", type: "uint256" },
          { name: "quorumVotes", type: "uint256" },
          { name: "eta", type: "uint256" },
          { name: "startBlock", type: "uint256" },
          { name: "endBlock", type: "uint256" },
          { name: "forVotes", type: "uint256" },
          { name: "againstVotes", type: "uint256" },
          { name: "abstainVotes", type: "uint256" },
          { name: "canceled", type: "bool" },
          { name: "vetoed", type: "bool" },
          { name: "executed", type: "bool" },
        ],
        name: "",
        type: "tuple",
      },
    ],
  },
] as const;

/**
 * Nouns Token ABI to check voting power
 */
const NOUNS_TOKEN_ABI = [
  {
    name: "getPriorVotes",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "account", type: "address" },
      { name: "blockNumber", type: "uint256" },
    ],
    outputs: [{ name: "", type: "uint96" }],
  },
] as const;

interface ProposalActionsProps {
  proposal: DetailedProposal;
  isNounsDao?: boolean;
}

export function ProposalActions({ proposal, isNounsDao = false }: ProposalActionsProps) {
  const { address } = useAccount();
  const { writeContractAsync, isPending, data: hash } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed, isError: isFailed, error: receiptError } =
    useWaitForTransactionReceipt({
      hash,
    });
  const addRecentTransaction = useAddRecentTransaction();
  const [processingAction, setProcessingAction] = useState<'queue' | 'execute' | 'cancel' | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Get contract addresses from CHAIN_CONFIG based on current chain
  const daoAddress = CHAIN_CONFIG.addresses.nounsDaoProxy || CHAIN_CONFIG.addresses.nounsDAOProxy;
  const tokenAddress = CHAIN_CONFIG.addresses.nounsToken;

  // Check if user is the proposer
  const isProposer = address?.toLowerCase() === proposal.proposerAddress.toLowerCase();

  // Get proposal threshold
  const { data: proposalThreshold } = useReadContract({
    address: daoAddress,
    abi: DAO_ABI,
    functionName: "proposalThreshold",
    query: {
      enabled: !!daoAddress,
    },
  });

  // Get current block number
  const { data: blockNumber } = useBlockNumber();

  // Check if proposer lost voting power (current voting power < threshold)
  // This check is needed to determine if anyone can cancel (not just the proposer)
  const { data: currentProposerVotingPower } = useReadContract({
    address: tokenAddress,
    abi: NOUNS_TOKEN_ABI,
    functionName: "getPriorVotes",
    args: blockNumber
      ? [proposal.proposerAddress, BigInt(blockNumber - 1n)]
      : undefined,
    query: {
      enabled: !!proposalThreshold && !!blockNumber && !!tokenAddress,
    },
  });

  const proposerLostPower =
    proposalThreshold &&
    currentProposerVotingPower !== undefined &&
    currentProposerVotingPower < proposalThreshold;

  // Check if proposal is in objection period
  const { data: currentBlockNumber } = useBlockNumber();
  const isInObjectionPeriod = 
    proposal.state === "successful" && 
    proposal.objectionPeriodEndBlock && 
    currentBlockNumber && 
    currentBlockNumber <= proposal.objectionPeriodEndBlock;

  // Check if execution ETA has passed (for queued proposals)
  const currentTimestamp = Math.floor(Date.now() / 1000);
  // Get execution ETA (prefer executionEtaTimestamp, fallback to executionETA string)
  const executionETA = proposal.executionEtaTimestamp || (proposal.executionETA ? parseInt(proposal.executionETA) : null);
  const executionEtaPassed = executionETA 
    ? currentTimestamp >= executionETA
    : false; // If no ETA, don't show execute button (can't verify readiness)

  // Determine which buttons to show
  const showQueueButton = proposal.state === "successful" && !isInObjectionPeriod;
  // Execute button only shows if:
  // 1. Proposal is queued
  // 2. AND execution ETA exists
  // 3. AND execution ETA has passed
  const showExecuteButton = proposal.state === "queued" && executionETA !== null && executionEtaPassed;
  // Show cancel button only if:
  // 1. Proposal is in a cancelable state: active, queued, or succeeded (but not executed)
  // 2. AND (user is the proposer OR proposer lost voting power)
  // FOR NOUNS ONLY: Only show if connected wallet is the proposer
  const isCancelableState = 
    proposal.state === "active" ||
    proposal.state === "queued" ||
    (proposal.state === "successful" && proposal.state !== "executed");
  const showCancelButton =
    isCancelableState &&
    (isNounsDao 
      ? isProposer  // For Nouns: only show if connected wallet is proposer
      : (isProposer || proposerLostPower));  // For Lil Nouns: show if proposer OR proposer lost power

  const handleQueue = async () => {
    if (!address || !daoAddress) return;
    setProcessingAction('queue');
    setError(null);
    try {
      const txHash = await writeContractAsync({
        address: daoAddress,
        abi: DAO_ABI,
        functionName: "queue",
        args: [BigInt(proposal.id)],
      });
      addRecentTransaction({
        hash: txHash,
        description: `Queue proposal ${proposal.id}`,
      });
    } catch (error: any) {
      console.error("Failed to queue proposal:", error);
      const errorMessage = error?.message || error?.shortMessage || "Failed to queue proposal";
      setError(errorMessage);
      setProcessingAction(null);
    }
  };

  const handleExecute = async () => {
    if (!address || !daoAddress) return;
    setProcessingAction('execute');
    setError(null);
    try {
      // Validate proposal state before attempting execution
      if (proposal.state !== "queued") {
        setError(`Proposal must be in "queued" state to execute. Current state: ${proposal.state}`);
        setProcessingAction(null);
        return;
      }

      // Check if ETA has passed (if available)
      // This is a double-check since we already check this before showing the button
      const currentTime = Math.floor(Date.now() / 1000);
      const executionETA = proposal.executionEtaTimestamp || (proposal.executionETA ? parseInt(proposal.executionETA) : null);
      
      if (executionETA && currentTime < executionETA) {
        const timeRemaining = executionETA - currentTime;
        const hoursRemaining = Math.floor(timeRemaining / 3600);
        const minutesRemaining = Math.floor((timeRemaining % 3600) / 60);
        setError(`Timelock delay hasn't passed yet. Wait ${hoursRemaining}h ${minutesRemaining}m before executing.`);
        setProcessingAction(null);
        return;
      }

      // Estimate gas first, then cap it at the contract limit (~16.7M)
      const CONTRACT_GAS_CAP = BigInt(16777216); // Contract's gas cap
      
      let gasLimit: bigint;
      try {
        const data = encodeFunctionData({
          abi: DAO_ABI,
          functionName: "execute",
          args: [BigInt(proposal.id)],
        });
        
        const estimatedGas = await estimateGas(CHAIN_CONFIG.publicClient, {
          account: address,
          to: daoAddress,
          data,
        });
        
        // Cap at contract limit, with a small buffer
        gasLimit = estimatedGas > CONTRACT_GAS_CAP ? CONTRACT_GAS_CAP : estimatedGas;
        
        // Add 10% buffer but don't exceed cap
        const gasWithBuffer = (gasLimit * BigInt(110)) / BigInt(100);
        gasLimit = gasWithBuffer > CONTRACT_GAS_CAP ? CONTRACT_GAS_CAP : gasWithBuffer;
      } catch (gasError: any) {
        console.warn("Gas estimation failed:", gasError);
        console.warn("Gas error details:", {
          message: gasError?.message,
          shortMessage: gasError?.shortMessage,
          cause: gasError?.cause,
          data: gasError?.data,
          name: gasError?.name
        });
        
        // Try to extract revert reason from error
        let revertReason = "";
        if (gasError?.data) {
          try {
            // Try to decode error data if available
            revertReason = `\nRevert data: ${gasError.data}`;
          } catch (e) {
            // Ignore decode errors
          }
        }
        
        // If gas estimation fails due to revert, provide helpful error message
        if (gasError?.message?.includes("execution reverted") || gasError?.message?.includes("Transaction execution reverted")) {
          let errorMsg = "Cannot execute proposal. ";
          
          if (proposal.state !== "queued") {
            errorMsg += `Proposal state is "${proposal.state}", but must be "queued".`;
          } else if (proposal.executionETA) {
            const currentTime = Math.floor(Date.now() / 1000);
            const eta = parseInt(proposal.executionETA);
            if (currentTime < eta) {
              errorMsg += "Timelock delay hasn't passed yet.";
            } else {
              // Check if this is an upgrade proposal with V6 functions
              const hasV6Functions = proposal.transactions?.some((tx: any) => 
                tx.signature?.includes("_setLastMinuteWindowInBlocks") ||
                tx.signature?.includes("_setObjectionPeriodDurationInBlocks") ||
                tx.signature?.includes("_setProposalUpdatablePeriodInBlocks")
              );
              
              if (hasV6Functions) {
                errorMsg += "This proposal upgrades to V6 and calls V6-only functions. ";
                errorMsg += "\n\nTenderly simulation succeeded because it uses state overrides (sets executor as admin). ";
                errorMsg += "On-chain execution fails because:\n";
                errorMsg += "(1) The V6 implementation contract may not exist at the specified address\n";
                errorMsg += "(2) The transactions may not have been queued correctly\n";
                errorMsg += "(3) The calldata encoding might differ from what was queued\n";
                errorMsg += "\nTo debug:\n";
                errorMsg += "- Verify the V6 logic contract exists at the implementation address\n";
                errorMsg += "- Check on Etherscan/Sepolia if the executor is the admin of the proxy\n";
                errorMsg += "- Verify the queued transactions match the proposal actions exactly\n";
                errorMsg += "- Check if the timelock delay has passed and transactions haven't expired";
                
                // Try to check if implementation contract exists
                try {
                  const setImplTx = proposal.transactions?.find((tx: any) => 
                    tx.signature?.includes("_setImplementation")
                  );
                  if (setImplTx?.calldata) {
                    // Extract address from calldata (last 20 bytes after function selector)
                    const implAddress = `0x${setImplTx.calldata.slice(-40)}`;
                    const bytecode = await getBytecode(CHAIN_CONFIG.publicClient, {
                      address: implAddress as `0x${string}`
                    });
                    if (!bytecode || bytecode === "0x") {
                      errorMsg += `\n\n⚠️ CRITICAL: Implementation contract does NOT exist at ${implAddress}`;
                    } else {
                      errorMsg += `\n\n✓ Implementation contract exists at ${implAddress}`;
                    }
                  }
                } catch (e) {
                  // Ignore errors in diagnostic check
                }
                
                // Add revert reason if available
                if (revertReason) {
                  errorMsg += revertReason;
                }
                
                // Add full error details for debugging
                errorMsg += `\n\nFull error: ${gasError?.message || gasError?.shortMessage || "Unknown error"}`;
              } else {
                errorMsg += "One of the proposal actions will revert. ";
                errorMsg += "\n\nNote: Tenderly simulation uses state overrides (executor as admin), ";
                errorMsg += "so it may succeed even if on-chain execution fails. ";
                errorMsg += "\n\nPossible causes: ";
                errorMsg += "(1) Executor is not authorized, (2) Invalid function parameters, ";
                errorMsg += "(3) Contract state prevents execution, (4) Transactions not queued correctly.";
              }
            }
          } else {
            errorMsg += "One of the proposal actions will revert or the proposal is not ready for execution.";
          }
          
          setError(errorMsg);
          setProcessingAction(null);
          return;
        }
        
        // If estimation fails for other reasons, use a safe fallback
        gasLimit = BigInt(15000000); // 15M as a safe fallback
      }
      
      const txHash = await writeContractAsync({
        address: daoAddress,
        abi: DAO_ABI,
        functionName: "execute",
        args: [BigInt(proposal.id)],
        gas: gasLimit,
      });
      addRecentTransaction({
        hash: txHash,
        description: `Execute proposal ${proposal.id}`,
      });
    } catch (error: any) {
      console.error("Failed to execute proposal:", error);
      const errorMessage = error?.message || error?.shortMessage || "Failed to execute proposal";
      setError(errorMessage);
      setProcessingAction(null);
    }
  };

  const handleCancel = async () => {
    if (!address || !daoAddress) return;
    setProcessingAction('cancel');
    setError(null);
    try {
      // Check proposal state before attempting cancel
      // Can't cancel proposals in final states (defeated, expired, executed, cancelled, vetoed)
      if (
        proposal.state === "defeated" ||
        proposal.state === "expired" ||
        proposal.state === "executed" ||
        proposal.state === "cancelled" ||
        proposal.state === "vetoed"
      ) {
        setError(`Cannot cancel proposal in "${proposal.state}" state. Proposals in final states cannot be canceled.`);
        setProcessingAction(null);
        return;
      }

      // Estimate gas first, then cap it at the contract limit (~16.7M)
      const CONTRACT_GAS_CAP = BigInt(16777216); // Contract's gas cap
      
      let gasLimit: bigint;
      try {
        const data = encodeFunctionData({
          abi: DAO_ABI,
          functionName: "cancel",
          args: [BigInt(proposal.id)],
        });
        
        const estimatedGas = await estimateGas(CHAIN_CONFIG.publicClient, {
          account: address,
          to: daoAddress,
          data,
        });
        
        // Cap at contract limit, with a small buffer
        gasLimit = estimatedGas > CONTRACT_GAS_CAP ? CONTRACT_GAS_CAP : estimatedGas;
        
        // Add 10% buffer but don't exceed cap
        const gasWithBuffer = (gasLimit * BigInt(110)) / BigInt(100);
        gasLimit = gasWithBuffer > CONTRACT_GAS_CAP ? CONTRACT_GAS_CAP : gasWithBuffer;
      } catch (gasError: any) {
        console.warn("Gas estimation failed for cancel:", gasError);
        
        // If gas estimation fails due to revert, check if it's specifically the final state error
        const errorMessage = gasError?.message || gasError?.shortMessage || "";
        if (errorMessage.includes("CantCancelProposalAtFinalState")) {
          // Only show final state error if the contract explicitly says so
          // Note: "updatable" is NOT a final state and should be cancelable
          setError(`Cannot cancel proposal ${proposal.id}. The contract indicates it is in a final state.`);
          setProcessingAction(null);
          return;
        }
        
        // If gas estimation fails for other reasons (including generic reverts),
        // use a safe fallback and let the transaction attempt proceed
        // The contract will revert with a more specific error if cancellation is truly not allowed
        console.warn("Gas estimation failed, using fallback. Error:", errorMessage);
        gasLimit = BigInt(5000000); // 5M as a safe fallback for cancel
      }
      
      const txHash = await writeContractAsync({
        address: daoAddress,
        abi: DAO_ABI,
        functionName: "cancel",
        args: [BigInt(proposal.id)],
        gas: gasLimit,
      });
      addRecentTransaction({
        hash: txHash,
        description: `Cancel proposal ${proposal.id}`,
      });
    } catch (error: any) {
      console.error("Failed to cancel proposal:", error);
      let errorMessage = error?.message || error?.shortMessage || "Failed to cancel proposal";
      
      // Provide more helpful error message if it's a state-related error
      // Note: Only show final state error if contract explicitly says so
      // "updatable" is NOT a final state and should be cancelable
      if (errorMessage.includes("CantCancelProposalAtFinalState")) {
        errorMessage = `Cannot cancel proposal ${proposal.id}. The contract indicates it is in a final state and cannot be canceled.`;
      } else if (errorMessage.includes("proposer above threshold")) {
        errorMessage = `Cannot cancel proposal ${proposal.id}. You are not the proposer and the proposer still has sufficient voting power.`;
      } else if (errorMessage.includes("gas limit")) {
        errorMessage = `Gas limit error: ${errorMessage}. The proposal may be in an invalid state or have too many transactions.`;
      }
      
      setError(errorMessage);
      setProcessingAction(null);
    }
  };

  useEffect(() => {
    if (isConfirmed) {
      setProcessingAction(null);
      setError(null);
    }
  }, [isConfirmed]);

  useEffect(() => {
    if (isFailed) {
      setProcessingAction(null);
      const errorMessage = receiptError?.message || receiptError?.shortMessage || "Transaction failed";
      setError(errorMessage);
    }
  }, [isFailed, receiptError]);

  if (!showQueueButton && !showExecuteButton && !showCancelButton) {
    return null;
  }

  const isAnyLoading = isPending || isConfirming;
  const isQueueLoading = isAnyLoading && processingAction === 'queue';
  const isExecuteLoading = isAnyLoading && processingAction === 'execute';
  const isCancelLoading = isAnyLoading && processingAction === 'cancel';

  return (
    <div className="flex flex-col gap-2">
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-800">
          {error}
        </div>
      )}
    <div className="flex flex-wrap gap-2">
      {showQueueButton && (
        <Button
          variant="primary"
          onClick={handleQueue}
          disabled={isQueueLoading || !address}
        >
          {isQueueLoading ? "Processing..." : "Queue Proposal"}
        </Button>
      )}
      {showExecuteButton && (
        <Button
          variant="positive"
          onClick={handleExecute}
          disabled={isExecuteLoading || !address}
        >
          {isExecuteLoading ? "Processing..." : "Execute Proposal"}
        </Button>
      )}
      {showCancelButton && (
        <Button
          variant="negative"
          onClick={handleCancel}
          disabled={isCancelLoading || !address}
        >
          {isCancelLoading ? "Processing..." : "Cancel Proposal"}
        </Button>
      )}
      </div>
    </div>
  );
}

