# V8 Sepolia Preview release — 2026-09-21

This is a testnet Preview, not a production or mainnet release. The active Sepolia factory is `0xCa648c6b3e53b126Ad6bC00b248a7Ac236C3aaF6`. Deployment receipts, public constructor parameters, bytecode reconciliation, and explorer URLs are recorded in [`deployments/sepolia-rounds-v8.json`](../../deployments/sepolia-rounds-v8.json). Sepolia Etherscan returned `Pass - Verified` for the factory, round implementation, prize-vault implementation, and two-owner test admin. Future round/vault clones are not individually source-verified by that result.

The Vercel project `satori-ffbfc349/lils-monorepo` built deployment `dpl_JD9utxr5nNTVwLL65cJCw3oUp2d1` as a READY Preview at <https://lils-monorepo-nq6r1857p-satori-ffbfc349.vercel.app>. Its Preview-only `ROUNDS_UPLOAD_FACTORY_ADDRESS` was set to the V8 factory. The deployment includes `api/rounds/uploads/[action]`; hosted upload requests have **not** been exercised in this release check. Production variables and deployment were not changed.

## Release-path checks

- Full Foundry suite, 85 Rounds/upload tests, local production frontend build, Rounds/Page ESLint, Solidity formatting, and diff whitespace checks passed.
- Root ESLint configuration was repaired. Whole-app lint now runs but still reports 245 errors and 243 warnings in older app areas; whole-app typecheck reports 249 errors, none in Rounds/Page. Those are not waived as a green whole-app gate.
- The largest TypeScript clusters are `src/utils/__tests__/action-json-parser.test.ts` (39), `src/components/NounExplorer/index-old-complex.tsx` (32), and `src/components/ProposalEditor/RichTextEditor.tsx` (15). The most frequent codes are unresolved names (`TS2304`, 71) and incompatible assignments (`TS2322`, 67). Fixing these legacy modules is a separate whole-app cleanup; the V8 Preview does not suppress them.
- The direct `react-router-dom` dependency moved from 7.9.1 to 7.18.2 with install scripts disabled. The native Bun audit now reports zero high/critical React Router advisory records. The Rounds tests and build passed after the change.
- The native Bun audit still reports **5 critical and 102 high advisory records** across the monorepo dependency installation. These are advisory records, not a count of proven reachable exploit paths. The critical records are associated with Payload/Next peer packages and `shell-quote`. This Preview is a Vite static app plus a Vercel upload function, not a Next/Payload server; the inspected upload function imports `viem` and the local CAR validator, not Payload/Next, `sharp`, or Hono. This narrows the V8 upload path but does not clear the rest of the website or build supply chain. No forced dependency remediation or blanket script approval was used.

## Remaining gates

Before treating this as mainnet-ready: reproduce and remediate or explicitly accept each reachable critical/high finding; fix the whole-app typecheck/lint baseline; exercise the hosted upload flow with a real committed V8 round; prove the two owners can operate the Sepolia ERC-1271 admin; rehearse creation-time snapshot, 1,000-entry batched finalization, claims, and recovery; and obtain an independent contract security review. The V8 prize-vault implementation has only 208 bytes of runtime-size headroom. No mainnet deployment is authorized by this Preview.
