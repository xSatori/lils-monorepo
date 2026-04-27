# Rounds Contracts Security Review

## Scope

- `contracts/src/RoundsFactory.sol`
- `contracts/src/RoundProxy.sol`
- `contracts/src/RoundsRound.sol`

## Security Invariants

- Round prize funds are transferred into the round contract at creation.
- The `0.01 ETH` protocol fee is paid to the Lil Nouns treasury during creation.
- Round creators cannot withdraw prize funds after creation.
- Only the global admin can refund locked funds to the creator.
- Global admin has every round-admin privilege.
- Winners can be edited until finalization, then never changed.
- Total winner payouts cannot exceed the deposited prize amount.
- Unallocated funds return to the creator during final payout.
- Each wallet can submit at most one vote receipt per round.
- Round implementation upgrades are controlled by the global admin through the factory.
- ERC-20 prize tokens must be explicitly allowed by the global admin.
- Vote-power rounds use a voting-window snapshot block.
- Custom ERC-721 rounds require token-id nullifiers for voting receipts.

## Review Notes

- Reentrancy: claim, refund, finalization, and surplus paths use a non-reentrant guard.
- Access control: round admin actions accept either `admin` or factory `globalAdmin`; pause, global refund, ERC-20 token allowlisting, and surplus recovery are global-admin only.
- Pause behavior: pause blocks proposal, voting, admin mutation, and normal finalization paths while preserving global refund and claim paths.
- Upgrade control: each proxy admin is the factory; factory and proxy both validate implementation UUID/version, and proxy admin transfer is not exposed.
- Prize accounting: finalization converts payouts into claimable balances instead of pushing funds, avoiding recipient-level payout DoS.
- Unallocated funds: normal finalization can return unallocated funds to the creator only after global-admin approval.
- ERC20 safety: ERC-20 prize tokens are global-admin allowlisted and creation rejects tokens whose received balance delta differs from the configured prize amount.
- Voting eligibility: Lil Nouns/delegate mode uses `getPastVotes` against an activated voting snapshot. Custom ERC-721 mode uses token-id nullifiers through `submitVoteWithTokenIds`.
- ETH custody: proxy `receive()` delegates into `RoundsRound.receive()` so funded ETH rounds can accept locked prize deposits.
- Surplus recovery: global admin can recover only balances above reserved prize or outstanding claim balances, and only to the creator or Lil Nouns treasury.

## Manual Audit Checklist

- Confirm every function that moves funds is gated as intended:
  - `finalizeWinnersAndPay()` is round-admin or global-admin, blocked while paused, and blocked until voting ends.
  - `globalRefundToCreator()` is global-admin only and creates a creator claim instead of transferring immediately.
  - `claimPrize()` can only claim the caller's existing claimable balance.
  - `recoverSurplus()` is global-admin only and cannot recover reserved prize funds.
  - `createEthRound()` and `createErc20Round()` collect the flat fee before funds become usable by the round.
- Confirm factory upgrades cannot bypass global-admin controls.
- Confirm `setWinners()` cannot exceed the deposited prize amount and cannot run after finalization.
- Confirm unallocated ETH/ERC20 balances return to the creator only during finalization or global-admin refund.
- Confirm proposal hiding does not delete onchain proposal history.
- Confirm voting eligibility semantics match the intended Lil Nouns token/delegate behavior on mainnet.
- Confirm custom ERC-721 token-id nullifiers cannot be reused after token transfers.
- Confirm ERC-20 allowlist policy before enabling any non-ETH prize token.

## Known Follow-Ups Before Mainnet

- Run Foundry tests and fuzz tests in an environment with `forge` installed.
- Run Slither, Aderyn, or equivalent static analysis.
- Add invariant tests for payout totals, finalization immutability, proxy upgrade permissions, refund permissions, surplus recovery, and vote token-id nullifiers.
- Confirm Lil Nouns token voting interface and the default eligibility token address before deployment.
- Decide whether voting receipts should store full EIP-712 signature fields in addition to the current chain/round/voter-bound ballot hash.
- Consider replacing the custom proxy with audited OpenZeppelin proxy contracts if dependency installation is acceptable.
- Confirm the global admin is a multisig or timelock-controlled address before deployment.
- Document custom ERC-721 voting as current-owner voting with token-id nullifiers unless a separate holder snapshot mechanism is added.
- Keep ERC-20 prizes disabled until each token has been explicitly reviewed and allowlisted by the global admin.
