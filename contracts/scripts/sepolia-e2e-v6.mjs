import { readFile } from "node:fs/promises";
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
const env = Object.fromEntries(
  (await readFile(resolve(root, ".env.local"), "utf8"))
    .split(/\r?\n/)
    .filter((line) => /^[A-Za-z_][A-Za-z0-9_]*=/.test(line))
    .map((line) => {
      const index = line.indexOf("=");
      return [line.slice(0, index), line.slice(index + 1).trim().replace(/^['"]|['"]$/g, "")];
    }),
);
const expected = {
  deployer: "0x45803D21b418c8a675c7654597BE1056019C655E",
  factory: "0xC7e45B337975f1EC07cac943d0CeC6609E544377",
  votes: "0xddDF394EC7CC88bDCD54bF45326B123885A8eE6a",
  adapter: "0xDC13e69c8e335d419205c22680f0B27b3FD79C36",
  erc20: "0x7768DbC8c3F81B3b4B80565234aE6Df5C94A5ee5",
};
if (
  !env.SEPOLIA_RPC_URL ||
  !env.PINATA_JWT ||
  Number(env.ROUNDS_UPLOAD_CHAIN_ID) !== 11_155_111 ||
  getAddress(env.ROUNDS_UPLOAD_FACTORY_ADDRESS) !== expected.factory
) {
  throw new Error("V6 Sepolia RPC, Pinata, or stateless upload settings are not ready.");
}

const artifact = async (source, name) =>
  JSON.parse(
    await readFile(resolve(root, `contracts/out/${source}/${name}.json`), "utf8"),
  );
const [factoryArtifact, roundArtifact, vaultArtifact, votesArtifact, erc20Artifact] =
  await Promise.all([
    artifact("RoundFactoryV6.sol", "RoundFactoryV6"),
    artifact("RoundV6.sol", "RoundV6"),
    artifact("RoundPrizeVaultV6.sol", "RoundPrizeVaultV6"),
    artifact("MockLilNounsVotes.sol", "MockLilNounsVotes"),
    artifact("MockPrizeAssets.sol", "MockPrizeERC20"),
  ]);
const provider = new JsonRpcProvider(env.SEPOLIA_RPC_URL, 11_155_111, {
  staticNetwork: true,
});
if (Number((await provider.getNetwork()).chainId) !== 11_155_111) {
  throw new Error("RPC is not Sepolia.");
}
const encrypted = await readFile(resolve(root, ".rounds-secrets/v5-sepolia-deployer"), "utf8");
const password = (
  await readFile(resolve(root, ".rounds-secrets/v5-sepolia-deployer.password"), "utf8")
).trim();
const unlocked = await Wallet.fromEncryptedJson(encrypted, password);
if (getAddress(unlocked.address) !== expected.deployer) {
  throw new Error("The disposable keystore is not the verified deployer.");
}
const deployer = unlocked.connect(provider);
const actor = Wallet.createRandom().connect(provider);
const factory = new Contract(expected.factory, factoryArtifact.abi, deployer);
const votes = new Contract(expected.votes, votesArtifact.abi, deployer);
const erc20 = new Contract(expected.erc20, erc20Artifact.abi, deployer);
if (Number(await factory.activeImplementationVersion()) !== 6) {
  throw new Error("Active factory version is not V6.");
}
if (Number(await factory.roundCount()) !== 0) {
  throw new Error("V6 factory already contains rounds; inspect before continuing.");
}
if ((await provider.getBalance(deployer.address)) < 30_000_000_000_000_000n) {
  throw new Error("Disposable deployer has less than 0.03 Sepolia ETH.");
}

const activity = { setup: [], rounds: [] };
async function send(label, pending) {
  const transaction = await pending;
  console.log(JSON.stringify({ stage: label, hash: transaction.hash }));
  const receipt = await transaction.wait();
  if (receipt.status !== 1) throw new Error(`${label} reverted: ${transaction.hash}`);
  return receipt;
}
async function waitUntil(timestamp, label) {
  for (;;) {
    const block = await provider.getBlock("latest");
    const remaining = Number(timestamp - BigInt(block.timestamp));
    if (remaining <= 0) return;
    if (remaining < 10 || remaining % 60 < 20) {
      console.log(JSON.stringify({ stage: label, remainingSeconds: remaining }));
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, Math.min(20, remaining) * 1_000));
  }
}
async function content(bytes) {
  return { ...(await createDeterministicCar(bytes)), bytes, hash: keccak256(bytes) };
}
async function pinRound(round, metadata, image) {
  const response = await handleStatelessPinRequest({
    method: "POST",
    env,
    body: {
      kind: "round",
      chainId: 11_155_111,
      round,
      metadataCar: Buffer.from(metadata.car).toString("base64"),
      image: { car: Buffer.from(image.car).toString("base64"), mimeType: "image/png" },
    },
  });
  if (response.status !== 200) {
    throw new Error(`Round media pin failed: ${JSON.stringify(response.body?.error)}`);
  }
  return response.body.data;
}
async function pinSubmission(round, metadata, image) {
  const response = await handleStatelessPinRequest({
    method: "POST",
    env,
    body: {
      kind: "submission",
      chainId: 11_155_111,
      round,
      submissionId: "0",
      metadataCar: Buffer.from(metadata.car).toString("base64"),
      images: [{ car: Buffer.from(image.car).toString("base64"), mimeType: "image/png" }],
    },
  });
  if (response.status !== 200) {
    throw new Error(`Submission media pin failed: ${JSON.stringify(response.body?.error)}`);
  }
  return response.body.data;
}
async function checkGateway(cid, bytes) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await fetch(`https://gateway.pinata.cloud/ipfs/${cid}`, {
        signal: AbortSignal.timeout(30_000),
      });
      if (response.ok) {
        const received = new Uint8Array(await response.arrayBuffer());
        if (
          received.length === bytes.length &&
          received.every((value, index) => value === bytes[index])
        ) return;
      }
    } catch { /* retry a propagation delay */ }
    await new Promise((resolveWait) => setTimeout(resolveWait, 10_000));
  }
  throw new Error(`Pinned CID ${cid} was not retrievable byte-for-byte.`);
}

// One ephemeral test voter is kept only in this process; the deployer owns both entries and prizes.
activity.setup.push((await send("fund-test-voter", deployer.sendTransaction({
  to: actor.address,
  value: 3_000_000_000_000_000n,
}))).hash);
activity.setup.push((await send("mint-test-votes", votes.mint(actor.address, 5))).hash);
activity.setup.push((await send("delegate-test-votes", votes.connect(actor).delegate(actor.address))).hash);

const pngs = [
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZlT8AAAAASUVORK5CYII=",
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
];
const imageContents = await Promise.all(
  pngs.map((png) => content(Uint8Array.from(Buffer.from(png, "base64")))),
);
const prizeAmounts = [100_000_000_000_000n, 10n * 10n ** 18n];
const titles = ["V6 Sepolia ETH test", "V6 Sepolia token test"];
const fee = await factory.creationFee();
const factoryInterface = new Interface(factoryArtifact.abi);

for (let index = 0; index < 2; index += 1) {
  const image = imageContents[index];
  const title = titles[index];
  const description = `V6 funded-first Sepolia lifecycle test ${index + 1}.`;
  const metadata = await content(toUtf8Bytes(JSON.stringify({
    schema: "lil-nouns-round-v1", title, description, image: image.uri,
  })));
  const config = {
    metadataURI: metadata.uri,
    metadataHash: metadata.hash,
    roundStart: 0,
    submissionsOpen: 0,
    submissionsClose: 0,
    votingStart: 0,
    votingEnd: 0,
    votingPowerAdapter: expected.adapter,
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
  const vaultConfig = {
    recoveryRecipient: deployer.address,
    claimPeriod: 300,
    recoveryDelay: 300,
    allocations: [{
      winnerRank: 0,
      assetType: index === 0 ? 0 : 1,
      token: index === 0 ? ZeroAddress : expected.erc20,
      tokenId: 0,
      amount: prizeAmounts[index],
    }],
  };
  await factory.createRound.staticCall(
    config, vaultConfig, keccak256(toUtf8Bytes(`v6-e2e-${index}-${Date.now()}`)),
    { value: fee },
  );
  const receipt = await send(`create-round-${index + 1}`, factory.createRound(
    config, vaultConfig, keccak256(toUtf8Bytes(`v6-sepolia-${index}-${Date.now()}`)),
    { value: fee },
  ));
  const event = receipt.logs
    .map((log) => { try { return factoryInterface.parseLog(log); } catch { return null; } })
    .find((entry) => entry?.name === "RoundCreated");
  if (!event) throw new Error(`RoundCreated event missing for test ${index + 1}`);
  const address = getAddress(event.args.round);
  const vaultAddress = getAddress(event.args.prizeVault);
  const round = new Contract(address, roundArtifact.abi, deployer);
  const vault = new Contract(vaultAddress, vaultArtifact.abi, deployer);
  if (await round.scheduleConfigured()) throw new Error("New V6 round is already scheduled.");
  activity.rounds.push({ title, address, vaultAddress, createHash: receipt.hash, roundMetadata: metadata, image, round, vault, transactions: [] });
  const pinned = await pinRound(address, metadata, image);
  console.log(JSON.stringify({ stage: `round-${index + 1}-pinned`, round: address, metadataCid: pinned.metadata.cid, imageCid: pinned.image.cid }));
  await checkGateway(metadata.cid, metadata.bytes);
}

const [ethRound, tokenRound] = activity.rounds;
try {
  await ethRound.round.setSchedule.staticCall(0, 0, 0, 0);
  throw new Error("Unfunded vault unexpectedly allowed scheduling.");
} catch (error) {
  if (error.message.includes("unexpectedly")) throw error;
}
ethRound.transactions.push((await send("fund-eth-prize", ethRound.vault.fundNative({ value: prizeAmounts[0] }))).hash);
tokenRound.transactions.push((await send("mint-mock-erc20", erc20.mint(deployer.address, prizeAmounts[1]))).hash);
tokenRound.transactions.push((await send("approve-mock-erc20", erc20.approve(tokenRound.vaultAddress, prizeAmounts[1]))).hash);
tokenRound.transactions.push((await send("fund-token-prize", tokenRound.vault.fundERC20(expected.erc20, prizeAmounts[1]))).hash);
for (const item of activity.rounds) {
  item.transactions.push((await send(`seal-${item.title}`, item.vault.seal())).hash);
  if (!(await item.vault.isReadyForSubmissions())) throw new Error("Sealed vault is not ready.");
}

const latest = await provider.getBlock("latest");
const opening = BigInt(latest.timestamp) + 150n;
const schedule = (open) => [open, open + 300n, open + 600n, open + 900n];
ethRound.transactions.push((await send("schedule-eth-round", ethRound.round.setSchedule(...schedule(opening)))).hash);
tokenRound.transactions.push((await send("schedule-token-round-initial", tokenRound.round.setSchedule(...schedule(opening + 60n)))).hash);
tokenRound.transactions.push((await send("revise-token-round-before-opening", tokenRound.round.setSchedule(...schedule(opening)))).hash);
for (const item of activity.rounds) {
  if (BigInt(await item.round.submissionsOpen()) !== opening) throw new Error("Schedule mismatch.");
}
console.log(JSON.stringify({ stage: "scheduled", opening: opening.toString(), closing: (opening + 300n).toString(), votingStart: (opening + 600n).toString(), votingEnd: (opening + 900n).toString() }));

await waitUntil(opening, "await-submissions");
for (let index = 0; index < 2; index += 1) {
  const item = activity.rounds[index];
  const entryTitle = `V6 test submission ${index + 1}`;
  const entryDescription = `Pinned image entry for V6 Sepolia test round ${index + 1}.`;
  const submissionMetadata = await content(toUtf8Bytes(JSON.stringify({
    schema: "lil-nouns-round-submission-v1",
    title: entryTitle,
    description: entryDescription,
    images: [item.image.uri],
    youtubeUrls: [],
  })));
  const input = {
    submissionType: 0,
    title: entryTitle,
    description: entryDescription,
    metadataURI: submissionMetadata.uri,
    metadataHash: submissionMetadata.hash,
    originalImageCount: 1,
  };
  item.transactions.push((await send(`submit-round-${index + 1}`, item.round.submit(input))).hash);
  if (Number(await item.round.submissionCount()) !== 1) throw new Error("Submission count mismatch.");
  const pinned = await pinSubmission(item.address, submissionMetadata, item.image);
  await checkGateway(submissionMetadata.cid, submissionMetadata.bytes);
  console.log(JSON.stringify({ stage: `submission-${index + 1}-pinned`, round: item.address, metadataCid: pinned.metadata.cid, imageCid: pinned.images[0].cid }));
  item.submissionMetadataCid = submissionMetadata.cid;
}

await waitUntil(opening + 300n, "await-review");
tokenRound.transactions.push((await send("review-reject-token-entry", tokenRound.round.moderateSubmission(0, 2))).hash);
tokenRound.transactions.push((await send("review-approve-token-entry", tokenRound.round.moderateSubmission(0, 1))).hash);
await waitUntil(opening + 600n, "await-voting");
for (let index = 0; index < 2; index += 1) {
  const item = activity.rounds[index];
  item.transactions.push((await send(`snapshot-round-${index + 1}`, item.round.captureSnapshot())).hash);
  item.transactions.push((await send(`vote-round-${index + 1}`, item.round.connect(actor).castVotes([0], [1]))).hash);
}

await waitUntil(opening + 900n, "await-finalization");
for (let index = 0; index < 2; index += 1) {
  const item = activity.rounds[index];
  item.transactions.push((await send(`finalize-round-${index + 1}`, item.round.finalize())).hash);
  const winners = await item.round.getWinners();
  if (winners.length !== 1 || winners[0] !== 0n) throw new Error("Wrong deterministic winner.");
}
const distributionTime = activity.rounds.reduce(async (currentPromise, item) => {
  const current = await currentPromise;
  const availableAt = BigInt(await item.vault.distributionAvailableAt());
  return availableAt > current ? availableAt : current;
}, Promise.resolve(0n));
await waitUntil(await distributionTime, "await-prize-release");
for (let index = 0; index < 2; index += 1) {
  const item = activity.rounds[index];
  item.transactions.push((await send(`release-prize-${index + 1}`, item.vault.release(0))).hash);
  const allocation = await item.vault.getAllocation(0);
  if (!allocation.claimed) throw new Error("Prize allocation was not released.");
}
const voterBalance = await provider.getBalance(actor.address);
const voterGasPrice = (await provider.getFeeData()).gasPrice;
if (voterGasPrice && voterBalance > 21_000n * voterGasPrice) {
  activity.setup.push((await send("return-test-voter-change", actor.sendTransaction({
    to: deployer.address,
    value: voterBalance - 21_000n * voterGasPrice,
    gasLimit: 21_000,
    gasPrice: voterGasPrice,
  }))).hash);
}
console.log(JSON.stringify({
  stage: "complete",
  chainId: 11_155_111,
  factory: expected.factory,
  voter: actor.address,
  setupTransactions: activity.setup,
  rounds: activity.rounds.map((item) => ({
    title: item.title,
    round: item.address,
    vault: item.vaultAddress,
    createHash: item.createHash,
    roundMetadataCid: item.roundMetadata.cid,
    submissionMetadataCid: item.submissionMetadataCid,
    transactions: item.transactions,
  })),
}, (_key, value) => typeof value === "bigint" ? value.toString() : value));
provider.destroy();
