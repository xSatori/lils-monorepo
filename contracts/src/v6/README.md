# Round V6: fund before scheduling

V6 rounds are created with all five schedule fields set to zero. The factory
rejects a creation request that includes a date or an empty prize plan. The
creator pays the existing exact creation fee and receives a new round and prize
vault; no prize assets are transferred by round creation.

1. Fund every prize allocation in the new vault.
2. Call `seal()` once the vault holds the full prize plan.
3. A round admin calls `setSchedule(submissionsOpen, submissionsClose,
   votingStart, votingEnd)`. The vault must already be sealed. Submissions must
   open in the future. All phases must be ordered; test-mode rounds require
   exactly five minutes each for submissions, review, and voting.
4. A round admin may replace that schedule while the **current** opening time
   is still in the future. At or after opening, the schedule is immutable.

While unscheduled, the round reports `UPCOMING`, does not accept submissions,
and cannot be finalized. Funding has no opening deadline until a schedule is
set. The existing contributor-refund path remains available while the vault is
in `FUNDING`; an unscheduled vault cannot be canceled for a missed deadline.
Once sealed, the prize plan cannot be changed or refunded through that path.

V5 implementations and existing rounds are untouched. V6 uses a separate
`RoundFactoryV6`, because the existing factory validates a schedule at creation.
The factory creation ABI remains compatible with generation 3+ consumers, but
the frontend must point its active `roundsFactory` to the new factory only
after a verified deployment. Keep prior factory addresses in
`roundsLegacyFactories` so their rounds remain readable. The Sepolia V5 factory
is already listed there and deduplicated while it remains active.

`DeployTestRoundsV6.s.sol` is a local/Sepolia-only deployment *script*, not an
authorization to broadcast. It requires the existing disposable deployer,
two distinct global admins, treasury, and `V6_VOTING_POWER_ADAPTER`. Verify the
adapter and all addresses against the intended environment before any signed
deployment. Do not switch the frontend address or fund prizes until the new
factory and both implementations are verified onchain.
