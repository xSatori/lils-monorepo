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
const testClient = createTestClient({
  chain: foundry,
  mode: "anvil",
  transport,
});

function gitCommitSha() {
  if (process.env.GIT_COMMIT_SHA) return process.env.GIT_COMMIT_SHA;
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "UNKNOWN";
  }
}

async function artifact(name) {
  const path = new URL(`../out/${name}.sol/${name}.json`, import.meta.url);
  return JSON.parse(await readFile(path, "utf8"));
}

function wallet(account) {
  return createWalletClient({ account, chain: foundry, transport });
}

async function receipt(hash) {
  return publicClient.waitForTransactionReceipt({ hash });
}

async function deploy(account, contractArtifact, args = []) {
  const hash = await wallet(account).deployContract({
    abi: contractArtifact.abi,
    bytecode: contractArtifact.bytecode.object,
    args,
  });
  const result = await receipt(hash);
  if (!result.contractAddress)
    throw new Error("deployment receipt did not include an address");
  return {
    address: result.contractAddress,
    hash,
    blockNumber: result.blockNumber,
  };
}

async function write(account, address, abi, functionName, args = [], value) {
  const hash = await wallet(account).writeContract({
    address,
    abi,
    functionName,
    args,
    ...(value === undefined ? {} : { value }),
  });
  const result = await receipt(hash);
  return { hash, blockNumber: result.blockNumber, status: result.status };
}

async function expectRevert(label, request) {
  try {
    await publicClient.simulateContract(request);
  } catch (error) {
    return { label, reverted: true, error: error.shortMessage ?? error.name };
  }
  throw new Error(`${label} unexpectedly succeeded`);
}

const [
  deployer,
  admin1,
  admin2,
  creator,
  treasury,
  submitter1,
  submitter2,
  voter,
  additionalAdmin,
] = await wallet(
  "0x0000000000000000000000000000000000000000",
).requestAddresses();

const [mockArtifact, adapterArtifact, roundArtifact, factoryArtifact] =
  await Promise.all([
    artifact("MockLilNounsVotes"),
    artifact("LilNounsVotingPower"),
    artifact("Round"),
    artifact("RoundFactory"),
  ]);

const creationFee = 100_000_000_000_000n;
const mock = await deploy(deployer, mockArtifact, [deployer]);
const adapter = await deploy(deployer, adapterArtifact, [mock.address]);
const implementation = await deploy(deployer, roundArtifact);
const factory = await deploy(deployer, factoryArtifact, [
  admin1,
  admin2,
  treasury,
  creationFee,
  implementation.address,
  adapter.address,
  true,
]);

const actorSetup = [];
for (const [actor, votes] of [
  [voter, 10n],
  [submitter1, 2n],
]) {
  actorSetup.push(
    await write(deployer, mock.address, mockArtifact.abi, "mint", [
      actor,
      votes,
    ]),
  );
  actorSetup.push(
    await write(actor, mock.address, mockArtifact.abi, "delegate", [actor]),
  );
}

const latestBlock = await publicClient.getBlock();
const submissionsOpen = latestBlock.timestamp;
const submissionsClose = submissionsOpen + 300n;
const votingStart = submissionsClose + 300n;
const votingEnd = votingStart + 300n;
const config = {
  metadataURI: "ipfs://local-round",
  metadataHash: keccak256(stringToHex("local-round")),
  roundStart: submissionsOpen,
  submissionsOpen,
  submissionsClose,
  votingStart,
  votingEnd,
  votingPowerAdapter: adapter.address,
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

const treasuryBefore = await publicClient.getBalance({ address: treasury });
const createHash = await wallet(creator).writeContract({
  address: factory.address,
  abi: factoryArtifact.abi,
  functionName: "createRound",
  args: [config, keccak256(stringToHex("local-e2e"))],
  value: creationFee,
});
const createReceipt = await receipt(createHash);
const createdLog = createReceipt.logs
  .map((log) => {
    try {
      return decodeEventLog({
        abi: factoryArtifact.abi,
        data: log.data,
        topics: log.topics,
      });
    } catch {
      return undefined;
    }
  })
  .find((log) => log?.eventName === "RoundCreated");
const roundAddress = createdLog?.args?.round;
if (!roundAddress) throw new Error("RoundCreated event was not found");

const treasuryAfter = await publicClient.getBalance({ address: treasury });
const factoryBalance = await publicClient.getBalance({
  address: factory.address,
});
if (treasuryAfter - treasuryBefore !== creationFee || factoryBalance !== 0n) {
  throw new Error("creation fee forwarding invariant failed");
}

const adminAdded = await write(
  creator,
  roundAddress,
  roundArtifact.abi,
  "grantRoundAdmin",
  [additionalAdmin],
);
const adminRemoved = await write(
  creator,
  roundAddress,
  roundArtifact.abi,
  "revokeRoundAdmin",
  [additionalAdmin],
);
const submission1 = await write(
  submitter1,
  roundAddress,
  roundArtifact.abi,
  "submit",
  [
    0,
    "Entry One",
    "Local entry one description",
    "ipfs://local-entry-one",
    keccak256(stringToHex("local-entry-one")),
  ],
);
const submission2 = await write(
  submitter2,
  roundAddress,
  roundArtifact.abi,
  "submit",
  [
    1,
    "Entry Two",
    "Local entry two description",
    "ipfs://local-entry-two",
    keccak256(stringToHex("local-entry-two")),
  ],
);
const submissionLimitRejection = await expectRevert(
  "per-wallet submission cap",
  {
    account: submitter1,
    address: roundAddress,
    abi: roundArtifact.abi,
    functionName: "submit",
    args: [
      0,
      "Extra Entry",
      "Local extra entry description",
      "ipfs://extra",
      keccak256(stringToHex("extra")),
    ],
  },
);
const earlyVoteRejection = await expectRevert("vote before voting phase", {
  account: voter,
  address: roundAddress,
  abi: roundArtifact.abi,
  functionName: "castVotes",
  args: [[0n], [1n]],
});
const unauthorizedModeration = await expectRevert("unauthorized moderation", {
  account: submitter2,
  address: roundAddress,
  abi: roundArtifact.abi,
  functionName: "moderateSubmission",
  args: [0n, 1],
});
await testClient.increaseTime({ seconds: 300 });
await testClient.mine({ blocks: 1 });
const reviewPeriodSubmissionRejection = await expectRevert(
  "submission during moderation review",
  {
    account: submitter2,
    address: roundAddress,
    abi: roundArtifact.abi,
    functionName: "submit",
    args: [
      0,
      "Review-period entry",
      "This entry arrived after submissions closed",
      "ipfs://review-period-entry",
      keccak256(stringToHex("review-period-entry")),
    ],
  },
);
const approved1 = await write(
  creator,
  roundAddress,
  roundArtifact.abi,
  "moderateSubmission",
  [0n, 1],
);
const approved2 = await write(
  creator,
  roundAddress,
  roundArtifact.abi,
  "moderateSubmission",
  [1n, 1],
);

await testClient.increaseTime({ seconds: 300 });
await testClient.mine({ blocks: 1 });
const snapshot = await write(
  voter,
  roundAddress,
  roundArtifact.abi,
  "captureSnapshot",
);
const selfVoteRejection = await expectRevert("self voting", {
  account: submitter1,
  address: roundAddress,
  abi: roundArtifact.abi,
  functionName: "castVotes",
  args: [[0n], [1n]],
});
const partialVote = await write(
  voter,
  roundAddress,
  roundArtifact.abi,
  "castVotes",
  [[0n], [2n]],
);
const additiveVote = await write(
  voter,
  roundAddress,
  roundArtifact.abi,
  "castVotes",
  [[1n], [3n]],
);
const perEntryCapRejection = await expectRevert("per-entry vote cap", {
  account: voter,
  address: roundAddress,
  abi: roundArtifact.abi,
  functionName: "castVotes",
  args: [[0n], [5n]],
});
const allocationToCap = await write(
  voter,
  roundAddress,
  roundArtifact.abi,
  "castVotes",
  [[0n], [4n]],
);
const overAllocationRejection = await expectRevert("remaining vote limit", {
  account: voter,
  address: roundAddress,
  abi: roundArtifact.abi,
  functionName: "castVotes",
  args: [[1n], [2n]],
});

await testClient.increaseTime({ seconds: 300 });
await testClient.mine({ blocks: 1 });
const finalized = await write(
  submitter2,
  roundAddress,
  roundArtifact.abi,
  "finalize",
);
const refinalized = await write(
  voter,
  roundAddress,
  roundArtifact.abi,
  "finalize",
);
const winners = await publicClient.readContract({
  address: roundAddress,
  abi: roundArtifact.abi,
  functionName: "getWinners",
});
const usedVotes = await publicClient.readContract({
  address: roundAddress,
  abi: roundArtifact.abi,
  functionName: "usedVotes",
  args: [voter],
});
if (winners.length !== 1 || winners[0] !== 0n || usedVotes !== 9n) {
  throw new Error(
    "local final state did not match expected deterministic results",
  );
}

const deploymentEntries = {
  mockVotingToken: mock,
  votingPowerAdapter: adapter,
  implementation,
  factory,
};
const manifest = {
  chainName: "Anvil local",
  chainId: 31_337,
  gitCommitSha: gitCommitSha(),
  dirtyState: true,
  compiler: "solc 0.8.24",
  optimizer: { enabled: true, runs: 200 },
  constructorArguments: {
    mockVotingToken: [deployer],
    votingPowerAdapter: [mock.address],
    implementation: [],
    factory: [
      admin1,
      admin2,
      treasury,
      creationFee.toString(),
      implementation.address,
      adapter.address,
      true,
    ],
  },
  deployer,
  globalAdmins: [admin1, admin2],
  treasury,
  votingToken: mock.address,
  votingPowerAdapter: adapter.address,
  implementation: implementation.address,
  implementationVersion: 2,
  factory: factory.address,
  creationFeeWei: creationFee.toString(),
  testProfile: {
    submissionsSeconds: 300,
    moderationReviewSeconds: 300,
    votingSeconds: 300,
  },
  roundInitializer: {
    creator,
    userSalt: keccak256(stringToHex("local-e2e")),
    config: Object.fromEntries(
      Object.entries(config).map(([key, value]) => [
        key,
        typeof value === "bigint" ? value.toString() : value,
      ]),
    ),
  },
  deployments: Object.fromEntries(
    Object.entries(deploymentEntries).map(([name, entry]) => [
      name,
      {
        address: entry.address,
        transactionHash: entry.hash,
        blockNumber: entry.blockNumber.toString(),
      },
    ]),
  ),
  bytecodeHashes: Object.fromEntries(
    await Promise.all(
      Object.entries(deploymentEntries).map(async ([name, entry]) => {
        const code = await publicClient.getCode({ address: entry.address });
        if (!code || code === "0x")
          throw new Error(`${name} has no deployed runtime code`);
        return [name, keccak256(code)];
      }),
    ),
  ),
  testRound: roundAddress,
  evidence: {
    createRound: createHash,
    createRoundBlock: createReceipt.blockNumber.toString(),
    treasuryBalanceBefore: treasuryBefore.toString(),
    treasuryBalanceAfter: treasuryAfter.toString(),
    factoryBalanceAfter: factoryBalance.toString(),
    adminAdded: adminAdded.hash,
    adminRemoved: adminRemoved.hash,
    submissions: [submission1.hash, submission2.hash],
    approvals: [approved1.hash, approved2.hash],
    snapshot: snapshot.hash,
    votes: [partialVote.hash, additiveVote.hash, allocationToCap.hash],
    finalized: finalized.hash,
    refinalized: refinalized.hash,
    winnerIds: winners.map(String),
    usedVotes: usedVotes.toString(),
    rejections: [
      submissionLimitRejection,
      earlyVoteRejection,
      unauthorizedModeration,
      reviewPeriodSubmissionRejection,
      selfVoteRejection,
      perEntryCapRejection,
      overAllocationRejection,
    ],
  },
  verificationStatus: "local runtime verified",
  timestampUtc: new Date().toISOString(),
};

await mkdir(new URL("../../deployments", import.meta.url), { recursive: true });
await writeFile(
  new URL("../../deployments/local-rounds.json", import.meta.url),
  `${JSON.stringify(manifest, null, 2)}\n`,
  "utf8",
);
console.log(
  JSON.stringify({
    factory: factory.address,
    round: roundAddress,
    treasuryFeeDelta: (treasuryAfter - treasuryBefore).toString(),
    factoryBalance: factoryBalance.toString(),
    winners: winners.map(String),
    usedVotes: usedVotes.toString(),
  }),
);
