const { Pool } = require("pg");

const DATABASE_URL_KEYS = [
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

const DEFAULT_LIL_SCHEMAS = [
  process.env.LIL_PONDER_LIVE_SCHEMA,
  process.env.LIL_PONDER_SCHEMA,
  process.env.PONDER_LIVE_SCHEMA,
  process.env.PONDER_SCHEMA,
  "ponder_live_lilcamp",
  "ponder_live_lilcamp_v2",
  "ponder_live",
].filter(Boolean);

let pool;
let selectedSchema;

function getDatabaseUrl() {
  for (const key of DATABASE_URL_KEYS) {
    const value = process.env[key];
    if (value && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

function getDatabaseDebugInfo() {
  const activeKey = DATABASE_URL_KEYS.find((key) => {
    const value = process.env[key];
    return Boolean(value && value.trim());
  });
  const activeValue = activeKey ? process.env[activeKey] : "";

  let hostname = null;
  try {
    hostname = activeValue ? new URL(activeValue).hostname : null;
  } catch {
    hostname = "invalid-url";
  }

  return {
    activeKey: activeKey || null,
    hostname,
    configuredKeys: DATABASE_URL_KEYS.filter((key) => {
      const value = process.env[key];
      return Boolean(value && value.trim());
    }),
    schemas: getLilSchemas(),
  };
}

function getPool() {
  if (pool) return pool;

  const connectionString = getDatabaseUrl();
  if (!connectionString) {
    throw new Error(
      `No database connection string found. Set one of: ${DATABASE_URL_KEYS.join(", ")}`,
    );
  }

  const ssl = connectionString.includes("sslmode=disable")
    ? false
    : { rejectUnauthorized: false };

  pool = new Pool({
    connectionString,
    ssl,
    max: 1,
    idleTimeoutMillis: 5_000,
    connectionTimeoutMillis: 3_000,
  });

  return pool;
}

function getLilSchemas() {
  return [...new Set(DEFAULT_LIL_SCHEMAS)].filter((schema) =>
    /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(schema),
  );
}

function isMissingRelationError(error) {
  return (
    error?.code === "42P01" ||
    String(error?.message || "").includes("does not exist")
  );
}

async function queryLilPonder(query, values = []) {
  const schema = await getSelectedLilSchema();
  const rewrittenQuery = query.replaceAll("ponder_live.", `${schema}.`);
  const result = await getPool().query(rewrittenQuery, values);
  return result.rows;
}

async function getSelectedLilSchema() {
  if (selectedSchema) return selectedSchema;

  const schemas = getLilSchemas();
  const candidates = [];
  let lastError;

  for (const schema of schemas) {
    try {
      const result = await getPool().query(
        `
        SELECT
          COUNT(*)::int AS candidate_count,
          MAX(created_timestamp)::numeric AS newest_candidate_timestamp
        FROM ${schema}.lil_candidates
        `,
      );
      candidates.push({
        schema,
        candidateCount: Number(result.rows[0]?.candidate_count || 0),
        newestCandidateTimestamp: Number(
          result.rows[0]?.newest_candidate_timestamp || 0,
        ),
      });
    } catch (error) {
      lastError = error;

      if (!isMissingRelationError(error)) {
        throw error;
      }
    }
  }

  if (candidates.length === 0) {
    throw lastError || new Error("No Lil Camp Ponder schemas configured");
  }

  candidates.sort((a, b) => {
    if (b.newestCandidateTimestamp !== a.newestCandidateTimestamp) {
      return b.newestCandidateTimestamp - a.newestCandidateTimestamp;
    }

    return b.candidateCount - a.candidateCount;
  });

  selectedSchema = candidates[0].schema;
  return selectedSchema;
}

function sendJson(res, statusCode, body, cacheControl) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json");
  if (cacheControl) {
    res.setHeader("Cache-Control", cacheControl);
  }
  res.end(JSON.stringify(body));
}

module.exports = {
  getDatabaseDebugInfo,
  queryLilPonder,
  sendJson,
};
