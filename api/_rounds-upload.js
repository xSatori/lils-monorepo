const {
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
} = require("node:crypto");
const {
  Contract,
  JsonRpcProvider,
  getAddress,
  isAddress,
  verifyMessage,
} = require("ethers");
const { Pool } = require("pg");

const ALLOWED_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_IMAGE_COUNT = 8;
const MAX_TOTAL_IMAGE_BYTES = 40 * 1024 * 1024;
const MAX_METADATA_BYTES = 64 * 1024;
const PRESIGNED_URL_SECONDS = 60;
const CHALLENGE_SECONDS = 5 * 60;
const SESSION_SECONDS = 10 * 60;
const MAX_CHALLENGES_PER_WALLET_HOUR = 12;
const MAX_CHALLENGES_PER_CLIENT_HOUR = 30;

const DATABASE_URL_KEYS = [
  "ROUNDS_UPLOAD_DATABASE_URL",
  "RAILWAY_DATABASE_PUBLIC_URL",
  "DATABASE_PUBLIC_URL",
  "POSTGRES_PUBLIC_URL",
  "DATABASE_URL",
  "POSTGRES_URL",
  "POSTGRES_URL_NON_POOLING",
  "NEON_DATABASE_URL",
  "PONDER_DATABASE_URL",
  "POSTGRES_PRISMA_URL",
];

class UploadError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = "UploadError";
    this.code = code;
    this.status = status;
  }
}

function sanitizeFileName(value) {
  const cleaned = String(value || "image")
    .replace(/[\\/\x00-\x1f\x7f]+/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  return cleaned || "image";
}

function validateUploadIntent(input) {
  if (!input || !isAddress(input.wallet) || !isAddress(input.round)) {
    throw new UploadError(
      "INVALID_ADDRESS",
      "A valid wallet and round address are required.",
    );
  }
  const chainId = Number(input.chainId);
  if (!Number.isSafeInteger(chainId) || chainId <= 0) {
    throw new UploadError("INVALID_CHAIN", "A valid chain ID is required.");
  }
  if (!Array.isArray(input.files)) {
    throw new UploadError(
      "INVALID_FILES",
      "The image manifest must be an array.",
    );
  }
  if (input.files.length > MAX_IMAGE_COUNT) {
    throw new UploadError(
      "TOO_MANY_IMAGES",
      "A submission may include at most eight images.",
    );
  }

  let totalBytes = 0;
  const files = input.files.map((file) => {
    const type = String(file?.type || "").toLowerCase();
    const size = Number(file?.size);
    if (!ALLOWED_IMAGE_MIME_TYPES.has(type)) {
      throw new UploadError(
        "INVALID_IMAGE_TYPE",
        "Images must be JPEG, PNG, WebP, or GIF. Video, audio, and SVG are not accepted.",
      );
    }
    if (!Number.isSafeInteger(size) || size <= 0 || size > MAX_IMAGE_BYTES) {
      throw new UploadError(
        "IMAGE_TOO_LARGE",
        "Each image must be no larger than 10 MiB.",
      );
    }
    totalBytes += size;
    return { name: sanitizeFileName(file?.name), type, size };
  });

  if (totalBytes > MAX_TOTAL_IMAGE_BYTES) {
    throw new UploadError(
      "BATCH_TOO_LARGE",
      "Image uploads may total at most 40 MiB.",
    );
  }
  return {
    wallet: getAddress(input.wallet),
    round: getAddress(input.round),
    chainId,
    files,
  };
}

function hashUploadIntent(intent) {
  const canonical = JSON.stringify({
    wallet: intent.wallet.toLowerCase(),
    round: intent.round.toLowerCase(),
    chainId: intent.chainId,
    files: intent.files.map(({ name, type, size }) => ({ name, type, size })),
  });
  return `0x${createHash("sha256").update(canonical).digest("hex")}`;
}

function buildChallengeMessage({
  domain,
  wallet,
  round,
  chainId,
  nonce,
  intentHash,
  issuedAt,
  expiresAt,
}) {
  return [
    `${domain} wants you to authorize a sponsored Lil Nouns Rounds upload.`,
    "",
    `Wallet: ${wallet}`,
    `Round: ${round}`,
    `Chain ID: ${chainId}`,
    `Upload intent: ${intentHash}`,
    `Nonce: ${nonce}`,
    `Issued at: ${issuedAt}`,
    `Expires at: ${expiresAt}`,
    "",
    "This signature does not submit a transaction or move funds.",
  ].join("\n");
}

function createPinataSignBody(file, keyvalues = {}) {
  const body = {
    network: "public",
    expires: PRESIGNED_URL_SECONDS,
    filename: sanitizeFileName(file.name),
    allow_mime_types: [file.type],
    max_file_size: file.size,
  };
  if (Object.keys(keyvalues).length) body.keyvalues = keyvalues;
  return body;
}

function getDatabaseUrl(env) {
  for (const key of DATABASE_URL_KEYS) {
    const value = env[key];
    if (value && value.trim()) return value.trim();
  }
  return null;
}

let pool;
let schemaReady;

function getPool(env) {
  if (pool) return pool;
  const connectionString = getDatabaseUrl(env);
  if (!connectionString) {
    throw new UploadError(
      "HOSTED_UPLOAD_UNAVAILABLE",
      "Hosted uploads are unavailable. Use a manual content-addressed URI and hash.",
      503,
    );
  }
  pool = new Pool({
    connectionString,
    ssl: connectionString.includes("sslmode=disable")
      ? false
      : { rejectUnauthorized: false },
    max: 2,
    idleTimeoutMillis: 5_000,
    connectionTimeoutMillis: 3_000,
  });
  return pool;
}

async function ensureSchema(db) {
  if (!schemaReady) {
    schemaReady = db
      .query(
        `
        CREATE TABLE IF NOT EXISTS rounds_upload_challenges (
          id text PRIMARY KEY,
          wallet text NOT NULL,
          round_address text NOT NULL,
          chain_id bigint NOT NULL,
          intent_hash text NOT NULL,
          message text NOT NULL,
          client_hash text NOT NULL,
          expires_at timestamptz NOT NULL,
          consumed_at timestamptz,
          created_at timestamptz NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS rounds_upload_challenges_wallet_created_idx
          ON rounds_upload_challenges (wallet, created_at);
        CREATE INDEX IF NOT EXISTS rounds_upload_challenges_client_created_idx
          ON rounds_upload_challenges (client_hash, created_at);
        CREATE TABLE IF NOT EXISTS rounds_upload_sessions (
          token_hash text PRIMARY KEY,
          wallet text NOT NULL,
          round_address text NOT NULL,
          chain_id bigint NOT NULL,
          expires_at timestamptz NOT NULL,
          consumed_at timestamptz,
          created_at timestamptz NOT NULL DEFAULT now()
        );
      `,
      )
      .catch((error) => {
        schemaReady = null;
        throw error;
      });
  }
  await schemaReady;
}

function requireConfiguration(env) {
  if (
    !env.PINATA_JWT ||
    !env.ROUNDS_UPLOAD_AUTH_SECRET ||
    env.ROUNDS_UPLOAD_AUTH_SECRET.length < 32 ||
    !env.ROUNDS_UPLOAD_RPC_URL ||
    !env.ROUNDS_UPLOAD_CHAIN_ID ||
    !isAddress(env.ROUNDS_UPLOAD_FACTORY_ADDRESS)
  ) {
    throw new UploadError(
      "HOSTED_UPLOAD_UNAVAILABLE",
      "Hosted uploads are unavailable. Use a manual content-addressed URI and hash.",
      503,
    );
  }
}

function configuredUploadNetwork(env) {
  const chainId = Number(env.ROUNDS_UPLOAD_CHAIN_ID);
  if (!Number.isSafeInteger(chainId) || chainId <= 0) {
    throw new UploadError(
      "HOSTED_UPLOAD_UNAVAILABLE",
      "Hosted uploads are unavailable. Use a manual content-addressed URI and hash.",
      503,
    );
  }
  return {
    chainId,
    factory: getAddress(env.ROUNDS_UPLOAD_FACTORY_ADDRESS),
    rpcUrl: env.ROUNDS_UPLOAD_RPC_URL,
  };
}

function assertRoundAcceptsSponsoredUpload({
  timestamp,
  opens,
  closes,
  walletSubmissions,
  walletLimit,
  submissionCount,
  submissionLimit,
}) {
  if (timestamp < opens || timestamp >= closes) {
    throw new UploadError(
      "SUBMISSIONS_CLOSED",
      "Sponsored uploads are available only while this round accepts submissions.",
      409,
    );
  }
  if (walletSubmissions >= walletLimit) {
    throw new UploadError(
      "WALLET_SUBMISSION_LIMIT",
      "This wallet has reached the round submission limit.",
      409,
    );
  }
  if (submissionCount >= submissionLimit) {
    throw new UploadError(
      "ROUND_SUBMISSION_LIMIT",
      "This round has reached its total submission limit.",
      409,
    );
  }
}

function assertLegacyUploadVersion(version) {
  if (Number(version) >= 5) {
    throw new UploadError(
      "STATELESS_UPLOAD_REQUIRED",
      "V5 rounds commit media onchain before using the database-free pin endpoint.",
      409,
    );
  }
}

async function verifyConfiguredRoundEligibility(intent, env) {
  const configured = configuredUploadNetwork(env);
  if (intent.chainId !== configured.chainId) {
    throw new UploadError(
      "UNSUPPORTED_CHAIN",
      "Sponsored uploads are not enabled for this chain.",
      403,
    );
  }

  const provider = new JsonRpcProvider(configured.rpcUrl, configured.chainId, {
    staticNetwork: true,
  });
  try {
    const network = await provider.getNetwork();
    if (Number(network.chainId) !== configured.chainId) {
      throw new UploadError(
        "RPC_CHAIN_MISMATCH",
        "The upload authorization network is unavailable.",
        503,
      );
    }
    const factory = new Contract(
      configured.factory,
      ["function isRound(address) view returns (bool)"],
      provider,
    );
    if (!(await factory.isRound(intent.round))) {
      throw new UploadError(
        "UNREGISTERED_ROUND",
        "Sponsored uploads require a registered round.",
        403,
      );
    }

    const round = new Contract(
      intent.round,
      [
        "function deployedImplementationVersion() view returns (uint32)",
        "function submissionsOpen() view returns (uint40)",
        "function submissionsClose() view returns (uint40)",
        "function votingStart() view returns (uint40)",
        "function submissionsByWallet(address) view returns (uint256)",
        "function maxSubmissionsPerWallet() view returns (uint16)",
        "function submissionCount() view returns (uint256)",
        "function maxSubmissions() view returns (uint16)",
      ],
      provider,
    );
    const block = await provider.getBlock("latest");
    if (!block) throw new Error("Latest block unavailable");
    assertLegacyUploadVersion(await round.deployedImplementationVersion());
    const opens = Number(await round.submissionsOpen());
    let closes;
    try {
      closes = Number(await round.submissionsClose());
    } catch {
      // V1 rounds predate the explicit review window; votingStart is their close boundary.
      closes = Number(await round.votingStart());
    }
    const [walletSubmissions, walletLimit, submissionCount, submissionLimit] =
      await Promise.all([
        round.submissionsByWallet(intent.wallet),
        round.maxSubmissionsPerWallet(),
        round.submissionCount(),
        round.maxSubmissions(),
      ]);
    assertRoundAcceptsSponsoredUpload({
      timestamp: block.timestamp,
      opens,
      closes,
      walletSubmissions,
      walletLimit,
      submissionCount,
      submissionLimit,
    });
  } catch (error) {
    if (error instanceof UploadError) throw error;
    throw new UploadError(
      "ROUND_CHECK_UNAVAILABLE",
      "The round could not be verified. Use a manual content-addressed URI and hash.",
      503,
    );
  } finally {
    provider.destroy();
  }
}

function requestDomain(headers) {
  const host = String(headers.host || headers["x-forwarded-host"] || "")
    .split(",")[0]
    .trim()
    .toLowerCase();
  if (!/^[a-z0-9.-]+(?::\d{1,5})?$/.test(host)) {
    throw new UploadError(
      "INVALID_ORIGIN",
      "The request host is invalid.",
      400,
    );
  }
  return host;
}

function clientHash(ip, secret) {
  return createHmac("sha256", secret)
    .update(String(ip || "unknown"))
    .digest("hex");
}

function tokenHash(token) {
  return createHash("sha256").update(token).digest("hex");
}

async function createChallenge({
  body,
  headers,
  ip,
  env,
  db,
  now = new Date(),
  verifyRound = verifyConfiguredRoundEligibility,
}) {
  requireConfiguration(env);
  const intent = validateUploadIntent(body);
  await verifyRound(intent, env);
  await ensureSchema(db);
  const id = randomUUID();
  const nonce = randomBytes(16).toString("hex");
  const intentHash = hashUploadIntent(intent);
  const issuedAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + CHALLENGE_SECONDS * 1000);
  const message = buildChallengeMessage({
    domain: requestDomain(headers),
    ...intent,
    nonce,
    intentHash,
    issuedAt,
    expiresAt: expiresAt.toISOString(),
  });
  const hashedClient = clientHash(ip, env.ROUNDS_UPLOAD_AUTH_SECRET);
  const client = typeof db.connect === "function" ? await db.connect() : db;
  const usesTransaction = client !== db;
  let result;
  try {
    if (usesTransaction) {
      await client.query("BEGIN");
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtext($1)), pg_advisory_xact_lock(hashtext($2))",
        [`wallet:${intent.wallet.toLowerCase()}`, `client:${hashedClient}`],
      );
      await client.query(
        "DELETE FROM rounds_upload_challenges WHERE created_at < now() - interval '1 day'; DELETE FROM rounds_upload_sessions WHERE created_at < now() - interval '1 day'",
      );
    }
    result = await client.query(
      `
        WITH wallet_count AS (
          SELECT count(*)::int AS count FROM rounds_upload_challenges
          WHERE wallet = $2 AND created_at > now() - interval '1 hour'
        ), client_count AS (
          SELECT count(*)::int AS count FROM rounds_upload_challenges
          WHERE client_hash = $7 AND created_at > now() - interval '1 hour'
        )
        INSERT INTO rounds_upload_challenges
          (id, wallet, round_address, chain_id, intent_hash, message, client_hash, expires_at)
        SELECT $1, $2, $3, $4, $5, $6, $7, $8
        FROM wallet_count, client_count
        WHERE wallet_count.count < $9 AND client_count.count < $10
        RETURNING id
      `,
      [
        id,
        intent.wallet.toLowerCase(),
        intent.round.toLowerCase(),
        intent.chainId,
        intentHash,
        message,
        hashedClient,
        expiresAt,
        MAX_CHALLENGES_PER_WALLET_HOUR,
        MAX_CHALLENGES_PER_CLIENT_HOUR,
      ],
    );
    if (usesTransaction) await client.query("COMMIT");
  } catch (error) {
    if (usesTransaction) await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    if (usesTransaction) client.release();
  }
  if (!result.rowCount) {
    throw new UploadError(
      "RATE_LIMITED",
      "Too many upload authorization requests.",
      429,
    );
  }
  return { challengeId: id, message, expiresAt: expiresAt.toISOString() };
}

async function signPinataUrl(file, env, fetchImpl, keyvalues) {
  const response = await fetchImpl(
    "https://uploads.pinata.cloud/v3/files/sign",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.PINATA_JWT}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(createPinataSignBody(file, keyvalues)),
      signal: AbortSignal.timeout(8_000),
    },
  );
  if (!response.ok) {
    throw new UploadError(
      "PINATA_ERROR",
      "The upload provider could not authorize this upload.",
      502,
    );
  }
  const payload = await response.json();
  const signedUrl = payload?.data;
  let parsed;
  try {
    parsed = new URL(signedUrl);
  } catch {
    throw new UploadError(
      "PINATA_ERROR",
      "The upload provider returned an invalid response.",
      502,
    );
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.hostname !== "uploads.pinata.cloud"
  ) {
    throw new UploadError(
      "PINATA_ERROR",
      "The upload provider returned an invalid response.",
      502,
    );
  }
  return signedUrl;
}

async function authorizeImages({
  body,
  env,
  db,
  fetchImpl = fetch,
  verifyRound = verifyConfiguredRoundEligibility,
}) {
  requireConfiguration(env);
  const intent = validateUploadIntent(body);
  const challengeId = String(body.challengeId || "");
  const signature = String(body.signature || "");
  if (
    !/^[0-9a-f-]{36}$/i.test(challengeId) ||
    !/^0x[0-9a-f]+$/i.test(signature)
  ) {
    throw new UploadError(
      "INVALID_AUTHORIZATION",
      "The upload authorization is invalid.",
      401,
    );
  }
  await ensureSchema(db);
  const intentHash = hashUploadIntent(intent);
  const challenge = await db.query(
    `
      SELECT message FROM rounds_upload_challenges
      WHERE id = $1 AND wallet = $2 AND round_address = $3 AND chain_id = $4
        AND intent_hash = $5 AND consumed_at IS NULL AND expires_at > now()
    `,
    [
      challengeId,
      intent.wallet.toLowerCase(),
      intent.round.toLowerCase(),
      intent.chainId,
      intentHash,
    ],
  );
  if (!challenge.rowCount) {
    throw new UploadError(
      "CHALLENGE_EXPIRED",
      "The upload challenge expired or was already used.",
      409,
    );
  }
  let signer;
  try {
    signer = verifyMessage(challenge.rows[0].message, signature);
  } catch {
    throw new UploadError(
      "INVALID_SIGNATURE",
      "The wallet signature is invalid.",
      401,
    );
  }
  if (signer.toLowerCase() !== intent.wallet.toLowerCase()) {
    throw new UploadError(
      "INVALID_SIGNATURE",
      "The wallet signature is invalid.",
      401,
    );
  }
  await verifyRound(intent, env);
  const consumed = await db.query(
    `
      UPDATE rounds_upload_challenges SET consumed_at = now()
      WHERE id = $1 AND wallet = $2 AND round_address = $3 AND chain_id = $4
        AND intent_hash = $5 AND consumed_at IS NULL AND expires_at > now()
      RETURNING id
    `,
    [
      challengeId,
      intent.wallet.toLowerCase(),
      intent.round.toLowerCase(),
      intent.chainId,
      intentHash,
    ],
  );
  if (!consumed.rowCount) {
    throw new UploadError(
      "CHALLENGE_EXPIRED",
      "The upload challenge expired or was already used.",
      409,
    );
  }

  const urls = await Promise.all(
    intent.files.map(async (file, index) => ({
      index,
      name: file.name,
      type: file.type,
      size: file.size,
      url: await signPinataUrl(file, env, fetchImpl, {
        app: "lil-nouns-rounds",
        kind: "submission-image",
        round: intent.round.toLowerCase(),
        wallet: intent.wallet.toLowerCase(),
        uploadSession: challengeId,
      }),
    })),
  );
  const sessionToken = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_SECONDS * 1000);
  await db.query(
    `INSERT INTO rounds_upload_sessions
      (token_hash, wallet, round_address, chain_id, expires_at)
      VALUES ($1, $2, $3, $4, $5)`,
    [
      tokenHash(sessionToken),
      intent.wallet.toLowerCase(),
      intent.round.toLowerCase(),
      intent.chainId,
      expiresAt,
    ],
  );
  return { uploads: urls, sessionToken, expiresAt: expiresAt.toISOString() };
}

async function authorizeMetadata({ body, env, db, fetchImpl = fetch }) {
  requireConfiguration(env);
  const sessionToken = String(body?.sessionToken || "");
  const size = Number(body?.size);
  const hash = String(body?.hash || "");
  if (
    !sessionToken ||
    !Number.isSafeInteger(size) ||
    size <= 0 ||
    size > MAX_METADATA_BYTES
  ) {
    throw new UploadError(
      "INVALID_METADATA",
      "Submission metadata must be valid JSON of at most 64 KiB.",
    );
  }
  if (!/^0x[0-9a-f]{64}$/i.test(hash)) {
    throw new UploadError(
      "INVALID_METADATA",
      "A bytes32 metadata hash is required.",
    );
  }
  await ensureSchema(db);
  const consumed = await db.query(
    `
      UPDATE rounds_upload_sessions SET consumed_at = now()
      WHERE token_hash = $1 AND consumed_at IS NULL AND expires_at > now()
      RETURNING wallet, round_address, chain_id
    `,
    [tokenHash(sessionToken)],
  );
  if (!consumed.rowCount) {
    throw new UploadError(
      "SESSION_EXPIRED",
      "The metadata upload session expired or was already used.",
      409,
    );
  }
  const url = await signPinataUrl(
    {
      name: `submission-${hash.slice(2, 14)}.json`,
      type: "application/json",
      size,
    },
    env,
    fetchImpl,
    {
      app: "lil-nouns-rounds",
      kind: "submission-metadata",
      round: consumed.rows[0].round_address,
      wallet: consumed.rows[0].wallet,
      uploadSession: tokenHash(sessionToken).slice(0, 20),
    },
  );
  return {
    url,
    contentType: "application/json",
    expiresIn: PRESIGNED_URL_SECONDS,
  };
}

async function handleRoundsUploadRequest({
  action,
  method,
  headers = {},
  body,
  ip,
  env = process.env,
  db,
  fetchImpl = fetch,
  verifyRound = verifyConfiguredRoundEligibility,
}) {
  if (method !== "POST") {
    return {
      status: 405,
      body: {
        error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed." },
      },
    };
  }
  try {
    requireConfiguration(env);
    const database = db || getPool(env);
    let data;
    if (action === "challenge") {
      data = await createChallenge({
        body,
        headers,
        ip,
        env,
        db: database,
        verifyRound,
      });
    } else if (action === "presign") {
      data = await authorizeImages({
        body,
        env,
        db: database,
        fetchImpl,
        verifyRound,
      });
    } else if (action === "metadata") {
      data = await authorizeMetadata({ body, env, db: database, fetchImpl });
    } else {
      throw new UploadError("NOT_FOUND", "Upload endpoint not found.", 404);
    }
    return { status: 200, body: { data } };
  } catch (error) {
    if (error instanceof UploadError) {
      return {
        status: error.status,
        body: { error: { code: error.code, message: error.message } },
      };
    }
    console.error("Rounds upload request failed", {
      action,
      name: error?.name,
      code: error?.code,
    });
    return {
      status: 500,
      body: {
        error: {
          code: "INTERNAL_ERROR",
          message: "Hosted upload failed. Use the manual metadata option.",
        },
      },
    };
  }
}

module.exports = {
  ALLOWED_IMAGE_MIME_TYPES,
  MAX_IMAGE_BYTES,
  MAX_IMAGE_COUNT,
  MAX_TOTAL_IMAGE_BYTES,
  MAX_METADATA_BYTES,
  UploadError,
  assertLegacyUploadVersion,
  assertRoundAcceptsSponsoredUpload,
  authorizeImages,
  authorizeMetadata,
  buildChallengeMessage,
  createChallenge,
  createPinataSignBody,
  handleRoundsUploadRequest,
  hashUploadIntent,
  verifyConfiguredRoundEligibility,
  validateUploadIntent,
};
