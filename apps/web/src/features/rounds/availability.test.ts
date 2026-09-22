// @ts-nocheck -- Bun's test globals are executed by Bun and are not in the app tsconfig.
import { describe, expect, it } from "bun:test";

import { getRoundsReadAvailability } from "./availability";

describe("Rounds read availability", () => {
  it("reports a Sepolia RPC failure before an empty factory state", () => {
    expect(
      getRoundsReadAvailability({
        chainId: 11_155_111,
        hasClient: false,
        hasFactory: true,
      }),
    ).toEqual({
      state: "rpc-unavailable",
      message: "Sepolia RPC unavailable.",
    });
  });

  it("keeps an unconfigured factory distinct from a failed RPC client", () => {
    expect(
      getRoundsReadAvailability({
        chainId: 11_155_111,
        hasClient: true,
        hasFactory: false,
      }),
    ).toEqual({ state: "factory-unavailable" });
  });
});
