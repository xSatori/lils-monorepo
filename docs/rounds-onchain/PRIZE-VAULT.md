# Rounds v3 Prize Vault

`RoundFactoryV3` atomically deploys and binds one immutable `RoundV3` clone and one `RoundPrizeVault` clone. Existing v1/v2 factories, rounds, and manifests are unchanged. `RoundV3` remains authoritative for the schedule, submissions, moderation, votes, deterministic winners, and round admins. The vault is authoritative for its immutable plan, custody, contributor credits, liabilities, refunds, releases, claims, expiry, and recovery.

## Lifecycle

`FUNDING` accepts only registered ETH/ERC-20/ERC-721/ERC-1155 assets before submissions open. ERC-20 funding credits the actual balance increase. Permissionless `seal()` requires exact tracked funding and verifies actual holdings cover every liability. A sealed vault is required before submissions. An underfunded plan can be canceled after submissions open; contributors reclaim only recorded credits.

After deterministic finalization, anyone may call `release(allocationId)`. The vault derives the winner from the bound round. A winner may sign an EIP-712 `claimTo` redirect bound to chain, vault, round, plan, exact asset, nonce, recipient, and deadline; EOAs and ERC-1271 wallets are supported.

## Two-signature recovery

Recovery requires two distinct current signers: global/global, global/recovery-eligible round admin, or two recovery-eligible round admins. Roles are checked at queue and execution. Round admins become recovery-eligible only when granted before `submissionsOpen`; the creator is eligible from initialization. Actions are typed, nonce-bound, delayed, and cancelable only with equivalent two-party authority.

Recovery is limited to excess, expired allocations, or recovery-recipient rotation. Rotation uses the same delay and invalidates queued transfers to the old recipient. During `FUNDING`/`CANCELED`, actual balance minus contributor credits is excess. During `SEALED`, actual balance minus outstanding winner liabilities is excess. Expired recovery also requires a sealed finalized round and the immutable claim deadline.

Signature checks for both queueing and cancellation are non-reentrant. Anyone may mark a queued action expired after its signed deadline; queueing, cancellation, execution, and expiration each emit a terminal audit event. Events provide the action ID, signers, nonce, delay, and terminal status; the full typed action remains recoverable from the queue transaction calldata or the exact exported signing payload retained by the UI. This avoids an unbounded enumerable array or large aggregate getter.

## Asset caveats

Outbound ERC-20/ERC-1155 transfers must debit the vault by exactly the requested amount and preserve backing. ERC-721 ownership is verified after transfer. Failures roll back claimed/liability state and do not block unrelated allocations.

After sealing, `fundedByAsset` is the historical committed amount while `liabilityByAsset` is the live amount still owed to winners. Tests therefore require historical funding to equal the original plan, every live liability to be fully backed by the vault's actual balance, and released amounts plus remaining liabilities to equal the original commitment.

An output-tax token can debit the vault exactly while delivering less to the winner. Rebasing and hostile balance mutation can prevent sealing or transfer. A malicious token that refuses every transfer can remain physically stuck; no vault can force arbitrary token code to cooperate. Exact-value awards should use standard reviewed token contracts.

The chain also cannot prove two addresses belong to two humans. A creator may control multiple keys granted before the boundary. The frozen signer set, two-key signatures, delay, events, live-role checks, and liability exclusions expose and constrain this risk but cannot eliminate collusion.
