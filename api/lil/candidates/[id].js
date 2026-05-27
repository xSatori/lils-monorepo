const {
  getDatabaseDebugInfo,
  queryLilPonder,
  sendJson,
} = require("../../_lil-camp-db");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  const id = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;

  if (!id) {
    sendJson(res, 400, { error: "Candidate id is required" });
    return;
  }

  try {
    const [candidateRows, signatures, feedback, versions] = await Promise.all([
      queryLilPonder(
        `
        SELECT c.id, c.slug, c.proposer, c.title, c.description,
               c.targets, c."values", c.signatures AS signatures_list, c.calldatas,
               c.encoded_proposal_hash, c.proposal_id_to_update,
               c.canceled, c.signature_count,
               c.created_timestamp, c.last_updated_timestamp, c.block_number,
               e.name as proposer_ens
        FROM ponder_live.lil_candidates c
        LEFT JOIN ponder_live.ens_names e ON LOWER(c.proposer) = LOWER(e.address)
        WHERE c.id = $1
        LIMIT 1
        `,
        [id],
      ),
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
        [id],
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
        [id],
      ),
      queryLilPonder(
        `
        SELECT id, candidate_id, version_number, title, description,
               update_message, block_timestamp
        FROM ponder_live.lil_candidate_versions
        WHERE candidate_id = $1
        ORDER BY block_timestamp DESC
        `,
        [id],
      ),
    ]);

    if (candidateRows.length === 0) {
      sendJson(res, 404, { error: "Candidate not found" });
      return;
    }

    sendJson(
      res,
      200,
      {
        candidate: {
          ...candidateRows[0],
          signatures,
          feedback,
          versions,
        },
      },
      "s-maxage=30, stale-while-revalidate=120",
    );
  } catch (error) {
    const debug = getDatabaseDebugInfo();
    console.error("Failed to fetch Lil Camp candidate:", {
      message: error?.message,
      code: error?.code,
      debug,
    });
    sendJson(res, 500, {
      error: "Failed to fetch candidate",
      code: error?.code || null,
      message: error?.message || "Unknown error",
      debug,
    });
  }
};
