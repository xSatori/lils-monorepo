import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  Contract,
  Interface,
  JsonRpcProvider,
  Wallet,
  ZeroAddress,
  getAddress,
  keccak256,
  toUtf8Bytes,
} from "ethers";
import { createDeterministicCar } from "../../packages/rounds-media/index.mjs";
import { handleStatelessPinRequest } from "../../api/_rounds-stateless-upload.mjs";

const root = resolve(import.meta.dirname, "../..");
const env = await loadEnv(resolve(root, ".env.local"));
const required = [
  "SEPOLIA_RPC_URL",
  "PINATA_JWT",
  "ROUNDS_UPLOAD_RPC_URL",
  "ROUNDS_UPLOAD_CHAIN_ID",
  "ROUNDS_UPLOAD_FACTORY_ADDRESS",
];
for (const key of required) if (!env[key]) throw new Error(`Missing ${key}`);
if (Number(env.ROUNDS_UPLOAD_CHAIN_ID) !== 11_155_111) throw new Error("Upload chain must be Sepolia");

const addresses = {
  deployer: "0x45803D21b418c8a675c7654597BE1056019C655E",
  factory: "0xd4cB8549980AdD2feA586FD13a47613118B0B5b4",
  votes: "0xddDF394EC7CC88bDCD54bF45326B123885A8eE6a",
  adapter: "0xDC13e69c8e335d419205c22680f0B27b3FD79C36",
  erc20: "0x7768DbC8c3F81B3b4B80565234aE6Df5C94A5ee5",
  erc721: "0x67BACB16fde9Ad896FAFfc3Eb8585c0349B5F6d1",
  erc1155: "0xd7E70ae807B16E714027b45056516C98bbD7266f",
};
if (getAddress(env.ROUNDS_UPLOAD_FACTORY_ADDRESS) !== addresses.factory) {
  throw new Error("Upload factory does not match the V5 deployment");
}

const [factoryArtifact, roundArtifact, vaultArtifact, votesArtifact, erc20Artifact, erc721Artifact, erc1155Artifact] =
  await Promise.all([
    artifact("RoundFactoryV3.sol", "RoundFactoryV3"),
    artifact("RoundV5.sol", "RoundV5"),
    artifact("RoundPrizeVaultV5.sol", "RoundPrizeVaultV5"),
    artifact("MockLilNounsVotes.sol", "MockLilNounsVotes"),
    artifact("MockPrizeAssets.sol", "MockPrizeERC20"),
    artifact("MockPrizeAssets.sol", "MockPrizeERC721"),
    artifact("MockPrizeAssets.sol", "MockPrizeERC1155"),
  ]);

const provider = new JsonRpcProvider(env.SEPOLIA_RPC_URL, 11_155_111, { staticNetwork: true });
const network = await provider.getNetwork();
if (Number(network.chainId) !== 11_155_111) throw new Error("RPC is not Sepolia");

const keystore = await readFile(resolve(root, ".rounds-secrets/v5-sepolia-deployer"), "utf8");
const password = (await readFile(resolve(root, ".rounds-secrets/v5-sepolia-deployer.password"), "utf8")).trim();
const unlocked = await Wallet.fromEncryptedJson(keystore, password);
if (getAddress(unlocked.address) !== addresses.deployer) throw new Error("Unexpected deployer keystore");
const deployer = unlocked.connect(provider);
const adminA = Wallet.createRandom().connect(provider);
const adminB = Wallet.createRandom().connect(provider);
const executor = Wallet.createRandom().connect(provider);

const factory = new Contract(addresses.factory, factoryArtifact.abi, deployer);
const votes = new Contract(addresses.votes, votesArtifact.abi, deployer);
const erc20 = new Contract(addresses.erc20, erc20Artifact.abi, deployer);
const erc721 = new Contract(addresses.erc721, erc721Artifact.abi, deployer);
const erc1155 = new Contract(addresses.erc1155, erc1155Artifact.abi, deployer);
const transactions = { setup: [], creation: null, admin: [], prizes: [], submissions: [], media: [], voting: [], finalization: [], distribution: [] };
const rejections = {};

console.log(JSON.stringify({ stage: "setup", message: "Funding disposable actors and preparing test assets" }));
for (const actor of [adminA, adminB, executor]) {
  transactions.setup.push(await send(deployer.sendTransaction({ to: actor.address, value: 1_500_000_000_000_000n })));
}
transactions.setup.push(await send(votes.mint(deployer.address, 10)));
transactions.setup.push(await send(votes.mint(adminA.address, 10)));
transactions.setup.push(await send(votes.connect(deployer).delegate(deployer.address)));
transactions.setup.push(await send(votes.connect(adminA).delegate(adminA.address)));
transactions.setup.push(await send(erc20.mint(deployer.address, 100n * 10n ** 18n)));
transactions.setup.push(await send(erc721.mint(deployer.address)));
transactions.setup.push(await send(erc1155.mint(deployer.address, 7n, 5n)));

const pngA = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZlT8AAAAASUVORK5CYII=", "base64"));
const pngB = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64"));
const originalImage = await createDeterministicCar(pngA);
const adminImage = await createDeterministicCar(pngB);
const firstMetadata = await metadataCar("Sepolia IPFS entry", "Commit first, pin second lifecycle proof.", [originalImage.uri]);
const secondMetadata = await metadataCar("Second Sepolia entry", "Distinct-wallet deterministic winner proof.", []);

const latest = await provider.getBlock("latest");
const submissionsOpen = BigInt(latest.timestamp) + 300n;
const submissionsClose = submissionsOpen + 300n;
const votingStart = submissionsClose + 300n;
const votingEnd = votingStart + 300n;
const config = {
  metadataURI: firstMetadata.uri,
  metadataHash: firstMetadata.hash,
  roundStart: BigInt(latest.timestamp),
  submissionsOpen,
  submissionsClose,
  votingStart,
  votingEnd,
  votingPowerAdapter: addresses.adapter,
  votingStrategy: 1,
  snapshotMode: 0,
  customSnapshotBlock: 0,
  baseOrFixedVotes: 0,
  maxVotesPerSubmission: 6,
  maxSubmissionsPerWallet: 1,
  maxSubmissions: 10,
  winnerCount: 1,
  minTitleLength: 3,
  maxTitleLength: 120,
  minDescriptionLength: 10,
  maxDescriptionLength: 2_000,
};
const nativePrize = 200_000_000_000_000n;
const erc20Prize = 100n * 10n ** 18n;
const vaultConfig = {
  recoveryRecipient: deployer.address,
  claimPeriod: 300,
  recoveryDelay: 300,
  allocations: [
    { winnerRank: 0, assetType: 0, token: ZeroAddress, tokenId: 0, amount: nativePrize },
    { winnerRank: 0, assetType: 1, token: addresses.erc20, tokenId: 0, amount: erc20Prize },
    { winnerRank: 0, assetType: 2, token: addresses.erc721, tokenId: 1, amount: 1 },
    { winnerRank: 0, assetType: 3, token: addresses.erc1155, tokenId: 7, amount: 5 },
  ],
};
const fee = await factory.creationFee();
const treasury = await factory.treasury();
const treasuryBefore = await provider.getBalance(treasury);
console.log(JSON.stringify({ stage: "create", submissionsOpen: Number(submissionsOpen), votingStart: Number(votingStart), votingEnd: Number(votingEnd) }));
const createReceipt = await send(factory.createRound(config, vaultConfig, keccak256(toUtf8Bytes(`v5-sepolia-${Date.now()}`)), { value: fee }));
transactions.creation = createReceipt.hash;
const created = new Interface(factoryArtifact.abi).parseLog(
  createReceipt.logs.find((log) => {
    try { return new Interface(factoryArtifact.abi).parseLog(log)?.name === "RoundCreated"; } catch { return false; }
  }),
);
const roundAddress = getAddress(created.args.round);
const vaultAddress = getAddress(created.args.prizeVault);
const round = new Contract(roundAddress, roundArtifact.abi, deployer);
const vault = new Contract(vaultAddress, vaultArtifact.abi, deployer);

transactions.admin.push((await send(round.grantRoundAdmin(adminA.address))).hash);
transactions.admin.push((await send(round.grantRoundAdmin(adminB.address))).hash);
transactions.prizes.push((await send(erc20.approve(vaultAddress, erc20Prize))).hash);
transactions.prizes.push((await send(erc721.approve(vaultAddress, 1))).hash);
transactions.prizes.push((await send(erc1155.setApprovalForAll(vaultAddress, true))).hash);
transactions.prizes.push((await send(vault.fundNative({ value: nativePrize }))).hash);
transactions.prizes.push((await send(vault.fundERC20(addresses.erc20, erc20Prize))).hash);
transactions.prizes.push((await send(vault.fundERC721(addresses.erc721, 1))).hash);
transactions.prizes.push((await send(vault.fundERC1155(addresses.erc1155, 7, 5))).hash);
transactions.prizes.push((await send(vault.seal())).hash);

rejections.votingBeforeOpen = await expectRevert(
  round.castVotes.staticCall([0], [1]),
  "voting before open",
);
await waitUntil(provider, submissionsOpen, "submissions-open");

const submissionOne = {
  submissionType: 0,
  title: "Sepolia IPFS entry",
  description: "Commit first, pin second lifecycle proof.",
  metadataURI: firstMetadata.uri,
  metadataHash: firstMetadata.hash,
  originalImageCount: 1,
};
const submissionTwo = {
  submissionType: 1,
  title: "Second Sepolia entry",
  description: "Distinct-wallet deterministic winner proof.",
  metadataURI: secondMetadata.uri,
  metadataHash: secondMetadata.hash,
  originalImageCount: 0,
};
transactions.submissions.push((await send(round.connect(adminA).submit(submissionOne))).hash);
transactions.submissions.push((await send(round.connect(adminB).submit(submissionTwo))).hash);
rejections.perWalletSubmissionLimit = await expectRevert(
  round.connect(adminA).submit.staticCall(submissionOne),
  "per-wallet submission limit",
);
rejections.unauthorizedModeration = await expectRevert(
  round.connect(executor).moderateSubmission.staticCall(0, 2),
  "unauthorized moderation",
);

const pinOne = await pinSubmission(roundAddress, 0, firstMetadata, [originalImage], ["image/png"]);
const pinOneRetry = await pinSubmission(roundAddress, 0, firstMetadata, [originalImage], ["image/png"]);
const pinTwo = await pinSubmission(roundAddress, 1, secondMetadata, [], []);
await assertGateway(originalImage.cid, pngA);
await assertGateway(firstMetadata.cid, firstMetadata.bytes);

const imageNonce = await round.imageRevisionNonce(0);
const imageDeadline = BigInt(Math.floor(Date.now() / 1000) + 1_200);
const imageHash = keccak256(pngB);
const mediaTypedData = {
  domain: { name: "LilNounsRound", version: "5", chainId: 11_155_111, verifyingContract: roundAddress },
  types: {
    SubmissionImage: [
      { name: "round", type: "address" },
      { name: "submissionId", type: "uint256" },
      { name: "nonce", type: "uint256" },
      { name: "imageURI", type: "string" },
      { name: "imageHash", type: "bytes32" },
      { name: "deadline", type: "uint256" },
    ],
  },
  value: { round: roundAddress, submissionId: 0, nonce: imageNonce, imageURI: adminImage.uri, imageHash, deadline: imageDeadline },
};
const signatureA = await adminA.signTypedData(mediaTypedData.domain, mediaTypedData.types, mediaTypedData.value);
const signatureB = await adminB.signTypedData(mediaTypedData.domain, mediaTypedData.types, mediaTypedData.value);
transactions.media.push((await send(round.appendSubmissionImage(
  0,
  adminImage.uri,
  imageHash,
  imageNonce,
  imageDeadline,
  { signer: adminA.address, signature: signatureA },
  { signer: adminB.address, signature: signatureB },
))).hash);
const adminPin = await pinAdminImage(roundAddress, 0, 0, adminImage, "image/png");
const adminPinRetry = await pinAdminImage(roundAddress, 0, 0, adminImage, "image/png");
await assertGateway(adminImage.cid, pngB);
transactions.admin.push((await send(round.revokeRoundAdmin(adminB.address))).hash);

await waitUntil(provider, submissionsClose, "moderation-buffer");
const approvedBeforeVoting = [await round.getSubmission(0), await round.getSubmission(1)].every((entry) => Number(entry.status) === 1);
await waitUntil(provider, votingStart, "voting-open");
transactions.voting.push((await send(round.connect(executor).captureSnapshot())).hash);
rejections.selfVote = await expectRevert(round.connect(adminA).castVotes.staticCall([0], [1]), "self vote");
transactions.voting.push((await send(round.connect(deployer).castVotes([0], [4]))).hash);
rejections.overAllocation = await expectRevert(
  round.connect(deployer).castVotes.staticCall([0, 1], [2, 5]),
  "total over-allocation",
);
transactions.voting.push((await send(round.connect(adminA).castVotes([1], [3]))).hash);
rejections.perEntryCap = await expectRevert(
  round.connect(adminA).castVotes.staticCall([1], [4]),
  "per-entry cap",
);
transactions.voting.push((await send(round.connect(adminA).castVotes([1], [2]))).hash);

await waitUntil(provider, votingEnd, "voting-ended");
transactions.finalization.push((await send(round.connect(executor).finalize())).hash);
const winnersBefore = await round.getWinners();
transactions.finalization.push((await send(round.connect(executor).finalize())).hash);
const winnersAfter = await round.getWinners();
if (winnersBefore.length !== 1 || winnersBefore[0] !== 1n || winnersAfter[0] !== 1n) {
  throw new Error("Deterministic winner or idempotent finalization failed");
}

const distributionAvailableAt = await vault.distributionAvailableAt();
await waitUntil(provider, distributionAvailableAt, "prize-distribution-open");
const balancesBefore = {
  native: await provider.getBalance(adminB.address),
  erc20: await erc20.balanceOf(adminB.address),
  erc1155: await erc1155.balanceOf(adminB.address, 7),
};
for (let allocationId = 0; allocationId < 4; allocationId += 1) {
  transactions.distribution.push((await send(vault.connect(executor).release(allocationId))).hash);
}
const balancesAfter = {
  native: await provider.getBalance(adminB.address),
  erc20: await erc20.balanceOf(adminB.address),
  erc1155: await erc1155.balanceOf(adminB.address, 7),
  erc721Owner: await erc721.ownerOf(1),
};
if (balancesAfter.native - balancesBefore.native !== nativePrize) throw new Error("ETH prize mismatch");
if (balancesAfter.erc20 - balancesBefore.erc20 !== erc20Prize) throw new Error("ERC20 prize mismatch");
if (getAddress(balancesAfter.erc721Owner) !== getAddress(adminB.address)) throw new Error("ERC721 prize mismatch");
if (balancesAfter.erc1155 - balancesBefore.erc1155 !== 5n) throw new Error("ERC1155 prize mismatch");

const treasuryAfter = await provider.getBalance(treasury);
const assertions = {
  factoryVersion: Number(await factory.activeImplementationVersion()),
  feeForwardedWei: (treasuryAfter - treasuryBefore).toString(),
  factoryRetainedWei: (await provider.getBalance(addresses.factory)).toString(),
  creatorIsAdmin: await round.hasRole(await round.ROUND_ADMIN_ROLE(), deployer.address),
  secondAdminRemoved: !(await round.hasRole(await round.ROUND_ADMIN_ROLE(), adminB.address)),
  submissionsDefaultApproved: approvedBeforeVoting,
  snapshotCaptured: await round.snapshotCaptured(),
  snapshotBlock: (await round.snapshotBlock()).toString(),
  submissionTotals: [(await round.submissionVoteTotals(0)).toString(), (await round.submissionVoteTotals(1)).toString()],
  additiveVotes: (await round.voterSubmissionVotes(adminA.address, 1)).toString(),
  deterministicWinnerSubmissionId: winnersAfter[0].toString(),
  permissionlessExecutor: executor.address,
  allPrizeTypesReleased: true,
  pinata: {
    originalCid: originalImage.cid,
    metadataCid: firstMetadata.cid,
    adminImageCid: adminImage.cid,
    originalRetryDuplicate: pinOneRetry.body.data.images[0].isDuplicate,
    metadataRetryDuplicate: pinOneRetry.body.data.metadata.isDuplicate,
    adminRetryDuplicate: adminPinRetry.body.data.image.isDuplicate,
    secondSubmissionPinned: pinTwo.status === 200,
    gatewayBytesVerified: true,
  },
};
if (assertions.feeForwardedWei !== fee.toString() || assertions.factoryRetainedWei !== "0") {
  throw new Error("Creation fee invariant failed");
}
if (!assertions.creatorIsAdmin || !assertions.submissionsDefaultApproved || !assertions.snapshotCaptured) {
  throw new Error("Round lifecycle invariant failed");
}

let gitCommitSha = "UNKNOWN";
try { gitCommitSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch {}
const manifest = {
  schemaVersion: 5,
  chain: { name: "Ethereum Sepolia", chainId: 11_155_111 },
  generatedAt: new Date().toISOString(),
  gitCommitSha,
  dirtyState: true,
  actors: { deployer: deployer.address, roundAdmins: [adminA.address, adminB.address], publicExecutor: executor.address },
  contracts: { ...addresses, round: roundAddress, prizeVault: vaultAddress },
  schedule: Object.fromEntries(Object.entries({ submissionsOpen, submissionsClose, votingStart, votingEnd, distributionAvailableAt }).map(([key, value]) => [key, value.toString()])),
  transactions,
  rejections,
  ipfs: {
    originalImage: originalImage.uri,
    adminImage: adminImage.uri,
    firstMetadata: firstMetadata.uri,
    secondMetadata: secondMetadata.uri,
    firstPinResponse: pinOne.body.data,
    adminPinResponse: adminPin.body.data,
  },
  assertions,
};
await mkdir(resolve(root, "deployments"), { recursive: true });
await writeFile(resolve(root, "deployments/sepolia-rounds-v5-e2e.json"), `${JSON.stringify(manifest, bigintReplacer, 2)}\n`);
console.log(JSON.stringify({ stage: "complete", round: roundAddress, vault: vaultAddress, manifest: "deployments/sepolia-rounds-v5-e2e.json" }));
provider.destroy();

async function artifact(source, name) {
  return JSON.parse(await readFile(resolve(root, `contracts/out/${source}/${name}.json`), "utf8"));
}

async function loadEnv(path) {
  const result = { ...process.env };
  const contents = await readFile(path, "utf8");
  for (const line of contents.split(/\r?\n/)) {
    const match = line.match(/^([^#][^=]*)=(.*)$/);
    if (match) result[match[1].trim()] = match[2].trim().replace(/^['"]|['"]$/g, "");
  }
  return result;
}

async function send(pending) {
  const transaction = await pending;
  const receipt = await transaction.wait();
  if (receipt.status !== 1) throw new Error(`Transaction reverted: ${transaction.hash}`);
  return {
    hash: transaction.hash,
    blockNumber: receipt.blockNumber,
    logs: receipt.logs,
  };
}

async function expectRevert(promise, label) {
  try {
    await promise;
  } catch {
    return true;
  }
  throw new Error(`Expected ${label} to revert`);
}

async function waitUntil(rpc, timestamp, stage) {
  for (;;) {
    const block = await rpc.getBlock("latest");
    const remaining = Number(timestamp - BigInt(block.timestamp));
    if (remaining <= 0) return;
    console.log(JSON.stringify({ stage, remainingSeconds: remaining, blockNumber: block.number }));
    await new Promise((resolveWait) => setTimeout(resolveWait, Math.min(20, remaining) * 1_000));
  }
}

async function metadataCar(title, description, images) {
  const bytes = toUtf8Bytes(JSON.stringify({ schema: "lil-nouns-round-submission-v1", title, description, images, youtubeUrls: [] }));
  const content = await createDeterministicCar(bytes);
  return { ...content, bytes, hash: keccak256(bytes) };
}

async function pinSubmission(round, submissionId, metadata, images, mimeTypes) {
  const response = await handleStatelessPinRequest({
    method: "POST",
    env,
    body: {
      kind: "submission",
      chainId: 11_155_111,
      round,
      submissionId: String(submissionId),
      metadataCar: Buffer.from(metadata.car).toString("base64"),
      images: images.map((image, index) => ({ car: Buffer.from(image.car).toString("base64"), mimeType: mimeTypes[index] })),
    },
  });
  if (response.status !== 200) throw new Error(`Submission pin failed: ${response.body?.error?.code}`);
  return response;
}

async function pinAdminImage(round, submissionId, imageIndex, image, mimeType) {
  const response = await handleStatelessPinRequest({
    method: "POST",
    env,
    body: {
      kind: "admin-image",
      chainId: 11_155_111,
      round,
      submissionId: String(submissionId),
      imageIndex: String(imageIndex),
      car: Buffer.from(image.car).toString("base64"),
      mimeType,
    },
  });
  if (response.status !== 200) throw new Error(`Admin image pin failed: ${response.body?.error?.code}`);
  return response;
}

async function assertGateway(cid, expectedBytes) {
  const response = await fetch(`https://gateway.pinata.cloud/ipfs/${cid}`, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`Pinata gateway could not load ${cid}`);
  const actual = new Uint8Array(await response.arrayBuffer());
  if (actual.length !== expectedBytes.length || actual.some((value, index) => value !== expectedBytes[index])) {
    throw new Error(`Pinata gateway bytes differ for ${cid}`);
  }
}

function bigintReplacer(_key, value) {
  return typeof value === "bigint" ? value.toString() : value;
}
