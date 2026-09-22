const { describe, expect, it } = require("bun:test");

describe("deterministic Rounds CAR", () => {
  it("produces stable raw CIDs and exact-byte round trips", async () => {
    const { createDeterministicCar, inspectDeterministicCar } =
      await import("../packages/rounds-media/index.mjs");
    const bytes = new TextEncoder().encode('{"title":"Exact bytes"}');
    const first = await createDeterministicCar(bytes);
    const second = await createDeterministicCar(bytes);
    expect(first.cid).toBe(second.cid);
    expect(first.car).toEqual(second.car);
    expect(first.uri).toBe(`ipfs://${first.cid}`);
    const inspected = await inspectDeterministicCar(first.car);
    expect(inspected.cid).toBe(first.cid);
    expect(inspected.bytes).toEqual(bytes);
  });

  it("rejects empty and malformed CAR payloads", async () => {
    const { createDeterministicCar, inspectDeterministicCar } =
      await import("../packages/rounds-media/index.mjs");
    await expect(createDeterministicCar(new Uint8Array())).rejects.toThrow("non-empty");
    await expect(inspectDeterministicCar(new Uint8Array([1, 2, 3]))).rejects.toThrow();
  });
});
