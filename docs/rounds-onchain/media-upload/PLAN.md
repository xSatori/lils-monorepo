# Database-free Rounds media implementation plan

**Status:** Complete for the Sepolia test profile. Protocol authorization, deterministic CAR gates, stateless Pinata v3 raw-file pinning, commit-first recovery, and sign/share/execute/pin UX passed local verification, live Pinata testing, the V5 Sepolia lifecycle, and hosted Preview testing.

## Current baseline to replace

Historical pre-V5 rounds retain the upload-before-commit PostgreSQL challenge/session path. V5 rejects that legacy path and instead builds deterministic content locally, commits it onchain, then sends the exact CAR bundle to the stateless pin route. V5 is deployed on Sepolia and configured in the Preview; production/mainnet remains separately gated.

Pinata's JWT remains a server-only environment variable. Removing PostgreSQL does not mean exposing that credential or eliminating the upload backend.

## Architecture decisions

- Ethereum becomes the durable authorization, nonce, role, phase, and submission-cap source.
- Initial content is prepared deterministically, committed onchain, and pinned afterward.
- The backend never issues a generic upload capability. It accepts bytes/CAR content, recomputes its roots, compares them to live onchain commitments, and pins only a match.
- Duplicate requests for the same committed CID must be idempotent. Provider behavior must be proven before the database is removed.
- Existing submission metadata remains immutable. Admin help is modeled as ordered onchain image additions rather than a metadata replacement.
- A new image requires two distinct current admin signatures from the union of the two factory global admins and that round's admins. Global/global, global/round, and round/round are valid.
- The two approvals are EIP-712 signatures verified by the round contract. Any account may execute them in one transaction; the submitter does not sign or transact.
- Each image-addition approval binds chain ID, round, submission ID, current image nonce, image URI, image hash, and deadline. Role membership is evaluated at execution.
- Additions are permitted until, but never at or after, `votingStart`. Repinning identical bytes for an already committed CID remains permissionless and phase-independent.
- Existing v1-v4 clones remain immutable. The planned behavior lands in a future versioned implementation and affects future rounds only.

## Planned protocol surface

The exact interface will be finalized test-first, but the intended shape is:

```solidity
appendSubmissionImage(
    uint256 submissionId,
    string imageURI,
    bytes32 imageHash,
    uint256 nonce,
    uint256 deadline,
    ImageApproval signerA,
    ImageApproval signerB
)
```

Required onchain state and behavior:

- a bounded ordered list of appended image URI/hash records per submission;
- a monotonic image-revision nonce per submission;
- a protocol-wide maximum total image count that includes original metadata images by declared count or a conservative append cap;
- two unique recovered signers, each currently recognized as a factory global admin or an admin of the target round;
- content-addressed URI validation, nonzero hash, bounded URI length, nonexpired deadline, exact nonce, and pre-voting phase checks;
- an indexed event containing the submission ID, revision, executor, both signers, URI, and hash;
- no function capable of replacing/removing an image or rewriting original submission metadata through this authority.

Because Solidity cannot prove the MIME type represented by a CID, the backend and frontend also validate the bytes as JPEG, PNG, WebP, or GIF. The contract commits the URI/hash and declares it as an image; clients must refuse to render malformed or mismatched content while preserving the visible onchain audit record.

## Dependency order and tasks

### Task 1: Prove deterministic content packaging

**Description:** Build an isolated proof that browser-generated image and metadata CAR payloads produce stable CIDs that Pinata preserves exactly, including duplicate and concurrent upload behavior.

**Acceptance criteria:**

- The same bytes always produce the same file and metadata roots in browser and backend tests.
- Pinata cannot substitute an alternate root when the prepared CAR is uploaded.
- Duplicate and concurrent requests are either provider-idempotent or cheaply detectable without application database state.

**Verification:** Focused CAR/CID fixtures, local round trips, and an isolated Sepolia/test Pinata account exercise with transaction-free test data.

**Files likely touched:** `apps/web/src/features/rounds/media.ts`, `api/_rounds-upload.js`, focused media fixtures/tests.

### Task 2: Specify and test the future round interface

**Description:** Add failing unit, fuzz, and invariant tests for append-only images and two-admin EIP-712 authorization before writing the future implementation.

**Acceptance criteria:**

- All three signer combinations work with two distinct live admins.
- Duplicate signers, stale/rotated/revoked admins, expired approvals, wrong chain/round/submission/image/nonce, replay, over-cap images, and post-voting execution revert.
- Original metadata, ownership, moderation, votes, and final results cannot be changed by the new capability.

**Verification:** Foundry unit, fuzz, invariant, gas, and contract-size checks.

**Files likely touched:** future versioned contracts under `contracts/src/`, `contracts/test/`, ABI generation inputs.

### Task 3: Implement the versioned append-only contract slice

**Description:** Implement the tested interface as a future round version using the repository's current OpenZeppelin EIP-712/ECDSA and ERC-1271-compatible patterns where available.

**Acceptance criteria:**

- Any executor can submit the exact two approvals once.
- Current global and round roles are checked atomically at execution.
- Ordered additions and their complete audit trail are readable from direct RPC/events and permanently freeze at voting start.

**Verification:** Task 2 tests pass plus storage-layout, role-boundary, static-analysis, and gas review.

**Dependencies:** Task 2.

### Checkpoint A: Protocol authorization

- Two independent security reviews approve the authority expansion.
- No path permits one signer, duplicate identity, metadata replacement, or post-voting mutation.
- The explicit new global-admin content authority is recorded in `ARCHITECTURE.md`, `PARITY.md`, and `THREAT-MODEL.md` as an intentional security change.

### Task 4: Replace database-backed upload authorization

**Description:** Refactor the upload service to authorize pinning from live onchain submission/image records and exact content verification.

**Acceptance criteria:**

- No PostgreSQL connection, schema creation, challenge row, session row, advisory lock, or database environment variable exists in the V5 upload path. Historical pre-V5 compatibility remains isolated.
- The service accepts only configured-chain/factory rounds and bytes whose hashes/CIDs equal the live onchain commitment.
- Replays can only repin identical content and cannot create a generic Pinata capability or upload arbitrary bytes.

**Verification:** Backend unit/adversarial tests, concurrency tests, secret/log audit, and live isolated Pinata test.

**Files likely touched:** `api/_rounds-upload.js`, `api/rounds/uploads/[action].js`, `api/rounds-upload.test.js`, Netlify/Vite adapters.

**Dependencies:** Tasks 1 and 3.

### Task 5: Build submission-first upload and recovery UI

**Description:** Change the user workflow to calculate content, submit its commitment, then pin it, with durable retry guidance when pinning fails.

**Acceptance criteria:**

- The UI distinguishes transaction confirmation from media availability.
- A submission owner can retry exact-CID pinning without creating a new submission.
- Manual `ipfs://`/`ar://` input and YouTube-link behavior remain available.

**Verification:** Focused frontend tests, wrong-network/rejection/RPC/Pinata failure tests, keyboard and responsive browser checks.

**Files likely touched:** `media.ts`, `SubmissionMediaUpload.tsx`, `RoundActions.tsx`, `RoundDetail.tsx`, related tests.

**Dependencies:** Tasks 1 and 4.

### Task 6: Build two-admin image-assistance UI

**Description:** Provide a guided request/sign/execute workflow that does not depend on the submitter or a database.

**Acceptance criteria:**

- Admin A prepares an exact image-addition payload and signature package that can be shared as a file or encoded link; Admin B reviews and signs the identical payload.
- The UI clearly shows signer eligibility, duplicate/stale signature failures, image preview/CID, deadline, revision, and the fact that the action is permanent and append-only.
- Any executor can submit both approvals, then pin/retry the exact committed image; viewers see an `Admin added` label and both approving addresses.

**Verification:** EIP-712 fixture tests, wallet rejection and stale-role tests, browser accessibility checks, and a local two-admin lifecycle.

**Files likely touched:** new focused Rounds admin-media component/hook, `RoundDetail.tsx`, contract bindings, focused tests.

**Dependencies:** Tasks 3 and 4.

### Task 7: Indexing and direct-RPC parity

**Description:** Index image-addition events as a rebuildable ordered view while preserving direct-RPC/event fallback.

**Acceptance criteria:**

- Reindexing produces the same ordered revisions and signer audit trail.
- An empty or lagging index never hides live onchain additions.
- Unavailable or malformed content does not hide submission owner/status/votes/results.

**Verification:** Indexer handler tests, rebuild test, RPC/index comparison.

**Dependencies:** Task 3.

### Checkpoint B: Integrated local lifecycle

- Initial submission, failed pin, retry, two-admin image addition, moderation, voting freeze, voting, finalization, and prize distribution complete locally.
- PostgreSQL is disabled and no database code path is exercised.
- Backend, contract, frontend, and index projections agree.

### Task 8: Documentation, generated bindings, and configuration cleanup

**Description:** Update authoritative docs and remove obsolete database configuration only after the replacement passes.

**Acceptance criteria:**

- `GOAL.md`, `PLAN.md`, `PARITY.md`, `ARCHITECTURE.md`, `THREAT-MODEL.md`, `DEPLOYMENT.md`, ABIs, addresses, and frontend information modal describe the implemented version accurately.
- `ROUNDS_UPLOAD_DATABASE_URL` and fallback database-variable discovery are removed from upload documentation/code.
- Current and historical factory generations remain correctly readable.

**Dependencies:** Tasks 4-7.

### Task 9: Fresh Sepolia lifecycle

**Description:** Deploy a new versioned implementation/factory configuration using a new disposable Sepolia wallet only after every readiness gate passes.

**Acceptance criteria:**

- Prove all three two-admin signer combinations, stale-role and replay rejection, failed-pin recovery, exact-CID repinning, append-only behavior, and permanent voting-start freeze.
- Prove the hosted flow runs with no PostgreSQL/database environment configuration.
- Record source verification, addresses, transactions, explorer links, bytecode hashes, gas, and direct-RPC/frontend/index agreement without exposing secrets.

**Dependencies:** Checkpoint B and Task 8.

## Security invariants

- Two distinct current authorized admin identities are required for every new image.
- A dual-role address counts once.
- Admin rotation or round-admin revocation invalidates an unexecuted signature.
- Every approval is chain-, contract-, submission-, nonce-, image-, and deadline-bound.
- Each nonce succeeds at most once.
- Existing images and original metadata cannot be replaced or removed.
- No new image can be added at or after `votingStart`.
- Image additions cannot change ownership, status, eligibility rules, votes, totals, winners, prize state, or schedules.
- Repinning existing committed content never changes onchain state.
- The upload backend can pin only bytes matching an existing live onchain commitment.
- The absence or loss of Pinata/backend/index infrastructure never changes authoritative protocol state.
- No Pinata credential appears onchain, client-side, in Git, logs, signatures, or manifests.

## Risks and mitigations

| Risk                                                        | Severity | Mitigation                                                                                                                                                                                                    |
| ----------------------------------------------------------- | -------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Two compromised admins append malicious content             |     High | Two distinct live signers, append-only scope, pre-vote cutoff, public signer/event audit, MIME verification and safe rendering.                                                                               |
| Global admins gain cross-round content influence            |     High | Explicitly accepted authority; limited to append-only images, requires two identities, cannot alter text/status/votes/results, prominently documented in UI/threat model.                                     |
| Last-second image addition before voting                    |   Medium | Visible timestamp/revision/signers; product review should decide whether a small immutable pre-vote image freeze is additionally required before implementation.                                              |
| Stateless concurrent replay creates duplicate provider cost |      Low | Three simultaneous identical uploads produced one provider record with the exact expected CID. Provider billing/abuse monitoring and rate limiting remain operator controls because no database quota ledger exists. |
| Onchain URI claims non-image bytes                          |   Medium | Backend magic-byte/MIME validation, frontend safe decode, no SVG/HTML, content-unavailable fallback, public hash record.                                                                                      |
| CID prepared locally differs from Pinata result             |     High | Deterministic CAR fixtures and live provider proof before protocol/UI migration.                                                                                                                              |
| Submission is onchain but pinning fails                     |   Medium | Explicit incomplete state, exact-content retry by user/admin/public helper, manual provider fallback.                                                                                                         |
| Existing rounds cannot receive feature                      | Expected | New version for future rounds only; UI remains generation-aware.                                                                                                                                              |

## Open design gate

Resolved: additions remain possible until the exact `votingStart` boundary because the moderation buffer is the intended review window. The last-block content-change risk is accepted and visible through the timestamp, revision, signer, executor, and event audit trail.

## Current implementation boundary

- V5 stores a submitter-declared `originalImageCount` and enforces `original + appended <= 8`. Solidity cannot inspect external metadata, so the upload verifier and UI reconcile fetched `images.length` to the declaration and render at most eight total images. Manual metadata that cannot be fetched remains a documented trust limitation.
- Signatures use explicit signer identities with OpenZeppelin `SignatureChecker`, so ERC-1271 contract admins are supported. Authority is evaluated when executed. A revoked signer is invalid while revoked; if the exact address is re-granted before an unexpired approval executes, it is current again.
- Local raw CIDv1 CAR generation and exact-byte round trips pass in browser/backend tests. The V5 `pin` route verifies configured-factory state through RPC, validates complete original bundles or admin-added image commitments, extracts each exact raw block from its verified single-root CAR, uploads those bytes through Pinata v3 without the unsupported `car` field, and rejects any returned CID mismatch. Live initial and duplicate retries preserved exact CIDs; three simultaneous identical uploads resolved to one provider record. The legacy PostgreSQL path is retained only for pre-V5 compatibility and explicitly rejects V5 rounds.
- Vercel's current Node/Fluid request allowance can carry the 40 MiB payload. Netlify must fail closed for payloads beyond its adapter limit; it must never fall back to generic presigned uploads.

## Verification commands planned

- `forge fmt --check`
- `forge build --sizes`
- `forge test -vvv`
- repository-supported fuzz/invariant/static/gas checks
- `bun test api/rounds-upload.test.js`
- `bun test apps/web/src/features/rounds`
- indexer tests/build
- `bun run --cwd apps/web type-check`
- `bun run --cwd apps/web lint`
- `bun run --cwd apps/web build`
- `bun audit`
- `git diff --check`
