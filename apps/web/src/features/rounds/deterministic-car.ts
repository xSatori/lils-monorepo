import { CarWriter } from "@ipld/car";
import * as raw from "multiformats/codecs/raw";
import { sha256 } from "multiformats/hashes/sha2";
import { CID } from "multiformats/cid";

export async function createDeterministicCar(bytes: Uint8Array) {
  if (!bytes.length) throw new Error("Content must contain at least one byte.");
  const cid = CID.createV1(raw.code, await sha256.digest(bytes));
  const { writer, out } = CarWriter.create([cid]);
  // Drain concurrently: CarWriter applies backpressure until the reader consumes output.
  const collected = (async () => {
    const chunks: Uint8Array[] = [];
    for await (const chunk of out) chunks.push(chunk);
    const car = new Uint8Array(chunks.reduce((length, chunk) => length + chunk.length, 0));
    let offset = 0;
    for (const chunk of chunks) {
      car.set(chunk, offset);
      offset += chunk.length;
    }
    return car;
  })();
  await writer.put({ cid, bytes });
  await writer.close();
  return { cid: cid.toString(), uri: `ipfs://${cid}` as const, bytes, car: await collected };
}
