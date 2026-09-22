const MAX_LEGACY_REQUEST_BYTES = 128 * 1024;
// Netlify's adapter is intentionally smaller than the Vercel route. It fails closed instead of
// issuing generic presigned URLs when an exact committed CAR bundle exceeds this boundary.
const MAX_STATELESS_REQUEST_BYTES = 4 * 1024 * 1024;

exports.handler = async function handler(event) {
  const action = String(event.queryStringParameters?.action || "");
  if (action === "content") {
    if (event.httpMethod !== "GET") {
      return response(405, "METHOD_NOT_ALLOWED", "Method not allowed.");
    }
    const { retrieveRoundContent } = require("../../api/_rounds-content");
    const result = await retrieveRoundContent(event.queryStringParameters?.cid);
    return {
      statusCode: result.status,
      headers: {
        ...secureHeaders(),
        "Cache-Control":
          result.status === 200 ? "public, max-age=300" : "no-store",
        "Content-Type":
          result.status === 200
            ? "application/json; charset=utf-8"
            : "text/plain; charset=utf-8",
      },
      body: result.body,
    };
  }
  const maxRequestBytes =
    action === "pin" ? MAX_STATELESS_REQUEST_BYTES : MAX_LEGACY_REQUEST_BYTES;
  let body;
  try {
    if (
      Buffer.byteLength(
        event.body || "",
        event.isBase64Encoded ? "base64" : "utf8",
      ) > maxRequestBytes
    ) {
      return response(
        413,
        "REQUEST_TOO_LARGE",
        "The upload request is too large.",
      );
    }
    const raw = event.isBase64Encoded
      ? Buffer.from(event.body || "", "base64").toString("utf8")
      : event.body || "{}";
    body = JSON.parse(raw);
  } catch {
    return response(
      400,
      "INVALID_JSON",
      "The request body must be valid JSON.",
    );
  }

  let result;
  if (action === "pin") {
    const { handleStatelessPinRequest } = await import(
      "../../api/_rounds-stateless-upload.mjs"
    );
    result = await handleStatelessPinRequest({
      method: event.httpMethod,
      body,
    });
  } else {
    const { handleRoundsUploadRequest } = require("../../api/_rounds-upload");
    const headers = event.headers || {};
    const forwarded = String(headers["x-forwarded-for"] || "");
    result = await handleRoundsUploadRequest({
      action,
      method: event.httpMethod,
      headers,
      body,
      ip:
        forwarded.split(",")[0].trim() ||
        event.requestContext?.identity?.sourceIp,
    });
  }
  return {
    statusCode: result.status,
    headers: secureHeaders(),
    body: JSON.stringify(result.body),
  };
};

function secureHeaders() {
  return {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
  };
}

function response(statusCode, code, message) {
  return {
    statusCode,
    headers: secureHeaders(),
    body: JSON.stringify({ error: { code, message } }),
  };
}
