# Prize Escrow Status and Proposed Boundary

This v2-era note is superseded for new rounds by [PRIZE-VAULT.md](./PRIZE-VAULT.md). Existing v1/v2 rounds still use metadata-only awards and are not migrated.

## Current status

The current `RoundFactory` and `Round` contracts expose **no supported or accounted prize-deposit/release path**. Awards are descriptive content-addressed metadata. Unsolicited ETH or tokens are not protocol-managed prizes and may be unrecoverable; standard token transfers and forced ETH can bypass rejecting receive hooks.

The historical `feat/rounds` snapshot at `393b7c5` contained a different, unused custody draft. It accepted ETH and allowlisted ERC-20 prizes, but did not support NFTs. It also allowed admins to set winner wallets/payouts and required an admin/global-admin finalization call, so it does not satisfy the current deterministic, permissionless-winner model and must not be copied into this protocol.

## Recommended separate contract

Prize custody should be a separate, opt-in `RoundPrizeVault` bound immutably to one factory-registered round. Keeping custody outside `Round` prevents token-transfer complexity from expanding the voting contract's attack surface and lets rounds remain usable without prizes.

The vault should support explicitly registered deposits of:

- native ETH;
- standard ERC-20 tokens with received-balance accounting;
- ERC-721 token IDs through `IERC721Receiver`;
- ERC-1155 IDs and amounts through `IERC1155Receiver` if multi-token prizes are required.

After the round is finalized, winners should claim each asset independently, or anyone should be able to trigger an isolated per-winner/per-asset release. Recipient addresses come only from the finalized winning submissions' stored owners, and prize amounts/assets come only from an immutable payout plan committed before voting. The caller never supplies or changes recipients, and one rejecting recipient or malicious token must not block other awards.

The implementation must use reentrancy protection, received/outbound balance accounting, duplicate-asset controls, explicit underfunding behavior, and monotonic claimed state. Fee-on-transfer, rebasing, ERC-777-style callbacks, and rejecting ERC-721/ERC-1155 recipients require explicit handling and adversarial tests.

## Admin release

A privileged admin-release function is unnecessary after finalization because the permissionless `release()` function is already callable by an admin. An admin must not be able to release early, replace recipients, or change amounts after the immutable boundary.

If cancellation/refund behavior is later required, it needs a separate state machine, public events, a delay, and narrowly defined depositor refunds. Generic rescue functions must exclude registered prize assets and outstanding winner claims.

## Approval boundary

Implementing this vault introduces new custody and fund-movement risk. It requires explicit approval, dedicated threat modeling, adversarial token tests, an independent security review, and a new Sepolia lifecycle before any deployment. It is not part of the current version-2 moderation-buffer change.
