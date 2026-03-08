"use client";
import { ToastProvider } from "./toast";
import { TooltipProvider } from "@/components/ui/tooltip";
import { TransactionListenerProvider } from "./TransactionListener";
import TanstackQueryProvider from "./TanstackQueryProvider";
import { Address, fallback } from "viem";
import { http, WagmiProvider } from "wagmi";
import { CHAIN_CONFIG } from "@/config";
import {
  getDefaultConfig,
  AvatarComponent,
  RainbowKitProvider,
  DisclaimerComponent,
} from "@rainbow-me/rainbowkit";
import { createConfig } from "wagmi";
import { EnsAvatar } from "@/components/EnsAvatar";

export const PROJECT_ID = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID;
const APP_URL = import.meta.env.VITE_URL || 'https://www.lilnouns.wtf';

// Validate required environment variables
if (typeof window !== 'undefined' && !PROJECT_ID) {
  console.warn(
    '⚠️ VITE_WALLETCONNECT_PROJECT_ID is not set. ' +
    'WalletConnect (mobile wallets) will not be available. ' +
    'Other wallet connectors (MetaMask, Coinbase Wallet, etc.) will still work. ' +
    'Get a free project ID at https://cloud.walletconnect.com'
  );
}

// Create minimal wagmi config without WalletConnect for SSR
const transports =
  CHAIN_CONFIG.rpcUrl.fallback2 != null
    ? fallback([
        http(CHAIN_CONFIG.rpcUrl.primary),
        http(CHAIN_CONFIG.rpcUrl.fallback),
        http(CHAIN_CONFIG.rpcUrl.fallback2),
      ])
    : fallback([
        http(CHAIN_CONFIG.rpcUrl.primary),
        http(CHAIN_CONFIG.rpcUrl.fallback),
      ]);

const config = typeof window === 'undefined' 
  ? createConfig({
      chains: [CHAIN_CONFIG.chain],
      transports: {
        [CHAIN_CONFIG.publicClient.chain!.id]: transports,
      },
      ssr: true,
    })
  : getDefaultConfig({
      chains: [CHAIN_CONFIG.chain],
      transports: {
        [CHAIN_CONFIG.publicClient.chain!.id]: transports,
      },
      // WalletConnect v2 requires a valid project ID
      // If missing, WalletConnect won't be available but other connectors will work
      projectId: PROJECT_ID || '00000000000000000000000000000000000000000000',
      appName: "Lilnouns.wtf",
      appDescription: "Lil Nouns DAO Governance Hub",
      appUrl: APP_URL,
      appIcon: `${APP_URL}/app-icon.jpeg`,
      ssr: true,
    });

export const CustomAvatar: AvatarComponent = ({ address, ensImage, size }) => {
  return <EnsAvatar address={address as Address} size={size} />;
};

const Disclaimer: DisclaimerComponent = ({ Text }) => (
  <Text>
    By connecting your wallet, you agree to use this service responsibly.
  </Text>
);

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <TanstackQueryProvider>
      <WagmiProvider config={config}>
          <RainbowKitProvider
            avatar={CustomAvatar}
            appInfo={{ appName: "Lil Nouns", disclaimer: Disclaimer }}
            showRecentTransactions={true}
          >
            <ToastProvider>
              <TransactionListenerProvider>
                <TooltipProvider>{children}</TooltipProvider>
              </TransactionListenerProvider>
            </ToastProvider>
          </RainbowKitProvider>
      </WagmiProvider>
    </TanstackQueryProvider>
  );
}
