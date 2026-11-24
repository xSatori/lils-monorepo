import { describe, expect, it, mock } from "bun:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  retrieveRoundContent,
  retrieveRoundImage,
} = require("./_rounds-content.js");
const uploadRoute = require("./rounds/uploads/[action].js");
const CID = "bafkreibagcuzpsiht655vu4nrnb3bbh6ksk4hz7zhjru74jj2l2kstqtui";
const CONTENT = '{"title":"Test round","description":"A round"}';
const IMAGE_CID = "bafkreids5j4lobvthy2klxosd2sc4o67uvzejirva47bywitwyi5twpq4e";
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZlT8AAAAASUVORK5CYII=",
  "base64",
);

describe("round content retrieval", () => {
  it("returns exact metadata bytes from a gateway", async () => {
    const fetchImpl = mock(async () => new Response(CONTENT));
    const result = await retrieveRoundContent(CID, fetchImpl);
    expect(result).toEqual({ status: 200, body: CONTENT });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("tries the next gateway when the first is unavailable", async () => {
    const fetchImpl = mock(async () =>
      fetchImpl.mock.calls.length === 1
        ? new Response("Unavailable", { status: 503 })
        : new Response(CONTENT),
    );
    expect(await retrieveRoundContent(CID, fetchImpl)).toEqual({
      status: 200,
      body: CONTENT,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("rejects malformed CIDs without making a request", async () => {
    const fetchImpl = mock(async () => new Response(CONTENT));
    expect(
      (await retrieveRoundContent("https://example.com", fetchImpl)).status,
    ).toBe(400);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects oversized or invalid metadata", async () => {
    const fetchImpl = mock(async () => new Response("x".repeat(65_537)));
    expect((await retrieveRoundContent(CID, fetchImpl)).status).toBe(502);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

describe("round image retrieval", () => {
  it("returns exact verified image bytes with a safe content type", async () => {
    const fetchImpl = mock(async () => new Response(PNG));
    const result = await retrieveRoundImage(IMAGE_CID, fetchImpl);
    expect(result.status).toBe(200);
    expect(result.contentType).toBe("image/png");
    expect(Buffer.from(result.body)).toEqual(PNG);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("falls back when the first gateway rate-limits images", async () => {
    const fetchImpl = mock(async () =>
      fetchImpl.mock.calls.length === 1
        ? new Response("Rate limited", { status: 429 })
        : new Response(PNG),
    );
    expect((await retrieveRoundImage(IMAGE_CID, fetchImpl)).status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("rejects malformed IDs, altered bytes, and non-image responses", async () => {
    const fetchImpl = mock(async () => new Response("not an image"));
    expect(
      (await retrieveRoundImage("https://example.com/a", fetchImpl)).status,
    ).toBe(400);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect((await retrieveRoundImage(IMAGE_CID, fetchImpl)).status).toBe(502);
    const alteredPng = Buffer.from(PNG);
    alteredPng[alteredPng.length - 1] ^= 1;
    expect(
      (
        await retrieveRoundImage(
          IMAGE_CID,
          async () => new Response(alteredPng),
        )
      ).status,
    ).toBe(502);
  });
});

describe("round image route", () => {
  it("returns an image-safe response for an invalid CID without reading a request body", async () => {
    const headers = {};
    const response = {
      setHeader(name, value) {
        headers[name] = value;
      },
      end(body) {
        this.body = body;
      },
    };
    await uploadRoute(
      { method: "GET", query: { action: "image", cid: "not-a-cid" } },
      response,
    );
    expect(response.statusCode).toBe(400);
    expect(response.body).toBe("Invalid content ID.");
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
  });
});
