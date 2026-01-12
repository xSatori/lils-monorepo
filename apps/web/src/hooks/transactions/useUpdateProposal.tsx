"use client";
import { useCallback } from "react";
import { useAccount } from "wagmi";
import { encodeFunctionData, Hex, getAddress } from "viem";
import { CHAIN_CONFIG } from "@/config";
import { nounsDaoLogicConfig } from "@/data/generated/wagmi";
import {
  UseSendTransactionReturnType,
  useSendTransaction,
} from "./useSendTransaction";
import { CustomTransactionValidationError } from "./types";
import { Action } from "@/types/proposal-editor";
import { resolveActions } from "@/utils/transactions";
import { useEnsResolution } from "@/hooks/useEnsResolution";
import { DetailedProposal } from "@/data/goldsky/governance/common";

interface UseUpdateProposalReturnType
  extends Omit<UseSendTransactionReturnType, "sendTransaction"> {
  updateProposal: (
    proposal: DetailedProposal,
    title: string,
    description: string,
    actions: Action[],
    updateMessage: string,
  ) => Promise<void>;
}

export function useUpdateProposal(): UseUpdateProposalReturnType {
  const { sendTransaction, ...other } = useSendTransaction();
  const { address } = useAccount();
  const { resolveEnsAddresses } = useEnsResolution();

  const updateProposal = useCallback(
    async (
      proposal: DetailedProposal,
      title: string,
      description: string,
      actions: Action[],
      updateMessage: string,
    ) => {
      if (!address) {
        throw new CustomTransactionValidationError(
          "NOT_CONNECTED",
          "Wallet not connected.",
        );
      }

      // Verify user is the proposer
      if (address.toLowerCase() !== proposal.proposerAddress.toLowerCase()) {
        throw new CustomTransactionValidationError(
          "UNAUTHORIZED",
          "Only the proposer can update this proposal.",
        );
      }

      // Verify proposal is in updatable state
      if (proposal.state !== "updatable") {
        throw new CustomTransactionValidationError(
          "INVALID_STATE",
          "Proposal is not in updatable period.",
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

      // Determine which function to use based on whether proposal has signers
      const hasSigners = proposal.signers && proposal.signers.length > 0;
      
      let data: Hex;
      if (hasSigners) {
        // Proposals with signers require updateProposalBySigs (signature collection needed)
        // For now, throw an error - signature collection would need to be implemented
        throw new CustomTransactionValidationError(
          "SIGNATURES_REQUIRED",
          "This proposal was created with signatures. Updating requires collecting signatures from all original signers. This feature is not yet implemented.",
        );
      } else {
        // Proposals without signers can use updateProposal
        data = encodeFunctionData({
          abi: nounsDaoLogicConfig.abi,
          functionName: "updateProposal",
          args: [
            BigInt(proposal.id),
            targets,
            values,
            signatures,
            calldatas,
            fullDescription,
            updateMessage,
          ],
        });
      }

      const request = {
        to: CHAIN_CONFIG.addresses.nounsDaoProxy,
        data,
        value: BigInt(0), // No fee for proposal updates
        gasFallback: BigInt(2000000), // Updates can be gas-intensive
      };

      return sendTransaction(
        request,
        {
          type: "update-proposal" as any,
          description: `Update proposal ${proposal.id}: ${title}`,
        },
        async () => {
          if (!address) {
            return new CustomTransactionValidationError(
              "NOT_CONNECTED",
              "Wallet not connected.",
            );
          }
          if (address.toLowerCase() !== proposal.proposerAddress.toLowerCase()) {
            return new CustomTransactionValidationError(
              "UNAUTHORIZED",
              "Only the proposer can update this proposal.",
            );
          }
          if (proposal.state !== "updatable") {
            return new CustomTransactionValidationError(
              "INVALID_STATE",
              "Proposal is not in updatable period.",
            );
          }
          return null;
        },
      );
    },
    [sendTransaction, address, resolveEnsAddresses],
  );

  return { updateProposal, ...other };
}

