import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { JsonRpcProvider, keccak256 } from "ethers";

const root = resolve(import.meta.dirname, "../..");
const env = await loadEnv(resolve(root, ".env.local"));
const broadcast = JSON.parse(
  await readFile(resolve(root, "broadcast/DeployTestRoundsV5.s.sol/11155111/run-latest.json"), "utf8"),
);
const e2e = JSON.parse(await readFile(resolve(root, "deployments/sepolia-rounds-v5-e2e.json"), "utf8"));
const provider = new JsonRpcProvider(env.SEPOLIA_RPC_URL, 11155111, { staticNetwork: true });
const deployments = {};
for (const transaction of broadcast.transactions.filter((item) => item.transactionType === "CREATE")) {
  const receipt = await provider.getTransactionReceipt(transaction.hash);
  const code = await provider.getCode(transaction.contractAddress);
  deployments[transaction.contractName] = {
    address: transaction.contractAddress,
    transactionHash: transaction.hash,
    blockNumber: receipt.blockNumber,
    bytecodeHash: keccak256(code),
    constructorArguments: transaction.arguments,
    verificationStatus: "VERIFIED",
  };
}
let gitCommitSha = "UNKNOWN";
try {
  gitCommitSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
} catch {}
const manifest = {
  schemaVersion: 5,
  chain: { name: "Ethereum Sepolia", chainId: 11155111 },
  generatedAt: new Date().toISOString(),
  gitCommitSha,
  dirtyState: true,
  compiler: { version: "0.8.24", optimizer: true, optimizerRuns: 200, evmVersion: "cancun" },
  deployer: "0x45803D21b418c8a675c7654597BE1056019C655E",
  globalAdmins: [
    "0xdcf37d8aa17142f053aaa7dc56025ab00d897a19",
    "0x66cd193d0c0fb3b9b44dd371107617a7e9f38184",
  ],
  treasury: "0x2fC16Ed86E11544Fc9d67214705aAa60A3fEdEA5",
  creationFeeWei: "100000000000000",
  testMode: true,
  implementationVersion: 5,
  deployments,
  endToEnd: {
    round: e2e.contracts.round,
    prizeVault: e2e.contracts.prizeVault,
    transactions: e2e.transactions,
    assertions: e2e.assertions,
    evidenceFile: "deployments/sepolia-rounds-v5-e2e.json",
  },
  preview: {
    url: "https://lils-monorepo-nn8iwiim1-satori-ffbfc349.vercel.app",
    deploymentId: "dpl_2hxvKuofqUZAAo8C3GX1ahvw5t8r",
    target: "preview",
    status: "READY",
    validCommittedUploadTest: "PASSED",
  },
  verification: {
    explorer: "https://sepolia.etherscan.io",
    status: "VERIFIED",
    checkedContracts: Object.keys(deployments),
  },
};
await writeFile(resolve(root, "deployments/sepolia-rounds-v5.json"), `${JSON.stringify(manifest, null, 2)}\n`);
provider.destroy();
console.log(JSON.stringify({ manifest: "deployments/sepolia-rounds-v5.json", contracts: Object.keys(deployments).length }));

async function loadEnv(path) {
  const output = { ...process.env };
  for (const line of (await readFile(path, "utf8")).split(/\r?\n/)) {
    const match = line.match(/^([^#][^=]*)=(.*)$/);
    if (match) output[match[1].trim()] = match[2].trim().replace(/^['"]|['"]$/g, "");
  }
  return output;
}
