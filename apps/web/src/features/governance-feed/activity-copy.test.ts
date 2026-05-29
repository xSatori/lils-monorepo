// @ts-nocheck
import { describe, expect, it } from "bun:test";

import { getActivityValuePrefix } from "./activity-copy";

describe("governance activity copy", () => {
  it("keeps for for non-vote value labels", () => {
    expect(getActivityValuePrefix({ type: "auction-bid" })).toBe("for");
  });
});
