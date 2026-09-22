import type { IncomingMessage, ServerResponse } from "node:http";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { parse } from "dotenv";
import type { Plugin } from "vite";

const require = createRequire(import.meta.url);
type VercelHandler = (
  req: IncomingMessage & { query: Record<string, string> },
  res: ServerResponse,
) => Promise<void> | void;

const uploadHandler =
  require("../../api/rounds/uploads/[action].js") as VercelHandler;

export function roundsUploadApiPlugin(): Plugin {
  return {
    name: "rounds-upload-api",
    configureServer(server) {
      // The dev-only upload handler runs in Node, not in Vite's client env.
      try {
        const localEnv = parse(readFileSync(new URL("../../.env.local", import.meta.url)));
        for (const key of [
          "PINATA_JWT",
          "ROUNDS_UPLOAD_RPC_URL",
          "ROUNDS_UPLOAD_CHAIN_ID",
          "ROUNDS_UPLOAD_FACTORY_ADDRESS",
        ]) {
          if (localEnv[key]) process.env[key] = localEnv[key];
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      server.middlewares.use("/api/rounds/uploads", async (req, res) => {
        const url = new URL(req.url || "/", "http://localhost");
        const action = url.pathname.replace(/^\//, "").split("/")[0] || "";
        Object.assign(req, {
          query: { ...Object.fromEntries(url.searchParams), action },
        });
        try {
          await uploadHandler(
            req as IncomingMessage & { query: Record<string, string> },
            res,
          );
        } catch (error) {
          console.error("[roundsUploadApiPlugin] Upload API failed", {
            name: error instanceof Error ? error.name : "UnknownError",
          });
          if (!res.headersSent) {
            res.statusCode = 500;
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.setHeader("Cache-Control", "no-store");
          }
          res.end(
            JSON.stringify({
              error: {
                code: "INTERNAL_ERROR",
                message: "Hosted upload failed.",
              },
            }),
          );
        }
      });
    },
  };
}
