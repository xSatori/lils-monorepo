import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";

import { createDeterministicCar } from "../packages/rounds-media/index.mjs";

function readEnv(text) {
  return Object.fromEntries(
    text
      .split(/\r?\n/)
      .map((line) => line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/))
      .filter(Boolean)
      .map((match) => {
        let value = match[2].trim();
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        return [match[1], value];
      }),
  );
}

function requireJwt(env) {
  const jwt = env.PINATA_JWT?.trim();
  if (!jwt) throw new Error("PINATA_JWT is missing from .env.local");
  return jwt;
}

async function uploadExactBytes(jwt, bytes, name) {
  const form = new FormData();
  form.append("network", "public");
  form.append("name", name);
  form.append("file", new File([bytes], name, { type: "application/octet-stream" }));
  const response = await fetch("https://uploads.pinata.cloud/v3/files", {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}` },
    body: form,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Pinata upload failed with HTTP ${response.status}`);
  }
  const data = payload?.data ?? payload;
  if (typeof data?.id !== "string" || typeof data?.cid !== "string") {
    throw new Error("Pinata returned an invalid upload response");
  }
  return { id: data.id, cid: data.cid };
}

async function listByCid(jwt, cid) {
  const response = await fetch(
    `https://api.pinata.cloud/v3/files/public?cid=${encodeURIComponent(cid)}&limit=100`,
    { headers: { Authorization: `Bearer ${jwt}` } },
  );
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Pinata list failed with HTTP ${response.status}`);
  const data = payload?.data ?? payload;
  return Array.isArray(data?.files) ? data.files : [];
}

async function removeFile(jwt, id) {
  const response = await fetch(`https://api.pinata.cloud/v3/files/public/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${jwt}` },
  });
  if (!response.ok) throw new Error(`Pinata cleanup failed with HTTP ${response.status}`);
}

const env = readEnv(await readFile(new URL("../.env.local", import.meta.url), "utf8"));
const jwt = requireJwt(env);
const bytes = new Uint8Array([
  ...new TextEncoder().encode("lil-nouns-rounds-v5-pinata-proof:"),
  ...randomBytes(16),
]);
const prepared = await createDeterministicCar(bytes);
const name = `rounds-v5-proof-${Date.now()}.bin`;
const uploaded = [];

try {
  uploaded.push(
    ...(await Promise.all(
      Array.from({ length: 3 }, (_, index) =>
        uploadExactBytes(jwt, bytes, `${index}-${name}`),
      ),
    )),
  );
  const listed = await listByCid(jwt, prepared.cid);
  const matching = listed.filter((file) => file?.cid === prepared.cid);
  const uniqueCids = new Set(uploaded.map((file) => file.cid));
  const uniqueIds = new Set(uploaded.map((file) => file.id));
  const result = {
    expectedCid: prepared.cid,
    uploadCount: uploaded.length,
    allRootsMatch: uniqueCids.size === 1 && uniqueCids.has(prepared.cid),
    uniqueProviderRecordCount: uniqueIds.size,
    listedMatchingRecordCount: matching.length,
  };
  console.log(JSON.stringify(result, null, 2));
  if (!result.allRootsMatch) process.exitCode = 1;
} finally {
  const cleanup = await Promise.allSettled(
    [...new Set(uploaded.map((file) => file.id))].map((id) => removeFile(jwt, id)),
  );
  if (cleanup.some((item) => item.status === "rejected")) {
    console.error("One or more isolated Pinata proof records could not be removed.");
    process.exitCode = 1;
  }
}
