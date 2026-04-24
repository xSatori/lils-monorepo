/**
 * Goldsky Edge JSON-RPC proxy. GOLDSKY_RPC_SECRET is bound via Worker secrets / .dev.vars only.
 */

export interface Env {
  GOLDSKY_RPC_SECRET: string;
  /** Comma-separated list of allowed Origin values; omit for * */
  ALLOWED_ORIGINS?: string;
}

const GOLDSKY_EVM_1_BASE = "https://edge.goldsky.com/standard/evm/1";
const UPSTREAM_TIMEOUT_MS = 15_000;

function jsonRpcError(id: unknown, code: number, message: string): string {
  return JSON.stringify({
    jsonrpc: "2.0",
    id: id ?? null,
    error: { code, message },
  });
}

function corsHeaders(request: Request, env: Env): { ok: boolean; headers: Headers } {
  const headers = new Headers();
  headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type");
  headers.set("Access-Control-Max-Age", "86400");

  const raw = env.ALLOWED_ORIGINS?.trim();
  if (!raw) {
    headers.set("Access-Control-Allow-Origin", "*");
    return { ok: true, headers };
  }

  const allowed = raw.split(",").map((s) => s.trim()).filter(Boolean);
  const origin = request.headers.get("Origin");

  if (!origin) {
    headers.set("Access-Control-Allow-Origin", allowed[0] ?? "*");
    return { ok: true, headers };
  }
  if (allowed.includes(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    return { ok: true, headers };
  }

  headers.set("Access-Control-Allow-Origin", "null");
  return { ok: false, headers };
}

function withHeaders(base: Headers, extra: Record<string, string>): Headers {
  const h = new Headers(base);
  for (const [k, v] of Object.entries(extra)) {
    h.set(k, v);
  }
  return h;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { ok: corsOk, headers: cors } = corsHeaders(request, env);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: corsOk ? 204 : 403, headers: cors });
    }

    if (!corsOk) {
      return new Response(JSON.stringify({ error: "Origin not allowed" }), {
        status: 403,
        headers: withHeaders(cors, { "Content-Type": "application/json" }),
      });
    }

    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: withHeaders(cors, { "Content-Type": "application/json" }),
      });
    }

    const secret = env.GOLDSKY_RPC_SECRET;
    if (!secret?.trim()) {
      return new Response(jsonRpcError(null, -32603, "RPC proxy not configured"), {
        status: 503,
        headers: withHeaders(cors, {
          "Content-Type": "application/json",
          "X-RPC-Upstream": "goldsky-edge:not_configured",
        }),
      });
    }

    let body: unknown;
    let reqId: unknown = null;
    try {
      const text = await request.text();
      body = JSON.parse(text || "{}");
      if (body && typeof body === "object" && "id" in body) {
        reqId = (body as { id: unknown }).id;
      }
    } catch {
      return new Response(jsonRpcError(null, -32700, "Parse error"), {
        status: 400,
        headers: withHeaders(cors, { "Content-Type": "application/json" }),
      });
    }

    const url = `${GOLDSKY_EVM_1_BASE}?secret=${encodeURIComponent(secret)}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

    try {
      const upstream = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const text = await upstream.text();
      if (!upstream.ok) {
        return new Response(jsonRpcError(reqId, -32603, "Upstream RPC error"), {
          status: 200,
          headers: withHeaders(cors, {
            "Content-Type": "application/json",
            "X-RPC-Upstream": "goldsky-edge:failed",
          }),
        });
      }

      return new Response(text, {
        status: 200,
        headers: withHeaders(cors, {
          "Content-Type": upstream.headers.get("Content-Type") || "application/json",
          "X-RPC-Upstream": "goldsky-edge:ok",
        }),
      });
    } catch (err) {
      clearTimeout(timeoutId);
      const aborted = err instanceof Error && err.name === "AbortError";
      return new Response(
        jsonRpcError(
          reqId,
          -32603,
          aborted ? "Upstream timeout" : "Upstream request failed",
        ),
        {
          status: 200,
          headers: withHeaders(cors, {
            "Content-Type": "application/json",
            "X-RPC-Upstream": "goldsky-edge:timeout_or_failed",
          }),
        },
      );
    }
  },
} satisfies ExportedHandler<Env>;
