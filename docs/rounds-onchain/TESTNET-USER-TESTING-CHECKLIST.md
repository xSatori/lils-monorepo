# Rounds V5 testnet readiness checklist

The automated V5 deployment and hosted Pinata proof are complete. This file records the completed operator setup and the remaining manual user-testing handoff. Do not paste JWTs, RPC credentials, wallet keys, or seed phrases into chat, source files, deployment manifests, or browser-exposed `VITE_*` variables.

## 1. Vercel CLI and preview project

- [x] Vercel CLI was available for the automated run. If your terminal cannot find it, install it with `npm i -g vercel`.
- [x] Vercel authentication was confirmed.
- [x] The checkout was linked to `Satori/lils-monorepo`.
- [x] V5 was deployed only as a Vercel Preview, not Production.

If this repository does not already have a dedicated test project, create one in Vercel and use `bun run build` with `apps/web/dist` as the output. The committed `vercel.json` already declares those settings.

## 2. Pinata test credential

- [x] A host-funded Pinata account/workspace was configured.
- [x] A test credential with the required public-file access was configured without exposing it.
- [x] Exact-CID, retry, and three-request concurrent upload tests passed.
- [x] `PINATA_JWT` was added to Vercel Preview and Development only.
- [ ] Do not send the JWT in chat. Once it exists in Vercel, tell Codex only that the variable has been configured.

The Preview stateless route is enabled. Production remains separately gated; retain Pinata usage/billing alerts and hosting rate limits.

## 3. Server-only Rounds upload variables

Add these to Vercel Preview/Development. None belongs in browser code:

| Variable | Value / action |
|---|---|
| `PINATA_JWT` | Secret created in step 2. |
| `ROUNDS_UPLOAD_RPC_URL` | A reliable Ethereum Sepolia HTTPS RPC URL. |
| `ROUNDS_UPLOAD_CHAIN_ID` | `11155111` |
| `ROUNDS_UPLOAD_FACTORY_ADDRESS` | `0xd4cB8549980AdD2feA586FD13a47613118B0B5b4` in Preview/Development. |

Legacy pre-V5 uploads may still use `ROUNDS_UPLOAD_AUTH_SECRET` and a database URL such as `ROUNDS_UPLOAD_DATABASE_URL`. V5 does not use them. Existing legacy values can remain until historical-round support is intentionally retired; do not add a new PostgreSQL database for V5.

## 4. Browser-visible preview variables

These are intentionally public in the compiled Vite app. Never put a secret in a `VITE_*` variable.

| Variable | Required value / purpose |
|---|---|
| `VITE_CHAIN_ID` | `11155111` |
| `VITE_URL` | The Vercel Preview URL; update it after the first preview exists. |
| `VITE_WALLETCONNECT_PROJECT_ID` | WalletConnect project ID for test wallets. |
| `VITE_ALCHEMY_API_KEY` | Public browser RPC project key, if this existing app configuration uses Alchemy. |
| `VITE_INFURA_API_KEY` | Public browser RPC project key/fallback, if this existing app configuration uses Infura. |
| `VITE_MAINNET_RPC_URL` | Existing read-only mainnet RPC used by non-Rounds parts of the site. This does not authorize a mainnet transaction. |
| `VITE_MAINNET_RPC_FALLBACKS` | Optional comma-separated read-only fallback RPC URLs. |
| `VITE_INDEXER_URL` | Optional existing indexer endpoint. Rounds critical state retains a direct-RPC fallback. |

Keep existing app variables such as CMS, analytics, Discord, Tenderly, or subgraph configuration unchanged unless the linked Vercel project already requires them. They are not new Rounds V5 dependencies.

## 5. Contract deployment inputs

The global admins are already resolved:

- Admin 1: `0xdcf37d8aa17142f053aaa7dc56025ab00d897a19`
- Admin 2: `0x66cd193d0c0fb3b9b44dd371107617a7e9f38184`

Before deployment:

- [x] Reuse the existing Sepolia test treasury `0x2fC16Ed86E11544Fc9d67214705aAa60A3fEdEA5`.
- [x] All eight V5 deployment contracts were verified on Etherscan.
- [x] Use the newly generated disposable V5 deployer address `0x45803D21b418c8a675c7654597BE1056019C655E`. Its encrypted keystore and separate password file are stored under the Git-ignored `.rounds-secrets/` directory. Never place its private key or mnemonic in `.env.local`.
- [x] The disposable deployer was funded and used only on Sepolia. No mainnet ETH, account, transaction, or production treasury was used.

The V5 deployment profile pins chain ID `11155111`, the creation fee `100000000000000` wei, and five-minute submission/review/voting test timing. No mainnet deployment is authorized.

## 6. Remaining manual user testing

1. Open `https://lils-monorepo-nn8iwiim1-satori-ffbfc349.vercel.app/rounds` and connect a Sepolia-only test wallet.
2. Review the Rounds information modal, mobile layout, empty/loading/error states, transaction copy, and five-minute countdowns.
3. Create a disposable user round, submit normal-size PNG/JPEG/WebP/GIF images, intentionally interrupt one upload, and use retry.
4. Exercise the two-admin sign/share/execute flow with the intended operational admin wallets before Production activation.
5. Review Pinata usage and Vercel function logs after testing. Rotate the currently configured Alchemy API key because its URL was exposed in local test-tool output, then update local and Vercel variables.
6. Report any UX/UI issues; Production/mainnet activation remains separately gated.
