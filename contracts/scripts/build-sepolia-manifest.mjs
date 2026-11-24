import { readFile, writeFile } from "node:fs/promises";
import { createPublicClient, http, keccak256, stringToHex } from "viem";
import { sepolia } from "viem/chains";

const rpcUrl =
  process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";
const publicClient = createPublicClient({
  chain: sepolia,
  transport: http(rpcUrl),
});
const state = JSON.parse(
  await readFile(
    new URL("../../tmp/rounds-sepolia/sepolia-e2e-state.json", import.meta.url),
    "utf8",
  ),
);
const broadcast = JSON.parse(
  await readFile(
    new URL(
      "../../broadcast/DeployTestRounds.s.sol/11155111/run-latest.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const [factoryAbi, roundAbi] = await Promise.all([
  readFile(new URL("../abi/RoundFactory.json", import.meta.url), "utf8").then(
    JSON.parse,
  ),
  readFile(new URL("../abi/Round.json", import.meta.url), "utf8").then(
    JSON.parse,
  ),
]);

const deploymentNames = [
  "mockVotingToken",
  "votingPowerAdapter",
  "implementation",
  "factory",
];
const deploymentContracts = [
  "MockLilNounsVotes",
  "LilNounsVotingPower",
  "Round",
  "RoundFactory",
];
const deployments = {};
for (let index = 0; index < deploymentNames.length; index += 1) {
  const receipt = broadcast.receipts[index];
  deployments[deploymentNames[index]] = {
    contract: deploymentContracts[index],
    address: state.addresses[deploymentNames[index]],
    transactionHash: receipt.transactionHash,
    blockNumber: Number(BigInt(receipt.blockNumber)),
    gasUsed: BigInt(receipt.gasUsed).toString(),
    status: receipt.status === "0x1" ? "success" : receipt.status,
  };
}

const [
  globalAdmins,
  treasury,
  creationFee,
  testMode,
  adapter,
  implementationVersion,
  configurationHash,
  deployerBalance,
] = await Promise.all([
  publicClient.readContract({
    address: state.addresses.factory,
    abi: factoryAbi,
    functionName: "getGlobalAdmins",
  }),
  publicClient.readContract({
    address: state.addresses.factory,
    abi: factoryAbi,
    functionName: "treasury",
  }),
  publicClient.readContract({
    address: state.addresses.factory,
    abi: factoryAbi,
    functionName: "creationFee",
  }),
  publicClient.readContract({
    address: state.addresses.factory,
    abi: factoryAbi,
    functionName: "testMode",
  }),
  publicClient.readContract({
    address: state.addresses.factory,
    abi: factoryAbi,
    functionName: "votingPowerAdapter",
  }),
  publicClient.readContract({
    address: state.addresses.factory,
    abi: factoryAbi,
    functionName: "activeImplementationVersion",
  }),
  publicClient.readContract({
    address: state.addresses.round,
    abi: roundAbi,
    functionName: "configurationHash",
  }),
  publicClient.getBalance({ address: state.addresses.deployer }),
]);
if (
  globalAdmins[0].toLowerCase() !==
    "0xdcf37d8aa17142f053aaa7dc56025ab00d897a19" ||
  globalAdmins[1].toLowerCase() !==
    "0x66cd193d0c0fb3b9b44dd371107617a7e9f38184" ||
  treasury.toLowerCase() !== state.addresses.treasury.toLowerCase() ||
  creationFee.toString() !== state.creationFeeWei ||
  !testMode ||
  adapter.toLowerCase() !== state.addresses.votingPowerAdapter.toLowerCase()
) {
  throw new Error(
    "live factory configuration changed before manifest generation",
  );
}

const bytecodeHashes = {};
for (const [name, address] of Object.entries({
  mockVotingToken: state.addresses.mockVotingToken,
  votingPowerAdapter: state.addresses.votingPowerAdapter,
  implementation: state.addresses.implementation,
  factory: state.addresses.factory,
  testRoundClone: state.addresses.round,
})) {
  const bytecode = await publicClient.getBytecode({ address });
  if (!bytecode || bytecode === "0x")
    throw new Error(`missing deployed code: ${name}`);
  bytecodeHashes[name] = keccak256(bytecode);
}

const explorerBase = "https://sepolia.etherscan.io";
const transactionLink = (transactionHash) =>
  `${explorerBase}/tx/${transactionHash}`;
const addressLink = (address) => `${explorerBase}/address/${address}`;
const manifestVersion = Number(implementationVersion);
const callerSalt = keccak256(
  stringToHex(`lil-nouns-rounds-sepolia-e2e-v${manifestVersion}`),
);
const v1Verification = {
  mockVotingToken: {
    status: "exact_match",
    provider: "Sourcify",
    jobUrl:
      "https://sourcify.dev/server/v2/verify/57423355-b32b-48fc-a600-34e5279a50f0",
  },
  votingPowerAdapter: {
    status: "exact_match",
    provider: "Sourcify",
    jobUrl:
      "https://sourcify.dev/server/v2/verify/50ed4763-d37b-4940-8fa7-990d296b5207",
  },
  implementation: {
    status: "exact_match",
    provider: "Sourcify",
    jobUrl:
      "https://sourcify.dev/server/v2/verify/7a199f9c-8ccc-480e-aaf9-b90512f9de65",
  },
  factory: {
    status: "exact_match",
    provider: "Sourcify",
    jobUrl:
      "https://sourcify.dev/server/v2/verify/747470b7-e6a6-473b-b9ca-e748fb2335a7",
  },
};
const v2Verification = {
  mockVotingToken: {
    status: "exact_match",
    provider: "Sourcify",
    note: "Forge reported this deployed address was already verified.",
  },
  votingPowerAdapter: {
    status: "exact_match",
    provider: "Sourcify",
    note: "Forge reported this deployed address was already verified.",
  },
  implementation: {
    status: "exact_match",
    provider: "Sourcify",
    jobUrl:
      "https://sourcify.dev/server/v2/verify/3f9d4244-dfa9-457c-89e7-997d32c592fd",
  },
  factory: {
    status: "exact_match",
    provider: "Sourcify",
    jobUrl:
      "https://sourcify.dev/server/v2/verify/7d831049-ffbc-48ee-9dba-ca77b65e7875",
  },
};
const verification =
  manifestVersion === 1
    ? v1Verification
    : manifestVersion === 2
      ? v2Verification
      : Object.fromEntries(
          deploymentNames.map((name) => [
            name,
            { status: "not_attempted", provider: "UNKNOWN" },
          ]),
        );

const manifest = {
  chainName: "Ethereum Sepolia",
  chainId: 11_155_111,
  timestampUtc: new Date().toISOString(),
  gitCommitSha: process.env.GIT_COMMIT_SHA ?? "UNKNOWN",
  dirtyState: true,
  dirtyStateNote:
    "Uncommitted Rounds implementation and evidence only; no commit or push was authorized.",
  compiler: "solc 0.8.24",
  optimizer: { enabled: true, runs: 200 },
  evmVersion: "cancun",
  deployer: state.addresses.deployer,
  deployerBalanceAfterWei: deployerBalance.toString(),
  globalAdmins,
  treasury: state.addresses.treasury,
  votingToken: state.addresses.mockVotingToken,
  votingPowerAdapter: state.addresses.votingPowerAdapter,
  implementation: state.addresses.implementation,
  implementationVersion: Number(implementationVersion),
  factory: state.addresses.factory,
  creationFeeWei: creationFee.toString(),
  testMode,
  testProfile:
    manifestVersion === 1
      ? { submissionsSeconds: 300, votingSeconds: 300 }
      : {
          submissionsSeconds: 300,
          moderationReviewSeconds: 300,
          votingSeconds: 300,
        },
  constructorArguments: {
    mockVotingToken: [state.addresses.deployer],
    votingPowerAdapter: [state.addresses.mockVotingToken],
    implementation: [],
    factory: [
      globalAdmins[0],
      globalAdmins[1],
      state.addresses.treasury,
      creationFee.toString(),
      state.addresses.implementation,
      state.addresses.votingPowerAdapter,
      true,
    ],
  },
  deployments,
  bytecodeHashes,
  verification,
  testRound: {
    address: state.addresses.round,
    creator: state.addresses.creator,
    callerSalt,
    configurationHash,
    initializerArguments: {
      factory: state.addresses.factory,
      creator: state.addresses.creator,
      implementationVersion: Number(implementationVersion),
      configurationHash,
      config: state.configuration,
    },
    schedule: state.schedule,
    snapshotBlock: state.snapshotBlock,
    winnerIds: state.winnerIds,
  },
  evidence: {
    treasuryBalanceBefore: state.treasuryBalanceBefore,
    treasuryBalanceAfter: state.treasuryBalanceAfter,
    treasuryFeeDelta: (
      BigInt(state.treasuryBalanceAfter) - BigInt(state.treasuryBalanceBefore)
    ).toString(),
    factoryBalanceAfter: state.factoryBalanceAfter,
    setupTransactions: state.setupTransactions,
    votingTransactions: state.votingTransactions,
    finalizationTransactions: state.finalizationTransactions,
    rejectionChecks: state.rejections,
    historicalVotingPower: state.historicalVotingPower,
    voteState: state.voteState,
    directRpcFinalState: state.directRpcFinalState,
    eventProjection: state.eventProjection,
  },
  explorer: {
    addresses: Object.fromEntries(
      Object.entries({
        mockVotingToken: state.addresses.mockVotingToken,
        votingPowerAdapter: state.addresses.votingPowerAdapter,
        implementation: state.addresses.implementation,
        factory: state.addresses.factory,
        testRound: state.addresses.round,
        treasury: state.addresses.treasury,
      }).map(([name, address]) => [name, addressLink(address)]),
    ),
    deploymentTransactions: Object.fromEntries(
      Object.entries(deployments).map(([name, deployment]) => [
        name,
        transactionLink(deployment.transactionHash),
      ]),
    ),
    createRound: transactionLink(
      state.setupTransactions.createRound.transactionHash,
    ),
    snapshot: transactionLink(
      state.votingTransactions.snapshot.transactionHash,
    ),
    partialVote: transactionLink(
      state.votingTransactions.partialVote.transactionHash,
    ),
    additiveVote: transactionLink(
      state.votingTransactions.additiveVote.transactionHash,
    ),
    finalized: transactionLink(
      state.finalizationTransactions.finalized.transactionHash,
    ),
    refinalized: transactionLink(
      state.finalizationTransactions.refinalized.transactionHash,
    ),
  },
  scope: {
    mainnetTransactionOccurred: false,
    existingLilNounsContractsModified: false,
    productionInfrastructureChanged: false,
    committedOrPushed: false,
    realWalletOrSecretUsed: false,
  },
};

const manifestPath =
  manifestVersion === 1
    ? "../../deployments/sepolia-rounds.json"
    : `../../deployments/sepolia-rounds-v${manifestVersion}.json`;
await writeFile(
  new URL(manifestPath, import.meta.url),
  `${JSON.stringify(manifest, null, 2)}\n`,
  "utf8",
);
process.stdout.write(
  `${JSON.stringify({ factory: manifest.factory, round: manifest.testRound.address, winnerIds: manifest.testRound.winnerIds, manifestPath, verification: manifestVersion <= 2 ? "exact_match" : "not_attempted" })}\n`,
);
