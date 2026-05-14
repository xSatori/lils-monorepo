import { Address, getAddress } from "viem";
import { CHAIN_CONFIG } from "@/config";

export interface AddressOverride {
  name: string;
  avatar?: string;
}

/**
 * Address overrides for special addresses (contracts, treasury, etc.)
 * These take precedence over ENS resolution
 */
let ADDRESS_OVERRIDES: Record<string, AddressOverride> | null = null;

/**
 * Initialize address overrides from config
 * This is called lazily on first access
 */
function initializeAddressOverrides() {
  if (ADDRESS_OVERRIDES !== null) return;
  
  try {
    const treasury = getAddress(CHAIN_CONFIG.addresses.nounsTreasury);
    const auctionHouse = getAddress(CHAIN_CONFIG.addresses.lilVRGDAProxy);
    const nounsToken = getAddress(CHAIN_CONFIG.addresses.nounsToken);
    const nounsPayer = getAddress(CHAIN_CONFIG.addresses.nounsPayer);

    ADDRESS_OVERRIDES = {
      [treasury.toLowerCase()]: {
        name: "Lil Nouns Treasury",
        avatar: "/nouns-treasury.png",
      },
      [auctionHouse.toLowerCase()]: {
        name: "Nouns Auction House",
        avatar: "/auction-house.png",
      },
      [nounsToken.toLowerCase()]: {
        name: "Nouns NFT",
        avatar: "/nouns-treasury.png",
      },
      [nounsPayer.toLowerCase()]: {
        name: "Nouns Payer",
        avatar: "/nouns-treasury.png",
      },
    };
  } catch (error) {
    // If CHAIN_CONFIG is not available yet, initialize empty
    ADDRESS_OVERRIDES = {};
  }
}

/**
 * Get address override if it exists
 */
export function getAddressOverrides(address: Address): AddressOverride | undefined {
  if (typeof window === "undefined") return undefined;
  
  initializeAddressOverrides();
  return ADDRESS_OVERRIDES?.[address.toLowerCase()];
}

