import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Contract, JsonRpcProvider } from "ethers";

const root = resolve(import.meta.dirname, "../..");
const env = await loadEnv(resolve(root, ".env.local"));
const evidencePath = resolve(root, "deployments/sepolia-rounds-v5-e2e.json");
const evidence = JSON.parse(await readFile(evidencePath, "utf8"));
const provider = new JsonRpcProvider(env.SEPOLIA_RPC_URL, 11_155_111, { staticNetwork: true });
const round = new Contract(evidence.contracts.round, await abi("RoundV5.sol", "RoundV5"), provider);
const vault = new Contract(
  evidence.contracts.prizeVault,
  await abi("RoundPrizeVaultV5.sol", "RoundPrizeVaultV5"),
  provider,
);

evidence.transactions.admin = unique([
  ...(await round.queryFilter(round.filters.RoundAdminGranted())).map(txHash),
  ...(await round.queryFilter(round.filters.RoundAdminRevoked())).map(txHash),
]);
evidence.transactions.submissions = unique(
  (await round.queryFilter(round.filters.SubmissionCreated())).map(txHash),
);
evidence.transactions.moderation = unique(
  (await round.queryFilter(round.filters.SubmissionModerated())).map(txHash),
);
evidence.transactions.snapshot = unique(
  (await round.queryFilter(round.filters.SnapshotCaptured())).map(txHash),
);
evidence.transactions.voting = unique(
  (await round.queryFilter(round.filters.VotesCast())).map(txHash),
);
evidence.transactions.finalization = unique(
  (await round.queryFilter(round.filters.Finalized())).map(txHash),
);
evidence.transactions.prizeFundingAndSeal = unique([
  ...(await vault.queryFilter(vault.filters.PrizeFunded())).map(txHash),
  ...(await vault.queryFilter(vault.filters.PrizePlanSealed())).map(txHash),
]);
evidence.transactions.distribution = unique(
  (await vault.queryFilter(vault.filters.PrizeReleased())).map(txHash),
);

await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
provider.destroy();
console.log(JSON.stringify({
  admin: evidence.transactions.admin.length,
  submissions: evidence.transactions.submissions.length,
  snapshot: evidence.transactions.snapshot.length,
  votes: evidence.transactions.voting.length,
  prizeFundingAndSeal: evidence.transactions.prizeFundingAndSeal.length,
  distributions: evidence.transactions.distribution.length,
}));

function txHash(event) {
  return event.transactionHash;
}

function unique(values) {
  return [...new Set(values)];
}

async function abi(source, contractName) {
  const artifact = JSON.parse(
    await readFile(resolve(root, `contracts/out/${source}/${contractName}.json`), "utf8"),
  );
  return artifact.abi;
}

async function loadEnv(path) {
  const output = { ...process.env };
  for (const line of (await readFile(path, "utf8")).split(/\r?\n/)) {
    const match = line.match(/^([^#][^=]*)=(.*)$/);
    if (match) output[match[1].trim()] = match[2].trim().replace(/^['"]|['"]$/g, "");
  }
  return output;
}
