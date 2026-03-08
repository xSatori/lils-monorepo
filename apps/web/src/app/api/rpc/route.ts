/**
 * JSON-RPC proxy for Goldsky EVM RPC.
 * Forwards requests to Goldsky with the secret added server-side only.
 * The secret (GOLDSKY_RPC_SECRET) must be set in server env and must never
 * be exposed to the client, logs, or source.
 *
 * Returns JSON-RPC errors on upstream failure/timeout so viem fallback can kick in.
 */

const GOLDSKY_EVM_1_BASE = "https://edge.goldsky.com/standard/evm/1";
const UPSTREAM_TIMEOUT_MS = 15_000;

function jsonRpcError(code: number, message: string) {
  return Response.json(
    { jsonrpc: "2.0", id: null, error: { code, message } },
    { status: 200 }
  );
}

export async function POST(request: Request) {
  const secret = process.env.GOLDSKY_RPC_SECRET;
  if (!secret?.trim()) {
    return Response.json(
      { jsonrpc: "2.0", id: null, error: { code: -32603, message: "RPC proxy not configured" } },
      { status: 503 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } },
      { status: 400 }
    );
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
      return jsonRpcError(-32603, "Upstream RPC error");
    }
    return new Response(text, {
      status: 200,
      headers: {
        "Content-Type": res.headers.get("Content-Type") ?? "application/json",
      },
    });
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === "AbortError") {
      return jsonRpcError(-32603, "Upstream timeout");
    }
    return jsonRpcError(-32603, "Upstream request failed");
  }
}
