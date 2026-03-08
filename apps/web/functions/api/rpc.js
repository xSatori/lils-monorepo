/**
 * Netlify Function: JSON-RPC proxy for Goldsky EVM RPC.
 * For production: /api/rpc is redirected here via _redirects.
 * Keeps GOLDSKY_RPC_SECRET server-side only; never exposed to client.
 *
 * Env (Netlify UI): GOLDSKY_RPC_SECRET
 */

const GOLDSKY_EVM_1_BASE = "https://edge.goldsky.com/standard/evm/1";
const UPSTREAM_TIMEOUT_MS = 15_000;

function jsonRpcError(code, message) {
  return JSON.stringify({
    jsonrpc: "2.0",
    id: null,
    error: { code, message },
  });
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
      body: "",
    };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  const secret = process.env.GOLDSKY_RPC_SECRET;
  if (!secret || !secret.trim()) {
    return {
      statusCode: 503,
      headers: { "Content-Type": "application/json" },
      body: jsonRpcError(-32603, "RPC proxy not configured"),
    };
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json" },
      body: jsonRpcError(-32700, "Parse error"),
    };
  }

  const url = `${GOLDSKY_EVM_1_BASE}?secret=${encodeURIComponent(secret)}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const text = await res.text();
    if (!res.ok) {
      return {
        statusCode: 502,
        headers: { "Content-Type": "application/json" },
        body: jsonRpcError(-32603, "Upstream RPC error"),
      };
    }
    const contentType = res.headers.get("Content-Type") || "application/json";
    return {
      statusCode: 200,
      headers: { "Content-Type": contentType },
      body: text,
    };
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === "AbortError") {
      return {
        statusCode: 504,
        headers: { "Content-Type": "application/json" },
        body: jsonRpcError(-32603, "Upstream timeout"),
      };
    }
    return {
      statusCode: 502,
      headers: { "Content-Type": "application/json" },
      body: jsonRpcError(-32603, "Upstream request failed"),
    };
  }
};
