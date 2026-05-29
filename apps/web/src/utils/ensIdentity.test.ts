import { describe, expect, it } from "bun:test";

import { buildEnsRpcUrls, truncateAddressForDisplay } from "./ensIdentity";

describe("ENS identity helpers", () => {
  it("uses configured RPC URLs before public ENS fallbacks", () => {
    expect(
      buildEnsRpcUrls(
        " https://primary.example ",
        "https://fallback.example, https://eth.llamarpc.com",
      ),
    ).toEqual([
      "https://primary.example",
      "https://fallback.example",
      "https://eth.llamarpc.com",
      "https://ethereum-rpc.publicnode.com",
    ]);
  });

  it("falls back to public ENS RPC URLs when no Vite RPC is configured", () => {
    expect(buildEnsRpcUrls()).toEqual([
      "https://ethereum-rpc.publicnode.com",
      "https://eth.llamarpc.com",
    ]);
  });

  it("formats wallet addresses consistently", () => {
    expect(
      truncateAddressForDisplay("0xdcf37d8Aa17142f053AAA7dc56025aB00D897a19"),
    ).toBe("0xdcf3...7a19");
  });
});
