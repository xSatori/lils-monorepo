# Prize Vault Threat Model

| Threat | Control | Residual risk |
| --- | --- | --- |
| Clone takeover/binding substitution | Disabled implementation initializers; atomic factory initialization; reciprocal registry checks | Future implementation registration remains global-admin authority |
| CREATE2 front-running | Salt binds creator, nonce, version, config hash, plan hash, chain, kind, caller salt | Addresses are intentionally predictable |
| One global replaces the other | v3 rotation is self-rotation-only | Two compromised keys can collude |
| Late recovery-signer manufacture | Recovery eligibility freezes at `submissionsOpen`; creator is always eligible | Key-owner identity independence is not provable |
| Recovery theft | State-specific reserve accounting, asset holding checks, sealed-only expiry | Hostile balance reporting can deny service |
| Replay/stale signatures | EIP-712 domain and action binding, nonce, deadline, distinct signers, live-role recheck | Signers must review typed data |
| Reentrancy/callback forgery | Reentrancy guard, checks-effects-interactions, expected NFT callbacks, outbound postconditions | Arbitrary tokens may revert |
| Fee/rebase/surcharge tokens | Actual-received deposits, seal checks, exact debit and remaining-backing checks | Output tax may under-deliver to recipient |
| Rejecting or absent winner | Failed transfer rolls back; winner can authorize `claimTo`; after the release-only claim period a quorum may hold and reclaim | Recovery is an explicit two-admin seizure path |
| Public-release front-run of emergency hold | V4 separates the initial hold window, release-only claim period, and late rescue window | During the claim period a quorum cannot stop a valid public execution |
| One-admin censorship or seizure | Hold, unhold, and reclaim each require two distinct live signers from the approved pair combinations | Two authorized signers can collude |
| Indefinite held allocation | Unhold is quorum-controlled and reclaim becomes available after the hold delay | A colluding quorum can intentionally withhold or reclaim a winner's prize |
| Cross-allocation hold/reclaim replay | Typed action binds exact allocation, asset tuple, plan, vault, round, chain, action, nonce, recipient, delay, and deadline | Signers must verify the full typed payload |
| Reclaim destination substitution | Contract fixes allocation reclaim to current `recoveryRecipient`; delayed safety payloads bind the expected current recipient; recipient rotation itself requires delayed two-signature recovery | A quorum can deliberately rotate the recipient first, subject to delay and events |
| Canceled-plan sweep | Expiry requires `SEALED`; credits are reserved and refundable | Refund is a contributor transaction |
| Indexer lag | Direct RPC fallback and per-allocation failure isolation | History may be temporarily incomplete |
| Test mode on mainnet | Chain-ID guard rejects chain `1` | Operators must still verify chain |

Stateful invariants exercise native funding/refunds/sealing/release/recovery, initialization, plan immutability, nonce monotonicity, recipient derivation, liability backing, and v4 held/reclaimed terminal states. Multi-asset hostile behavior is covered by focused adversarial tests rather than one combined stateful handler.
