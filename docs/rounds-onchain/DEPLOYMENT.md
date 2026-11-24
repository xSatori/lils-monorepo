# Onchain Rounds Deployment

## Running the integrated rounds branch

The `feat/onchain-rounds` branch serves the V8 Sepolia interface and a [read-only snapshot of historical rounds](../../apps/web/src/features/rounds/archive/README.md) at `/rounds`. The Solidity contracts manage rounds, voting and prizes. The Node backend verifies onchain media commitments and serves or pins IPFS content. The upstream offchain funding service is separate.

From the repository root, with Bun and Foundry installed:

```sh
bun install --frozen-lockfile
bun run --cwd packages/types build
bun run --cwd packages/assets build
bun run --cwd packages/ui build
bun test api apps/web/src/features/rounds
forge test
bun run --cwd apps/web dev
```

For a production bundle run `bun run --cwd apps/web build` after building the shared packages. The contracts use the pinned OpenZeppelin 5.4.0 alias in the root Foundry configuration. The upstream contracts retain their own OpenZeppelin dependency.

The frontend defaults to self-pinning. To use sponsored V8 uploads, set `VITE_ROUNDS_UPLOAD_API_URL=/api/rounds/uploads` for the frontend build. Provide these variables to the Node function runtime (or root `.env.local` for Vite development):

| Variable | Value |
| --- | --- |
| `PINATA_JWT` | Server-side Pinata credential |
| `ROUNDS_UPLOAD_RPC_URL` | Sepolia RPC URL |
| `ROUNDS_UPLOAD_CHAIN_ID` | `11155111` |
| `ROUNDS_UPLOAD_FACTORY_ADDRESS` | `0xCa648c6b3e53b126Ad6bC00b248a7Ac236C3aaF6` |

The legacy challenge, presign and metadata workflow also needs `ROUNDS_UPLOAD_AUTH_SECRET` (at least 32 characters) and `ROUNDS_UPLOAD_DATABASE_URL` (PostgreSQL). Keep server credentials out of `VITE_*` variables. The archive and manual pinning work without these credentials. Netlify caps pin requests at 4 MiB; platform limits also apply.

The deployment records below describe historical releases. The Foundry broadcast scripts send transactions when run with broadcasting enabled. The Pinata verification script creates and removes provider data; it is separate from the local test suite.

## Sepolia V8 Preview (2026-09-21)

V8 is the active local and Vercel Preview Sepolia factory. All four deployment
contracts are source-verified on Sepolia Etherscan. The Preview URL, Preview-only
sponsored-upload factory setting, verification evidence, security-audit triage,
and remaining release gates are in [V8-PREVIEW-RELEASE.md](./V8-PREVIEW-RELEASE.md)
and [`deployments/sepolia-rounds-v8.json`](../../deployments/sepolia-rounds-v8.json).
V7 and earlier factories remain readable as historical rounds. This Preview is
not a production deployment or mainnet sign-off.

## Sepolia V7 (2026-09-21)

V7 was deployed from the disposable Sepolia deployer. The active factory is
`0x4c05EF874bA1AF1D97C0708075CD531a38283454`; its round and prize-vault
implementations, transaction hashes, and direct-RPC verification are recorded in
[`deployments/sepolia-rounds-v7.json`](../../deployments/sepolia-rounds-v7.json).
The factory reports version 7, a mutable initial 0.01 ETH creation fee, and the
fixed Lil Nouns treasury `0xd5f279ff9EB21c6D40C8f345a66f2751C4eeA1fB`.
The Sepolia frontend now creates V7 rounds and continues to read V6/V5 rounds.
The stateless sponsored-upload service recognizes V7 rounds even when its
configured legacy factory is V6. Set `ROUNDS_UPLOAD_FACTORY_ADDRESS` to the V7
factory in each hosted Sepolia environment as well; the local ignored `.env.local`
has been updated. Restart a running local dev server so it reloads that variable.
No hosted deployment or explorer source publication is implied by these local
changes.

The additive v3 prize-vault Sepolia procedure is in [PRIZE-VAULT-SEPOLIA.md](./PRIZE-VAULT-SEPOLIA.md). Existing v2 manifests must not be overwritten.

## Profiles

### Local

- Chain: local development only.
- Test mode: enabled.
- Submissions: five minutes.
- Moderation review: five minutes.
- Voting: five minutes.
- Voting token: `MockLilNounsVotes`.
- Creation fee: `100000000000000` wei unless overridden for a local test.

### Ethereum Sepolia

- Chain ID: `11155111`.
- Test mode: enabled and visibly labeled by clients.
- Submissions: five minutes.
- Moderation review: five minutes for version 2.
- Voting: five minutes.
- Voting token: test-only checkpoint mock unless a verified compatible Lil Nouns deployment is selected.
- Creation fee: `100000000000000` wei.
- Two nonzero, distinct public global-admin addresses are required.
- Deployment uses a newly generated disposable wallet stored only in a verified ignored local keystore/secrets directory. Only its public address may be reported.

### Ethereum mainnet

Not authorized. Test mode is allowlisted only on local chain IDs `31337`/`1337` and Sepolia `11155111`, so it reverts on chain ID `1` and every other chain. Read-only chain verification confirmed the mainnet Lil Nouns token `0x4b10701Bfd7BFEdc47d50562b76b436fbB5BdB3B`, treasury `0xd5f279ff9EB21c6D40C8f345a66f2751C4eeA1fB`, and governor `0x5d2C31ce16924C2a71D317e5BbFd5ce387854039`. The production creation fee remains `UNKNOWN`, and all mainnet deployment requires separate explicit approval.

## Readiness gates

1. Contracts compile with pinned compiler/optimizer settings.
2. Unit, integration, fuzz, and invariant suites pass.
3. No unresolved critical/high security issue.
4. Contract-size and maximum finalization gas are acceptable.
5. SDK/frontend/indexer build and critical reads have direct-RPC fallback.
6. Local five-minute submission, moderation-review, and voting lifecycle passes.
7. `git diff --check` passes and secret scan is clean.
8. Both global-admin public addresses are supplied.

## Manifest schema

The local/Sepolia manifest records chain name/ID, UTC time, Git SHA and dirty note, compiler/optimizer settings, public deployer, admins, treasury, voting token/adapter, implementation/version, factory, creation fee, constructor/initializer inputs, transaction hashes, block numbers, bytecode hashes, verification status, test round, and end-to-end hashes/links. It never includes a private key, mnemonic, raw keystore, or RPC credential.

## Local deployment evidence

The version-4 Anvil chain-ID `31337` lifecycle was executed on 2026-09-18 and recorded separately in `deployments/local-rounds-v4.json`. It deployed fresh v4 round/vault implementations and a factory, forwarded the exact paid creation fee, retained zero factory ETH, stored a new submission as approved without an approval transaction, captured the snapshot, cast partial and additive votes totaling five, finalized permissionlessly, observed the immutable distribution delay, and let an unrelated executor deliver the exact ETH allocation to the deterministic winner. Allocation hold/unhold/reclaim quorum combinations and delayed late-rescue behavior are covered by the focused unit and stateful invariant suites because their EIP-712 signatures are exercised directly there.

The Anvil chain-ID `31337` version-2 lifecycle was executed on 2026-09-18 with exact five-minute submission, moderation-review, and voting phases. The run deployed the mock checkpoint token, historical-vote adapter, round implementation, and versioned factory; created a paid round; proved the `100000000000000` wei treasury increase and that the paid creation fee was not retained by the factory; closed submissions, rejected a review-period submission, approved entries during the dedicated review buffer, then exercised snapshot capture, partial and additive voting, required rejection paths, deterministic finalization, and idempotent re-finalization. The transaction-level record, constructor/initializer inputs, live deployed-code hashes, and final state are in `deployments/local-rounds.json`. Local time was advanced only after each phase-specific rejection had been observed; no production clock or chain state was altered.

Slither 0.11.3 with solc 0.8.24 found no critical/high issue. Its remaining reports were reviewed as intentional exact-fee treasury delivery, timestamp lifecycle design, reverting payable fallbacks and unavoidable forced-ETH caveats, strict zero eligibility checks, and bounded vote-path complexity.

The version-2 contract run contains 33 unit/integration/fuzz tests plus five stateful invariants. Each invariant completes 256 runs and 128,000 targeted handler calls. The handler actively exercises valid additive allocations alongside rejected snapshot recapture, self/duplicate/invalid/over-cap votes, frozen moderation, generic role mutation, clone reinitialization, and one additional paid factory round whose provenance and non-retained fee are checked.

## Sepolia deployment evidence

### Active version 5 deployment

Version 5 is the active Sepolia/frontend configuration. It preserves V4's approved-by-default submissions, frozen voting boundary, permissionless deterministic prize distribution, and two-signature hold/unhold/reclaim controls. It adds commit-first/pin-second media, exact-CID stateless Pinata uploads without PostgreSQL, and append-only submission images authorized by two distinct current global/round admins.

- Disposable deployer: `0x45803D21b418c8a675c7654597BE1056019C655E`
- Mock voting token: `0xddDF394EC7CC88bDCD54bF45326B123885A8eE6a`
- Historical voting-power adapter: `0xDC13e69c8e335d419205c22680f0B27b3FD79C36`
- Round implementation v5: `0xCa319f00c3806A41C62b5d1104d56F32E9518e29`
- Prize-vault implementation v5: `0xdb51b57048d83Cb258aB800073e844Db3Fc4A826`
- Factory: `0xd4cB8549980AdD2feA586FD13a47613118B0B5b4`
- Test treasury: `0x2fC16Ed86E11544Fc9d67214705aAa60A3fEdEA5`
- Paid test round: `0x657ac7E91d122576415dC5C4f4B1dbdAa7fD7159`
- Prize vault: `0xEC7016A448feE6765a1A5Ce09B6E91e122e98f1f`
- Vercel Preview: `https://lils-monorepo-nn8iwiim1-satori-ffbfc349.vercel.app`

The normal-time Sepolia lifecycle completed five-minute submission, moderation, and voting phases without clock manipulation. It proved exact fee forwarding, default-approved entries, admin add/remove, immutable snapshot capture, additive voting and rejection paths, deterministic/idempotent finalization, public execution by a non-admin/non-winner, and exact release of ETH, ERC-20, ERC-721, and ERC-1155 prizes. Initial, metadata, and two-admin appended-image CIDs were pinned and retrieved byte-for-byte; duplicate retries were idempotent. The Preview served the Rounds UI and accepted the same valid committed CAR while rejecting malformed requests.

All eight deployment contracts are Etherscan verified. Complete addresses, constructor inputs, bytecode hashes, blocks, transaction hashes, assertions, IPFS evidence, and Preview evidence are in `deployments/sepolia-rounds-v5.json` and `deployments/sepolia-rounds-v5-e2e.json`. One earlier empty test round/vault was created when a local receipt parser stopped; it contains no submissions, prizes, or retained funds and is recorded as an operational caveat.

### Historical version 4 deployment

Version 4 was the preceding frontend configuration. It keeps submissions approved by default, freezes moderation when voting starts, lets any caller execute a deterministic winner distribution after the safety delay, and supports allocation-specific two-signature hold, unhold, and delayed reclaim. The two signers may be the two global admins, one global plus one current round admin, or two current round admins.

- Disposable deployer: `0x63939F7EBf558F90Ec12b7dd5a4c7DCAE51d10D2`
- Mock voting token: `0xEfd032ffd80776FE7bE721e00fe0868bC97853B9`
- Historical voting-power adapter: `0x92F8b9ce56902aa0C50869eDf30e761d0971Ce06`
- Round implementation v4: `0xe4A60C7604Dc0753BC2920bE25cd3BC5294Ea525`
- Prize-vault implementation v4: `0x1F1AfC11f04ac2cE352faE7EbF28C64dA05879a2`
- Factory: `0x6D00E67aF83E89A8E888EF0920c99f9eCf9527B5`
- Test treasury: `0x2fC16Ed86E11544Fc9d67214705aAa60A3fEdEA5`
- Paid test round: `0xfe479Ba8BCDa873C8ADf2eA719c5B076d7093068`
- Prize vault: `0x70D7B561Df1B18Ea77bbaA4e2928c87299E68910`

The live five-minute Sepolia lifecycle proved exact creation-fee forwarding, zero factory fee retention, creator/admin management, two default-approved submissions, review-period rejection and reapproval, immutable snapshot capture, additive voting, required reverts, permissionless deterministic finalization, idempotent re-finalization, two-signature hold/unhold, public prize execution by a non-winner, and delayed two-signature recovery. Direct state and event-derived totals both equal `[12, 9]`; the winner received `200000000000000` wei, the held allocation recovery recipient received `200000000000000` wei, and the vault ended at zero ETH.

An initially deployed factory at `0x26e918a8B460078ECb9582dc1FE44e4a846b1Dde` is superseded and unused because its reused test voting token was controlled by an older disposable signer. The active factory above uses a fresh v4-only voting token and adapter. Complete transaction hashes, blocks, bytecode hashes, initializer inputs, rejection evidence, and explorer links are in `deployments/sepolia-rounds-v4.json`.

Explorer source publication was not attempted because no explorer API credential was configured and publishing private-worktree source metadata to a third-party verifier was not separately approved. Deployment receipts and runtime bytecode hashes were reconciled directly by RPC.

### Historical version 3 deployment

Version 3 added a dedicated minimal-clone prize vault to every round while preserving the five-minute Sepolia submission, moderation-review, and voting phases. The vault custody plan supports native ETH, ERC-20, ERC-721, and ERC-1155 assets; winners release or redirect their own allocations permissionlessly after deterministic finalization.

- Disposable deployer: `0x97309d0652c1d5d07FFC699ccb1C42404cbd0b1e`
- Mock voting token: `0xf965870Ce35473d8a1e059C14DDC1c3DEf3FBF0a`
- Historical voting-power adapter: `0xaEe5648150ee98cEFd9B3bb88c6c4E11a0c0994d`
- Round implementation v3: `0xD36156D12fFf656B52a755087e1b0CdE18FB1526`
- Prize-vault implementation: `0x7d0240a99B4eA2c8f062b37aD0d1e7D8c6ACB1d4`
- Factory v3: `0xa0dCca7e11012642298C6Ed0BF92Bd1561d38237`
- Test treasury: `0x2fC16Ed86E11544Fc9d67214705aAa60A3fEdEA5`
- Paid test round: `0x6eCD7eAc705d238126F27f595032fa65d2e6B2d4`
- Prize vault: `0x50030cE356A34183ba51670727214e160c744756`

The funded lifecycle sealed and released ETH, ERC-20, ERC-721, and ERC-1155 prizes; exercised winner `claimTo`; proved the complete round lifecycle and rejection paths; and reconciled direct RPC state with the event-derived projection. A second underfunded vault proved exact contributor refunds and delayed two-admin recovery of excess assets without touching liabilities. All eight deployed contracts are Sourcify `exact_match`. Full transaction hashes, blocks, inputs, bytecode hashes, balances, reverts, explorer links, verification jobs, and final state are in `deployments/sepolia-rounds-v3.json`; the concise narrative is in [PRIZE-VAULT-SEPOLIA.md](./PRIZE-VAULT-SEPOLIA.md).

The test profile was deployed and exercised on Ethereum Sepolia (`11155111`) on 2026-09-18 using a newly generated disposable encrypted keystore. The deployer public address is `0xC3CE7cE8FFEa3E5BB455A1F597873250cFeb48A7`; no private key, mnemonic, password, or keystore content is present in tracked files or manifests.

### Historical version 2 deployment

Version 2 introduced the dedicated moderation-review interval. Its test schedule used five minutes for submissions, five minutes for review, and five minutes for voting, all observed against normal Sepolia block time without chain-time manipulation.

- Mock voting token: `0x6bc527932A9D48Cb3298Aa11C8FFDac482E47D72`
- Historical voting-power adapter: `0x01f7178860A5C081c1533B5ABb61e64d3e84596a`
- Round implementation v2: `0xc8089729b9b0fE4f08ABcA5F6848a2784a71D5d0`
- Factory v2: `0xFdf7d9C70b79925ef46B13e8b552BE320419Dbf0`
- Test treasury: `0x2fC16Ed86E11544Fc9d67214705aAa60A3fEdEA5`
- Paid test round: `0x6fa4EC952172634dAAc7ec7E0AA4edDaA054E154`

The paid creation transaction increased the treasury by exactly `100000000000000` wei and left the factory at zero. The creator became the first round admin, added and removed another admin, and three distinct wallets submitted entries. A second submission from a capped wallet reverted. Submission writes closed before the review buffer; a late submission reverted while admins still approved entries during that buffer, and moderation froze at voting start.

Snapshot block `11730831` was captured permissionlessly and never changed. Live transactions proved a partial three-vote allocation followed by an additive two-vote allocation to the same entry; final totals were `[4, 5, 5]`. Self-voting, duplicate IDs, snapshot recapture, post-start moderation, per-entry over-allocation, and remaining-vote over-allocation reverted. Permissionless finalization selected submission `1` because the two leading entries tied at five votes and the earlier submission ID is the deterministic tie-breaker. A second finalization call preserved the result, and direct RPC state matched the event-derived projection.

All four deployment contracts are Sourcify `exact_match`. The complete secret-free v2 evidence is in `deployments/sepolia-rounds-v2.json`, including constructor/initializer arguments, code hashes, blocks, transaction hashes, rejection evidence, verification job URLs, and explorer links.

### Historical version 1 deployment

The immutable version-1 factory `0xE2758DDAe22AfB0DE52E6DBF8C0FDeBa08c10624` and round `0xb3f6ACF7C41c7dD08168Da7D3CCf20FD5faB39b4` predate the review interval. They remain readable through frontend compatibility normalization, but new v2 creation is never encoded against that address. Historical evidence remains in `deployments/sepolia-rounds.json`.

`build-sepolia-manifest.mjs` selects a versioned output path from the deployed implementation version: v1 writes `sepolia-rounds.json`, while v2 writes `sepolia-rounds-v2.json`. Verification evidence is version-specific, so the historical job records are never reused for the v2 deployment.
