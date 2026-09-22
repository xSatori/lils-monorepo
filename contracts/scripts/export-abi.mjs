import { mkdir, readFile, writeFile } from "node:fs/promises";

const contracts = [
  ["RoundFactory", "RoundFactory"],
  ["Round", "Round"],
  ["LilNounsVotingPower", "LilNounsVotingPower"],
  ["MockLilNounsVotes", "MockLilNounsVotes"],
  ["RoundFactoryV3", "RoundFactoryV3"],
  ["RoundV3", "RoundV3"],
  ["RoundPrizeVault", "RoundPrizeVault"],
  ["RoundV4", "RoundV4"],
  ["RoundPrizeVaultV4", "RoundPrizeVaultV4"],
  ["RoundV5", "RoundV5"],
  ["RoundPrizeVaultV5", "RoundPrizeVaultV5"],
  ["MockPrizeERC20", "MockPrizeAssets"],
  ["MockPrizeERC721", "MockPrizeAssets"],
  ["MockPrizeERC1155", "MockPrizeAssets"],
];
const outputDirectory = new URL("../abi/", import.meta.url);
await mkdir(outputDirectory, { recursive: true });

for (const [name, source] of contracts) {
  const artifactUrl = new URL(
    `../out/${source}.sol/${name}.json`,
    import.meta.url,
  );
  const artifact = JSON.parse(await readFile(artifactUrl, "utf8"));
  await writeFile(
    new URL(`${name}.json`, outputDirectory),
    `${JSON.stringify(artifact.abi, null, 2)}\n`,
    "utf8",
  );
}
