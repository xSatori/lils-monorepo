"use client";
import { encodeFunctionData, Hex } from "viem";
import {
  UseSendTransactionReturnType,
  useSendTransaction,
} from "./useSendTransaction";
import { useCallback } from "react";

import { CustomTransactionValidationError } from "./types";
import { useAccount } from "wagmi";
import { getBlock, multicall } from "viem/actions";
import { CHAIN_CONFIG } from "@/config";
import { nounsDaoLogicConfig } from "@/data/generated/wagmi";
import { getProposal } from "@/data/goldsky/governance/getProposal";

interface UseCastRefundableVoteReturnType
  extends Omit<UseSendTransactionReturnType, "sendTransaction"> {
  castRefundableVote: (
    proposalId: number,
    vote: "for" | "against" | "abstain",
    reason?: string,
  ) => void;
}

const VOTE_MAP: Record<"for" | "against" | "abstain", number> = {
  against: 0,
  for: 1,
  abstain: 2,
};

export function useCastRefundableVote(): UseCastRefundableVoteReturnType {
  const { sendTransaction, ...other } = useSendTransaction();
  const { address } = useAccount();

  const castRefundableVoteValidation = useCallback(
    async (
      proposalId: number,
      vote: "for" | "against" | "abstain",
      reason?: string,
    ): Promise<CustomTransactionValidationError | null> => {
      if (!address) {
        // Never should get here, since sendTransaction enforces connected
        return new CustomTransactionValidationError(
          "NOT_CONNECTED",
          "Wallet not connected.",
        );
      }

      // First check if proposal exists in subgraph (more reliable than contract call)
      let proposalFromSubgraph;
      try {
        proposalFromSubgraph = await getProposal(proposalId.toString(), 'lilnouns');
      } catch (error) {
        console.warn(`Failed to fetch proposal ${proposalId} from subgraph:`, error);
      }

      try {
        // proposalsV3 is available from V2 onwards, so try it first
        // Fallback to proposals (older V2 function) if proposalsV3 fails
        const primaryFunctionName = "proposalsV3";
        const fallbackFunctionName = "proposals";
        
        let results = await multicall(
          CHAIN_CONFIG.publicClient,
          {
            contracts: [
              {
                address: CHAIN_CONFIG.addresses.nounsDaoProxy,
                abi: nounsDaoLogicConfig.abi,
                functionName: "getReceipt",
                args: [BigInt(proposalId), address],
              },
              {
                address: CHAIN_CONFIG.addresses.nounsDaoProxy,
                abi: nounsDaoLogicConfig.abi,
                functionName: primaryFunctionName,
                args: [BigInt(proposalId)],
              },
            ],
            allowFailure: true,
          },
        );

        let [receiptResult, proposalResult] = results;

        // If primary function failed, try the fallback function
        if (proposalResult.status === 'failure') {
          console.warn(`Primary function ${primaryFunctionName} failed for proposal ${proposalId}, trying fallback ${fallbackFunctionName}`);
          
          const fallbackResults = await multicall(
            CHAIN_CONFIG.publicClient,
            {
              contracts: [
                {
                  address: CHAIN_CONFIG.addresses.nounsDaoProxy,
                  abi: nounsDaoLogicConfig.abi,
                  functionName: "getReceipt",
                  args: [BigInt(proposalId), address],
                },
                {
                  address: CHAIN_CONFIG.addresses.nounsDaoProxy,
                  abi: nounsDaoLogicConfig.abi,
                  functionName: fallbackFunctionName,
                  args: [BigInt(proposalId)],
                },
              ],
              allowFailure: true,
            },
          );
          
          [receiptResult, proposalResult] = fallbackResults;
        }

        // Check if proposal exists - if contract call fails but subgraph has it, use subgraph data
        if (proposalResult.status === 'failure') {
          if (proposalFromSubgraph) {
            // Proposal exists in subgraph but contract call failed - use subgraph data for validation
            console.warn(`Contract call failed for proposal ${proposalId}, using subgraph data for validation`);
            
            // Use subgraph data to validate
            const currentBlock = await getBlock(CHAIN_CONFIG.publicClient);
            const blockNumber = Number(currentBlock.number);
            
            // Check voting period from subgraph data
            if (blockNumber < proposalFromSubgraph.votingStartBlock) {
              return new CustomTransactionValidationError(
                "VOTING_NOT_STARTED",
                "The voting period has not started yet.",
              );
            }
            
            if (blockNumber > proposalFromSubgraph.votingEndBlock) {
              return new CustomTransactionValidationError(
                "VOTING_ENDED",
                "The voting period has ended.",
              );
            }
            
            // Check if user has voted - try to get receipt, but don't fail if it doesn't work
            let hasVoted = false;
            if (receiptResult.status === 'success') {
              hasVoted = (receiptResult.result as { hasVoted: boolean }).hasVoted;
            } else {
              // If receipt call failed, check votes from subgraph
              const userVote = proposalFromSubgraph.votes?.find(
                v => v.voterAddress.toLowerCase() === address.toLowerCase()
              );
              hasVoted = !!userVote;
            }
            
            if (hasVoted) {
              return new CustomTransactionValidationError(
                "ALREADY_VOTED",
                "Address has already voted.",
              );
            }
            
            // If we got here, validation passed using subgraph data
            return null;
          } else {
            // Both contract calls failed and subgraph doesn't have it
            // But if this is a recent proposal, it might just not be indexed yet
            // Allow the vote to proceed - the actual transaction will fail if proposal doesn't exist
            console.warn(`Both contract calls failed and subgraph doesn't have proposal ${proposalId}. Allowing vote to proceed - transaction will validate on-chain.`);
            return null; // Allow vote to proceed - on-chain validation will catch if it doesn't exist
          }
        }

        // Contract call succeeded - use contract data
        const { hasVoted } = receiptResult.result as { hasVoted: boolean };
        const proposalData = proposalResult.result as { startBlock: bigint; endBlock: bigint };
        const { startBlock, endBlock } = proposalData;

        if (hasVoted) {
          return new CustomTransactionValidationError(
            "ALREADY_VOTED",
            "Address has already voted.",
          );
        }

        const currentBlock = await getBlock(CHAIN_CONFIG.publicClient);
        if (currentBlock.number < startBlock) {
          return new CustomTransactionValidationError(
            "VOTING_NOT_STARTED",
            "The voting period has not started yet.",
          );
        }

        if (currentBlock.number > endBlock) {
          return new CustomTransactionValidationError(
            "VOTING_ENDED",
            "The voting period has ended.",
          );
        }

        return null;
      } catch (error: any) {
        // Handle contract call errors (e.g., proxy implementation not set, proposal doesn't exist)
        const errorMessage = error?.message || error?.toString() || 'Unknown error';
        
        // If proposal exists in subgraph but contract call failed, provide helpful message
        if (proposalFromSubgraph) {
          if (errorMessage.includes('delegate call failed') || errorMessage.includes('low-level')) {
            return new CustomTransactionValidationError(
              "CONTRACT_ERROR",
              `Proposal ${proposalId} exists but the contract call failed. This may indicate a proxy implementation issue or network problem. Please try again or contact support.`,
            );
          }
        }
        
        // Check for various error patterns that indicate proposal doesn't exist
        const proposalNotFoundPatterns = [
          'delegate call failed',
          'PROPOSAL_NOT_FOUND',
          'proposal does not exist',
          'invalid proposal id',
          'proposal not found',
          'execution reverted',
        ];
        
        const isProposalNotFound = proposalNotFoundPatterns.some(pattern => 
          errorMessage.toLowerCase().includes(pattern.toLowerCase())
        );
        
        if (isProposalNotFound) {
          // Provide more helpful error message
          if (proposalFromSubgraph) {
            return new CustomTransactionValidationError(
              "PROPOSAL_NOT_FOUND",
              `Prop ${proposalId} exists in the subgraph but could not be found on-chain. This may indicate a sync issue. Please try again in a few moments.`,
            );
          } else {
            return new CustomTransactionValidationError(
              "PROPOSAL_NOT_FOUND",
              `Prop ${proposalId} not found. This proposal may not exist, may have been cancelled, or may not be indexed yet. Please verify the proposal ID and try again.`,
            );
          }
        }
        
        return new CustomTransactionValidationError(
          "VALIDATION_ERROR",
          `Failed to validate vote: ${errorMessage}`,
        );
      }
    },
    [address],
  );

  const castRefundableVote = useCallback(
    (
      proposalId: number,
      vote: "for" | "against" | "abstain",
      reason?: string,
    ) => {
      let data: Hex;
      if (reason && reason != "") {
        data = encodeFunctionData({
          abi: nounsDaoLogicConfig.abi,
          functionName: "castRefundableVoteWithReason",
          args: [BigInt(proposalId), VOTE_MAP[vote], reason],
        });
      } else {
        data = encodeFunctionData({
          abi: nounsDaoLogicConfig.abi,
          functionName: "castRefundableVote",
          args: [BigInt(proposalId), VOTE_MAP[vote]],
        });
      }

      const request = {
        to: CHAIN_CONFIG.addresses.nounsDaoProxy,
        data,
        value: BigInt(0),
        gasFallback: BigInt(500000), // Vote generally ~200k, can be more if reason is long
      };

      return sendTransaction(
        request,
        { type: "cast-vote", description: `Casting vote on prop ${proposalId}` },
        () => castRefundableVoteValidation(proposalId, vote, reason),
      );
    },
    [sendTransaction, castRefundableVoteValidation],
  );

  return { castRefundableVote, ...other };
}
