const { describe, expect, it } = require("bun:test");
const { keccak256 } = require("viem");

describe("stateless committed CAR verification", () => {
  it("recognizes V8 and V7 rounds alongside the configured Sepolia factory", async () => {
    const { allowedRoundFactories } = await import(
      "./_rounds-stateless-upload.mjs"
    );
    const v6 = "0xC7e45B337975f1EC07cac943d0CeC6609E544377";
    const v7 = "0x4c05EF874bA1AF1D97C0708075CD531a38283454";
    const v8 = "0xCa648c6b3e53b126Ad6bC00b248a7Ac236C3aaF6";
    expect(allowedRoundFactories(11155111, v6)).toEqual([
      v6.toLowerCase(),
      v8.toLowerCase(),
      v7.toLowerCase(),
    ]);
    expect(allowedRoundFactories(11155111, v7)).toEqual([
      v7.toLowerCase(),
      v8.toLowerCase(),
    ]);
    expect(allowedRoundFactories(11155111, v8)).toEqual([
      v8.toLowerCase(),
      v7.toLowerCase(),
    ]);
    expect(allowedRoundFactories(1, v6)).toEqual([v6.toLowerCase()]);
  });

  it("pins only an exact registered round metadata and cover-image bundle", async () => {
    const { createDeterministicCar } = await import(
      "../packages/rounds-media/index.mjs"
    );
    const { handleStatelessPinRequest } = await import(
      "./_rounds-stateless-upload.mjs"
    );
    const pngBytes = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 5,
    ]);
    const image = await createDeterministicCar(pngBytes);
    const metadataBytes = new TextEncoder().encode(
      JSON.stringify({
        schema: "lil-nouns-round-v1",
        title: "Round",
        description: "Exact",
        image: image.uri,
      }),
    );
    const metadata = await createDeterministicCar(metadataBytes);
    const expected = [image.cid, metadata.cid];
    let upload = 0;
    const result = await handleStatelessPinRequest({
      method: "POST",
      body: {
        kind: "round",
        chainId: 11155111,
        round: "0x2222222222222222222222222222222222222222",
        metadataCar: Buffer.from(metadata.car).toString("base64"),
        image: {
          car: Buffer.from(image.car).toString("base64"),
          mimeType: "image/png",
          name: "cover.png",
        },
      },
      env: { PINATA_JWT: "test-only" },
      loadCommitment: async () => ({
        kind: "round",
        creator: "0x1111111111111111111111111111111111111111",
        metadataURI: metadata.uri,
        metadataHash: keccak256(metadataBytes),
      }),
      fetchImpl: async (_url, init) => {
        const cid = expected[upload++];
        return Response.json({
          data: { id: `file-${upload}`, cid, is_duplicate: false },
        });
      },
    });
    expect(result.status).toBe(200);
    expect(result.body.data).toMatchObject({
      round: "0x2222222222222222222222222222222222222222",
      image: { cid: image.cid },
      metadata: { cid: metadata.cid },
    });
  });

  it("rejects round metadata whose image URI does not match the supplied image CAR", async () => {
    const { createDeterministicCar } = await import(
      "../packages/rounds-media/index.mjs"
    );
    const { handleStatelessPinRequest } = await import(
      "./_rounds-stateless-upload.mjs"
    );
    const image = await createDeterministicCar(
      new TextEncoder().encode("GIF89a-cover"),
    );
    const metadataBytes = new TextEncoder().encode(
      JSON.stringify({
        schema: "lil-nouns-round-v1",
        title: "Round",
        description: "Exact",
        image: "ipfs://bafywrong",
      }),
    );
    const metadata = await createDeterministicCar(metadataBytes);
    const result = await handleStatelessPinRequest({
      method: "POST",
      body: {
        kind: "round",
        chainId: 11155111,
        round: "0x2222222222222222222222222222222222222222",
        metadataCar: Buffer.from(metadata.car).toString("base64"),
        image: {
          car: Buffer.from(image.car).toString("base64"),
          mimeType: "image/gif",
        },
      },
      env: { PINATA_JWT: "test-only" },
      loadCommitment: async () => ({
        kind: "round",
        creator: "0x1111111111111111111111111111111111111111",
        metadataURI: metadata.uri,
        metadataHash: keccak256(metadataBytes),
      }),
    });
    expect(result.status).toBe(422);
    expect(result.body.error.message).toContain("cover image");
  });

  it("accepts exact onchain metadata and reconciles the declared image count", async () => {
    const { createDeterministicCar } = await import(
      "../packages/rounds-media/index.mjs"
    );
    const { verifyCommittedCar } = await import(
      "./_rounds-stateless-upload.mjs"
    );
    const bytes = new TextEncoder().encode(
      JSON.stringify({
        title: "Entry",
        description: "Exact",
        images: ["ipfs://bafyimage"],
      }),
    );
    const content = await createDeterministicCar(bytes);
    const verified = await verifyCommittedCar({
      car: content.car,
      commitment: {
        kind: "metadata",
        uri: content.uri,
        hash: keccak256(bytes),
        declaredOriginalImageCount: 1,
      },
    });
    expect(verified.cid).toBe(content.cid);
    expect(verified.metadata.images).toHaveLength(1);
  });

  it("rejects count mismatches, altered hashes, roots, and spoofed image MIME", async () => {
    const { createDeterministicCar } = await import(
      "../packages/rounds-media/index.mjs"
    );
    const { verifyCommittedCar } = await import(
      "./_rounds-stateless-upload.mjs"
    );
    const metadataBytes = new TextEncoder().encode(
      JSON.stringify({ images: ["ipfs://bafyimage"] }),
    );
    const metadata = await createDeterministicCar(metadataBytes);
    await expect(
      verifyCommittedCar({
        car: metadata.car,
        commitment: {
          kind: "metadata",
          uri: metadata.uri,
          hash: keccak256(metadataBytes),
          declaredOriginalImageCount: 0,
        },
      }),
    ).rejects.toThrow("image count");
    await expect(
      verifyCommittedCar({
        car: metadata.car,
        commitment: {
          kind: "metadata",
          uri: metadata.uri,
          hash: `0x${"11".repeat(32)}`,
          declaredOriginalImageCount: 1,
        },
      }),
    ).rejects.toThrow("integrity hash");
    const fakePng = await createDeterministicCar(
      new TextEncoder().encode("not png"),
    );
    await expect(
      verifyCommittedCar({
        car: fakePng.car,
        commitment: {
          kind: "image",
          uri: fakePng.uri,
          hash: keccak256(fakePng.bytes),
          mimeType: "image/png",
        },
      }),
    ).rejects.toThrow("allowed image MIME");
  });

  it("verifies the ordered original-image bundle and aggregate bytes", async () => {
    const { createDeterministicCar } = await import(
      "../packages/rounds-media/index.mjs"
    );
    const { verifyOriginalSubmissionBundle } = await import(
      "./_rounds-stateless-upload.mjs"
    );
    const pngBytes = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 7,
    ]);
    const image = await createDeterministicCar(pngBytes);
    const metadataBytes = new TextEncoder().encode(
      JSON.stringify({ images: [image.uri] }),
    );
    const metadata = await createDeterministicCar(metadataBytes);
    const verified = await verifyOriginalSubmissionBundle({
      metadataCar: metadata.car,
      imageCars: [image.car],
      imageMimeTypes: ["image/png"],
      onchainSubmission: {
        metadataURI: metadata.uri,
        metadataHash: keccak256(metadataBytes),
        originalImageCount: 1,
      },
    });
    expect(verified.images[0].cid).toBe(image.cid);
    expect(verified.totalBytes).toBe(pngBytes.byteLength);

    await expect(
      verifyOriginalSubmissionBundle({
        metadataCar: metadata.car,
        imageCars: [],
        imageMimeTypes: [],
        onchainSubmission: {
          metadataURI: metadata.uri,
          metadataHash: keccak256(metadataBytes),
          originalImageCount: 1,
        },
      }),
    ).rejects.toThrow("ordered metadata image list");
  });

  it("pins the exact raw blocks from an original CAR bundle with stable orphan-control metadata", async () => {
    const { createDeterministicCar } = await import(
      "../packages/rounds-media/index.mjs"
    );
    const { handleStatelessPinRequest } = await import(
      "./_rounds-stateless-upload.mjs"
    );
    const pngBytes = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 7,
    ]);
    const image = await createDeterministicCar(pngBytes);
    const metadataBytes = new TextEncoder().encode(
      JSON.stringify({ images: [image.uri] }),
    );
    const metadata = await createDeterministicCar(metadataBytes);
    const requests = [];
    const expectedCids = [image.cid, metadata.cid];
    const result = await handleStatelessPinRequest({
      method: "POST",
      body: {
        kind: "submission",
        chainId: 11155111,
        round: "0x2222222222222222222222222222222222222222",
        submissionId: "3",
        metadataCar: Buffer.from(metadata.car).toString("base64"),
        images: [
          {
            car: Buffer.from(image.car).toString("base64"),
            name: "entry.png",
            mimeType: "image/png",
          },
        ],
      },
      env: { PINATA_JWT: "test-only" },
      loadCommitment: async () => ({
        kind: "metadata",
        owner: "0x1111111111111111111111111111111111111111",
        metadataURI: metadata.uri,
        metadataHash: keccak256(metadataBytes),
        originalImageCount: 1,
      }),
      fetchImpl: async (url, init) => {
        expect(url).toBe("https://uploads.pinata.cloud/v3/files");
        expect(init.headers.Authorization).toBe("Bearer test-only");
        const form = init.body;
        expect(form.get("network")).toBe("public");
        expect(form.get("car")).toBeNull();
        const keyvalues = JSON.parse(String(form.get("keyvalues")));
        expect(keyvalues).toMatchObject({
          app: "lil-nouns-rounds",
          round: "0x2222222222222222222222222222222222222222",
          submission: "3",
        });
        const cid = expectedCids[requests.length];
        requests.push({ cid, kind: keyvalues.kind });
        return Response.json({
          data: { id: `file-${requests.length}`, cid, is_duplicate: false },
        });
      },
    });

    expect(result.status).toBe(200);
    expect(result.body.data).toMatchObject({
      submissionId: "3",
      metadata: { cid: metadata.cid },
      images: [{ cid: image.cid }],
    });
    expect(requests).toEqual([
      { cid: image.cid, kind: "submission-image" },
      { cid: metadata.cid, kind: "submission-metadata" },
    ]);
  });

  it("rejects a Pinata CID that does not equal the committed CAR root", async () => {
    const { createDeterministicCar } = await import(
      "../packages/rounds-media/index.mjs"
    );
    const { handleStatelessPinRequest } = await import(
      "./_rounds-stateless-upload.mjs"
    );
    const metadataBytes = new TextEncoder().encode(
      JSON.stringify({ images: [] }),
    );
    const metadata = await createDeterministicCar(metadataBytes);
    const result = await handleStatelessPinRequest({
      method: "POST",
      body: {
        kind: "submission",
        chainId: 11155111,
        round: "0x2222222222222222222222222222222222222222",
        submissionId: "0",
        metadataCar: Buffer.from(metadata.car).toString("base64"),
        images: [],
      },
      env: { PINATA_JWT: "test-only" },
      loadCommitment: async () => ({
        kind: "metadata",
        owner: "0x1111111111111111111111111111111111111111",
        metadataURI: metadata.uri,
        metadataHash: keccak256(metadataBytes),
        originalImageCount: 0,
      }),
      fetchImpl: async () =>
        Response.json({
          data: {
            id: "wrong",
            cid: "bafkreiaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          },
        }),
    });

    expect(result.status).toBe(502);
    expect(result.body.error.code).toBe("PINATA_CID_MISMATCH");
  });

  it("pins only the exact onchain admin-added image commitment", async () => {
    const { createDeterministicCar } = await import(
      "../packages/rounds-media/index.mjs"
    );
    const { handleStatelessPinRequest } = await import(
      "./_rounds-stateless-upload.mjs"
    );
    const gifBytes = new TextEncoder().encode("GIF89a-image");
    const image = await createDeterministicCar(gifBytes);
    const result = await handleStatelessPinRequest({
      method: "POST",
      body: {
        kind: "admin-image",
        chainId: 11155111,
        round: "0x2222222222222222222222222222222222222222",
        submissionId: "4",
        imageIndex: 1,
        car: Buffer.from(image.car).toString("base64"),
        name: "assisted.gif",
        mimeType: "image/gif",
      },
      env: { PINATA_JWT: "test-only" },
      loadCommitment: async () => ({
        kind: "admin-image",
        uri: image.uri,
        hash: keccak256(gifBytes),
        signerA: "0x1111111111111111111111111111111111111111",
        signerB: "0x3333333333333333333333333333333333333333",
      }),
      fetchImpl: async (_url, init) => {
        const keyvalues = JSON.parse(String(init.body.get("keyvalues")));
        expect(keyvalues).toMatchObject({
          kind: "admin-image",
          imageIndex: "1",
        });
        return Response.json({
          data: { id: "admin-image", cid: image.cid, is_duplicate: true },
        });
      },
    });

    expect(result.status).toBe(200);
    expect(result.body.data.image).toMatchObject({
      cid: image.cid,
      isDuplicate: true,
    });
  });
});
