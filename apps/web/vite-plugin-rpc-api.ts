import type { Plugin } from "vite";
import { config } from "dotenv";
import { resolve } from "path";

// Load .env and .env.local so GOLDSKY_RPC_SECRET is available in dev (server-side only)
try {
  config({ path: resolve(process.cwd(), ".env") });
} catch {
  // ignore
}
try {
  config({ path: resolve(process.cwd(), ".env.local") });
} catch {
  // ignore
}

const GOLDSKY_EVM_1_BASE = "https://edge.goldsky.com/standard/evm/1";
const UPSTREAM_TIMEOUT_MS = 15_000;

/**
 * Vite plugin to handle /api/rpc in development (Goldsky RPC proxy).
 * Production uses the Netlify function in functions/api/rpc.js.
 */
export function rpcApiPlugin(): Plugin {
  return {
    name: "rpc-api-proxy",
    configureServer(server) {
      server.middlewares.use("/api/rpc", async (req, res, next) => {
        if (req.method !== "POST") {
          res.writeHead(405, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Method not allowed" }));
          return;
        }

        const secret = process.env.GOLDSKY_RPC_SECRET;
        if (!secret?.trim()) {
          res.writeHead(503, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              jsonrpc: "2.0",
              id: null,
              error: { code: -32603, message: "RPC proxy not configured" },
            })
          );
          return;
        }

        let body;
        try {
          body = await new Promise<unknown>((resolveBody, rejectBody) => {
            const chunks: Buffer[] = [];
            req.on("data", (chunk: Buffer) => chunks.push(chunk));
            req.on("end", () => {
              try {
                resolveBody(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
              } catch (e) {
                rejectBody(e);
              }
            });
            req.on("error", rejectBody);
          });
        } catch {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              jsonrpc: "2.0",
              id: null,
              error: { code: -32700, message: "Parse error" },
            })
          );
          return;
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
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(
              JSON.stringify({
                jsonrpc: "2.0",
                id: null,
                error: { code: -32603, message: "Upstream RPC error" },
              })
            );
            return;
          }
          res.writeHead(200, {
            "Content-Type": upstream.headers.get("Content-Type") || "application/json",
          });
          res.end(text);
        } catch (err) {
          clearTimeout(timeoutId);
          const message =
            err && typeof err === "object" && "name" in err && err.name === "AbortError"
              ? "Upstream timeout"
              : "Upstream request failed";
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              jsonrpc: "2.0",
              id: null,
              error: { code: -32603, message },
            })
          );
        }
      });
    },
  };
}
