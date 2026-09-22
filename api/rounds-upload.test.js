const { describe, expect, it } = require("bun:test");
const { Wallet } = require("ethers");

const {
  UploadError,
  assertRoundAcceptsSponsoredUpload,
  assertLegacyUploadVersion,
  authorizeImages,
  buildChallengeMessage,
  createChallenge,
  createPinataSignBody,
  hashUploadIntent,
  validateUploadIntent,
} = require("./_rounds-upload");

const wallet = "0x1111111111111111111111111111111111111111";
const round = "0x2222222222222222222222222222222222222222";
const env = {
  PINATA_JWT: "test-only-jwt",
  ROUNDS_UPLOAD_AUTH_SECRET: "test-only-secret-that-is-at-least-32-characters",
  ROUNDS_UPLOAD_RPC_URL: "http://127.0.0.1:8545",
  ROUNDS_UPLOAD_CHAIN_ID: "11155111",
  ROUNDS_UPLOAD_FACTORY_ADDRESS: "0x3333333333333333333333333333333333333333",
};

function intent(files) {
  return { wallet, round, chainId: 11155111, files };
}

describe("Rounds upload server policy", () => {
  it("accepts the exact image MIME allowlist and rejects SVG/video/audio", () => {
    for (const type of ["image/jpeg", "image/png", "image/webp", "image/gif"]) {
      expect(
        validateUploadIntent(intent([{ name: "entry", type, size: 123 }])),
      ).toMatchObject({ files: [{ type }] });
    }

    for (const type of ["image/svg+xml", "video/mp4", "audio/mpeg"]) {
      expect(() =>
        validateUploadIntent(intent([{ name: "bad", type, size: 123 }])),
      ).toThrow(UploadError);
    }
  });

  it("enforces eight images, ten MiB each, and forty MiB total", () => {
    const mib = 1024 * 1024;
    expect(() =>
      validateUploadIntent(
        intent([
          { name: "too-large.png", type: "image/png", size: 10 * mib + 1 },
        ]),
      ),
    ).toThrow("10 MiB");
    expect(() =>
      validateUploadIntent(
        intent(
          Array.from({ length: 9 }, (_, index) => ({
            name: `${index}.png`,
            type: "image/png",
            size: 1,
          })),
        ),
      ),
    ).toThrow("eight");
    expect(() =>
      validateUploadIntent(
        intent(
          Array.from({ length: 5 }, (_, index) => ({
            name: `${index}.png`,
            type: "image/png",
            size: 9 * mib,
          })),
        ),
      ),
    ).toThrow("40 MiB");
  });

  it("binds the challenge to origin, wallet, round, chain, nonce, and intent", () => {
    const uploadIntent = validateUploadIntent(
      intent([{ name: "entry.png", type: "image/png", size: 42 }]),
    );
    const intentHash = hashUploadIntent(uploadIntent);
    const message = buildChallengeMessage({
      domain: "rounds.example",
      wallet,
      round,
      chainId: 11155111,
      nonce: "abc123",
      intentHash,
      issuedAt: "2026-09-18T00:00:00.000Z",
      expiresAt: "2026-09-18T00:05:00.000Z",
    });

    expect(message).toContain("rounds.example wants you to authorize");
    expect(message).toContain(wallet);
    expect(message).toContain(round);
    expect(message).toContain("Chain ID: 11155111");
    expect(message).toContain("Nonce: abc123");
    expect(message).toContain(`Upload intent: ${intentHash}`);
  });

  it("creates a narrow Pinata signing payload", () => {
    expect(
      createPinataSignBody(
        { name: "entry.png", type: "image/png", size: 2048 },
        { app: "lil-nouns-rounds", kind: "submission-image" },
      ),
    ).toEqual({
      network: "public",
      expires: 60,
      filename: "entry.png",
      allow_mime_types: ["image/png"],
      max_file_size: 2048,
      keyvalues: { app: "lil-nouns-rounds", kind: "submission-image" },
    });
  });

  it("does not consume a challenge for an invalid signature and consumes it once for the signer", async () => {
    const signer = Wallet.createRandom();
    const uploadIntent = validateUploadIntent({
      wallet: signer.address,
      round,
      chainId: 11155111,
      files: [{ name: "entry.png", type: "image/png", size: 2048 }],
    });
    const message = buildChallengeMessage({
      domain: "rounds.example",
      ...uploadIntent,
      nonce: "abc123",
      intentHash: hashUploadIntent(uploadIntent),
      issuedAt: "2026-09-18T00:00:00.000Z",
      expiresAt: "2099-09-18T00:05:00.000Z",
    });
    const state = { consumed: false, sessionInserted: false };
    const db = {
      async query(sql) {
        if (sql.includes("CREATE TABLE")) return { rowCount: 0, rows: [] };
        if (sql.includes("SELECT message")) {
          return state.consumed
            ? { rowCount: 0, rows: [] }
            : { rowCount: 1, rows: [{ message }] };
        }
        if (sql.includes("UPDATE rounds_upload_challenges")) {
          if (state.consumed) return { rowCount: 0, rows: [] };
          state.consumed = true;
          return { rowCount: 1, rows: [{ id: "challenge" }] };
        }
        if (sql.includes("INSERT INTO rounds_upload_sessions")) {
          state.sessionInserted = true;
          return { rowCount: 1, rows: [] };
        }
        throw new Error(`Unexpected query: ${sql}`);
      },
    };
    const body = {
      ...uploadIntent,
      challengeId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    };
    const verifyRound = async () => {};
    const fetchImpl = async () => ({
      ok: true,
      json: async () => ({
        data: "https://uploads.pinata.cloud/v3/files/test",
      }),
    });

    await expect(
      authorizeImages({
        body: { ...body, signature: "0x1234" },
        env,
        db,
        verifyRound,
        fetchImpl,
      }),
    ).rejects.toMatchObject({ code: "INVALID_SIGNATURE" });
    expect(state.consumed).toBe(false);

    const signature = await signer.signMessage(message);
    const authorization = await authorizeImages({
      body: { ...body, signature },
      env,
      db,
      verifyRound,
      fetchImpl,
    });
    expect(authorization.uploads).toHaveLength(1);
    expect(state.consumed).toBe(true);
    expect(state.sessionInserted).toBe(true);

    await expect(
      authorizeImages({
        body: { ...body, signature },
        env,
        db,
        verifyRound,
        fetchImpl,
      }),
    ).rejects.toMatchObject({ code: "CHALLENGE_EXPIRED" });
  });

  it("fails closed before storing challenges for unregistered and out-of-phase rounds", async () => {
    let queryCount = 0;
    const db = {
      query: async () => {
        queryCount += 1;
        return { rowCount: 0, rows: [] };
      },
    };
    const base = {
      body: intent([{ name: "entry.png", type: "image/png", size: 100 }]),
      headers: { host: "rounds.example" },
      ip: "127.0.0.1",
      env,
      db,
    };
    await expect(
      createChallenge({
        ...base,
        verifyRound: async () => {
          throw new UploadError(
            "UNREGISTERED_ROUND",
            "Sponsored uploads require a registered round.",
            403,
          );
        },
      }),
    ).rejects.toMatchObject({ code: "UNREGISTERED_ROUND" });
    await expect(
      createChallenge({
        ...base,
        verifyRound: async () => {
          throw new UploadError(
            "SUBMISSIONS_CLOSED",
            "Submissions are closed.",
            409,
          );
        },
      }),
    ).rejects.toMatchObject({ code: "SUBMISSIONS_CLOSED" });
    expect(queryCount).toBe(0);
  });

  it("rejects closed phases and exhausted wallet or round submission capacity", () => {
    const open = {
      timestamp: 150,
      opens: 100,
      closes: 200,
      walletSubmissions: 0n,
      walletLimit: 2n,
      submissionCount: 1n,
      submissionLimit: 10n,
    };
    expect(() => assertRoundAcceptsSponsoredUpload(open)).not.toThrow();
    expect(() =>
      assertRoundAcceptsSponsoredUpload({ ...open, timestamp: 200 }),
    ).toThrow(expect.objectContaining({ code: "SUBMISSIONS_CLOSED" }));
    expect(() =>
      assertRoundAcceptsSponsoredUpload({ ...open, walletSubmissions: 2n }),
    ).toThrow(expect.objectContaining({ code: "WALLET_SUBMISSION_LIMIT" }));
    expect(() =>
      assertRoundAcceptsSponsoredUpload({ ...open, submissionCount: 10n }),
    ).toThrow(expect.objectContaining({ code: "ROUND_SUBMISSION_LIMIT" }));
  });

  it("disables the PostgreSQL challenge/session flow for V5 rounds", () => {
    expect(() => assertLegacyUploadVersion(4)).not.toThrow();
    expect(() => assertLegacyUploadVersion(5)).toThrow(
      expect.objectContaining({ code: "STATELESS_UPLOAD_REQUIRED" }),
    );
  });
});
