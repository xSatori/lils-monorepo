import { getAddress, isAddress } from 'viem'
import { resolveEnsAddress as resolveEnsAddressRecord } from '@/utils/ensIdentity'

/**
 * Resolve a single ENS name or address to a checksummed address
 */
export async function resolveEnsAddress(input: string): Promise<string> {
  // If it's already a valid address, return it checksummed
  if (isAddress(input)) {
    return getAddress(input)
  }
  
  // Try to resolve ENS name
  try {
    const resolvedAddress = await resolveEnsAddressRecord(input)
    
    if (resolvedAddress) {
      return getAddress(resolvedAddress)
    }
  } catch (error) {
    console.warn(`Failed to resolve ENS name: ${input}`, error)
  }
  
  throw new Error(`Invalid address or unresolvable ENS name: ${input}`)
}

/**
 * Resolve multiple ENS names or addresses to checksummed addresses
 */
export async function resolveEnsAddresses(inputs: string[]): Promise<string[]> {
  return Promise.all(inputs.map(resolveEnsAddress))
}
