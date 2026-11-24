// @ts-nocheck -- Bun's test globals are executed by Bun and are not in the app tsconfig.
import { afterAll, beforeAll, describe, expect, it } from "bun:test";

const priorUploadBase = process.env.VITE_ROUNDS_UPLOAD_API_URL;
beforeAll(() => { process.env.VITE_ROUNDS_UPLOAD_API_URL = "/api/rounds/uploads"; });
afterAll(() => {
  if (priorUploadBase === undefined) delete process.env.VITE_ROUNDS_UPLOAD_API_URL;
  else process.env.VITE_ROUNDS_UPLOAD_API_URL = priorUploadBase;
});
import {
  encodeAbiParameters,
  encodeEventTopics,
  keccak256,
  toBytes,
} from "viem";

import {
  buildSubmissionMetadata,
  buildRoundMetadata,
  committedRoundAddressFromLogs,
  committedSubmissionIdFromLogs,
  isYouTubeUrl,
  parseYouTubeUrls,
  pinCommittedAdminImage,
  pinCommittedSubmission,
  pinCommittedRound,
  prepareHostedSubmission,
  prepareDeterministicSubmission,
  prepareDeterministicRound,
  validateImageFiles,
} from "./media";
import { roundFactoryV3Abi, roundV5Abi } from "./contracts";

function file(name: string, type: string, size: number): File {
  return { name, type, size } as File;
}

describe("Rounds submission media", () => {
  it("builds one deterministic round cover and canonical round metadata", async () => {
    const png = new File(
      [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 7])],
      "cover.png",
      { type: "image/png" },
    );
    const prepared = await prepareDeterministicRound({
      file: png,
      title: "Community round",
      description: "Fund public goods.",
    });
    expect(JSON.parse(prepared.json)).toEqual({
      schema: "lil-nouns-round-v1",
      title: "Community round",
      description: "Fund public goods.",
      image: prepared.image.uri,
    });
    expect(prepared.hash).toBe(keccak256(toBytes(prepared.json)));
    expect(
      JSON.parse(
        buildRoundMetadata({
          title: "A",
          description: "B",
          image: prepared.image.uri,
        }).json,
      ).image,
    ).toBe(prepared.image.uri);
  });

  it("pins a confirmed round with the exact prepared metadata and image CARs", async () => {
    const png = new File(
      [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 8])],
      "cover.png",
      { type: "image/png" },
    );
    const prepared = await prepareDeterministicRound({
      file: png,
      title: "Round",
      description: "Description",
    });
    const originalFetch = globalThis.fetch;
    let body: Record<string, unknown> | undefined;
    globalThis.fetch = (async (_input, init) => {
      body = JSON.parse(String(init?.body));
      return Response.json({
        data: {
          round: "0x2222222222222222222222222222222222222222",
          metadata: { cid: prepared.uri.slice(7) },
          image: { cid: prepared.image.cid },
        },
      });
    }) as typeof fetch;
    try {
      await pinCommittedRound({
        chainId: 11155111,
        round: "0x2222222222222222222222222222222222222222",
        prepared,
      });
      expect(body).toMatchObject({
        kind: "round",
        metadataCar: expect.any(String),
        image: { car: expect.any(String), mimeType: "image/png" },
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("extracts the created round address from the generation-5 factory receipt", () => {
    const factory = "0x1111111111111111111111111111111111111111";
    const round = "0x2222222222222222222222222222222222222222";
    const prizeVault = "0x3333333333333333333333333333333333333333";
    const creator = "0x4444444444444444444444444444444444444444";
    const topics = encodeEventTopics({
      abi: roundFactoryV3Abi,
      eventName: "RoundCreated",
      args: { round, prizeVault, creator },
    });
    const data = encodeAbiParameters(
      [
        { type: "uint32" },
        { type: "uint256" },
        { type: "bytes32" },
        { type: "bytes32" },
        { type: "bytes32" },
        { type: "bytes32" },
      ],
      [
        5,
        1n,
        `0x${"11".repeat(32)}`,
        `0x${"22".repeat(32)}`,
        `0x${"33".repeat(32)}`,
        `0x${"44".repeat(32)}`,
      ],
    );
    expect(
      committedRoundAddressFromLogs({
        factory,
        factoryGeneration: 5,
        logs: [{ address: factory, topics, data }],
      }),
    ).toBe(round);
  });

  it("rejects video, audio, SVG, oversized, over-count, and oversized batches", () => {
    expect(validateImageFiles([file("clip.mp4", "video/mp4", 10)])).toContain(
      "JPEG, PNG, WebP, or GIF",
    );
    expect(
      validateImageFiles([file("vector.svg", "image/svg+xml", 10)]),
    ).toContain("JPEG, PNG, WebP, or GIF");
    expect(
      validateImageFiles([
        file("large.png", "image/png", 10 * 1024 * 1024 + 1),
      ]),
    ).toContain("10 MiB");
    expect(
      validateImageFiles(
        Array.from({ length: 9 }, (_, index) =>
          file(`${index}.png`, "image/png", 1),
        ),
      ),
    ).toContain("eight");
    expect(
      validateImageFiles(
        Array.from({ length: 5 }, (_, index) =>
          file(`${index}.png`, "image/png", 9 * 1024 * 1024),
        ),
      ),
    ).toContain("40 MiB");
  });

  it("allows HTTPS YouTube links but rejects uploads and lookalike hosts", () => {
    expect(isYouTubeUrl("https://www.youtube.com/watch?v=abc123")).toBe(true);
    expect(isYouTubeUrl("https://m.youtube.com/watch?v=abc123")).toBe(true);
    expect(isYouTubeUrl("https://youtu.be/abc123")).toBe(true);
    expect(isYouTubeUrl("http://youtube.com/watch?v=abc123")).toBe(false);
    expect(
      isYouTubeUrl("https://youtube.com.evil.example/watch?v=abc123"),
    ).toBe(false);
    expect(
      parseYouTubeUrls(
        "https://youtu.be/abc123\nhttps://youtu.be/abc123\nhttps://www.youtube.com/watch?v=def456",
      ),
    ).toEqual([
      "https://youtu.be/abc123",
      "https://www.youtube.com/watch?v=def456",
    ]);
  });

  it("builds deterministic exact bytes and the matching keccak hash", () => {
    const built = buildSubmissionMetadata({
      title: "A Lil project",
      description: "Exact content bytes",
      images: ["ipfs://bafy-image-one", "ipfs://bafy-image-two"],
      youtubeUrls: ["https://youtu.be/example"],
    });

    expect(JSON.parse(built.json)).toEqual({
      schema: "lil-nouns-round-submission-v1",
      title: "A Lil project",
      description: "Exact content bytes",
      images: ["ipfs://bafy-image-one", "ipfs://bafy-image-two"],
      youtubeUrls: ["https://youtu.be/example"],
    });
    expect(built.hash).toBe(keccak256(toBytes(built.json)));
    expect(
      buildSubmissionMetadata({
        title: "A Lil project",
        description: "Exact content bytes",
        images: ["ipfs://bafy-image-one", "ipfs://bafy-image-two"],
        youtubeUrls: ["https://youtu.be/example"],
      }),
    ).toEqual(built);
  });

  it("prepares stable image and metadata CARs before upload", async () => {
    const png = new File(
      [
        new Uint8Array([
          0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3,
        ]),
      ],
      "entry.png",
      { type: "image/png" },
    );
    const input = {
      files: [png],
      title: "Exact title",
      description: "Exact description",
      youtubeUrls: ["https://youtu.be/example"],
    };
    const first = await prepareDeterministicSubmission(input);
    const second = await prepareDeterministicSubmission(input);
    expect(first.uri).toBe(second.uri);
    expect(first.metadataCar).toEqual(second.metadataCar);
    expect(first.images[0].cid).toBe(second.images[0].cid);
    expect(first.originalImageCount).toBe(1);
    expect(JSON.parse(first.json).images).toEqual([first.images[0].uri]);
    expect(first.hash).toBe(keccak256(toBytes(first.json)));
  });

  it("rejects spoofed image MIME before building a CAR", async () => {
    const spoofed = new File(
      [new TextEncoder().encode("not a png")],
      "fake.png",
      {
        type: "image/png",
      },
    );
    await expect(
      prepareDeterministicSubmission({
        files: [spoofed],
        title: "Title",
        description: "Description",
        youtubeUrls: [],
      }),
    ).rejects.toThrow("does not contain valid image/png");
  });

  it("uploads the exact hashed metadata bytes and returns the matching content URI", async () => {
    const originalFetch = globalThis.fetch;
    const imageCid = "bafybeigdyrztimagecidabcdefghijklmnop";
    const metadataCid = "bafybeigdyrztmetadatacidabcdefghijkl";
    let uploadedMetadata = "";
    globalThis.fetch = (async (input, init) => {
      const url = String(input);
      if (url.endsWith("/challenge")) {
        return Response.json({
          data: {
            challengeId: "challenge",
            message: "Authorize",
            expiresAt: "soon",
          },
        });
      }
      if (url.endsWith("/presign")) {
        return Response.json({
          data: {
            uploads: [
              {
                index: 0,
                name: "entry.png",
                type: "image/png",
                size: 3,
                url: "https://uploads.pinata.cloud/image",
              },
            ],
            sessionToken: "session",
            expiresAt: "soon",
          },
        });
      }
      if (url === "https://uploads.pinata.cloud/image") {
        return Response.json({ data: { cid: imageCid } });
      }
      if (url === "https://uploads.pinata.cloud/metadata") {
        const form = init?.body as FormData;
        uploadedMetadata = await (form.get("file") as File).text();
        return Response.json({ data: { cid: metadataCid } });
      }
      if (url.endsWith("/metadata")) {
        const request = JSON.parse(String(init?.body));
        expect(request.hash).toMatch(/^0x[0-9a-f]{64}$/);
        expect(request.size).toBeGreaterThan(0);
        return Response.json({
          data: {
            url: "https://uploads.pinata.cloud/metadata",
            contentType: "application/json",
            expiresIn: 60,
          },
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }) as typeof fetch;

    try {
      const result = await prepareHostedSubmission({
        wallet: "0x1111111111111111111111111111111111111111",
        round: "0x2222222222222222222222222222222222222222",
        chainId: 11155111,
        files: [
          new File([new Uint8Array([1, 2, 3])], "entry.png", {
            type: "image/png",
          }),
        ],
        title: "Exact title",
        description: "Exact description",
        youtubeUrls: ["https://youtu.be/example"],
        signMessage: async () => "0x1234",
      });
      expect(result.uri).toBe(`ipfs://${metadataCid}`);
      expect(result.imageUris).toEqual([`ipfs://${imageCid}`]);
      expect(uploadedMetadata).toBe(result.json);
      expect(result.hash).toBe(keccak256(toBytes(uploadedMetadata)));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("pins a V5 deterministic bundle only after an onchain submission id exists", async () => {
    const png = new File(
      [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 9])],
      "entry.png",
      { type: "image/png" },
    );
    const prepared = await prepareDeterministicSubmission({
      files: [png],
      title: "Committed first",
      description: "Pinned second",
      youtubeUrls: [],
    });
    const originalFetch = globalThis.fetch;
    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
    globalThis.fetch = (async (input, init) => {
      const body = JSON.parse(String(init?.body));
      calls.push({ url: String(input), body });
      return Response.json({
        data: {
          submissionId: "7",
          metadata: { cid: prepared.uri.slice(7), isDuplicate: false },
          images: [{ cid: prepared.images[0].cid, isDuplicate: true }],
        },
      });
    }) as typeof fetch;

    try {
      const result = await pinCommittedSubmission({
        chainId: 11155111,
        round: "0x2222222222222222222222222222222222222222",
        submissionId: 7n,
        prepared,
      });
      expect(result.submissionId).toBe("7");
      expect(calls).toHaveLength(1);
      expect(calls[0].url).toBe("/api/rounds/uploads/pin");
      expect(calls[0].body).toMatchObject({
        kind: "submission",
        chainId: 11155111,
        submissionId: "7",
        metadataCar: expect.any(String),
        images: [
          {
            name: "entry.png",
            mimeType: "image/png",
            car: expect.any(String),
          },
        ],
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("derives the committed submission id from the matching V5 receipt event", () => {
    const owner = "0x1111111111111111111111111111111111111111";
    const round = "0x2222222222222222222222222222222222222222";
    const metadataHash = `0x${"44".repeat(32)}`;
    const topics = encodeEventTopics({
      abi: roundV5Abi,
      eventName: "SubmissionCreated",
      args: { submissionId: 7n, owner, submissionType: 0 },
    });
    const data = encodeAbiParameters(
      [
        { type: "bytes32" },
        { type: "bytes32" },
        { type: "uint32" },
        { type: "uint32" },
        { type: "uint8" },
        { type: "string" },
        { type: "bytes32" },
      ],
      [
        `0x${"11".repeat(32)}`,
        `0x${"22".repeat(32)}`,
        10,
        20,
        1,
        "ipfs://bafy-metadata",
        metadataHash,
      ],
    );
    expect(
      committedSubmissionIdFromLogs({
        round,
        metadataHash,
        logs: [{ address: round, topics, data }],
      }),
    ).toBe(7n);
  });

  it("pins an admin-assisted image only after its append index is onchain", async () => {
    const gif = new File(
      [new TextEncoder().encode("GIF89a-image")],
      "assist.gif",
      {
        type: "image/gif",
      },
    );
    const prepared = (
      await prepareDeterministicSubmission({
        files: [gif],
        title: "Admin assist",
        description: "Exact append",
        youtubeUrls: [],
      })
    ).images[0];
    const originalFetch = globalThis.fetch;
    let request: Record<string, unknown> | undefined;
    globalThis.fetch = (async (_input, init) => {
      request = JSON.parse(String(init?.body));
      return Response.json({
        data: {
          submissionId: "4",
          imageIndex: 2,
          image: { cid: prepared.cid, isDuplicate: false },
        },
      });
    }) as typeof fetch;
    try {
      await pinCommittedAdminImage({
        chainId: 11155111,
        round: "0x2222222222222222222222222222222222222222",
        submissionId: 4n,
        imageIndex: 2,
        prepared,
      });
      expect(request).toMatchObject({
        kind: "admin-image",
        submissionId: "4",
        imageIndex: 2,
        mimeType: "image/gif",
        car: expect.any(String),
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
