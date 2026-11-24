# Onchain Lil Nouns Rounds Tasks

- [x] Audit repository/toolchain/address sources and Yellow behavior.
- [x] Write goal, plan, parity, architecture, threat model, and deployment docs.
- [x] Add Foundry configuration and contract interfaces/dependencies; verify compile.
- [x] Implement/test historical voting adapter and test checkpoint token.
- [x] Implement/test round initialization, roles, submissions, moderation, snapshot, and voting.
- [x] Implement/test deterministic finalization and required invariants/fuzz cases.
- [x] Implement/test versioned exact-fee clone factory and test-mode guard.
- [x] Add deployment scripts and local end-to-end manifest.
- [x] Generate deterministic contract ABI artifacts (frontend/indexing integration remains in parallel work).
- [x] Run security, size/gas, frontend, formatting, and diff gates.
- [x] Resolve two public global-admin addresses and execute Sepolia deployment.
- [x] Execute/record Sepolia end-to-end proof.

## Version 4 policy update

- [x] Add v4 default-approved submissions and frozen pre-vote denial tests.
- [x] Add public deterministic prize execution and post-finalization distribution delay.
- [x] Add allocation-specific two-signature hold and unhold actions.
- [x] Add delayed two-signature allocation reclaim to the fixed recovery recipient.
- [x] Add replay, stale-role, reentrancy, race, terminal-state, accounting, fuzz, and invariant tests.
- [x] Export v4 ABIs and update frontend reads/actions/status labels.
- [x] Update parity, architecture, threat model, and deployment docs.
- [x] Run local lifecycle and full repository-compatible verification gates.
- [x] Deploy and exercise a new Sepolia v4 lifecycle with a disposable test wallet.

## Checkpoints

- [x] Design checkpoint: repository evidence and immutable boundaries documented.
- [x] Contract checkpoint: compile and all contract tests pass.
- [x] Integration checkpoint: SDK/indexer/frontend builds and direct-RPC fallback works.
- [x] Release checkpoint: local E2E, security/gas gates, and deploy inputs ready.

## Rounds media upload

- [x] Add server-only Pinata presign API with shared-store wallet nonce replay protection.
- [x] Bind sponsorship to the configured chain/factory, active submission phase, and remaining submission capacity.
- [x] Enforce image-only MIME, 10 MiB per-image, eight-image, and 40 MiB aggregate limits.
- [x] Build exact-byte canonical submission metadata and automatic keccak/URI transaction handoff.
- [x] Preserve manual `ipfs://` / `ar://` URI and hash fallback.
- [x] Add YouTube-link metadata without accepting uploaded video.
- [x] Add Vercel, Netlify, and Vite development adapters.
- [x] Run focused security tests, filtered typecheck, production build, syntax, audit, and diff checks.
- [ ] Restore repository-wide typecheck/lint baseline (pre-existing TypeScript failures and no discoverable ESLint config; outside this focused change).

## Database-free media authorization and two-admin image assistance (V5 Sepolia)

- [x] Prove deterministic browser/backend CAR and CID parity plus live Pinata duplicate retry behavior.
- [x] Specify and pass unit, fuzz, and invariant tests for append-only images and two distinct live admin approvals.
- [x] Implement an immutable V5 Round/Vault pair for global/global, global/round, and round/round signer pairs.
- [x] Complete local security coverage for stale roles, replay, duplicate identity, ERC-1271, authority expansion, and voting-start freeze.
- [x] Replace PostgreSQL challenges/sessions in V5 with live onchain commitment verification and exact-byte stateless pinning. (Historical pre-V5 compatibility remains isolated; live Pinata proof is still a deployment gate.)
- [x] Refactor V5 submission UX to commit first, pin second, and retain an exact in-session retry bundle after incomplete uploads.
- [x] Add the database-free two-admin sign/share/review/execute/pin workflow and public signer audit UI.
- [x] Hydrate ordered image additions through direct RPC, expose indexed signer events, and render the audit trail. (External subgraph is not present.)
- [x] Complete a PostgreSQL-disabled lifecycle and all applicable repository-compatible verification gates.
- [x] Update protocol/parity/threat/deployment docs, generated ABIs, configuration, and the Rounds information modal.
- [x] Deploy, verify, and exercise a fresh versioned Sepolia lifecycle with a new disposable wallet.
- [x] Document the operator-owned Vercel, Pinata, environment, and Sepolia prerequisites in `docs/rounds-onchain/TESTNET-USER-TESTING-CHECKLIST.md`.
