const { dispatchRoundUpload, checkSize } = require("../../_rounds-http");

async function readBody(req, max) {
  checkSize(Number(req.headers?.["content-length"] || 0), max);
  if (req.body != null) {
    const raw = typeof req.body === "string" || Buffer.isBuffer(req.body) ? req.body : JSON.stringify(req.body);
    checkSize(Buffer.byteLength(raw), max);
    return JSON.parse(raw);
  }
  const chunks = [];
  let size = 0;
  for await (const value of req) {
    const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
    size += chunk.length;
    checkSize(size, max);
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

module.exports = async function handle(req, res) {
  const result = await dispatchRoundUpload({
    action: req.query?.action,
    method: req.method,
    cid: req.query?.cid,
    headers: req.headers,
    ip: (process.env.VERCEL && req.headers?.["x-vercel-forwarded-for"]?.split(",")[0].trim()) || req.socket?.remoteAddress,
    readBody: max => readBody(req, max),
    pinLimit: 56 * 1024 * 1024,
  });
  res.statusCode = result.status;
  for (const [key, value] of Object.entries(result.headers)) res.setHeader(key, value);
  res.end(result.body);
};
