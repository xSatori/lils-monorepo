// @ts-nocheck
import { describe, expect, it } from "bun:test";
import { mapGoldskyNoun } from "./nounMapper";

describe("mapGoldskyNoun", () => {
  it("maps Goldsky's nested owner, delegate, and seed fields to the display shape", () => {
    expect(mapGoldskyNoun({
      id: "998",
      owner: { id: "0xee2c055f7706b9dfcd98cd5a23d5629d6316c0bd", delegate: { id: "0x1111111111111111111111111111111111111111" } },
      seed: { background: "0", body: "10", accessory: "101", head: "143", glasses: "0" },
    })).toEqual({
      id: "998",
      owner: "0xee2c055f7706b9dfcd98cd5a23d5629d6316c0bd",
      delegate: "0x1111111111111111111111111111111111111111",
      background: 0,
      body: 10,
      accessory: 101,
      head: 143,
      glasses: 0,
    });
  });

  it("omits incomplete records instead of fabricating a noun without canonical seed data", () => {
    expect(mapGoldskyNoun({ id: "999", owner: { id: "0x1111111111111111111111111111111111111111" }, seed: null })).toBeNull();
  });
});
