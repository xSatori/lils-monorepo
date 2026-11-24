# Rounds v4: Default Eligibility and Distribution Safety

## Objective

Version 4 changes submission and prize-distribution policy without mutating any deployed v1-v3 round. New submissions begin `APPROVED`; round admins may reject or hide them only before voting. Any account may execute a prize distribution to the deterministic winner, while two authorized admins may hold, unhold, or—after an explicit delay—reclaim one specific allocation.

## Required behavior

### Submissions

- `submit` stores `APPROVED` immediately and emits the normal creation event.
- Round admins may set `APPROVED`, `REJECTED`, or `HIDDEN` before `votingStart`.
- Moderation freezes at `votingStart`; the review interval remains configurable and defaults to one day in production.
- Voting accepts only `APPROVED` submissions.

### Public distribution

- `release(allocationId)` is callable by any account.
- The caller never selects or receives the prize. The vault derives the recipient from the round's finalized winner at the allocation's fixed rank.
- Winner-authorized `claimTo` remains available for an alternate recipient.
- Every release path rejects a held, reclaimed, already claimed, unfinalized, or not-yet-distributable allocation.
- A post-finalization distribution delay gives authorized admins a deterministic opportunity to place a hold before public execution opens.
- Once public execution opens, the immutable `claimPeriod` is release-only: no new hold can race an ordinary winner distribution.
- If an allocation remains unresolved after the claim period, the hold path reopens so a missing rank or permanently reverting winner cannot trap custody forever.

### Two-signature controls

- Valid pairs remain global/global, global/round, or round/round, with two distinct live signers.
- Signatures bind chain, vault, round, prize-plan hash, allocation, action, nonce, deadline, and relevant recipient/delay data.
- Delayed safety actions also bind the currently expected recovery recipient, so a queued action cannot execute against a silently changed destination.
- Holding one allocation has no effect on unrelated allocations.
- Unholding requires a fresh two-signature authorization and increments a nonce.
- Reclaim requires the allocation to remain held for at least the configured recovery delay, then a fresh two-signature authorization.
- Reclaim transfers only to the configured recovery recipient, consumes the liability, and permanently marks the allocation reclaimed.
- Reclaim is an explicit admin seizure power. Events and UI must label its signers, timing, recipient, and terminal effect.

## Tech stack and files

- Solidity `0.8.24`, OpenZeppelin `5.0.2`, Foundry.
- New immutable implementation files live under `contracts/src/v4/`; v3 remains unchanged.
- Contract tests live under `contracts/test/` and deployment scripts under `contracts/script/`.
- Frontend ABI, RPC normalization, types, and controls live under `apps/web/src/features/rounds/`.
- Architecture, parity, threat model, and deployment evidence live under `docs/rounds-onchain/` and `deployments/`.

## Commands

- Format: `C:\Users\Deej\.foundry\bin\forge.exe fmt --check`
- Focused contracts: `C:\Users\Deej\.foundry\bin\forge.exe test --match-path test/RoundsV4.t.sol -vvv`
- Full contracts: `C:\Users\Deej\.foundry\bin\forge.exe test`
- Sizes: `C:\Users\Deej\.foundry\bin\forge.exe build --sizes`
- Frontend tests: `bun test ./src/features/rounds`
- Frontend build: `bun run --cwd apps/web build`
- Repository hygiene: `git diff --check`

## Testing strategy

- Unit tests prove default approval, pre-vote rejection/hiding, frozen moderation, public executor behavior, and exact winner delivery.
- Signature tests cover every valid signer pair plus duplicate, unauthorized, stale-role, expired, replay, wrong-chain, wrong-vault, wrong-round, and wrong-allocation cases.
- Adversarial tests cover reentrancy, reverting recipients/tokens, hold/release races, independent allocations, premature reclaim, reclaim recipient constraints, and at-most-once terminal state.
- Invariants prove no held allocation releases, no reclaimed allocation releases, no caller can redirect a public release, and liability accounting remains conserved.
- A new local and Sepolia lifecycle must exercise hold, unhold, public release by a non-winner, and delayed reclaim.

## Boundaries

- Always: preserve deployed v1-v3 contracts; use a new registered version; emit indexed events; keep direct RPC authoritative.
- Ask first: mainnet deployment, production fee selection, changing the two-signature quorum model.
- Never: let a public executor select a recipient; let one admin hold/reclaim; reclaim contributor credits; mutate a claimed/reclaimed allocation; expose or reuse a user wallet secret.

## Success criteria

- New submissions are immediately eligible unless an admin rejects or hides them before voting.
- A non-winner, non-admin can execute release and the deterministic winner receives the asset.
- A held allocation cannot be released or redirected.
- Two authorized signatures can hold and unhold one allocation without affecting others.
- A held allocation can be reclaimed only after the delay, only with a fresh quorum, and only to the recovery recipient.
- All focused/full tests, invariants, size checks, frontend tests/build, local lifecycle, and Sepolia lifecycle pass with no unresolved critical/high issue.

## Security decision

The reclaim function intentionally weakens winner finality by giving an authorized quorum seizure power before distribution. The delay, allocation scope, fixed recipient, fresh signatures, nonces, explicit events, and terminal states make that authority visible and bounded, but they do not remove the underlying governance trust assumption.
