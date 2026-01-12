"use client";
import { useCallback } from "react";
import { useAccount } from "wagmi";
import { encodeFunctionData, Hex, getAddress } from "viem";
import { CHAIN_CONFIG } from "@/config";
import { nounsDaoDataAbi } from "@/abis/nounsDaoData";
import {
  UseSendTransactionReturnType,
  useSendTransaction,
} from "./useSendTransaction";
import { CustomTransactionValidationError } from "./types";
import { Action } from "@/types/proposal-editor";
import { resolveActions } from "@/utils/transactions";
import { ProposalIdea } from "@/data/goldsky/governance/ideaTypes";
import { extractSlugFromId } from "@/data/goldsky/governance/getProposalIdeas";
import { useEnsResolution } from "@/hooks/useEnsResolution";

interface UseUpdateProposalCandidateReturnType
  extends Omit<UseSendTransactionReturnType, "sendTransaction"> {
  updateCandidate: (
    candidate: ProposalIdea,
    title: string,
    description: string,
    actions: Action[],
    reason: string,
  ) => Promise<void>;
}

export function useUpdateProposalCandidate(): UseUpdateProposalCandidateReturnType {
  const { sendTransaction, ...other } = useSendTransaction();
  const { address } = useAccount();
  const { resolveEnsAddresses } = useEnsResolution();

  const updateCandidate = useCallback(
    async (
      candidate: ProposalIdea,
      title: string,
      description: string,
      actions: Action[],
      reason: string,
    ) => {
      if (!address) {
        throw new CustomTransactionValidationError(
          "NOT_CONNECTED",
          "Wallet not connected.",
        );
      }

      // Verify user is the proposer
      if (address.toLowerCase() !== candidate.proposerAddress.toLowerCase()) {
        throw new CustomTransactionValidationError(
          "UNAUTHORIZED",
          "Only the proposer can update this candidate.",
        );
      }

      // Resolve ENS names in actions BEFORE converting to transactions
      const resolvedActions: Action[] = await Promise.all(
        actions.map(async (action) => {
          if (action.type === 'one-time-payment' || action.type === 'streaming-payment' || action.type === 'treasury-noun-transfer') {
            const [resolvedTarget] = await resolveEnsAddresses([action.target])
            return { ...action, target: resolvedTarget as `0x${string}` }
          } else if (action.type === 'custom-transaction') {
            const [resolvedTarget] = await resolveEnsAddresses([action.contractCallTarget])
            return { ...action, contractCallTarget: resolvedTarget as `0x${string}` }
          }
          return action
        })
      )

      // Convert resolved actions to transactions
      const transactions = resolveActions(resolvedActions);

      const targets = transactions.map((tx) => getAddress(tx.target));
      const values = transactions.map((tx) => BigInt(tx.value));
      const signatures = transactions.map((tx) => tx.signature);
      const calldatas = transactions.map((tx) => tx.calldata as Hex);

      // Combine title and description
      const fullDescription = `# ${title}\n\n${description}`;

      const slug = extractSlugFromId(candidate.id);
      const proposalIdToUpdate = candidate.latestVersion.targetProposalId || 0;

      // Encode the updateProposalCandidate function call
      const data = encodeFunctionData({
        abi: nounsDaoDataAbi,
        functionName: "updateProposalCandidate",
        args: [
          targets,
          values,
          signatures,
          calldatas,
          fullDescription,
          slug,
          BigInt(proposalIdToUpdate),
          reason,
        ],
      });

      // Get the fee cost from chain config
      // Non-Nouners must pay this fee, Nouners can post for free
      const value = CHAIN_CONFIG.dataContractFees?.updateCandidateCost || BigInt(0);

      const request = {
        to: CHAIN_CONFIG.addresses.nounsDAODataProxy,
        data,
        value, // Include fee for non-Nouners
        gasFallback: BigInt(2000000), // Updates can be gas-intensive
      };

      return sendTransaction(
        request,
        {
          type: "update-candidate" as any,
          description: `Update candidate: ${title}`,
        },
        async () => {
          if (!address) {
            return new CustomTransactionValidationError(
              "NOT_CONNECTED",
              "Wallet not connected.",
            );
          }
          if (address.toLowerCase() !== candidate.proposerAddress.toLowerCase()) {
            return new CustomTransactionValidationError(
              "UNAUTHORIZED",
              "Only the proposer can update this candidate.",
            );
          }
          return null;
        },
      );
    },
    [sendTransaction, address, resolveEnsAddresses],
  );

  return { updateCandidate, ...other };
}

