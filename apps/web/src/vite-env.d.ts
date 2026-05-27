/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ALCHEMY_API_KEY?: string
  readonly VITE_INFURA_API_KEY?: string
  readonly VITE_DECENTRALIZED_SUBGRAPH_API_KEY: string
  readonly VITE_INDEXER_URL: string
  readonly VITE_CHAIN_ID: string
  readonly VITE_URL: string
  readonly VITE_CMS_URL: string
  readonly VITE_WALLETCONNECT_PROJECT_ID: string
  readonly VITE_WHISK_API_KEY: string
  /** Primary Ethereum mainnet RPC URL. */
  readonly VITE_MAINNET_RPC_URL: string
  /** Optional comma-separated Ethereum mainnet RPC fallbacks. Keep Alchemy last when set; leave empty to test only the primary RPC. */
  readonly VITE_MAINNET_RPC_FALLBACKS?: string
  /** Optional legacy JSON-RPC proxy URL. Not used by the default mainnet transport. */
  readonly VITE_RPC_PROXY_URL?: string
  // Tenderly Configuration
  readonly VITE_TENDERLY_ACCESS_KEY?: string
  readonly VITE_TENDERLY_USERNAME?: string
  readonly VITE_TENDERLY_PROJECT?: string
  // Discord Configuration
  // Note: DISCORD_BOT_TOKEN should be set as a server-side env var (not VITE_ prefix)
  readonly VITE_DISCORD_GUILD_ID?: string
  // Add other env variables as needed
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
