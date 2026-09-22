"use client";
import { ToastProvider } from "./toast";
import { TooltipProvider } from "@/components/ui/tooltip";
import { TransactionListenerProvider } from "./TransactionListener";
import TanstackQueryProvider from "./TanstackQueryProvider";
import { Address, Chain, fallback } from "viem";
import { http, WagmiProvider } from "wagmi";
import { CHAIN_CONFIG, CHAIN_SPECIFIC_CONFIGS } from "@/config";
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
const rpcUrls = [
  CHAIN_CONFIG.rpcUrl.primary,
  ...CHAIN_CONFIG.rpcUrl.fallbacks,
].filter(Boolean);
const rpcTransports = rpcUrls.map((url) => http(url));
const transports =
  rpcTransports.length === 1 ? rpcTransports[0] : fallback(rpcTransports);

const sepoliaConfig = CHAIN_SPECIFIC_CONFIGS[11_155_111]!;
const sepoliaRpcUrls = [
  sepoliaConfig.rpcUrl.primary,
  ...sepoliaConfig.rpcUrl.fallbacks,
  // Production does not expose an Alchemy or Infura Sepolia key. Keep a
  // keyless transport available for the Rounds-only testnet surface.
  "https://ethereum-sepolia-rpc.publicnode.com",
].filter((url) => Boolean(url) && !url.includes("undefined"));
const sepoliaRpcTransports = sepoliaRpcUrls.map((url) => http(url));
const sepoliaTransport =
  sepoliaRpcTransports.length === 1
    ? sepoliaRpcTransports[0]!
    : fallback(
        sepoliaRpcTransports as [
          (typeof sepoliaRpcTransports)[number],
          ...(typeof sepoliaRpcTransports)[number][],
        ],
      );
const chains: readonly [Chain, ...Chain[]] =
  CHAIN_CONFIG.chain.id === sepoliaConfig.chain.id
    ? [CHAIN_CONFIG.chain]
    : [CHAIN_CONFIG.chain, sepoliaConfig.chain];
const configuredTransports = {
  [CHAIN_CONFIG.chain.id]: transports,
  [sepoliaConfig.chain.id]: sepoliaTransport,
};

const config = typeof window === 'undefined' 
  ? createConfig({
      chains,
      transports: configuredTransports,
      ssr: true,
    })
  : getDefaultConfig({
      chains,
      transports: configuredTransports,
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
