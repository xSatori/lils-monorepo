const {
  getDatabaseDebugInfo,
  queryLilPonder,
  sendJson,
} = require("../../_lil-camp-db");

function parsePositiveInt(value, fallback, max) {
  const parsed = Number.parseInt(String(value || ""), 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.min(parsed, max);
}

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

function isZeroValue(value) {
  if (value === null || value === undefined || value === "") return true;
  return String(value) === "0";
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function isTopicCandidate(candidate) {
  const targets = normalizeArray(candidate.targets);
  const values = normalizeArray(candidate.values);
  const calldatas = normalizeArray(candidate.calldatas);

  if (targets.length === 0 && calldatas.length === 0) return true;

  return (
    targets.length === 1 &&
    targets[0]?.toLowerCase() === ZERO_ADDRESS &&
    isZeroValue(values[0]) &&
    (calldatas.length === 0 || calldatas[0] === "0x" || calldatas[0] === "")
  );
}

function matchesKind(candidate, kind) {
  if (kind === "topic") return isTopicCandidate(candidate);
  if (kind === "proposal") return !isTopicCandidate(candidate);
  return true;
}

async function fetchCandidateBySlug(slug, kind) {
  const rows = await queryLilPonder(
    `
    SELECT c.id, c.slug, c.proposer, c.title, c.description,
           c.targets, c."values", c.signatures AS signatures_list, c.calldatas,
           c.encoded_proposal_hash, c.proposal_id_to_update,
           promoted.proposal_id,
           c.created_timestamp, c.last_updated_timestamp, c.canceled,
           c.signature_count, c.block_number,
           e.name as proposer_ens
    FROM ponder_live.lil_candidates c
    LEFT JOIN LATERAL (
      SELECT p.id AS proposal_id
      FROM ponder_live.lil_proposals p
      WHERE LOWER(p.proposer) = LOWER(c.proposer)
        AND p.title = c.title
        AND p.description = c.description
        AND p.created_timestamp >= c.created_timestamp
        AND c.proposal_id_to_update IS NULL
      ORDER BY p.created_timestamp ASC
      LIMIT 1
    ) promoted ON TRUE
    LEFT JOIN ponder_live.ens_names e ON LOWER(c.proposer) = LOWER(e.address)
    WHERE c.slug = $1
    LIMIT 1
    `,
    [slug],
  );

  if (rows.length === 0) return null;

  const candidate = rows[0];
  if (!matchesKind(candidate, kind)) return null;

  const [signatures, feedback, versions] = await Promise.all([
    queryLilPonder(
      `
      SELECT cs.id, cs.signer, cs.sig, cs.expiration_timestamp, cs.reason,
             cs.block_timestamp,
             e.name as signer_ens
      FROM ponder_live.lil_candidate_signatures cs
      LEFT JOIN ponder_live.ens_names e ON LOWER(cs.signer) = LOWER(e.address)
      WHERE cs.candidate_id = $1
      ORDER BY cs.block_timestamp DESC
      `,
      [candidate.id],
    ),
    queryLilPonder(
      `
      SELECT cf.id, cf.msg_sender, cf.support, cf.reason, cf.block_timestamp,
             e.name as sender_ens
      FROM ponder_live.lil_candidate_feedback cf
      LEFT JOIN ponder_live.ens_names e ON LOWER(cf.msg_sender) = LOWER(e.address)
      WHERE cf.candidate_id = $1
      ORDER BY cf.block_timestamp DESC
      LIMIT 100
      `,
      [candidate.id],
    ),
    queryLilPonder(
      `
      SELECT id, candidate_id, version_number, title, description,
             update_message, block_timestamp
      FROM ponder_live.lil_candidate_versions
      WHERE candidate_id = $1
      ORDER BY block_timestamp DESC
      `,
      [candidate.id],
    ),
  ]);

  return {
    ...candidate,
    signatures,
    feedback,
    versions,
  };
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  const limit = parsePositiveInt(req.query.limit || req.query.first, 20, 1000);
  const offset = parsePositiveInt(req.query.offset || req.query.skip, 0, 10_000);
  const slug = typeof req.query.slug === "string" ? req.query.slug : "";
  const kind =
    req.query.kind === "topic"
      ? "topic"
      : req.query.kind === "proposal"
        ? "proposal"
        : "all";

  try {
    if (slug) {
      const candidate = await fetchCandidateBySlug(slug, kind);
      if (!candidate) {
        sendJson(res, 404, { error: "Candidate not found" });
        return;
      }

      sendJson(res, 200, { candidate }, "s-maxage=30, stale-while-revalidate=120");
      return;
    }

    const queryLimit =
      kind === "all" ? limit : Math.min(Math.max(limit * 5, limit), 1000);

    const rows = await queryLilPonder(
      `
      SELECT c.id, c.slug, c.proposer, c.title, c.description,
             c.targets, c."values", c.signatures AS signatures_list, c.calldatas,
             c.encoded_proposal_hash,
             promoted.proposal_id,
             c.created_timestamp, c.last_updated_timestamp, c.canceled,
             c.signature_count, c.proposal_id_to_update, c.block_number,
             e.name as proposer_ens
      FROM ponder_live.lil_candidates c
      LEFT JOIN LATERAL (
        SELECT p.id AS proposal_id
        FROM ponder_live.lil_proposals p
        WHERE LOWER(p.proposer) = LOWER(c.proposer)
          AND p.title = c.title
          AND p.description = c.description
          AND p.created_timestamp >= c.created_timestamp
          AND c.proposal_id_to_update IS NULL
        ORDER BY p.created_timestamp ASC
        LIMIT 1
      ) promoted ON TRUE
      LEFT JOIN ponder_live.ens_names e ON LOWER(c.proposer) = LOWER(e.address)
      ORDER BY c.created_timestamp DESC NULLS LAST
      LIMIT $1 OFFSET $2
      `,
      [queryLimit, offset],
    );
    const candidates = rows
      .filter((candidate) => matchesKind(candidate, kind))
      .slice(0, limit);

    sendJson(
      res,
      200,
      { candidates },
      "s-maxage=30, stale-while-revalidate=120",
    );
  } catch (error) {
    const debug = getDatabaseDebugInfo();
    console.error("Failed to fetch Lil Camp candidates:", {
      message: error?.message,
      code: error?.code,
      debug,
    });
    sendJson(res, 500, {
      error: "Failed to fetch candidates",
      code: error?.code || null,
      message: error?.message || "Unknown error",
      debug,
    });
  }
};
