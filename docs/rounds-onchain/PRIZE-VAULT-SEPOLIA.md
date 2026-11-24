# Rounds v3 Sepolia Lifecycle

Rounds v3 was deployed and exercised on Ethereum Sepolia (`11155111`) on 2026-09-18 using a fresh disposable encrypted keystore. The complete secret-free transaction record is in [`deployments/sepolia-rounds-v3.json`](../../deployments/sepolia-rounds-v3.json).

## Deployment

- Disposable deployer: `0x97309d0652c1d5d07FFC699ccb1C42404cbd0b1e`
- Factory v3: `0xa0dCca7e11012642298C6Ed0BF92Bd1561d38237`
- Round implementation v3: `0xD36156D12fFf656B52a755087e1b0CdE18FB1526`
- Prize-vault implementation: `0x7d0240a99B4eA2c8f062b37aD0d1e7D8c6ACB1d4`
- Mock voting token: `0xf965870Ce35473d8a1e059C14DDC1c3DEf3FBF0a`
- Historical voting-power adapter: `0xaEe5648150ee98cEFd9B3bb88c6c4E11a0c0994d`
- Test treasury: `0x2fC16Ed86E11544Fc9d67214705aAa60A3fEdEA5`
- Creation fee: `100000000000000` wei

All eight deployed contracts, including the three standard prize-token mocks, are Sourcify `exact_match`.

## Full funded lifecycle

The paid round `0x6eCD7eAc705d238126F27f595032fa65d2e6B2d4` uses vault `0x50030cE356A34183ba51670727214e160c744756`. The creation fee increased the treasury by exactly `100000000000000` wei and the factory retained zero.

The vault received and sealed a prize plan containing ETH, ERC-20, ERC-721, and two ERC-1155 allocations. Two wallets submitted approved entries after the dedicated moderation-review buffer; snapshot block `11732998` was captured permissionlessly. Partial and additive voting produced totals `[12, 9]`, and the earlier submission with 12 votes won deterministically.

Permissionless release sent the ETH, ERC-721, and both ERC-1155 prizes to the winner. The winner exercised `claimTo` for the ERC-20 allocation, redirecting it to a chosen recipient. All five allocations are claimed and the native vault balance is zero.

The lifecycle also proved rejection of accidental direct ETH, a second submission over the wallet cap, voting before the phase, unauthorized moderation and admin management, submission during review, snapshot recapture, moderation after voting began, self-voting, duplicate allocations, per-entry overflow, and remaining-vote overflow.

## Cancellation and recovery lifecycle

A second round `0x6F66812C7dC81E2d720540F6d410a56dC8d84347` used vault `0x93672015a302510505bcEe2C29f326679ca897ad` to prove the underfunded cancellation path. A contributor deposited 20 of a planned 50 ERC-20 tokens and received the exact 20-token refund after cancellation.

One ERC-20 token sent directly outside the contribution path remained classified as excess. Two round-admin signatures queued the constrained recovery, the mandatory delay elapsed, and execution recovered exactly that one token without consuming contributor credits. The cancellation vault ended at zero. A separate recovery action was also queued and canceled, and a matured action was executed during voting to prove that recovery authority cannot change winner allocations.

Mainnet was never transacted on. No private key, mnemonic, password, RPC credential, or keystore content is present in tracked files or the manifest.
