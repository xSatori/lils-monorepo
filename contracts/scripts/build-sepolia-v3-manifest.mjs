import { readFile, writeFile } from "node:fs/promises";
import { createPublicClient, http, keccak256 } from "viem";
import { sepolia } from "viem/chains";

const rpcUrl = process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";
const client = createPublicClient({ chain: sepolia, transport: http(rpcUrl) });
if (await client.getChainId() !== 11_155_111) throw new Error("v3 manifest builder requires Sepolia chain 11155111");
const statePath = process.env.ROUNDS_V3_STATE_PATH ?? "../../tmp/rounds-v3-sepolia/sepolia-e2e-state.json";
const broadcastPath = process.env.ROUNDS_V3_BROADCAST_PATH ?? "../../broadcast/DeployTestRoundsV3.s.sol/11155111/run-latest.json";
const state = JSON.parse(await readFile(new URL(statePath, import.meta.url), "utf8"));
const broadcast = JSON.parse(await readFile(new URL(broadcastPath, import.meta.url), "utf8"));
const required = ["deployer", "globalAdmin1", "globalAdmin2", "treasury", "mockVotingToken", "votingPowerAdapter", "roundImplementation", "vaultImplementation", "factory", "round", "vault"];
for (const key of required) if (!state.addresses?.[key]) throw new Error(`missing v3 state address: ${key}`);

const codeHashes = {};
for (const key of required.slice(4)) {
  const code = await client.getBytecode({ address: state.addresses[key] });
  if (!code || code === "0x") throw new Error(`no deployed bytecode for ${key}`);
  codeHashes[key] = keccak256(code);
}
const receiptByHash = Object.fromEntries((broadcast.receipts ?? []).map((receipt) => [receipt.transactionHash.toLowerCase(), receipt]));
const deploymentTransactions = Object.fromEntries(Object.entries(state.deploymentTransactions ?? {}).map(([name, hash]) => {
  const receipt = receiptByHash[hash.toLowerCase()];
  return [name, { transactionHash: hash, blockNumber: receipt ? Number(BigInt(receipt.blockNumber)) : "UNKNOWN", gasUsed: receipt ? BigInt(receipt.gasUsed).toString() : "UNKNOWN" }];
}));
const manifest = {
  schemaVersion: 3,
  chainName: "Ethereum Sepolia",
  chainId: 11_155_111,
  timestampUtc: new Date().toISOString(),
  gitCommitSha: process.env.GIT_COMMIT_SHA ?? "UNKNOWN",
  dirtyState: true,
  dirtyStateNote: "Uncommitted Rounds v3 prize-vault implementation and evidence only; no commit or push was authorized.",
  compiler: "solc 0.8.24",
  optimizer: { enabled: true, runs: 200 },
  evmVersion: "cancun",
  deployer: state.addresses.deployer,
  globalAdmins: [state.addresses.globalAdmin1, state.addresses.globalAdmin2],
  treasury: state.addresses.treasury,
  creationFeeWei: state.creationFeeWei,
  testMode: true,
  testProfile: { submissionsSeconds: 300, moderationReviewSeconds: 300, votingSeconds: 300, claimSeconds: 300, recoveryDelaySeconds: 300 },
  votingToken: state.addresses.mockVotingToken,
  votingPowerAdapter: state.addresses.votingPowerAdapter,
  roundImplementation: state.addresses.roundImplementation,
  vaultImplementation: state.addresses.vaultImplementation,
  implementationVersion: 3,
  factory: state.addresses.factory,
  testRound: state.addresses.round,
  testVault: state.addresses.vault,
  constructorArguments: state.constructorArguments,
  initializerArguments: state.initializerArguments,
  prizePlanHash: state.prizePlanHash,
  bytecodeHashes: codeHashes,
  deploymentTransactions,
  lifecycleTransactions: state.lifecycleTransactions ?? {},
  cancellationFlow: state.cancellationFlow,
  evidence: state.evidence ?? {},
  verification: {
    status: "exact_match",
    provider: "Sourcify",
    contracts: {
      mockVotingToken: { status: "exact_match", note: "Already verified." },
      votingPowerAdapter: { status: "exact_match", note: "Already verified." },
      prizeERC20: { status: "exact_match", jobUrl: "https://sourcify.dev/server/v2/verify/40c84c8e-5fea-4a45-945a-7011787a93fa" },
      prizeERC721: { status: "exact_match", jobUrl: "https://sourcify.dev/server/v2/verify/c4a197ec-efcb-484d-bb1b-1dccdacfcc28" },
      prizeERC1155: { status: "exact_match", jobUrl: "https://sourcify.dev/server/v2/verify/4001e03e-04b9-4803-8e9d-6e1e00c6d399" },
      roundImplementation: { status: "exact_match", jobUrl: "https://sourcify.dev/server/v2/verify/3fdf073f-9f17-40bc-ad68-f9713d68a836" },
      vaultImplementation: { status: "exact_match", jobUrl: "https://sourcify.dev/server/v2/verify/8e98fb4a-5a44-47ef-94a0-424ed2dc6832" },
      factory: { status: "exact_match", jobUrl: "https://sourcify.dev/server/v2/verify/69d90156-8a2b-4a3c-8ff7-7917f3d3ec40" },
    },
  },
  explorer: {
    addresses: Object.fromEntries(Object.entries(state.addresses).filter(([, value]) => typeof value === "string" && value.startsWith("0x") && value.length === 42).map(([key, value]) => [key, `https://sepolia.etherscan.io/address/${value}`])),
    deploymentTransactions: Object.fromEntries(Object.entries(state.deploymentTransactions ?? {}).map(([key, hash]) => [key, `https://sepolia.etherscan.io/tx/${hash}`])),
    lifecycleTransactions: Object.fromEntries(Object.entries(state.lifecycleTransactions ?? {}).flatMap(([phase, records]) => Object.entries(records).flatMap(([key, record]) => {
      if (record?.transactionHash) return [[`${phase}.${key}`, `https://sepolia.etherscan.io/tx/${record.transactionHash}`]];
      if (Array.isArray(record)) return record.filter((item) => item?.transactionHash).map((item, index) => [`${phase}.${key}.${index}`, `https://sepolia.etherscan.io/tx/${item.transactionHash}`]);
      return [];
    }))),
  },
  scope: { mainnetTransactionOccurred: false, existingLilNounsContractsModified: false, productionInfrastructureChanged: false, committedOrPushed: false, realWalletOrSecretUsed: false },
};
await writeFile(new URL("../../deployments/sepolia-rounds-v3.json", import.meta.url), `${JSON.stringify(manifest, null, 2)}\n`);
console.log("Wrote deployments/sepolia-rounds-v3.json after live Sepolia bytecode checks.");
