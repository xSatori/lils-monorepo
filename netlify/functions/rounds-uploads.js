const { dispatchRoundUpload, checkSize } = require("../../api/_rounds-http");

exports.handler = async function handle(event) {
  const pathAction = event.path?.split("/").filter(Boolean).at(-1);
  const result = await dispatchRoundUpload({
    action: !pathAction || pathAction === "rounds-uploads" ? event.queryStringParameters?.action : pathAction,
    method: event.httpMethod,
    cid: event.queryStringParameters?.cid,
    headers: event.headers || {},
    ip: event.headers?.["x-nf-client-connection-ip"] || event.requestContext?.identity?.sourceIp,
    readBody: max => {
      const text = event.body || "";
      checkSize(Buffer.byteLength(text, event.isBase64Encoded ? "base64" : "utf8"), max);
      return JSON.parse((event.isBase64Encoded ? Buffer.from(text, "base64").toString("utf8") : text) || "{}");
    },
    pinLimit: 4 * 1024 * 1024,
  });
  const binary = Buffer.isBuffer(result.body);
  return {
    statusCode: result.status,
    headers: result.headers,
    isBase64Encoded: binary,
    body: binary ? result.body.toString("base64") : result.body,
  };
};
