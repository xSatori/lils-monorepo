import { isAddress, getAddress, keccak256 } from "viem";
import { inspectDeterministicCar } from "../packages/rounds-media/index.mjs";

const IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);
const MAX_IMAGE_CAR_BYTES = 11 * 1024 * 1024;
const MAX_METADATA_CAR_BYTES = 128 * 1024;
const PINATA_UPLOAD_URL = "https://uploads.pinata.cloud/v3/files";
const SEPOLIA_V7_FACTORY = "0x4c05EF874bA1AF1D97C0708075CD531a38283454";
const SEPOLIA_CURRENT_FACTORY = "0xCa648c6b3e53b126Ad6bC00b248a7Ac236C3aaF6";

export class StatelessUploadError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = "StatelessUploadError";
    this.code = code;
    this.status = status;
  }
}

function matchesMagic(bytes, type) {
  if (type === "image/jpeg")
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (type === "image/png") {
    return [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every(
      (value, index) => bytes[index] === value,
    );
  }
  if (type === "image/gif") {
    const header = new TextDecoder().decode(bytes.slice(0, 6));
    return header === "GIF87a" || header === "GIF89a";
  }
  if (type === "image/webp") {
    const decoder = new TextDecoder();
    return (
      decoder.decode(bytes.slice(0, 4)) === "RIFF" &&
      decoder.decode(bytes.slice(8, 12)) === "WEBP"
    );
  }
  return false;
}

/**
 * Verifies exact bytes against live onchain data supplied by the caller. This deliberately does
 * not upload: Pinata CAR-root preservation and duplicate billing remain a live-provider gate.
 */
export async function verifyCommittedCar({ car, commitment }) {
  const inspected = await inspectDeterministicCar(car);
  if (`ipfs://${inspected.cid}` !== commitment.uri) {
    throw new Error("CAR root does not match the onchain content URI.");
  }
  if (
    keccak256(inspected.bytes).toLowerCase() !== commitment.hash.toLowerCase()
  ) {
    throw new Error("CAR bytes do not match the onchain integrity hash.");
  }

  if (commitment.kind === "metadata") {
    if (inspected.bytes.byteLength > 64 * 1024)
      throw new Error("Metadata exceeds 64 KiB.");
    let metadata;
    try {
      metadata = JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(inspected.bytes),
      );
    } catch {
      throw new Error("Metadata must be valid UTF-8 JSON.");
    }
    const images = Array.isArray(metadata?.images) ? metadata.images : [];
    if (
      images.length !== commitment.declaredOriginalImageCount ||
      images.length > 8
    ) {
      throw new Error(
        "Metadata image count does not match the onchain declaration.",
      );
    }
    if (
      !images.every(
        (uri) => typeof uri === "string" && uri.startsWith("ipfs://"),
      )
    ) {
      throw new Error("Metadata images must use ipfs:// URIs.");
    }
    return { ...inspected, metadata };
  }

  if (
    !IMAGE_TYPES.has(commitment.mimeType) ||
    !matchesMagic(inspected.bytes, commitment.mimeType)
  ) {
    throw new Error("CAR bytes do not match an allowed image MIME type.");
  }
  if (inspected.bytes.byteLength > 10 * 1024 * 1024)
    throw new Error("Image exceeds 10 MiB.");
  return inspected;
}

export async function verifyOriginalSubmissionBundle({
  metadataCar,
  imageCars,
  imageMimeTypes,
  onchainSubmission,
}) {
  const metadata = await verifyCommittedCar({
    car: metadataCar,
    commitment: {
      kind: "metadata",
      uri: onchainSubmission.metadataURI,
      hash: onchainSubmission.metadataHash,
      declaredOriginalImageCount: onchainSubmission.originalImageCount,
    },
  });
  if (
    imageCars.length !== metadata.metadata.images.length ||
    imageMimeTypes.length !== imageCars.length
  ) {
    throw new Error(
      "Image CAR bundle does not match the ordered metadata image list.",
    );
  }
  let totalBytes = 0;
  const images = [];
  for (let index = 0; index < imageCars.length; index += 1) {
    const inspected = await inspectDeterministicCar(imageCars[index]);
    if (`ipfs://${inspected.cid}` !== metadata.metadata.images[index]) {
      throw new Error(
        "Image CAR root does not match its ordered metadata URI.",
      );
    }
    if (
      !IMAGE_TYPES.has(imageMimeTypes[index]) ||
      !matchesMagic(inspected.bytes, imageMimeTypes[index])
    ) {
      throw new Error("CAR bytes do not match an allowed image MIME type.");
    }
    if (inspected.bytes.byteLength > 10 * 1024 * 1024)
      throw new Error("Image exceeds 10 MiB.");
    totalBytes += inspected.bytes.byteLength;
    images.push(inspected);
  }
  if (totalBytes > 40 * 1024 * 1024)
    throw new Error("Image bundle exceeds 40 MiB.");
  return { metadata, images, totalBytes };
}

export async function verifyRoundBundle({
  metadataCar,
  imageCar,
  imageMimeType,
  onchainRound,
}) {
  const metadata = await inspectDeterministicCar(metadataCar);
  if (`ipfs://${metadata.cid}` !== onchainRound.metadataURI)
    throw new Error("Round metadata CAR root does not match its onchain URI.");
  if (
    keccak256(metadata.bytes).toLowerCase() !==
    onchainRound.metadataHash.toLowerCase()
  )
    throw new Error(
      "Round metadata bytes do not match the onchain integrity hash.",
    );
  if (metadata.bytes.byteLength > 64 * 1024)
    throw new Error("Round metadata exceeds 64 KiB.");
  let value;
  try {
    value = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(metadata.bytes),
    );
  } catch {
    throw new Error("Round metadata must be valid UTF-8 JSON.");
  }
  if (
    value?.schema !== "lil-nouns-round-v1" ||
    typeof value?.title !== "string" ||
    typeof value?.description !== "string" ||
    typeof value?.image !== "string" ||
    !value.image.startsWith("ipfs://")
  )
    throw new Error("Round metadata does not match the supported schema.");

  const image = await inspectDeterministicCar(imageCar);
  if (`ipfs://${image.cid}` !== value.image)
    throw new Error("The supplied cover image does not match round metadata.");
  if (
    !IMAGE_TYPES.has(imageMimeType) ||
    !matchesMagic(image.bytes, imageMimeType)
  )
    throw new Error(
      "Round cover CAR bytes do not match an allowed image MIME type.",
    );
  if (image.bytes.byteLength > 10 * 1024 * 1024)
    throw new Error("Round cover image exceeds 10 MiB.");
  return { metadata: { ...metadata, metadata: value }, image };
}

export function allowedRoundFactories(chainId, configuredFactory) {
  return [
    ...new Set(
      [
        getAddress(configuredFactory),
        ...(chainId === 11155111
          ? [getAddress(SEPOLIA_CURRENT_FACTORY), getAddress(SEPOLIA_V7_FACTORY)]
          : []),
      ].map((address) => address.toLowerCase()),
    ),
  ];
}

function configuredNetwork(env) {
  const chainId = Number(env.ROUNDS_UPLOAD_CHAIN_ID);
  if (
    !Number.isSafeInteger(chainId) ||
    chainId <= 0 ||
    !env.ROUNDS_UPLOAD_RPC_URL ||
    !isAddress(env.ROUNDS_UPLOAD_FACTORY_ADDRESS)
  ) {
    throw new Error("Stateless upload RPC configuration is unavailable.");
  }
  return {
    chainId,
    rpcUrl: env.ROUNDS_UPLOAD_RPC_URL,
    factories: allowedRoundFactories(
      chainId,
      env.ROUNDS_UPLOAD_FACTORY_ADDRESS,
    ),
  };
}

function parseUint(value, label, { safe = false } = {}) {
  if (
    typeof value !== "string" &&
    typeof value !== "number" &&
    typeof value !== "bigint"
  ) {
    throw new StatelessUploadError("INVALID_REQUEST", `${label} is required.`);
  }
  const normalized = String(value);
  if (!/^(0|[1-9][0-9]*)$/.test(normalized)) {
    throw new StatelessUploadError(
      "INVALID_REQUEST",
      `${label} must be an unsigned integer.`,
    );
  }
  const parsed = BigInt(normalized);
  if (safe && parsed > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new StatelessUploadError("INVALID_REQUEST", `${label} is too large.`);
  }
  return safe ? Number(parsed) : normalized;
}

function decodeBase64Car(value, maxBytes) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > Math.ceil(maxBytes / 3) * 4 + 4 ||
    value.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(value)
  ) {
    throw new StatelessUploadError(
      "INVALID_CAR",
      "CAR content must be canonical base64.",
    );
  }
  const bytes = Buffer.from(value, "base64");
  if (bytes.byteLength === 0 || bytes.byteLength > maxBytes) {
    throw new StatelessUploadError(
      "INVALID_CAR",
      "CAR content exceeds the supported size.",
      413,
    );
  }
  if (bytes.toString("base64") !== value) {
    throw new StatelessUploadError(
      "INVALID_CAR",
      "CAR content must be canonical base64.",
    );
  }
  return new Uint8Array(bytes);
}

function pinataKeyvalues(values) {
  return JSON.stringify(
    Object.fromEntries(
      Object.entries(values).map(([key, value]) => [key, String(value)]),
    ),
  );
}

export async function uploadVerifiedCar({
  car,
  cid,
  name,
  keyvalues,
  env,
  fetchImpl = fetch,
}) {
  if (!env.PINATA_JWT?.trim()) {
    throw new StatelessUploadError(
      "HOSTED_UPLOAD_UNAVAILABLE",
      "Hosted uploads are unavailable. Keep the recovery bundle and retry later, or pin it with another CAR-compatible provider.",
      503,
    );
  }
  // The browser recovery artifact is a CAR, but Pinata's V3 file endpoint accepts the
  // contained file bytes rather than a CAR-import flag. Because our CIDs use the raw
  // codec, uploading this exact verified block preserves the committed CID.
  const inspected = await inspectDeterministicCar(car);
  if (inspected.cid !== cid) {
    throw new StatelessUploadError(
      "PINATA_CID_MISMATCH",
      "The recovery CAR root does not match the expected content ID.",
      422,
    );
  }
  const form = new FormData();
  form.append(
    "file",
    new Blob([inspected.bytes], { type: "application/octet-stream" }),
    name,
  );
  form.append("network", "public");
  form.append("name", name);
  form.append("keyvalues", pinataKeyvalues(keyvalues));

  let response;
  try {
    response = await fetchImpl(PINATA_UPLOAD_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.PINATA_JWT}` },
      body: form,
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new StatelessUploadError(
      "PINATA_UNAVAILABLE",
      "Pinata did not confirm the exact CAR upload. Retry the same recovery bundle.",
      502,
    );
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || typeof payload?.data?.cid !== "string") {
    throw new StatelessUploadError(
      "PINATA_ERROR",
      "Pinata did not accept the exact CAR upload. Retry the same recovery bundle.",
      502,
    );
  }
  if (payload.data.cid !== cid) {
    throw new StatelessUploadError(
      "PINATA_CID_MISMATCH",
      "Pinata returned a CID that does not match the onchain commitment.",
      502,
    );
  }
  return {
    id: typeof payload.data.id === "string" ? payload.data.id : null,
    cid,
    isDuplicate: payload.data.is_duplicate === true,
  };
}

function requestIdentity(body) {
  const chainId = Number(body?.chainId);
  if (
    !Number.isSafeInteger(chainId) ||
    chainId <= 0 ||
    !isAddress(body?.round)
  ) {
    throw new StatelessUploadError(
      "INVALID_REQUEST",
      "A supported chain and round address are required.",
    );
  }
  return {
    chainId,
    round: getAddress(body.round),
    submissionId:
      body?.kind === "round"
        ? undefined
        : parseUint(body?.submissionId, "submissionId"),
  };
}

/**
 * V5 database-free pinning entry point. Authorization comes exclusively from the configured
 * factory and the live round commitment; the caller receives no generic Pinata capability.
 */
export async function handleStatelessPinRequest({
  method,
  body,
  env = process.env,
  fetchImpl = fetch,
  loadCommitment = loadOnchainMediaCommitment,
}) {
  if (method !== "POST") {
    return {
      status: 405,
      body: {
        error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed." },
      },
    };
  }
  try {
    if (!env.PINATA_JWT?.trim()) {
      throw new StatelessUploadError(
        "HOSTED_UPLOAD_UNAVAILABLE",
        "Hosted uploads are unavailable. Keep the recovery bundle and retry later.",
        503,
      );
    }
    const identity = requestIdentity(body);
    if (body?.kind === "round") {
      if (!body.image || Array.isArray(body.image))
        throw new StatelessUploadError(
          "INVALID_REQUEST",
          "Exactly one round cover image is required.",
        );
      const commitment = await loadCommitment({
        ...identity,
        mediaKind: "round",
        env,
      });
      if (commitment?.kind !== "round")
        throw new StatelessUploadError(
          "COMMITMENT_MISMATCH",
          "The onchain round metadata commitment is unavailable.",
          409,
        );
      const metadataCar = decodeBase64Car(
        body.metadataCar,
        MAX_METADATA_CAR_BYTES,
      );
      const imageCar = decodeBase64Car(body.image.car, MAX_IMAGE_CAR_BYTES);
      let verified;
      try {
        verified = await verifyRoundBundle({
          metadataCar,
          imageCar,
          imageMimeType: String(body.image.mimeType || "").toLowerCase(),
          onchainRound: commitment,
        });
      } catch (error) {
        throw new StatelessUploadError(
          "COMMITMENT_MISMATCH",
          error instanceof Error
            ? error.message
            : "The round media does not match its onchain commitment.",
          422,
        );
      }
      const shared = {
        app: "lil-nouns-rounds",
        chain: identity.chainId,
        round: identity.round.toLowerCase(),
        creator: String(commitment.creator).toLowerCase(),
      };
      const image = await uploadVerifiedCar({
        car: imageCar,
        cid: verified.image.cid,
        name: "round-cover.car",
        keyvalues: { ...shared, kind: "round-cover" },
        env,
        fetchImpl,
      });
      const metadata = await uploadVerifiedCar({
        car: metadataCar,
        cid: verified.metadata.cid,
        name: "round-metadata.car",
        keyvalues: { ...shared, kind: "round-metadata" },
        env,
        fetchImpl,
      });
      return {
        status: 200,
        body: { data: { round: identity.round, metadata, image } },
      };
    }
    if (body?.kind === "submission") {
      if (!Array.isArray(body.images) || body.images.length > 8) {
        throw new StatelessUploadError(
          "INVALID_REQUEST",
          "The image CAR bundle is invalid.",
        );
      }
      const commitment = await loadCommitment({ ...identity, env });
      if (commitment?.kind !== "metadata") {
        throw new StatelessUploadError(
          "COMMITMENT_MISMATCH",
          "The onchain submission commitment is unavailable.",
          409,
        );
      }
      const metadataCar = decodeBase64Car(
        body.metadataCar,
        MAX_METADATA_CAR_BYTES,
      );
      const imageCars = body.images.map((image) =>
        decodeBase64Car(image?.car, MAX_IMAGE_CAR_BYTES),
      );
      const imageMimeTypes = body.images.map((image) =>
        String(image?.mimeType || "").toLowerCase(),
      );
      let verified;
      try {
        verified = await verifyOriginalSubmissionBundle({
          metadataCar,
          imageCars,
          imageMimeTypes,
          onchainSubmission: commitment,
        });
      } catch (error) {
        throw new StatelessUploadError(
          "COMMITMENT_MISMATCH",
          error instanceof Error
            ? error.message
            : "The CAR bundle does not match the onchain submission.",
          422,
        );
      }
      const shared = {
        app: "lil-nouns-rounds",
        chain: identity.chainId,
        round: identity.round.toLowerCase(),
        submission: identity.submissionId,
        owner: String(commitment.owner).toLowerCase(),
      };
      const images = [];
      for (let index = 0; index < verified.images.length; index += 1) {
        images.push(
          await uploadVerifiedCar({
            car: imageCars[index],
            cid: verified.images[index].cid,
            name: `submission-${identity.submissionId}-image-${index}.car`,
            keyvalues: {
              ...shared,
              kind: "submission-image",
              imageIndex: index,
            },
            env,
            fetchImpl,
          }),
        );
      }
      const metadata = await uploadVerifiedCar({
        car: metadataCar,
        cid: verified.metadata.cid,
        name: `submission-${identity.submissionId}-metadata.car`,
        keyvalues: { ...shared, kind: "submission-metadata" },
        env,
        fetchImpl,
      });
      return {
        status: 200,
        body: {
          data: { submissionId: identity.submissionId, metadata, images },
        },
      };
    }

    if (body?.kind === "admin-image") {
      const imageIndex = parseUint(body?.imageIndex, "imageIndex", {
        safe: true,
      });
      const commitment = await loadCommitment({ ...identity, imageIndex, env });
      if (commitment?.kind !== "admin-image") {
        throw new StatelessUploadError(
          "COMMITMENT_MISMATCH",
          "The onchain image commitment is unavailable.",
          409,
        );
      }
      const car = decodeBase64Car(body.car, MAX_IMAGE_CAR_BYTES);
      let verified;
      try {
        verified = await verifyCommittedCar({
          car,
          commitment: {
            kind: "image",
            uri: commitment.uri,
            hash: commitment.hash,
            mimeType: String(body.mimeType || "").toLowerCase(),
          },
        });
      } catch (error) {
        throw new StatelessUploadError(
          "COMMITMENT_MISMATCH",
          error instanceof Error
            ? error.message
            : "The CAR does not match the onchain image.",
          422,
        );
      }
      const image = await uploadVerifiedCar({
        car,
        cid: verified.cid,
        name: `submission-${identity.submissionId}-admin-image-${imageIndex}.car`,
        keyvalues: {
          app: "lil-nouns-rounds",
          chain: identity.chainId,
          round: identity.round.toLowerCase(),
          submission: identity.submissionId,
          kind: "admin-image",
          imageIndex,
          signerA: String(commitment.signerA).toLowerCase(),
          signerB: String(commitment.signerB).toLowerCase(),
        },
        env,
        fetchImpl,
      });
      return {
        status: 200,
        body: {
          data: { submissionId: identity.submissionId, imageIndex, image },
        },
      };
    }
    throw new StatelessUploadError(
      "INVALID_REQUEST",
      "Unsupported committed-media kind.",
    );
  } catch (error) {
    if (error instanceof StatelessUploadError) {
      return {
        status: error.status,
        body: { error: { code: error.code, message: error.message } },
      };
    }
    return {
      status: 503,
      body: {
        error: {
          code: "ONCHAIN_CHECK_UNAVAILABLE",
          message:
            "The onchain media commitment could not be verified. Retry later.",
        },
      },
    };
  }
}

/** Derives commitments from the configured factory and live round; request bodies are never authority. */
export async function loadOnchainMediaCommitment({
  chainId,
  round,
  submissionId,
  imageIndex,
  mediaKind,
  env = process.env,
}) {
  const configured = configuredNetwork(env);
  if (Number(chainId) !== configured.chainId || !isAddress(round)) {
    throw new Error("Unsupported upload chain or round.");
  }
  const { Contract, JsonRpcProvider } = await import("ethers");
  const provider = new JsonRpcProvider(configured.rpcUrl, configured.chainId, {
    staticNetwork: true,
  });
  try {
    const rpcChainId = await provider.send("eth_chainId", []);
    if (Number(rpcChainId) !== configured.chainId)
      throw new Error("Upload RPC chain mismatch.");
    const checkedRound = getAddress(round);
    const registrations = await Promise.all(
      configured.factories.map((factoryAddress) =>
        new Contract(
          factoryAddress,
          ["function isRound(address) view returns (bool)"],
          provider,
        ).isRound(checkedRound),
      ),
    );
    if (!registrations.some(Boolean))
      throw new Error("Round is not registered by an allowed factory.");
    const contract = new Contract(
      checkedRound,
      [
        "function deployedImplementationVersion() view returns (uint32)",
        "function creator() view returns (address)",
        "function metadataURI() view returns (string)",
        "function metadataHash() view returns (bytes32)",
        "function getSubmission(uint256) view returns ((address owner,uint8 submissionType,uint8 status,uint40 createdAt,uint32 titleLength,uint32 descriptionLength,uint8 originalImageCount,bytes32 titleHash,bytes32 descriptionHash,string metadataURI,bytes32 metadataHash))",
        "function getSubmissionImage(uint256,uint256) view returns ((string imageURI,bytes32 imageHash,address signerA,address signerB,address executor,uint40 appendedAt))",
      ],
      provider,
    );
    if (Number(await contract.deployedImplementationVersion()) < 5) {
      throw new Error("Stateless media commitments require a V5 round.");
    }
    if (mediaKind === "round") {
      const [creator, metadataURI, metadataHash] = await Promise.all([
        contract.creator(),
        contract.metadataURI(),
        contract.metadataHash(),
      ]);
      return { kind: "round", creator, metadataURI, metadataHash };
    }
    if (imageIndex === undefined) {
      const submission = await contract.getSubmission(submissionId);
      return {
        kind: "metadata",
        owner: submission.owner,
        metadataURI: submission.metadataURI,
        metadataHash: submission.metadataHash,
        originalImageCount: Number(submission.originalImageCount),
      };
    }
    const image = await contract.getSubmissionImage(submissionId, imageIndex);
    return {
      kind: "admin-image",
      uri: image.imageURI,
      hash: image.imageHash,
      signerA: image.signerA,
      signerB: image.signerB,
    };
  } finally {
    provider.destroy();
  }
}
