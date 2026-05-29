import { lilVRGDAAbi } from '@/abis/lilVRGDA';
import { CHAIN_CONFIG } from '@/config';

// Use a getter function to ensure we always get the current chain config
// This prevents issues where the config might be evaluated at module load time
// before the hostname detection has run (e.g., during SSR)
export const getLilVRGDAConfig = () => ({
  address: CHAIN_CONFIG.addresses.lilVRGDAProxy,
  abi: lilVRGDAAbi,
} as const);

// For backward compatibility, export a getter that reads current config
// This ensures we always get the correct chain-specific address
export const lilVRGDAConfig = new Proxy({} as ReturnType<typeof getLilVRGDAConfig>, {
  get(_target, prop) {
    const config = getLilVRGDAConfig();
    return config[prop as keyof typeof config];
  },
  ownKeys() {
    return ["address", "abi"];
  },
  getOwnPropertyDescriptor(_target, prop) {
    if (prop === "address" || prop === "abi") {
      return {
        enumerable: true,
        configurable: true,
      };
    }

    return undefined;
  },
});
