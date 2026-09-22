const { createHash } = require("node:crypto");

const MAX_METADATA_BYTES = 64 * 1024;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const GATEWAYS = [
  "https://gateway.pinata.cloud/ipfs/",
  "https://ipfs.io/ipfs/",
];

async function readBoundedBytes(response, limit) {
  if (!response.body) throw new Error("Empty gateway response.");
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) throw new Error("IPFS content is too large.");
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

async function readBoundedText(response) {
  return new TextDecoder("utf-8", { fatal: true }).decode(
    await readBoundedBytes(response, MAX_METADATA_BYTES),
  );
}

async function parseCid(cid) {
  if (
    typeof cid !== "string" ||
    cid.length > 120 ||
    !/^[A-Za-z0-9]+$/.test(cid)
  ) {
    return null;
  }
  try {
    const { CID } = await import("multiformats/cid");
    return CID.parse(cid);
  } catch {
    return null;
  }
}

function imageMimeType(bytes) {
  if (
    bytes.length >= 8 &&
    Buffer.from(bytes.subarray(0, 8)).equals(
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    )
  )
    return "image/png";
  if (
    bytes.length >= 3 &&
    bytes[0] === 255 &&
    bytes[1] === 216 &&
    bytes[2] === 255
  )
    return "image/jpeg";
  if (
    bytes.length >= 6 &&
    (Buffer.from(bytes.subarray(0, 6)).toString() === "GIF87a" ||
      Buffer.from(bytes.subarray(0, 6)).toString() === "GIF89a")
  )
    return "image/gif";
  if (
    bytes.length >= 12 &&
    Buffer.from(bytes.subarray(0, 4)).toString() === "RIFF" &&
    Buffer.from(bytes.subarray(8, 12)).toString() === "WEBP"
  )
    return "image/webp";
  return null;
}

async function retrieveRoundContent(cid, fetchImpl = fetch) {
  if (!(await parseCid(cid))) {
    return { status: 400, body: "Invalid content ID." };
  }

  for (const gateway of GATEWAYS) {
    try {
      const response = await fetchImpl(`${gateway}${cid}`, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(8_000),
      });
      if (!response.ok) continue;
      const raw = await readBoundedText(response);
      const metadata = JSON.parse(raw);
      if (
        typeof metadata?.title !== "string" ||
        typeof metadata?.description !== "string"
      ) {
        continue;
      }
      // Return exact bytes; the browser verifies their hash against the onchain commitment.
      return { status: 200, body: raw };
    } catch {
      // A gateway can be unavailable or challenge requests; try the independent fallback.
    }
  }
  return { status: 502, body: "Metadata could not be retrieved from IPFS." };
}

async function retrieveRoundImage(cid, fetchImpl = fetch) {
  const parsed = await parseCid(cid);
  if (!parsed) return { status: 400, body: "Invalid content ID." };

  for (const gateway of GATEWAYS) {
    try {
      const response = await fetchImpl(`${gateway}${cid}`, {
        headers: { Accept: "image/*" },
        signal: AbortSignal.timeout(8_000),
      });
      if (!response.ok) continue;
      const bytes = await readBoundedBytes(response, MAX_IMAGE_BYTES);
      const contentType = imageMimeType(bytes);
      if (!contentType) continue;
      if (parsed.code === 0x55 && parsed.multihash.code === 0x12) {
        const digest = createHash("sha256").update(bytes).digest();
        if (!digest.equals(Buffer.from(parsed.multihash.digest))) continue;
      }
      return { status: 200, body: Buffer.from(bytes), contentType };
    } catch {
      // Rate-limited or invalid gateway content should not prevent a fallback.
    }
  }
  return { status: 502, body: "Image could not be retrieved from IPFS." };
}

module.exports = { retrieveRoundContent, retrieveRoundImage };
