import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Contract, JsonRpcProvider, Wallet, getAddress, keccak256, toUtf8Bytes } from "ethers";
import { createDeterministicCar } from "../../packages/rounds-media/index.mjs";
import { handleStatelessPinRequest } from "../../api/_rounds-stateless-upload.mjs";

const root = resolve(import.meta.dirname, "../..");
const env = await loadEnv(resolve(root, ".env.local"));
const provider = new JsonRpcProvider(env.SEPOLIA_RPC_URL, 11_155_111, { staticNetwork: true });
if (Number((await provider.getNetwork()).chainId) !== 11_155_111) throw new Error("RPC is not Sepolia");

const addresses = {
  deployer: "0x45803D21b418c8a675c7654597BE1056019C655E",
  factory: "0xd4cB8549980AdD2feA586FD13a47613118B0B5b4",
  votes: "0xddDF394EC7CC88bDCD54bF45326B123885A8eE6a",
  adapter: "0xDC13e69c8e335d419205c22680f0B27b3FD79C36",
  erc20: "0x7768DbC8c3F81B3b4B80565234aE6Df5C94A5ee5",
  erc721: "0x67BACB16fde9Ad896FAFfc3Eb8585c0349B5F6d1",
  erc1155: "0xd7E70ae807B16E714027b45056516C98bbD7266f",
};
const [factoryAbi, roundAbi, vaultAbi, votesAbi, erc20Abi, erc721Abi, erc1155Abi] = await Promise.all([
  abi("RoundFactoryV3.sol", "RoundFactoryV3"), abi("RoundV5.sol", "RoundV5"),
  abi("RoundPrizeVaultV5.sol", "RoundPrizeVaultV5"), abi("MockLilNounsVotes.sol", "MockLilNounsVotes"),
  abi("MockPrizeAssets.sol", "MockPrizeERC20"), abi("MockPrizeAssets.sol", "MockPrizeERC721"),
  abi("MockPrizeAssets.sol", "MockPrizeERC1155"),
]);
const keystore = await readFile(resolve(root, ".rounds-secrets/v5-sepolia-deployer"), "utf8");
const password = (await readFile(resolve(root, ".rounds-secrets/v5-sepolia-deployer.password"), "utf8")).trim();
const deployer = (await Wallet.fromEncryptedJson(keystore, password)).connect(provider);
if (getAddress(deployer.address) !== addresses.deployer) throw new Error("Unexpected deployer");

const factory = new Contract(addresses.factory, factoryAbi, deployer);
const count = await factory.roundCount();
if (count < 2n) throw new Error("Expected the resumable V5 round");
const record = await factory.roundAt(count - 1n);
const roundAddress = getAddress(record.round);
const vaultAddress = getAddress(record.prizeVault);
const round = new Contract(roundAddress, roundAbi, deployer);
const vault = new Contract(vaultAddress, vaultAbi, deployer);
if (Number(await round.deployedImplementationVersion()) !== 5 || !(await vault.isReadyForSubmissions())) {
  throw new Error("Latest round is not the funded V5 lifecycle round");
}
const votes = new Contract(addresses.votes, votesAbi, deployer);
const erc20 = new Contract(addresses.erc20, erc20Abi, provider);
const erc721 = new Contract(addresses.erc721, erc721Abi, provider);
const erc1155 = new Contract(addresses.erc1155, erc1155Abi, provider);
const signerA = Wallet.createRandom().connect(provider);
const signerB = Wallet.createRandom().connect(provider);
const publicExecutor = Wallet.createRandom().connect(provider);
const transactions = { creation: null, resumeSetup: [], admin: [], media: [], voting: [], finalization: [], distribution: [] };
const rejections = {};

const createdEvents = await factory.queryFilter(factory.filters.RoundCreated(roundAddress));
if (createdEvents.length !== 1) throw new Error("Round creation event not uniquely found");
transactions.creation = createdEvents[0].transactionHash;
const creationReceipt = await provider.getTransactionReceipt(transactions.creation);
const treasury = await factory.treasury();
const treasuryBefore = await provider.getBalance(treasury, creationReceipt.blockNumber - 1);
const treasuryAfter = await provider.getBalance(treasury, creationReceipt.blockNumber);

console.log(JSON.stringify({ stage: "resume", round: roundAddress, vault: vaultAddress }));
transactions.resumeSetup.push((await send(deployer.sendTransaction({ to: signerA.address, value: 1_500_000_000_000_000n }))).hash);
transactions.resumeSetup.push((await send(deployer.sendTransaction({ to: publicExecutor.address, value: 1_500_000_000_000_000n }))).hash);
transactions.resumeSetup.push((await send(votes.mint(signerA.address, 10))).hash);
transactions.resumeSetup.push((await send(votes.connect(signerA).delegate(signerA.address))).hash);
transactions.admin.push((await send(round.grantRoundAdmin(signerA.address))).hash);
transactions.admin.push((await send(round.grantRoundAdmin(signerB.address))).hash);

const pngA = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZlT8AAAAASUVORK5CYII=", "base64"));
const pngB = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64"));
const originalImage = await createDeterministicCar(pngA);
const adminImage = await createDeterministicCar(pngB);
const firstMetadata = await metadataCar("Sepolia IPFS entry", "Commit first, pin second lifecycle proof.", [originalImage.uri]);
const secondMetadata = await metadataCar("Second Sepolia entry", "Distinct-wallet deterministic winner proof.", []);
const submission0 = await round.getSubmission(0);
const submission1 = await round.getSubmission(1);
if (submission0.metadataURI !== firstMetadata.uri || submission1.metadataURI !== secondMetadata.uri) {
  throw new Error("Resumed submissions do not match deterministic recovery bytes");
}
const submitData = round.interface.encodeFunctionData("submit", [{
  submissionType: 0, title: "Sepolia IPFS entry", description: "Commit first, pin second lifecycle proof.",
  metadataURI: firstMetadata.uri, metadataHash: firstMetadata.hash, originalImageCount: 1,
}]);
rejections.perWalletSubmissionLimit = await expectCallRevert({ to: roundAddress, from: submission0.owner, data: submitData }, "per-wallet limit");
const moderateData = round.interface.encodeFunctionData("moderateSubmission", [0, 2]);
rejections.unauthorizedModeration = await expectCallRevert({ to: roundAddress, from: publicExecutor.address, data: moderateData }, "unauthorized moderation");
const earlyVoteData = round.interface.encodeFunctionData("castVotes", [[0], [1]]);
rejections.votingBeforeOpen = await expectCallRevert({ to: roundAddress, from: deployer.address, data: earlyVoteData }, "early vote");

const pinOne = await pinSubmission(0, firstMetadata, [originalImage], ["image/png"]);
const pinOneRetry = await pinSubmission(0, firstMetadata, [originalImage], ["image/png"]);
const pinTwo = await pinSubmission(1, secondMetadata, [], []);
await assertGateway(originalImage.cid, pngA);
await assertGateway(firstMetadata.cid, firstMetadata.bytes);

const imageNonce = await round.imageRevisionNonce(0);
const deadline = BigInt(Math.floor(Date.now() / 1000) + 1_200);
const imageHash = keccak256(pngB);
const domain = { name: "LilNounsRound", version: "5", chainId: 11_155_111, verifyingContract: roundAddress };
const types = { SubmissionImage: [
  { name: "round", type: "address" }, { name: "submissionId", type: "uint256" },
  { name: "nonce", type: "uint256" }, { name: "imageURI", type: "string" },
  { name: "imageHash", type: "bytes32" }, { name: "deadline", type: "uint256" },
] };
const value = { round: roundAddress, submissionId: 0, nonce: imageNonce, imageURI: adminImage.uri, imageHash, deadline };
const signatureA = await signerA.signTypedData(domain, types, value);
const signatureB = await signerB.signTypedData(domain, types, value);
transactions.media.push((await send(round.appendSubmissionImage(0, adminImage.uri, imageHash, imageNonce, deadline,
  { signer: signerA.address, signature: signatureA }, { signer: signerB.address, signature: signatureB }))).hash);
const adminPin = await pinAdminImage(adminImage);
const adminPinRetry = await pinAdminImage(adminImage);
await assertGateway(adminImage.cid, pngB);
transactions.admin.push((await send(round.revokeRoundAdmin(signerB.address))).hash);

const votingStart = await round.votingStart();
const votingEnd = await round.votingEnd();
await waitUntil(votingStart, "voting-open");
transactions.voting.push((await send(round.connect(publicExecutor).captureSnapshot())).hash);
const selfVoteData = round.interface.encodeFunctionData("castVotes", [[0], [1]]);
rejections.selfVote = await expectCallRevert({ to: roundAddress, from: submission0.owner, data: selfVoteData }, "self vote");
transactions.voting.push((await send(round.castVotes([0], [4]))).hash);
rejections.overAllocation = await expectRevert(round.castVotes.staticCall([0, 1], [2, 5]), "total over-allocation");
transactions.voting.push((await send(round.connect(signerA).castVotes([1], [3]))).hash);
rejections.perEntryCap = await expectRevert(round.connect(signerA).castVotes.staticCall([1], [4]), "per-entry cap");
transactions.voting.push((await send(round.connect(signerA).castVotes([1], [2]))).hash);

await waitUntil(votingEnd, "voting-ended");
transactions.finalization.push((await send(round.connect(publicExecutor).finalize())).hash);
const winnersOne = await round.getWinners();
transactions.finalization.push((await send(round.connect(publicExecutor).finalize())).hash);
const winnersTwo = await round.getWinners();
if (winnersOne.length !== 1 || winnersOne[0] !== 1n || winnersTwo[0] !== 1n) throw new Error("Winner/finalization mismatch");
const winner = await round.winnerAddress(0);
const distributionAvailableAt = await vault.distributionAvailableAt();
await waitUntil(distributionAvailableAt, "distribution-open");
const before = { native: await provider.getBalance(winner), erc20: await erc20.balanceOf(winner), erc1155: await erc1155.balanceOf(winner, 7) };
for (let allocationId = 0; allocationId < 4; allocationId += 1) {
  transactions.distribution.push((await send(vault.connect(publicExecutor).release(allocationId))).hash);
}
const after = { native: await provider.getBalance(winner), erc20: await erc20.balanceOf(winner), erc1155: await erc1155.balanceOf(winner, 7), erc721Owner: await erc721.ownerOf(1) };
if (after.native - before.native !== 200_000_000_000_000n || after.erc20 - before.erc20 !== 100n * 10n ** 18n ||
    after.erc1155 - before.erc1155 !== 5n || getAddress(after.erc721Owner) !== getAddress(winner)) {
  throw new Error("Prize distribution mismatch");
}

const assertions = {
  feeForwardedWei: (treasuryAfter - treasuryBefore).toString(), factoryRetainedWei: (await provider.getBalance(addresses.factory)).toString(),
  creatorIsAdmin: await round.hasRole(await round.ROUND_ADMIN_ROLE(), deployer.address), secondAdminRemoved: !(await round.hasRole(await round.ROUND_ADMIN_ROLE(), signerB.address)),
  submissionsDefaultApproved: Number(submission0.status) === 1 && Number(submission1.status) === 1,
  moderationBufferSeconds: Number((await round.votingStart()) - (await round.submissionsClose())),
  snapshotCaptured: await round.snapshotCaptured(), snapshotBlock: (await round.snapshotBlock()).toString(),
  submissionTotals: [(await round.submissionVoteTotals(0)).toString(), (await round.submissionVoteTotals(1)).toString()],
  additiveVotes: (await round.voterSubmissionVotes(signerA.address, 1)).toString(), deterministicWinnerSubmissionId: winnersTwo[0].toString(),
  winner, permissionlessExecutor: publicExecutor.address, allPrizeTypesReleased: true,
  pinata: { originalCid: originalImage.cid, metadataCid: firstMetadata.cid, adminImageCid: adminImage.cid,
    originalRetryDuplicate: pinOneRetry.body.data.images[0].isDuplicate, metadataRetryDuplicate: pinOneRetry.body.data.metadata.isDuplicate,
    adminRetryDuplicate: adminPinRetry.body.data.image.isDuplicate, secondSubmissionPinned: pinTwo.status === 200, gatewayBytesVerified: true },
};
if (assertions.feeForwardedWei !== "100000000000000" || assertions.factoryRetainedWei !== "0" || assertions.moderationBufferSeconds !== 300 || !assertions.snapshotCaptured) {
  throw new Error("Lifecycle assertion failed");
}
let gitCommitSha = "UNKNOWN";
try { gitCommitSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch {}
const manifest = { schemaVersion: 5, chain: { name: "Ethereum Sepolia", chainId: 11_155_111 }, generatedAt: new Date().toISOString(), gitCommitSha, dirtyState: true,
  actors: { deployer: deployer.address, mediaAdmins: [signerA.address, signerB.address], publicExecutor: publicExecutor.address },
  contracts: { ...addresses, round: roundAddress, prizeVault: vaultAddress },
  schedule: { submissionsOpen: String(await round.submissionsOpen()), submissionsClose: String(await round.submissionsClose()), votingStart: String(votingStart), votingEnd: String(votingEnd), distributionAvailableAt: String(distributionAvailableAt) },
  transactions, rejections, ipfs: { originalImage: originalImage.uri, adminImage: adminImage.uri, firstMetadata: firstMetadata.uri, secondMetadata: secondMetadata.uri, firstPinResponse: pinOne.body.data, adminPinResponse: adminPin.body.data }, assertions };
await mkdir(resolve(root, "deployments"), { recursive: true });
await writeFile(resolve(root, "deployments/sepolia-rounds-v5-e2e.json"), `${JSON.stringify(manifest, replacer, 2)}\n`);
console.log(JSON.stringify({ stage: "complete", round: roundAddress, vault: vaultAddress, manifest: "deployments/sepolia-rounds-v5-e2e.json" }));
provider.destroy();

async function abi(source, name) { return JSON.parse(await readFile(resolve(root, `contracts/out/${source}/${name}.json`), "utf8")).abi; }
async function loadEnv(path) { const output = { ...process.env }; for (const line of (await readFile(path, "utf8")).split(/\r?\n/)) { const match = line.match(/^([^#][^=]*)=(.*)$/); if (match) output[match[1].trim()] = match[2].trim().replace(/^['"]|['"]$/g, ""); } return output; }
async function send(pending) { const tx = await pending; const receipt = await tx.wait(); if (receipt.status !== 1) throw new Error(`Reverted ${tx.hash}`); return { hash: tx.hash, blockNumber: receipt.blockNumber }; }
async function expectRevert(promise, label) { try { await promise; } catch { return true; } throw new Error(`Expected ${label} rejection`); }
async function expectCallRevert(tx, label) { try { await provider.call(tx); } catch { return true; } throw new Error(`Expected ${label} rejection`); }
async function waitUntil(timestamp, stage) { for (;;) { const block = await provider.getBlock("latest"); const remaining = Number(BigInt(timestamp) - BigInt(block.timestamp)); if (remaining <= 0) return; console.log(JSON.stringify({ stage, remainingSeconds: remaining, blockNumber: block.number })); await new Promise((done) => setTimeout(done, Math.min(20, remaining) * 1_000)); } }
async function metadataCar(title, description, images) { const bytes = toUtf8Bytes(JSON.stringify({ schema: "lil-nouns-round-submission-v1", title, description, images, youtubeUrls: [] })); return { ...(await createDeterministicCar(bytes)), bytes, hash: keccak256(bytes) }; }
async function pinSubmission(id, metadata, images, mimeTypes) { const result = await handleStatelessPinRequest({ method: "POST", env, body: { kind: "submission", chainId: 11_155_111, round: roundAddress, submissionId: String(id), metadataCar: Buffer.from(metadata.car).toString("base64"), images: images.map((image, index) => ({ car: Buffer.from(image.car).toString("base64"), mimeType: mimeTypes[index] })) } }); if (result.status !== 200) throw new Error(`Submission pin failed: ${result.body?.error?.code}`); return result; }
async function pinAdminImage(image) { const result = await handleStatelessPinRequest({ method: "POST", env, body: { kind: "admin-image", chainId: 11_155_111, round: roundAddress, submissionId: "0", imageIndex: "0", car: Buffer.from(image.car).toString("base64"), mimeType: "image/png" } }); if (result.status !== 200) throw new Error(`Admin pin failed: ${result.body?.error?.code}`); return result; }
async function assertGateway(cid, expected) { const response = await fetch(`https://gateway.pinata.cloud/ipfs/${cid}`, { signal: AbortSignal.timeout(30_000) }); if (!response.ok) throw new Error(`Gateway failed ${cid}`); const actual = new Uint8Array(await response.arrayBuffer()); if (actual.length !== expected.length || actual.some((byte, index) => byte !== expected[index])) throw new Error(`Gateway bytes differ ${cid}`); }
function replacer(_key, value) { return typeof value === "bigint" ? value.toString() : value; }
