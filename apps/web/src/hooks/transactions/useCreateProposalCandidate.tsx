"use client";
import { encodeFunctionData, Hex } from "viem";
import {
  UseSendTransactionReturnType,
  useSendTransaction,
} from "./useSendTransaction";
import { useCallback } from "react";
import { CustomTransactionValidationError } from "./types";
import { useAccount } from "wagmi";
import { CHAIN_CONFIG } from "@/config";
import type { Action } from "@/types/proposal-editor";
import { resolveActions } from "@/utils/transactions";
import { useEnsResolution } from "@/hooks/useEnsResolution";
import { nounsDaoDataAbi } from "@/abis/nounsDaoData";

interface UseCreateProposalCandidateReturnType
  extends Omit<UseSendTransactionReturnType, "sendTransaction"> {
  createCandidate: (
    title: string,
    description: string,
    actions: Action[],
  ) => Promise<void>;
}

export function useCreateProposalCandidate(): UseCreateProposalCandidateReturnType {
  const { sendTransaction, ...other } = useSendTransaction();
  const { address } = useAccount();
  const { resolveEnsAddresses } = useEnsResolution();

  const createCandidateValidation = useCallback(
    async (
      title: string,
      description: string,
      actions: Action[],
    ): Promise<CustomTransactionValidationError | null> => {
      if (!address) {
        return new CustomTransactionValidationError(
          "NOT_CONNECTED",
          "Wallet not connected.",
        );
      }

      if (!title || title.trim() === "") {
        return new CustomTransactionValidationError(
          "MISSING_TITLE",
          "Candidate title is required.",
        );
      }

      if (!description || description.trim() === "") {
        return new CustomTransactionValidationError(
          "MISSING_DESCRIPTION",
          "Candidate description is required.",
        );
      }

      return null;
    },
    [address],
  );

  const createCandidate = useCallback(
    async (
      title: string,
      description: string,
      actions: Action[],
    ) => {
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

      // Extract targets (already resolved)
      const targets = transactions.map(tx => tx.target) as Hex[];
      const values = transactions.map((tx) => BigInt(tx.value));
      const signatures = transactions.map((tx) => tx.signature);
      const calldatas = transactions.map((tx) => tx.calldata as Hex);

      // Combine title and description
      // Check if description already starts with the title as a heading to avoid duplication
      const escapedTitle = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const titleHeadingPattern = new RegExp(`^\\s*#+\\s+${escapedTitle}\\s*(\\n|$)`, 'i');
      const fullDescription = titleHeadingPattern.test(description) 
        ? description 
        : `# ${title}\n\n${description}`;

      // Create slug from title
      const slug = title
        .toLowerCase()
        .replace(/ /g, "-")
        .replace(/[^\w-]+/g, "");

      // Encode the createProposalCandidate function call
      const data = encodeFunctionData({
        abi: nounsDaoDataAbi,
        functionName: "createProposalCandidate",
        args: [
          targets,
          values,
          signatures,
          calldatas,
          fullDescription,
          slug,
          BigInt(0), // proposalIdToUpdate (0 for new candidate)
        ],
      });

      // Get the fee cost from chain config
      // Non-Nouners must pay this fee, Nouners can post for free
      const value = CHAIN_CONFIG.dataContractFees?.createCandidateCost || BigInt(0);

      const request = {
        to: CHAIN_CONFIG.addresses.nounsDAODataProxy,
        data,
        value, // Include fee for non-Nouners
        gasFallback: BigInt(2000000), // Candidates can be gas-intensive
      };

      return sendTransaction(
        request,
        {
          type: "create-candidate" as any,
          description: `Create candidate: ${title}`
        },
        () => createCandidateValidation(title, description, actions),
      );
    },
    [sendTransaction, createCandidateValidation, resolveEnsAddresses],
  );

  return { createCandidate, ...other };
}
