import { CarReader, CarWriter } from "@ipld/car";
import * as raw from "multiformats/codecs/raw";
import { sha256 } from "multiformats/hashes/sha2";
import { CID } from "multiformats/cid";

function asBytes(value) {
  if (!(value instanceof Uint8Array) || value.byteLength === 0) {
    throw new TypeError("Content must be a non-empty Uint8Array.");
  }
  return value;
}

async function collect(source) {
  const chunks = [];
  let length = 0;
  for await (const chunk of source) {
    chunks.push(chunk);
    length += chunk.byteLength;
  }
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

/** A one-root CAR containing one CIDv1 raw block. Identical bytes are identical CIDs/CARs. */
export async function createDeterministicCar(input) {
  const bytes = asBytes(input);
  const digest = await sha256.digest(bytes);
  const cid = CID.createV1(raw.code, digest);
  const { writer, out } = CarWriter.create([cid]);
  const carPromise = collect(out);
  await writer.put({ cid, bytes });
  await writer.close();
  return {
    cid: cid.toString(),
    uri: `ipfs://${cid.toString()}`,
    bytes,
    car: await carPromise,
  };
}

/** Rejects multi-root, multi-block, non-raw, or hash-mismatched payloads. */
export async function inspectDeterministicCar(input) {
  const car = asBytes(input);
  const reader = await CarReader.fromBytes(car);
  const roots = await reader.getRoots();
  if (roots.length !== 1 || roots[0].code !== raw.code) {
    throw new Error("CAR must contain exactly one raw CIDv1 root.");
  }
  const blocks = [];
  for await (const block of reader.blocks()) blocks.push(block);
  if (blocks.length !== 1 || !blocks[0].cid.equals(roots[0])) {
    throw new Error("CAR must contain exactly its one declared root block.");
  }
  const expected = CID.createV1(raw.code, await sha256.digest(blocks[0].bytes));
  if (!expected.equals(roots[0])) throw new Error("CAR block hash does not match its root.");
  return { cid: roots[0].toString(), bytes: blocks[0].bytes };
}
