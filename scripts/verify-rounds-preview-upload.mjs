import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { createDeterministicCar } from "../packages/rounds-media/index.mjs";

const deployment = process.argv[2];
if (!deployment?.startsWith("https://")) throw new Error("Pass the Vercel Preview URL");

const imageBytes = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZlT8AAAAASUVORK5CYII=",
    "base64",
  ),
);
const image = await createDeterministicCar(imageBytes);
const metadataBytes = new TextEncoder().encode(
  JSON.stringify({
    schema: "lil-nouns-round-submission-v1",
    title: "Sepolia IPFS entry",
    description: "Commit first, pin second lifecycle proof.",
    images: [image.uri],
    youtubeUrls: [],
  }),
);
const metadata = await createDeterministicCar(metadataBytes);
const body = JSON.stringify({
  kind: "submission",
  chainId: 11155111,
  round: "0x657ac7E91d122576415dC5C4f4B1dbdAa7fD7159",
  submissionId: "0",
  metadataCar: Buffer.from(metadata.car).toString("base64"),
  images: [
    {
      car: Buffer.from(image.car).toString("base64"),
      mimeType: "image/png",
    },
  ],
});

const output = execFileSync(
  process.execPath,
  [
    join(process.env.APPDATA, "npm/node_modules/vercel/dist/index.js"),
    "curl",
    "/api/rounds/uploads/pin",
    "--deployment",
    deployment,
    "--",
    "--silent",
    "--show-error",
    "--request",
    "POST",
    "--header",
    "Content-Type: application/json",
    "--data",
    body,
  ],
  { encoding: "utf8", maxBuffer: 2 * 1024 * 1024 },
);
const start = output.indexOf("{");
if (start < 0) throw new Error("Preview function did not return JSON");
const payload = JSON.parse(output.slice(start));
if (
  payload?.data?.metadata?.cid !== metadata.cid ||
  payload?.data?.images?.[0]?.cid !== image.cid
) {
  throw new Error("Preview function returned unexpected content IDs");
}
console.log(
  JSON.stringify({
    deployment,
    submissionId: payload.data.submissionId,
    imageCid: payload.data.images[0].cid,
    metadataCid: payload.data.metadata.cid,
    imageDuplicate: payload.data.images[0].isDuplicate,
    metadataDuplicate: payload.data.metadata.isDuplicate,
  }),
);
