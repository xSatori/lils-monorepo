// @ts-nocheck -- Bun's test globals are executed by Bun and are not in the app tsconfig.
import { describe, expect, it, mock } from "bun:test";

import { contentHash, fetchMetadata } from "./metadata";

import {
  isContentAddressedUri,
  resolveContentUri,
  resolveImageUri,
  validateSubmissionText,
} from "./validation";

const limits = {
  minTitleLength: 3,
  maxTitleLength: 10,
  minDescriptionLength: 5,
  maxDescriptionLength: 20,
};

describe("Rounds metadata", () => {
  it("loads same-origin IPFS content only when it matches the onchain hash", async () => {
    const originalFetch = globalThis.fetch;
    const raw =
      '{"title":"Verified title","description":"Verified description"}';
    const fetchMock = mock(async () => new Response(raw));
    globalThis.fetch = fetchMock as typeof fetch;
    try {
      const metadata = await fetchMetadata(
        "ipfs://bafkreibagcuzpsiht655vu4nrnb3bbh6ksk4hz7zhjru74jj2l2kstqtui",
        contentHash(raw),
      );
      expect(metadata.title).toBe("Verified title");
      expect(fetchMock.mock.calls[0][0]).toStartWith(
        "/api/rounds/uploads/content?cid=",
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("never accepts metadata that fails the onchain hash check", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(
      async () => new Response('{"title":"Tampered","description":"Changed"}'),
    ) as typeof fetch;
    try {
      await expect(
        fetchMetadata(
          "ipfs://bafkreibagcuzpsiht655vu4nrnb3bbh6ksk4hz7zhjru74jj2l2kstqtui",
          contentHash("original"),
        ),
      ).rejects.toThrow("onchain integrity hash");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("rejects malformed optional media instead of crashing the round page", async () => {
    const originalFetch = globalThis.fetch;
    const raw =
      '{"title":"Entry","description":"Description","images":{},"youtubeUrls":["https://youtu.be/test"]}';
    globalThis.fetch = mock(async () => new Response(raw)) as typeof fetch;
    try {
      await expect(
        fetchMetadata("ipfs://bafytest", contentHash(raw)),
      ).rejects.toThrow("invalid media fields");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("resolves content-addressed URIs", () => {
    expect(resolveContentUri("ipfs://bafy/test.json")).toBe(
      "https://ipfs.io/ipfs/bafy/test.json",
    );
    expect(resolveContentUri("ar://transaction")).toBe(
      "https://arweave.net/transaction",
    );
    expect(resolveContentUri("javascript:alert(1)")).toBe("about:blank");
    expect(isContentAddressedUri("ipfs://bafy/test.json")).toBe(true);
    expect(isContentAddressedUri("https://example.com/test.json")).toBe(false);
  });

  it("routes bare IPFS image CIDs through the same-origin image endpoint", () => {
    const cid = "bafkreibagcuzpsiht655vu4nrnb3bbh6ksk4hz7zhjru74jj2l2kstqtui";
    expect(resolveImageUri(`ipfs://${cid}`)).toBe(
      `/api/rounds/uploads/image?cid=${cid}`,
    );
    expect(resolveImageUri("ipfs://bafy/path.png")).toBe(
      "https://ipfs.io/ipfs/bafy/path.png",
    );
    expect(resolveImageUri("ar://transaction")).toBe(
      "https://arweave.net/transaction",
    );
    expect(resolveImageUri("javascript:alert(1)")).toBe("about:blank");
  });

  it("validates the same UTF-8 byte lengths enforced by Solidity", () => {
    expect(
      validateSubmissionText(
        { title: "Lil", description: "A useful thing" },
        limits,
      ),
    ).toBeUndefined();
    expect(
      validateSubmissionText(
        { title: "🚀🚀🚀", description: "A useful thing" },
        limits,
      ),
    ).toContain("Title"); // 12 UTF-8 bytes, above the 10-byte maximum.
  });
});
