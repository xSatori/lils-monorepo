# Onchain Rounds Architecture

Rounds v3 adds an immutable per-round prize-vault pair; see [PRIZE-VAULT.md](./PRIZE-VAULT.md). Version 4 keeps the same factory initializer schema while changing new-round submission eligibility and adding allocation-specific distribution safety. Existing v1-v3 rounds are unchanged.

## Authority model

Ethereum state is authoritative. The web app and event index are disposable projections. Critical screens read the factory/round directly when indexed data is empty, stale, or unavailable.

## Contracts

- `RoundFactory`: exact-fee entry point, two-admin control plane, immutable voting-power adapter, future implementation registry, round registry, CREATE2 clone deployment, and emergency creation pause.
- `Round`: one immutable-in-practice initialized instance containing config, admin membership, submissions, moderation, snapshot, allocations, totals, and winners.
- `IVotingPower`: narrow `getPastVotes(account, blockNumber)` adapter boundary.
- `LilNounsVotingPower`: translates Lil Nouns `getPriorVotes` checkpoints to the protocol boundary.
- `MockLilNounsVotes`: local/Sepolia-only checkpoint token used by the test profile.

Each clone is initialized in the same factory transaction that creates it. The implementation contract disables initialization in its constructor. CREATE2 salts include creator, creator nonce, implementation version, config hash, and caller salt. The factory records every successfully initialized instance.

## Roles

The factory stores exactly two distinct nonzero global admins. Either may independently pause creation, rotate one admin atomically, set fee/treasury, or register a future implementation. There is deliberately no invented 2-of-2 flow. The factory has no function that can pause or otherwise mutate an existing round.

Global admins cannot alter round votes, winners, snapshot, voting token, strategy, schedule, or round-admin membership.

The creator is the first round admin. OpenZeppelin `AccessControl` stores role membership, while the public grant/revoke entry points remain creator-only and inherited renunciation is disabled. This small wrapper is necessary to preserve the exact invariant that the immutable creator remains an admin and a round can never have zero admins. Admin/moderation changes emit indexed events.

The factory likewise uses OpenZeppelin `AccessControl` for membership checks, with an explicit two-address array and atomic rotation wrapper. No account receives `DEFAULT_ADMIN_ROLE`, and direct role renunciation is disabled, so the generic library cannot bypass the exactly-two-admin invariant.

## Lifecycle and immutability

`UPCOMING -> SUBMISSIONS_OPEN -> MODERATION_PENDING -> SNAPSHOT_PENDING/VOTING_OPEN -> ENDED -> FINALIZED`, with `ARCHIVED` as a post-finalization presentation flag. `submissionsClose` is immutable: submissions stop there, while round admins retain the ability to approve, reject, or hide entries until `votingStart`. The production UI defaults this review buffer to 24 hours, but the creator chooses it when creating the round. Timestamps, strategy, base/fixed allocation, caps, winner count, and content references are set during initialization and have no mutator. The voting adapter is immutable at the factory level and every round configuration must use that exact adapter; a creator cannot substitute a permissive eligibility contract.

Version-4 submissions begin `APPROVED`, matching Yellow's default eligibility. Submission writes stop at `submissionsClose`; admins may approve, reject, or hide entries during submissions and the dedicated moderation buffer, then lose that power at `votingStart`. At the voting boundary, eligibility is the stored approved/non-hidden state and cannot change. Historical v1-v3 rounds retain their original pending-first behavior.

Version 2 changes the initializer tuple by adding `submissionsClose`, so it requires a version-2 factory deployment. The Sepolia version-1 factory and its existing round remain immutable historical deployments and are read-only compatible in the frontend; the frontend must not encode a version-2 create call against that version-1 address.

Round-specific title and description min/max values are stored and enforced onchain as UTF-8 byte lengths (`bytes(field).length`). The submitted strings are calldata only: the contract stores each field's `keccak256(bytes(field))` commitment and `uint32` byte length alongside the content-addressed metadata URI/hash. Clients verify fetched metadata against both commitments and must describe the rule as bytes, not Unicode characters.

Only factory creation can be paused. A per-round emergency pause was deliberately rejected because a global admin could hold it through the fixed voting window and force finalization from partial or zero totals. Existing rounds therefore remain live and immutable under a factory pause.

## Snapshot model

Lil Nouns uses block checkpoints (`getPriorVotes`). For voting-start mode, anyone calls `captureSnapshot()` after voting begins; it deterministically stores the immediately prior block. This guarantees a closed historical block but means delayed first capture can include delegation changes between the nominal start and capture transaction. The UI exposes `SNAPSHOT_PENDING`, and deployment/keeper operations should capture promptly.

Custom snapshot mode fixes a prior block at initialization. It cannot be changed later.

## Voting and finalization

Every strategy is gated by positive historical delegated voting power. Each vote call contains unique submission IDs and positive amounts. State records cumulative used votes, voter/submission allocations, and aggregate totals. No decrement path exists.

Total submissions and winner count are bounded. Finalization is permissionless and computes an insertion-ranked top set: larger totals first, earlier submission ID on ties. Repeated calls are idempotent and return the frozen winners.

## Content

Round and submission records store a bounded URI and `bytes32` integrity hash. Contracts accept exactly nonempty `ipfs://` and `ar://` schemes at initialization and every metadata write; mutable `http://`/`https://` metadata references revert. Submission title/description text stays in that document while onchain hashes and byte lengths make tampering or schema mismatch detectable. Submission metadata supports the legacy ordered `images[]` list and a typed `media[]` list of content-addressed image, video, or audio objects. Media bytes remain external to Ethereum and the client resolves their IPFS/Arweave references through gateways; malformed or unavailable content never hides onchain owner/status/vote/result fields. Award descriptions remain metadata, while v3+ prize assets are custody-backed by the dedicated vault described below. Historical v1-v2 rounds have no supported or accounted prize-deposit/release path.

### Version 5 append-only media authority

V5 preserves V1-V4 and adds ordered image records without replacing original metadata. Each append requires EIP-712 approvals from two distinct identities that are current members of the union of factory global admins and round admins. The contract uses `SignatureChecker` with explicit signer addresses for EOA and ERC-1271 support. The payload binds chain, round, submission, nonce, URI, hash, and deadline. Role membership is deliberately live at execution: revocation invalidates an approval, while re-granting the same address before its deadline makes that address current again.

Original images remain content metadata, but V5 commits a declared original-image count and enforces a total cap of eight across originals and onchain additions. Clients and the upload verifier reject metadata whose fetched image count differs; the contract cannot parse offchain bytes, so inaccessible manual metadata retains that explicit trust limitation. Appends freeze at the exact `votingStart` boundary. This accepts a last-block content-change risk during moderation in exchange for using the whole configured review period; indexed signer/executor/revision events make the action auditable.

Every v3+ round has a dedicated vault for ETH, ERC-20, ERC-721, and ERC-1155 allocations. Public release derives the recipient from deterministic winner state; the transaction sender never chooses the recipient. A winner may separately authorize `claimTo` for an alternate address.

Version 4 adds an immutable post-finalization distribution delay. During that initial window, two authorized signers may hold a specific allocation. Public release then has an exclusive `claimPeriod` in which no new hold may race distribution. If an allocation is still unresolved after that period—for example, because its winner contract always reverts or its winner rank does not exist—the two-signature hold path reopens so assets cannot remain stuck forever. A held allocation blocks public release, direct winner claim, and signed redirect without affecting other allocations. A fresh two-signature action may unhold it, or—after it has remained held for the configured recovery delay—reclaim it only to the vault's configured recovery recipient. Reclaim is terminal, fully evented, and an explicit quorum seizure power rather than a trustless winner guarantee.

The separately gated custody design and historical branch audit are recorded in `PRIZE-ESCROW.md`.
