import { Address, createPublicClient, fallback, getAddress, http } from "viem";
import { mainnet } from "viem/chains";

const PUBLIC_ENS_RPC_URLS = [
  "https://ethereum-rpc.publicnode.com",
  "https://eth.llamarpc.com",
];

function splitRpcUrls(value?: string): string[] {
  return (value ?? "")
    .split(",")
    .map((url) => url.trim())
    .filter(Boolean);
}

export function buildEnsRpcUrls(
  primary?: string,
  fallbacks?: string,
): string[] {
  return Array.from(
    new Set([
      ...(primary?.trim() ? [primary.trim()] : []),
      ...splitRpcUrls(fallbacks),
      ...PUBLIC_ENS_RPC_URLS,
    ]),
  );
}

const ensPublicClient = createPublicClient({
  chain: mainnet,
  transport: fallback(
    buildEnsRpcUrls(
      import.meta.env.VITE_MAINNET_RPC_URL,
      import.meta.env.VITE_MAINNET_RPC_FALLBACKS,
    ).map((url) => http(url)),
    { retryCount: 1 },
  ),
});

export function truncateAddressForDisplay(address: string): string {
  if (address.length <= 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export async function resolveEnsName(address: Address): Promise<string | null> {
  try {
    return await ensPublicClient.getEnsName({
      address: getAddress(address),
    });
  } catch (error) {
    console.warn(`Failed to resolve ENS name for ${address}`, error);
    return null;
  }
}

export async function resolveEnsAddress(name: string): Promise<Address | null> {
  try {
    const resolvedAddress = await ensPublicClient.getEnsAddress({ name });
    return resolvedAddress ? getAddress(resolvedAddress) : null;
  } catch (error) {
    console.warn(`Failed to resolve ENS address for ${name}`, error);
    return null;
  }
}

export async function resolveEnsAvatar(name: string): Promise<string | null> {
  try {
    return await ensPublicClient.getEnsAvatar({ name });
  } catch (error) {
    console.warn(`Failed to resolve ENS avatar for ${name}`, error);
    return null;
  }
}
