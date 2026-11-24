import { expect, it } from "bun:test";
import { createDeterministicCar } from "./deterministic-car";
import { verifyPinFiles } from "./manual-pins";

it("verifies metadata and every image against the prepared bytes at their own CID", async () => {
  const files = await Promise.all(["metadata", "image"].map(async name => ({
    ...await createDeterministicCar(new TextEncoder().encode(name)), name,
  })));
  const calls = [];
  await verifyPinFiles(files, async url => {
    const file = files[calls.length];
    calls.push(String(url));
    return new Response(file.bytes);
  });
  expect(calls).toEqual(files.map(file => "https://ipfs.io/ipfs/" + file.cid));
});

it("rejects missing, changed and truncated content before verification succeeds", async () => {
  const file = { ...await createDeterministicCar(new Uint8Array([1, 2, 3])), name: "metadata" };
  for (const response of [new Response(null, { status: 404 }), new Response(new Uint8Array([1, 2])), new Response(new Uint8Array([1, 2, 4]))]) {
    await expect(verifyPinFiles([file], async () => response)).rejects.toThrow();
  }
});
