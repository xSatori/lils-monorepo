"use client";
import { UseSendTransactionReturnType, useSendTransaction } from "./useSendTransaction";
import { encodeFunctionData, formatEther } from "viem";
import { lilVRGDAConfig } from "@/config/lilVRGDAConfig";
import { CustomTransactionValidationError } from "./types";
import { multicall, readContract } from "viem/actions";
import { CHAIN_SPECIFIC_CONFIGS } from "@/config";
import { detectChainFromHostname } from "@/utils/networkDetection";
import { mainnet, sepolia } from "viem/chains";

interface UseBuyNounVRGDAReturnType extends Omit<UseSendTransactionReturnType, "sendTransaction"> {
  buyNoun: (expectedBlockNumber: bigint, expectedNounId: bigint, maxPrice?: bigint) => void;
}

// Compute the first purchasable noun ID from the raw nextNounId counter,
// skipping lil nounders allocations (% 10 === 0) and DAO allocations (% 10 === 1).
function getNextPurchasableNounId(rawNextNounId: bigint): bigint {
  let id = rawNextNounId;
  while (id % 10n === 0n || id % 10n === 1n) {
    id++;
  }
  return id;
}

export function useBuyNounVRGDA(): UseBuyNounVRGDAReturnType {
  const { sendTransaction, ...other } = useSendTransaction();

  async function buyNounValidation(
    expectedBlockNumber: bigint,
    expectedNounId: bigint,
    maxPrice?: bigint
  ): Promise<CustomTransactionValidationError | null> {
    try {
      // Get the correct chain config dynamically
      const chainId = detectChainFromHostname();
      const config = CHAIN_SPECIFIC_CONFIGS[chainId];
      
      if (!config) {
        return new CustomTransactionValidationError(
          "CONFIG_ERROR",
          "Unable to determine chain configuration. Please refresh and try again."
        );
      }
      
      const [currentPrice, nextNounId, poolSize] = await multicall(config.publicClient, {
        contracts: [
          { 
            address: config.addresses.lilVRGDAProxy,
            abi: lilVRGDAConfig.abi,
            functionName: "getCurrentVRGDAPrice" 
          },
          { 
            address: config.addresses.lilVRGDAProxy,
            abi: lilVRGDAConfig.abi,
            functionName: "nextNounId" 
          },
          { 
            address: config.addresses.lilVRGDAProxy,
            abi: lilVRGDAConfig.abi,
            functionName: "poolSize" 
          },
        ],
        allowFailure: false,
      });

      // Validate expected noun ID matches the next purchasable noun.
      // nextNounId() is the raw counter (includes auto-allocated founder/DAO nouns),
      // so we skip ids where % 10 === 0 (lil nounders) or % 10 === 1 (Nouns DAO).
      const purchasableNounId = getNextPurchasableNounId(nextNounId);
      if (expectedNounId !== purchasableNounId) {
        return new CustomTransactionValidationError(
          "INVALID_NOUN_ID",
          'This noun is no longer available. Please refresh and try again.'
        );
      }

      // Validate block number is within valid pool range
      const currentBlock = BigInt(await config.publicClient.getBlockNumber());
      const minValidBlock = currentBlock - BigInt(poolSize) + BigInt(1);
      const maxValidBlock = currentBlock - BigInt(1);
      
      if (expectedBlockNumber < minValidBlock || expectedBlockNumber > maxValidBlock) {
        return new CustomTransactionValidationError(
          "INVALID_BLOCK_NUMBER",
          `Block number ${expectedBlockNumber} is outside valid range ${minValidBlock}-${maxValidBlock}.`
        );
      }

      // Validate price hasn't increased beyond user's max (if specified)
      if (maxPrice && currentPrice > maxPrice) {
        const currentPriceFormatted = parseFloat(formatEther(currentPrice)).toFixed(4);
        const maxPriceFormatted = parseFloat(formatEther(maxPrice)).toFixed(4);
        return new CustomTransactionValidationError(
          "PRICE_INCREASED",
          `Current price ${currentPriceFormatted} ETH exceeds your maximum ${maxPriceFormatted} ETH.`
        );
      }

      return null;
    } catch (error) {
      console.error("VRGDA validation error:", error);
      
      // Provide more specific error messages based on the error type
      if (error instanceof Error) {
        // Check for division by zero error (contract not initialized)
        if (error.message.includes('Division or modulo by zero') || error.message.includes('division by zero')) {
          return new CustomTransactionValidationError(
            "CONTRACT_NOT_INITIALIZED",
            "The VRGDA contract is not properly initialized. Please contact support."
          );
        }
        // Check for common contract interaction errors
        if (error.message.includes('execution reverted')) {
          return new CustomTransactionValidationError(
            "CONTRACT_ERROR",
            "Contract call failed. The VRGDA contract may be paused or have an issue."
          );
        }
        if (error.message.includes('network') || error.message.includes('timeout')) {
          return new CustomTransactionValidationError(
            "NETWORK_ERROR", 
            "Network connection issue. Please check your connection and try again."
          );
        }
        if (error.message.includes('insufficient funds')) {
          return new CustomTransactionValidationError(
            "INSUFFICIENT_FUNDS",
            "Insufficient funds for this purchase."
          );
        }
        
        return new CustomTransactionValidationError(
          "VALIDATION_FAILED",
          `Validation failed: ${error.message}`
        );
      }
      
      return new CustomTransactionValidationError(
        "VALIDATION_FAILED",
        "Unable to validate VRGDA purchase. Please try again."
      );
    }
  }

  async function buyNoun(expectedBlockNumber: bigint, expectedNounId: bigint, maxPrice?: bigint) {
    try {
      // Get the correct chain config dynamically
      const chainId = detectChainFromHostname();
      const config = CHAIN_SPECIFIC_CONFIGS[chainId];
      
      if (!config) {
        throw new Error("Unable to determine chain configuration");
      }
      
      // Get current price for the transaction value
      const currentPrice = await readContract(config.publicClient, {
        address: config.addresses.lilVRGDAProxy,
        abi: lilVRGDAConfig.abi,
        functionName: "getCurrentVRGDAPrice",
      });

      const request = {
        to: config.addresses.lilVRGDAProxy,
        data: encodeFunctionData({
          abi: lilVRGDAConfig.abi,
          functionName: "buyNow",
          args: [expectedBlockNumber, expectedNounId],
        }),
        value: currentPrice,
        gasFallback: BigInt(200000), // VRGDA buyNow is more complex than a simple bid
      };

      return sendTransaction(
        request, 
        { type: "buy-noun-vrgda", description: "Buy Lil Noun" }, 
        () => buyNounValidation(expectedBlockNumber, expectedNounId, maxPrice)
      );
    } catch (error) {
      console.error("Error getting VRGDA price for purchase:", error);
      throw new CustomTransactionValidationError(
        "PRICE_FETCH_FAILED",
        error instanceof Error && (error.message.includes('Division or modulo by zero') || error.message.includes('division by zero'))
          ? "The VRGDA contract is not properly initialized. Please contact support."
          : "Failed to fetch current VRGDA price. Please try again."
      );
    }
  }

  return { buyNoun, ...other };
}