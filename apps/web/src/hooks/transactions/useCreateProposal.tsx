"use client";
import { encodeFunctionData, Hex } from "viem";
import {
  UseSendTransactionReturnType,
  useSendTransaction,
} from "./useSendTransaction";
import { useCallback } from "react";
import { CustomTransactionValidationError } from "./types";
import { useAccount } from "wagmi";
import { multicall } from "viem/actions";
import { CHAIN_CONFIG } from "@/config";
import { nounsDaoLogicConfig, nounsNftTokenConfig } from "@/data/generated/wagmi";
import { nounsDoaLogicAbi } from "@/abis/nounsDoaLogic";
import type { Action } from "@/types/proposal-editor";
import { resolveActions } from "@/utils/transactions";
import { useEnsResolution } from "@/hooks/useEnsResolution";

interface UseCreateProposalReturnType
  extends Omit<UseSendTransactionReturnType, "sendTransaction"> {
  createProposal: (
    title: string,
    description: string,
    actions: Action[],
  ) => Promise<void>;
}

export function useCreateProposal(): UseCreateProposalReturnType {
  const { sendTransaction, ...other } = useSendTransaction();
  const { address } = useAccount();
  const { resolveEnsAddresses } = useEnsResolution();

  const createProposalValidation = useCallback(
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
          "Proposal title is required.",
        );
      }

      if (!description || description.trim() === "") {
        return new CustomTransactionValidationError(
          "MISSING_DESCRIPTION",
          "Proposal description is required.",
        );
      }

      // Check voting power and proposal threshold
      const [currentVotes, proposalThreshold] = await multicall(
        CHAIN_CONFIG.publicClient,
        {
          contracts: [
            {
              address: CHAIN_CONFIG.addresses.nounsToken,
              abi: nounsNftTokenConfig.abi,
              functionName: "getCurrentVotes",
              args: [address],
            },
            {
              address: CHAIN_CONFIG.addresses.nounsDaoProxy,
              abi: nounsDaoLogicConfig.abi,
              functionName: "proposalThreshold",
              args: [],
            },
          ],
          allowFailure: false,
        },
      );

      if (currentVotes < proposalThreshold) {
        const errorMessage = `You need at least ${proposalThreshold} votes to create a proposal. You currently have ${currentVotes} votes.`;
        
        return new CustomTransactionValidationError(
          "INSUFFICIENT_VOTES",
          errorMessage,
        );
      }

      // Check if user has an active proposal
      try {
        const latestProposalId = await CHAIN_CONFIG.publicClient.readContract({
          address: CHAIN_CONFIG.addresses.nounsDaoProxy,
          abi: nounsDaoLogicConfig.abi,
          functionName: "latestProposalIds",
          args: [address],
        });

        if (latestProposalId && latestProposalId > 0n) {
          const proposalState = await CHAIN_CONFIG.publicClient.readContract({
            address: CHAIN_CONFIG.addresses.nounsDaoProxy,
            abi: nounsDaoLogicConfig.abi,
            functionName: "state",
            args: [latestProposalId],
          });

          // State 0 = Pending, 1 = Active, 2 = Canceled, 3 = Defeated, 4 = Succeeded, 5 = Queued, 6 = Expired, 7 = Executed
          if (proposalState === 0 || proposalState === 1) {
            return new CustomTransactionValidationError(
              "ACTIVE_PROPOSAL_EXISTS",
              "You already have an active proposal. Wait for it to complete before creating a new one.",
            );
          }
        }
      } catch (e) {
        // Ignore errors checking for active proposals
        console.warn("Failed to check for active proposals:", e);
      }

      return null;
    },
    [address],
  );

  const createProposal = useCallback(
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

      // Encode the propose function call (5 parameters only)
      // Filter ABI to remove the 6-parameter propose function and keep only the 5-parameter one
      const filteredAbi = nounsDoaLogicAbi.filter(
        (item) => 
          !(item.type === 'function' && 
            item.name === 'propose' && 
            item.inputs &&
            Array.isArray(item.inputs) &&
            item.inputs.length === 6)
      );
      
      const data = encodeFunctionData({
        abi: filteredAbi,
        functionName: "propose",
        args: [targets, values, signatures, calldatas, fullDescription],
      });

      const daoAddress = CHAIN_CONFIG.addresses.nounsDaoProxy || CHAIN_CONFIG.addresses.nounsDAOProxy;
      if (!daoAddress) {
        throw new Error("DAO proxy address not configured");
      }

      const request = {
        to: daoAddress,
        data,
        value: BigInt(0),
        gasFallback: BigInt(1000000), // Proposals can be gas-intensive
      };

      return sendTransaction(
        request,
        {
          type: "create-proposal" as any, // Will need to add to TransactionType enum
          description: `Create proposal: ${title}`
        },
        () => createProposalValidation(title, description, actions),
      );
    },
    [sendTransaction, createProposalValidation, resolveEnsAddresses],
  );

  return { createProposal, ...other };
}
