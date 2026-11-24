# Round V7: 1,000-submission capacity

V7 preserves the V6 funded-first lifecycle. A round is created without
a schedule, its prize vault must be fully funded and sealed, and an admin then
sets the submission/review/voting schedule before submissions open. V7 accepts
1–1,000 submissions, while the per-wallet maximum remains 10.

V7 has separate `RoundFactoryV7`, `RoundV7`, and `RoundPrizeVaultV7`
implementations. The factory and round both validate the 1,000 limit. Existing
V6 contracts and rounds retain their immutable 100-submission maximum. The
frontend may default to 1,000 only after its active factory reports
implementation version 7 or newer; on V6 it must retain the 100 limit.

The V7 deployment initializes the creation fee at 0.01 ETH. A global admin can
later change the fee through `setCreationFee`, and the current value is enforced
on every round creation. Fees are forwarded atomically to the fixed Lil Nouns
treasury at `0xd5f279ff9EB21c6D40C8f345a66f2751C4eeA1fB`. The treasury is
a contract constant with no setter or constructor override, on Sepolia and local
chains alike. Earlier factory fees and treasury settings are unaffected.

`DeployTestRoundsV7.s.sol` is a local/Sepolia deployment script, not permission
to broadcast. It requires the disposable deployer, two distinct global admins,
and `V7_VOTING_POWER_ADAPTER`. Verify addresses and the
compiled source before any signed deployment. Deploying the new factory alone
does not switch the frontend; update the configured active factory only after
deployment and explorer verification, and retain the V6 factory in the legacy
factory list so its rounds remain readable.

## Sepolia preflight

- Supply `DISPOSABLE_DEPLOYER_ADDRESS`, `GLOBAL_ADMIN_1`, `GLOBAL_ADMIN_2`,
  `V7_VOTING_POWER_ADAPTER`, and `SEPOLIA_RPC_URL` to the Foundry process.
  `.env.local` is not loaded automatically. The V6 Sepolia deployment record
  lists `0xDC13e69c8e335d419205c22680f0B27b3FD79C36` as its voting-power
  adapter; confirm it is still the intended adapter before reusing it.
- Run `forge test` and `forge fmt --check`, then simulate
  `forge script contracts/script/DeployTestRoundsV7.s.sol:DeployTestRoundsV7 --rpc-url $env:SEPOLIA_RPC_URL`
  without `--broadcast`. Confirm chain ID 11155111, the two admin addresses,
  adapter code, fee of 10000000000000000 wei, treasury address, and deployer
  balance against the latest estimated gas cost.
- A simulation does not deploy contracts. After a separately authorized signed
  broadcast, verify all three contracts on Sepolia Etherscan, read back the
  factory fee, treasury, admins, adapter, and implementation version. Set the
  frontend build variable `VITE_SEPOLIA_ROUNDS_FACTORY_V7` to the verified
  factory address and update the sponsored-upload service's
  `ROUNDS_UPLOAD_FACTORY_ADDRESS` to the same address. Do not use addresses
  printed by a simulation. The frontend automatically keeps configured V6
  and V5 factories available for existing rounds. Smoke-test creation and
  deterministic media pinning after activation.
