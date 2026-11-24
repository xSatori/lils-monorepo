const { describe, expect, it } = require("bun:test");
const { Readable } = require("node:stream");
const vercel = require("./rounds/uploads/[action]");
const netlify = require("../netlify/functions/rounds-uploads");

async function vercelRequest(action, method, raw) {
  const request = Object.assign(Readable.from(raw === undefined ? [] : [raw]), {
    query: { action, cid: "invalid" }, headers: {}, method,
  });
  const response = { setHeader() {}, end(value) { this.body = value; } };
  await vercel(request, response);
  return { status: response.statusCode, body: response.body };
}

async function netlifyRequest(action, method, raw) {
  const response = await netlify.handler({
    path: "/.netlify/functions/rounds-uploads/" + action,
    queryStringParameters: { cid: "invalid" }, headers: {}, httpMethod: method, body: raw,
  });
  return { status: response.statusCode, body: response.body };
}

for (const [name, request] of [["Vercel/Vite", vercelRequest], ["Netlify", netlifyRequest]]) {
  describe(name + " rounds adapter", () => {
    it("routes content and image reads to the CID validator", async () => {
      for (const action of ["content", "image"]) {
        const result = await request(action, "GET");
        expect(result.status).toBe(400);
        expect(result.body).toBe("Invalid content ID.");
      }
    });
    it("rejects unsupported actions, methods, malformed and oversized JSON before a provider call", async () => {
      expect((await request("unknown", "POST", "{}")).status).toBe(404);
      for (const action of ["pin", "challenge", "presign", "metadata"]) {
        expect((await request(action, "GET")).status).toBe(405);
        expect((await request(action, "POST", "{")).status).toBe(400);
      }
      expect((await request("presign", "POST", "x".repeat(128 * 1024 + 1))).status).toBe(413);
    });
  });
}

it("checks the RPC's actual chain before either generation accepts a commitment", async () => {
  const calls = [];
  const rpc = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const input = await request.json();
      const reply = query => {
        calls.push(query.method);
        return { jsonrpc: "2.0", id: query.id, result: "0x1" };
      };
      return Response.json(Array.isArray(input) ? input.map(reply) : reply(input));
    },
  });
  const address = "0x1111111111111111111111111111111111111111";
  const env = {
    ROUNDS_UPLOAD_RPC_URL: rpc.url.href,
    ROUNDS_UPLOAD_FACTORY_ADDRESS: address,
    ROUNDS_UPLOAD_CHAIN_ID: "11155111",
  };
  try {
    const { verifyConfiguredRoundEligibility } = require("./_rounds-upload");
    const { loadOnchainMediaCommitment } = await import("./_rounds-stateless-upload.mjs");
    const intent = { chainId: 11155111, round: address };
    await expect(verifyConfiguredRoundEligibility(intent, env)).rejects.toMatchObject({ code: "RPC_CHAIN_MISMATCH" });
    await expect(loadOnchainMediaCommitment({ ...intent, env })).rejects.toThrow("Upload RPC chain mismatch");
    expect(calls).toEqual(["eth_chainId", "eth_chainId"]);
  } finally {
    rpc.stop(true);
  }
});
