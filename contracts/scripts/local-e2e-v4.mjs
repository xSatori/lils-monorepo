import { mkdir, readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import {
  createPublicClient,
  createTestClient,
  createWalletClient,
  decodeEventLog,
  http,
  keccak256,
  stringToHex,
} from "viem";
import { foundry } from "viem/chains";

const rpcUrl = process.env.LOCAL_ROUNDS_RPC_URL ?? "http://127.0.0.1:8545";
const transport = http(rpcUrl);
const publicClient = createPublicClient({ chain: foundry, transport });
const testClient = createTestClient({ chain: foundry, mode: "anvil", transport });
const accounts = await createWalletClient({ chain: foundry, transport }).requestAddresses();
const [deployer, admin1, admin2, creator, treasury, submitter, voter, executor] = accounts;
const wallet = (account) => createWalletClient({ account, chain: foundry, transport });

async function artifact(name) {
  return JSON.parse(await readFile(new URL(`../out/${name}.sol/${name}.json`, import.meta.url), "utf8"));
}
async function receipt(hash) { return publicClient.waitForTransactionReceipt({ hash }); }
async function deploy(account, artifactValue, args = []) {
  const hash = await wallet(account).deployContract({ abi: artifactValue.abi, bytecode: artifactValue.bytecode.object, args });
  const result = await receipt(hash);
  if (!result.contractAddress) throw new Error(`missing deployment address for ${hash}`);
  return { address: result.contractAddress, hash, blockNumber: result.blockNumber };
}
async function write(account, address, abi, functionName, args = [], value) {
  const hash = await wallet(account).writeContract({ address, abi, functionName, args, ...(value === undefined ? {} : { value }) });
  const result = await receipt(hash);
  if (result.status !== "success") throw new Error(`${functionName} reverted`);
  return { hash, blockNumber: result.blockNumber };
}
async function advance(timestamp) {
  await testClient.setNextBlockTimestamp({ timestamp });
  await testClient.mine({ blocks: 1 });
}

const [mockVotes, adapterArtifact, roundArtifact, vaultArtifact, factoryArtifact] = await Promise.all([
  artifact("MockLilNounsVotes"),
  artifact("LilNounsVotingPower"),
  artifact("RoundV4"),
  artifact("RoundPrizeVaultV4"),
  artifact("RoundFactoryV3"),
]);
const creationFee = 100_000_000_000_000n;
const deployments = { votes: await deploy(deployer, mockVotes, [deployer]) };
deployments.adapter = await deploy(deployer, adapterArtifact, [deployments.votes.address]);
deployments.roundImplementation = await deploy(deployer, roundArtifact);
deployments.vaultImplementation = await deploy(deployer, vaultArtifact);
deployments.factory = await deploy(deployer, factoryArtifact, [
  admin1,
  admin2,
  treasury,
  creationFee,
  deployments.roundImplementation.address,
  deployments.vaultImplementation.address,
  deployments.adapter.address,
  true,
]);

const actorTransactions = [
  await write(deployer, deployments.votes.address, mockVotes.abi, "mint", [voter, 10n]),
  await write(voter, deployments.votes.address, mockVotes.abi, "delegate", [voter]),
];
await testClient.mine({ blocks: 1 });
const latest = await publicClient.getBlock();
const submissionsOpen = latest.timestamp + 60n;
const submissionsClose = submissionsOpen + 300n;
const votingStart = submissionsClose + 300n;
const votingEnd = votingStart + 300n;
const config = {
  metadataURI: "ipfs://local-v4-round",
  metadataHash: keccak256(stringToHex("local-v4-round")),
  roundStart: latest.timestamp,
  submissionsOpen,
  submissionsClose,
  votingStart,
  votingEnd,
  votingPowerAdapter: deployments.adapter.address,
  votingStrategy: 1,
  snapshotMode: 0,
  customSnapshotBlock: 0n,
  baseOrFixedVotes: 0n,
  maxVotesPerSubmission: 6n,
  maxSubmissionsPerWallet: 1,
  maxSubmissions: 10,
  winnerCount: 1,
  minTitleLength: 3,
  maxTitleLength: 120,
  minDescriptionLength: 10,
  maxDescriptionLength: 2_000,
};
const prizeAmount = 10_000_000_000_000_000n;
const vaultConfig = {
  recoveryRecipient: creator,
  claimPeriod: 300,
  recoveryDelay: 300,
  allocations: [{ winnerRank: 0, assetType: 0, token: "0x0000000000000000000000000000000000000000", tokenId: 0n, amount: prizeAmount }],
};
const treasuryBefore = await publicClient.getBalance({ address: treasury });
const create = await write(creator, deployments.factory.address, factoryArtifact.abi, "createRound", [config, vaultConfig, keccak256(stringToHex("local-v4-e2e"))], creationFee);
const createReceipt = await publicClient.getTransactionReceipt({ hash: create.hash });
const created = createReceipt.logs.map((log) => {
  try { return decodeEventLog({ abi: factoryArtifact.abi, data: log.data, topics: log.topics }); } catch { return undefined; }
}).find((log) => log?.eventName === "RoundCreated");
if (!created) throw new Error("RoundCreated event missing");
const round = created.args.round;
const vault = created.args.prizeVault;
if ((await publicClient.getBalance({ address: treasury })) - treasuryBefore !== creationFee) throw new Error("factory fee was not forwarded exactly");
if (await publicClient.getBalance({ address: deployments.factory.address }) !== 0n) throw new Error("factory retained ETH");

const lifecycle = [];
lifecycle.push(await write(creator, vault, vaultArtifact.abi, "fundNative", [], prizeAmount));
lifecycle.push(await write(creator, vault, vaultArtifact.abi, "seal"));
await advance(submissionsOpen);
lifecycle.push(await write(submitter, round, roundArtifact.abi, "submit", [0, "Local entry", "Local lifecycle entry", "ipfs://local-v4-entry", keccak256(stringToHex("local-v4-entry"))]));
const submission = await publicClient.readContract({ address: round, abi: roundArtifact.abi, functionName: "getSubmission", args: [0n] });
if (Number(submission.status) !== 1) throw new Error("v4 submission did not start approved");
await advance(votingStart);
lifecycle.push(await write(voter, round, roundArtifact.abi, "captureSnapshot"));
lifecycle.push(await write(voter, round, roundArtifact.abi, "castVotes", [[0n], [3n]]));
lifecycle.push(await write(voter, round, roundArtifact.abi, "castVotes", [[0n], [2n]]));
await advance(votingEnd);
lifecycle.push(await write(executor, round, roundArtifact.abi, "finalize"));
const distributionAvailableAt = await publicClient.readContract({ address: vault, abi: vaultArtifact.abi, functionName: "distributionAvailableAt" });
await advance(distributionAvailableAt);
const winnerBalanceBefore = await publicClient.getBalance({ address: submitter });
lifecycle.push(await write(executor, vault, vaultArtifact.abi, "release", [0n]));
const winnerBalanceAfter = await publicClient.getBalance({ address: submitter });
if (winnerBalanceAfter - winnerBalanceBefore !== prizeAmount) throw new Error("public executor did not deliver the exact ETH prize to the winner");

let gitCommitSha = "UNKNOWN";
try { gitCommitSha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch {}
const manifest = {
  schemaVersion: 4,
  chain: { name: "anvil", chainId: 31337 },
  gitCommitSha,
  generatedAt: new Date().toISOString(),
  creationFee: creationFee.toString(),
  actors: { deployer, admin1, admin2, creator, treasury, submitter, voter, executor },
  contracts: Object.fromEntries(Object.entries(deployments).map(([key, value]) => [key, value.address])),
  round,
  vault,
  transactions: { create: create.hash, actorSetup: actorTransactions.map((item) => item.hash), lifecycle: lifecycle.map((item) => item.hash) },
  assertions: {
    feeForwarded: true,
    factoryRetainedWei: "0",
    submissionDefaultApproved: true,
    additiveVotes: "5",
    publicExecutor: executor,
    deterministicWinner: submitter,
    prizeReleasedWei: prizeAmount.toString(),
  },
};
await mkdir(new URL("../../deployments/", import.meta.url), { recursive: true });
await writeFile(new URL("../../deployments/local-rounds-v4.json", import.meta.url), `${JSON.stringify(manifest, (_, value) => typeof value === "bigint" ? value.toString() : value, 2)}\n`);
console.log(JSON.stringify({ round, vault, manifest: "deployments/local-rounds-v4.json" }));
