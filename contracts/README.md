# Lil Nouns Onchain Rounds Contracts

Solidity 0.8.24 contracts for exact-fee, factory-created, chain-authoritative Lil Nouns Rounds.

The frontend uses the [0.1.0 protocol](src/0.1.0/README.md) and its [Sepolia deployment record](../deployments/sepolia-rounds-0.1.0.json). 0.1.0 supports funded prize vaults and onchain release. The layout and security notes below describe the original generation.

Install the root workspace dependencies with `bun install --frozen-lockfile`. Foundry resolves the rounds package `@openzeppelin/contracts-rounds` to OpenZeppelin Contracts 5.4.0. The remapping changes Solidity build metadata relative to the historical 0.1.0 compilation, so use the original release commit when reproducing deployment bytecode.

## Commands

```powershell
forge fmt --check
forge build --sizes
forge test -vv
forge test --gas-report
forge lint contracts/src --severity high --severity med -D warnings
```

The local Foundry binary is ignored environment tooling. Any standard Foundry 1.5.1 installation may be used instead.

## Layout

- `src/RoundFactory.sol`: two-admin, versioned OpenZeppelin clone factory and atomic fee forwarding.
- `src/Round.sol`: isolated lifecycle, submission-close review buffer, roles, moderation, snapshot voting, and winners.
- `src/LilNounsVotingPower.sol`: adapter for Lil Nouns `getPriorVotes` block checkpoints.
- `src/mocks/MockLilNounsVotes.sol`: local/Sepolia-only delegated-vote mock.
- `test/Rounds.t.sol`: unit, integration, fuzz, gas-bound, and rejection-path tests.
- `test/RoundsInvariant.t.sol`: targeted stateful accounting, eligibility, provenance, role, rejection-path, additional-creation, and finalization invariants.
- `script/DeployTestRounds.s.sol`: local/Sepolia test deployment using a CLI-provided encrypted account.

## Security boundaries

- OpenZeppelin supplies clones, reentrancy protection, initialization guards, ownership for the mock, and role storage/checks.
- Factory and round wrappers deliberately disable generic role renunciation. Membership changes occur only through invariant-preserving rotation or creator-managed functions.
- The factory pins one immutable historical-voting adapter; creators cannot substitute another adapter in round configuration.
- Submission title/description limits are exact UTF-8 byte limits. The strings are calldata-only while hashes and byte lengths are committed onchain.
- Metadata writes accept only nonempty `ipfs://` or `ar://` URIs; mutable web schemes revert.
- Version 2 separates submission close from voting start. The creator fixes the review interval at creation; submissions stop at close and moderation freezes at voting start.
- Awards are metadata only. These contracts expose no supported or accounted prize-deposit/release path; unsolicited ETH or tokens are not prizes and may be unrecoverable.
- Only future round creation can pause. Existing rounds expose no global-admin pause path that could consume a fixed voting window.
- The test deployment script refuses every chain except local `31337`/`1337` and Sepolia `11155111`.
- The script never reads or prints a private key. Use Foundry's encrypted account/keystore CLI support.
- Mainnet deployment is not authorized.
