import type { IncomingMessage, ServerResponse } from "node:http";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import type { Plugin } from "vite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const require = createRequire(import.meta.url);

const envCandidates = [
  resolve(__dirname, ".env"),
  resolve(__dirname, ".env.local"),
  resolve(__dirname, "../../.env"),
  resolve(__dirname, "../../.env.local"),
  resolve(process.cwd(), ".env"),
  resolve(process.cwd(), ".env.local"),
];

for (const envPath of envCandidates) {
  config({ path: envPath, override: false });
}

type VercelHandler = (
  req: IncomingMessage & { query: Record<string, string> },
  res: ServerResponse,
) => Promise<void> | void;

const candidatesHandler = require("../../api/lil/candidates/index.js") as VercelHandler;
const candidateByIdHandler = require("../../api/lil/candidates/[id].js") as VercelHandler;

function getCandidateId(pathname: string): string | null {
  const candidatePath = pathname
    .replace(/^\/api\/lil\/candidates\/?/, "")
    .replace(/^\//, "");
  return candidatePath ? decodeURIComponent(candidatePath) : null;
}

export function lilCampApiPlugin(): Plugin {
  return {
    name: "lil-camp-api",
    configureServer(server) {
      server.middlewares.use("/api/lil/candidates", async (req, res) => {
        const url = new URL(req.url || "", "http://localhost");
        const pathname = url.pathname.startsWith("/api/lil/candidates")
          ? url.pathname
          : `/api/lil/candidates${url.pathname === "/" ? "" : url.pathname}`;
        const query = Object.fromEntries(url.searchParams.entries());
        const id = getCandidateId(pathname);

        Object.assign(req, {
          query: id ? { ...query, id } : query,
        });

        try {
          await (id ? candidateByIdHandler : candidatesHandler)(
            req as IncomingMessage & { query: Record<string, string> },
            res,
          );
        } catch (error) {
          console.error("[lilCampApiPlugin] Candidate API failed", error);
          if (!res.headersSent) {
            res.statusCode = 500;
            res.setHeader("Content-Type", "application/json");
          }
          res.end(JSON.stringify({ error: "Candidate API failed" }));
        }
      });
    },
  };
}
