# Database-free Rounds media goal

**Status:** Implemented and exercised on Sepolia/Preview. Round/Vault V5, deterministic CAR construction, exact-byte verification, the stateless Pinata v3 raw-file route, commit-first/pin-second recovery UI, ABI/read support, and adversarial tests are active in the test profile. Live initial, metadata, retry, and two-admin appended-image uploads preserved their exact committed CIDs without PostgreSQL.

Replace the PostgreSQL-backed sponsored-upload authorization layer with a database-free design in which Ethereum is the durable authorization record. Pinata credentials remain server-only environment variables, but the application no longer requires a database for upload challenges, sessions, nonces, replay protection, or quotas.

## Initial submission flow

The browser deterministically builds the permitted image files, canonical metadata, IPFS CIDs, integrity hashes, and CAR recovery payload before uploading. The submitter first records the metadata URI and hash in the existing onchain submission transaction. After confirmation, the upload service verifies that submission directly through RPC, checks that the requester owns it, recomputes every CID/hash from the supplied bytes, extracts the exact raw block from each verified single-root CAR, and uploads only those committed bytes through Pinata v3. Replays may only request the same content and must be handled idempotently. A failed pin remains safely retryable without creating another submission or changing its onchain identity.

The managed path continues to accept at most eight total JPEG, PNG, WebP, or GIF images, with a 10 MiB per-image and 40 MiB aggregate ceiling. Uploaded video, audio, SVG, and mutable web URLs remain prohibited. Optional videos remain HTTPS YouTube links in content-addressed metadata. Manual `ipfs://` and `ar://` metadata remains available.

## Two-admin image assistance

Users are not required to sign or send another transaction when an image must be added. Before voting starts, any executor may append a new content-addressed image to a submission by presenting two EIP-712 approvals from two **distinct, currently authorized** administrators. The valid signer combinations are:

- two global admins;
- one global admin and one admin of that round; or
- two admins of that round.

An address that is both a global admin and a round admin still counts as only one signer. Signer authority is checked again at execution, so a revoked or rotated admin signature is invalid. Each approval is bound to the chain, round, submission, current image-revision nonce, exact new image URI/hash, and deadline. Successful execution consumes the onchain nonce, making the approval set replay-resistant without PostgreSQL.

The capability is deliberately **append-only**. Admins may not replace or remove existing images, rewrite the submitter's title or description, change ownership or submission type, alter moderation status through the image function, affect votes, or mutate finalized results. Image additions are allowed during submissions and the moderation-review period, but freeze permanently at `votingStart`. Exact-CID repinning is not a content change and may be performed by anyone at any time.

Every appended image, revision number, executor, and approving signer pair is authoritative onchain and emitted in indexed events. The frontend merges the immutable original metadata images with ordered onchain image additions, labels admin-added media, exposes the approving accounts, and continues showing authoritative submission state even when content is unavailable.

## Versioning boundary

Existing deployed rounds are immutable and do not gain this authority retroactively. The behavior is implemented in `RoundV5` and its V5 factory deployment for future rounds only. No existing Round v1-v4 clone, factory deployment, or mainnet contract was upgraded in place.

## Completion condition

The V5 upload path has no PostgreSQL dependency: Ethereum supplies authorization and replay identity, while exact-CID retries submit the same CAR bytes. The historical pre-V5 challenge/session path remains isolated for historical rounds. Live Pinata retries, a PostgreSQL-disabled lifecycle, and the fresh Sepolia lifecycle passed. `PINATA_JWT` remains a hosting secret; it is never placed onchain, in the browser, in Git, or in a database.
