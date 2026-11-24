const READ_ACTIONS = new Set(["content", "image"]);
const LEGACY_ACTIONS = new Set(["challenge", "presign", "metadata"]);
const MAX_LEGACY_BYTES = 128 * 1024;

function json(status, body) {
  return {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
    body: JSON.stringify(body),
  };
}

async function dispatchRoundUpload({ action, method, cid, headers, ip, readBody, pinLimit }) {
  if (READ_ACTIONS.has(action)) {
    if (method !== "GET") return json(405, { error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed." } });
    const { retrieveRoundContent, retrieveRoundImage } = require("./_rounds-content");
    const result = action === "image" ? await retrieveRoundImage(cid) : await retrieveRoundContent(cid);
    return {
      status: result.status,
      headers: {
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": result.status !== 200 ? "no-store" : action === "image" ? "public, max-age=86400, immutable" : "public, max-age=300",
        "Content-Type": result.contentType || (action === "content" && result.status === 200 ? "application/json; charset=utf-8" : "text/plain; charset=utf-8"),
      },
      body: result.body,
    };
  }
  if (action !== "pin" && !LEGACY_ACTIONS.has(action)) return json(404, { error: { code: "NOT_FOUND", message: "Upload endpoint not found." } });
  if (method !== "POST") return json(405, { error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed." } });

  let body;
  try {
    body = await readBody(action === "pin" ? pinLimit : MAX_LEGACY_BYTES);
  } catch (error) {
    return error?.code === "REQUEST_TOO_LARGE"
      ? json(413, { error: { code: "REQUEST_TOO_LARGE", message: "The upload request is too large." } })
      : json(400, { error: { code: "INVALID_JSON", message: "The request body must be valid JSON." } });
  }

  const result = action === "pin"
    ? await (await import("./_rounds-stateless-upload.mjs")).handleStatelessPinRequest({ method, body })
    : await require("./_rounds-upload").handleRoundsUploadRequest({ action, method, headers, body, ip });
  return json(result.status, result.body);
}

function checkSize(size, max) {
  if (size > max) throw Object.assign(new Error("The upload request is too large."), { code: "REQUEST_TOO_LARGE" });
}

module.exports = { dispatchRoundUpload, checkSize };
