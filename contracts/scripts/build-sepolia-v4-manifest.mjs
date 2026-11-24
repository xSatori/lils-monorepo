import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createPublicClient, http, keccak256 } from "viem";
import { sepolia } from "viem/chains";

const root = new URL("../../", import.meta.url);
const readJson = async (path) => JSON.parse(await readFile(new URL(path, root), "utf8"));
const [implementationsRun, activeFactoryRun, state, roundArtifact] = await Promise.all([
  readJson("broadcast/DeployTestRoundsV4ReuseMocks.s.sol/11155111/run-latest.json"),
  readJson("broadcast/DeployV4SepoliaFreshVotesFactory.s.sol/11155111/run-latest.json"),
  readJson("tmp/rounds-v4-sepolia/sepolia-v4-e2e-state.json"),
  readJson("contracts/out/RoundV4.sol/RoundV4.json"),
]);
const client = createPublicClient({ chain: sepolia, transport: http(process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com") });

function rows(run) {
  return run.transactions.map((tx, index) => ({
    contract: tx.contractName,
    address: tx.contractAddress,
    transactionHash: run.receipts[index].transactionHash,
    blockNumber: Number(BigInt(run.receipts[index].blockNumber)),
    gasUsed: BigInt(run.receipts[index].gasUsed).toString(),
  }));
}
const implementationRows = rows(implementationsRun);
const activeRows = rows(activeFactoryRun);
const deployments = Object.fromEntries([...implementationRows, ...activeRows].map((row) => [row.contract, row]));
const contracts = {
  votingToken: state.addresses.mockVotingToken,
  votingPowerAdapter: state.addresses.votingPowerAdapter,
  roundImplementation: state.addresses.roundImplementation,
  vaultImplementation: state.addresses.vaultImplementation,
  factory: state.addresses.factory,
  testRound: state.addresses.round,
  prizeVault: state.addresses.vault,
};
const bytecodeHashes = {};
for (const [name, address] of Object.entries(contracts)) {
  const code = await client.getBytecode({ address });
  if (!code) throw new Error(`missing deployed bytecode: ${name}`);
  bytecodeHashes[name] = keccak256(code);
}
let gitCommitSha = process.env.ROUNDS_GIT_COMMIT_SHA ?? "UNKNOWN";
let dirty = process.env.ROUNDS_GIT_DIRTY === undefined ? true : process.env.ROUNDS_GIT_DIRTY === "true";
try {
  gitCommitSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: fileURLToPath(root), encoding: "utf8" }).trim();
  dirty = execFileSync("git", ["status", "--porcelain"], { cwd: fileURLToPath(root), encoding: "utf8" }).trim().length > 0;
} catch {}
const metadata = typeof roundArtifact.metadata === "string" ? JSON.parse(roundArtifact.metadata) : roundArtifact.metadata;
const flattenTransactions = Object.fromEntries(Object.entries(state.lifecycleTransactions).flatMap(([phase, values]) => Object.entries(values).map(([name, receipt]) => [`${phase}.${name}`, receipt.transactionHash ?? receipt])));
const explorer = (kind, value) => `https://sepolia.etherscan.io/${kind}/${value}`;
const manifest = {
  schemaVersion: 4,
  chain: { name: "ethereum-sepolia", chainId: 11_155_111 },
  generatedAt: new Date().toISOString(),
  git: { commitSha: gitCommitSha, dirty },
  compiler: { version: metadata.compiler.version, optimizer: metadata.settings.optimizer, evmVersion: metadata.settings.evmVersion },
  deployer: state.addresses.deployer,
  globalAdmins: ["0xdcf37d8aa17142f053aaa7dc56025ab00d897a19", "0x66cd193d0c0fb3b9b44dd371107617a7e9f38184"],
  treasury: state.addresses.treasury,
  creationFeeWei: state.creationFeeWei,
  testMode: true,
  contracts,
  bytecodeHashes,
  deploymentTransactions: {
    roundImplementation: deployments.RoundV4,
    vaultImplementation: deployments.RoundPrizeVaultV4,
    votingToken: deployments.MockLilNounsVotes,
    votingPowerAdapter: deployments.LilNounsVotingPower,
    factory: deployments.RoundFactoryV3,
    supersededFactory: implementationRows.find((row) => row.contract === "RoundFactoryV3"),
  },
  constructorArguments: {
    votingToken: [state.addresses.deployer],
    votingPowerAdapter: [state.addresses.mockVotingToken],
    factory: [
      "0xdcf37d8aa17142f053aaa7dc56025ab00d897a19",
      "0x66cd193d0c0fb3b9b44dd371107617a7e9f38184",
      state.addresses.treasury,
      state.creationFeeWei,
      state.addresses.roundImplementation,
      state.addresses.vaultImplementation,
      state.addresses.votingPowerAdapter,
      true,
    ],
  },
  roundInitializerArguments: state.initializerArguments,
  lifecycleTransactions: flattenTransactions,
  evidence: state.evidence,
  explorerLinks: {
    factory: explorer("address", state.addresses.factory),
    roundImplementation: explorer("address", state.addresses.roundImplementation),
    vaultImplementation: explorer("address", state.addresses.vaultImplementation),
    votingToken: explorer("address", state.addresses.mockVotingToken),
    votingPowerAdapter: explorer("address", state.addresses.votingPowerAdapter),
    testRound: explorer("address", state.addresses.round),
    prizeVault: explorer("address", state.addresses.vault),
  },
  verification: { status: "not_attempted", reason: "No explorer API credential was configured, and publishing source metadata to a third-party verifier was not separately approved. Bytecode hashes and receipts were reconciled directly by RPC." },
  secretsIncluded: false,
};
await writeFile(new URL("deployments/sepolia-rounds-v4.json", root), `${JSON.stringify(manifest, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ manifest: "deployments/sepolia-rounds-v4.json", contracts })}\n`);
