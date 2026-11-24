# Rounds v4 contract specification

## Scope and compatibility

Version 4 is an immutable future implementation pair. Version 3 sources and deployed clones remain
unchanged. `RoundV4` and `RoundPrizeVaultV4` deliberately preserve the v3 initializer ABI so an
existing append-only `RoundFactoryV3` can register version 4 without changing earlier rounds.

The existing vault `recoveryDelay` is also the v4 distribution delay. It creates a deterministic
post-finalization hold window and then measures the minimum time an allocation must remain held
before reclaim. This keeps the factory tuple and prize-plan commitment compatible with v3 while
making both delays explicit onchain.

## Submission policy

- New submissions start `APPROVED`.
- Before `votingStart`, a round admin may set a submission to `APPROVED`, `REJECTED`, or `HIDDEN`.
- `PENDING` is not a valid v4 moderation target.
- At and after `votingStart`, moderation is frozen.
- Only `APPROVED` submissions can receive votes or become winners.

## Allocation state machine

Each allocation is independent and has one of these effective states:

1. `AVAILABLE`: unclaimed and not held.
2. `HELD`: protected from `claim`, `claimTo`, and public `release`.
3. `CLAIMED`: terminal; transferred to the deterministic winner or a winner-authorized recipient.
4. `RECLAIMED`: terminal; transferred only to the configured `recoveryRecipient`.

New holds are accepted in two bounded periods: after finalization and strictly before
`finalizedAt + recoveryDelay`, or at and after
`finalizedAt + recoveryDelay + claimPeriod`. Public/winner distribution opens at the first
boundary. The intervening `claimPeriod` is release-only, so a newly authorized hold cannot race the
normal public release path. The late hold path prevents a permanently reverting or absent winner
from leaving a committed liability stuck forever. Unhold requires a fresh quorum authorization.
Reclaim requires the allocation to remain held for at least `recoveryDelay` and requires another
fresh quorum authorization.

## Authorization and signature domain

Hold, unhold, and reclaim each require two distinct live signers. Valid pairs preserve v3 policy:
global/global, global/recovery-round-admin, or recovery-round-admin/recovery-round-admin. A round
admin is a recovery signer only when granted before submissions opened (the creator always
qualifies), matching v3's frozen recovery signer set.

The EIP-712 domain binds chain ID and verifying vault. The signed struct additionally binds the
vault, round, prize-plan hash, action, allocation ID, exact asset fields, current allocation nonce,
deadline, recovery recipient, and recovery delay. Successful actions increment an allocation-local
nonce. Signatures therefore cannot be replayed across chains, vaults, rounds, plans, allocations,
assets, actions, recipients, roles, or nonces. Authorization is rechecked at execution so stale
roles fail closed. EOAs and ERC-1271 signers are supported through OpenZeppelin
`SignatureChecker`.

## Centralization boundary

Reclaim is an intentional two-admin seizure power. A valid quorum can hold an unclaimed allocation
during the post-finalization window and, after the delay, permanently redirect it to the configured
recovery recipient. The allocation scope, two live signatures, time delay, fixed recipient,
allocation nonce, typed-data binding, and indexed events make this authority bounded and auditable;
they do not remove the underlying trust in the two-admin quorum.

V4 replaces v3's larger generic recovery queue with one compact delayed safety queue. That queue
supports only verified excess recovery and recovery-recipient rotation, both with a fresh two-signer
authorization, a global nonce, expiry, a full EIP-712 domain, and live-role revalidation at
execution. Excess is calculated against current committed liabilities (or refundable contributor
credits before sealing), so the queue cannot consume reserved value. V4 rejects the v3
expired-allocation recovery route so every committed allocation seizure must use the
held-allocation state machine.

Every queued safety action also commits to the recovery recipient observed when it was queued.
Execution requires that recipient to remain current. Consequently, executing one recipient
rotation invalidates older queued rotations and excess recoveries instead of allowing stale actions
to overwrite or pay according to superseded recovery policy.

To retain EIP-170 deployment margin after adding these controls, v4 removes two redundant or
nonessential entry points: direct winner `claim` (permissionless `release` already pays the winner)
and batch ERC-1155 funding (single-token `fundERC1155` remains). The initializer tuple remains v3
compatible. `claimPeriod` remains committed and production-validated and defines the release-only
window before late rescue becomes available; allocation reclaim is governed by the explicit hold
plus recovery delay.

## Required invariants

- A public executor can never choose or receive the release recipient.
- A held allocation cannot be claimed, redirected, publicly released, or generically recovered.
- A reclaimed or claimed allocation can never transition again.
- Holding one allocation does not change another allocation.
- Hold, unhold, and reclaim each consume exactly one allocation-local nonce.
- Reclaim occurs only after the hold delay, with a fresh live quorum, to `recoveryRecipient`.
- Late rescue cannot begin until the release-only claim period has elapsed.
- A queued safety action cannot execute after its committed recovery-recipient state changes.
- Remaining liability equals the sum of all nonterminal allocations for each asset.
- V3 source hashes remain unchanged.
