# Onchain Lil Nouns Rounds Plan

## Repository observations

- Package manager: Bun workspaces (`bun@1.1.34` declared; `bun 1.3.13` observed).
- Frontend: Vite, React 18, React Router, Viem, Wagmi, RainbowKit under `apps/web`.
- Contract intent: the historical `origin/feat/rounds` branch uses root `foundry.toml` with `contracts/src`, `contracts/test`, and `contracts/script`; the current checkout retains vendored `lib/forge-std`. A checksum-verified local Foundry 1.5.1 binary is available under ignored `tmp/foundry/bin`.
- Historical voting interface: the checked-in Lil Nouns ABI exposes block-based `getPriorVotes(address,uint256)`.
- Indexing: the frontend consumes existing Goldsky/Ponder data, but no writable subgraph package is present in this checkout.
- Production address sources conflict inside the repository. Read-only chain verification confirmed Lil Nouns mainnet token `0x4b10701Bfd7BFEdc47d50562b76b436fbB5BdB3B`, treasury `0xd5f279ff9EB21c6D40C8f345a66f2751C4eeA1fB`, and governor `0x5d2C31ce16924C2a71D317e5BbFd5ce387854039`; Rounds integrations must not use the Nouns DAO addresses mislabeled in `proposal-contracts.ts`.
- This worktree is detached at `d37ac9c087382ee620ce92122d86552cc8446c4b`; no pre-existing Rounds plan was found.

## Dependency order

`contracts/interfaces -> voting adapter/mock -> round -> factory -> contract tests -> ABI/types -> RPC event reader -> frontend flows -> deployment evidence`

## Work plan

1. **Repository and contract audit**
   - Files: root manifests, `apps/web/package.json`, `apps/web/src/config.ts`, `apps/web/src/addresses.json`, token ABI, Foundry files.
   - Acceptance: toolchain, paths, commands, address conflicts, and unknowns are recorded.
2. **Yellow behavior/parity inventory**
   - Files: Yellow `data/rounds.ts`, `utils/rounds/*`, Rounds API/tests; `docs/rounds-onchain/PARITY.md`.
   - Acceptance: every requested Yellow behavior is classified without silent omissions.
3. **Architecture and authorization design**
   - Files: `ARCHITECTURE.md`, `THREAT-MODEL.md`, Solidity interfaces.
   - Acceptance: immutable boundaries, two-admin authority, clone initialization, snapshot rules, and bounded finalization are explicit.
4. **Factory and round contracts**
   - Files: `contracts/src/RoundFactory.sol`, `Round.sol`, `contracts/src/v3/{RoundFactoryV3,RoundV3,RoundPrizeVault,PrizeTypes}.sol`, `interfaces/*`, supporting library contracts.
   - Acceptance: paid isolated creation, atomic initialization/fee forwarding, immutable submission-close review buffer, moderation, snapshot voting, roles, deterministic finalization, test-mode chain guard, and an atomically bound per-round v3 prize vault compile.
5. **Unit, fuzz, invariant, and integration tests**
   - Files: `contracts/test/*`.
   - Acceptance: required round and vault invariants, adversarial token behavior, paired factory initialization, signature replay boundaries, two-signer recovery combinations, and critical rejection paths pass under the repository-compatible contract runner.
6. **SDK and ABI generation**
   - Files: generated artifacts and `apps/web/src/features/rounds/contracts.ts`.
   - Acceptance: generation-aware typed ABIs, addresses, prize asset tuples, EIP-712 payloads, enums, and read/write helpers type-check.
7. **Subgraph/indexer integration**
   - Files: repo-native index package if present; otherwise `apps/web/src/features/rounds/indexer.ts` event-log reader.
   - Acceptance: rebuildable discovery covers factory, round, vault, admin, submission, allocation, funding, recovery, snapshot, and finalization events with direct-RPC fallback.
8. **Frontend flows**
   - Files: `apps/web/src/features/rounds/*`, `apps/web/src/App.tsx`, navigation/config where needed.
   - Acceptance: selectively reuse the `393b7c5` Rounds presentation without its fixtures; create, list/detail, submit, review-buffer moderation/admin, snapshot, additive vote, finalized-result, prize funding/refund/seal/release/claim, and delayed recovery states include loading/empty/error/rejection/wrong-network/content-unavailable UX.
9. **Security and gas review**
   - Files: contracts/tests and `THREAT-MODEL.md`.
   - Acceptance: no unresolved critical/high finding; worst-case configured finalization gas is measured.
10. **Local deployment and end-to-end test**

- Files: `contracts/script/*`, `contracts/scripts/local-e2e-v3.mjs`, `deployments/local*.json`.
- Acceptance: five-minute profile completes on a local chain with fee forwarding, paired round/vault binding, prize funding/sealing, deterministic finalization, and permissionless prize release evidence.

11. **Sepolia disposable-wallet deployment**
    - Files: ignored local keystore, scripts, `deployments/sepolia.json`.
    - Acceptance: only after readiness gates; generated wallet is Sepolia-only and no secret enters output, Git, logs, or manifests.
12. **Sepolia end-to-end verification and final report**
    - Files: deployment manifest and `DEPLOYMENT.md` evidence section.
    - Acceptance: paid creation, treasury delivery, admin changes, submissions, snapshot, additive voting/rejections, finalization, direct RPC and indexed/frontend parity are recorded with hashes and links.

## Checkpoints

- After 1-3: docs cover repository evidence, parity, architecture, and threats.
- After 4-5: compile plus focused/unit/fuzz/invariant/integration tests pass.
- After 6-8: frontend type-check, tests, build, and direct-RPC fallback pass.
- After 9-10: local lifecycle, contract-size/gas reports, lint, static analysis where available, and `git diff --check` pass.
- Before 11: two public global-admin addresses are resolved, Sepolia chain is confirmed, and all readiness gates pass.

## Known blockers and unknowns

- Sepolia version 1 is deployed with both supplied global admins. Versions 2 and 3 are local-only until separately recorded deployments update the configured factory address.
- Mainnet creation fee: `UNKNOWN`; token/treasury/governor are verified but mainnet remains separately gated.
- Slither 0.11.3 was subsequently installed and run with solc 0.8.24. It reported no critical/high finding. Reviewed informational/false-positive classes were controlled clone initialization ordering despite `nonReentrant`, the intentional treasury low-level call, timestamp lifecycle gates, reverting payable fallbacks/forced-ETH observations, default-zero locals, and dependency/library pragma ranges.
- This task intentionally does not make incremental commits because the user explicitly forbids commits and pushes.
- No Rounds-specific subgraph source exists in this checkout; direct event indexing is the safe local baseline.
