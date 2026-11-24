import { roundsUploadBase } from "./upload-service";
import {
  decodeEventLog,
  keccak256,
  toBytes,
  type Address,
  type Hex,
} from "viem";
import { createDeterministicCar } from "@nouns/rounds-media";
import { getRoundFactoryAbi, roundV5Abi } from "./contracts";

export const ALLOWED_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_IMAGE_COUNT = 8;
export const MAX_TOTAL_IMAGE_BYTES = 40 * 1024 * 1024;
export const MAX_METADATA_BYTES = 64 * 1024;

type UploadManifest = { name: string; type: string; size: number };

type ApiEnvelope<T> = {
  data?: T;
  error?: { code?: string; message?: string };
};

export type SubmissionMetadataBuild = {
  json: string;
  hash: Hex;
  byteLength: number;
};

export type PreparedContent = {
  cid: string;
  uri: `ipfs://${string}`;
  bytes: Uint8Array;
  car: Uint8Array;
  name: string;
  mimeType: string;
};

export type DeterministicSubmissionBuild = SubmissionMetadataBuild & {
  uri: `ipfs://${string}`;
  originalImageCount: number;
  images: PreparedContent[];
  metadataCar: Uint8Array;
};

export type RoundMetadataBuild = SubmissionMetadataBuild;

export type DeterministicRoundBuild = RoundMetadataBuild & {
  uri: `ipfs://${string}`;
  image: PreparedContent;
  metadataCar: Uint8Array;
};

function hasImageMagic(bytes: Uint8Array, type: string): boolean {
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

export function validateImageFiles(files: readonly File[]): string | undefined {
  if (files.length > MAX_IMAGE_COUNT) {
    return "Choose no more than eight images.";
  }
  let total = 0;
  for (const file of files) {
    if (!(ALLOWED_IMAGE_MIME_TYPES as readonly string[]).includes(file.type)) {
      return "Images must be JPEG, PNG, WebP, or GIF. Video, audio, and SVG uploads are not accepted.";
    }
    if (
      !Number.isSafeInteger(file.size) ||
      file.size <= 0 ||
      file.size > MAX_IMAGE_BYTES
    ) {
      return `Each image must be no larger than 10 MiB (${file.name}).`;
    }
    total += file.size;
  }
  if (total > MAX_TOTAL_IMAGE_BYTES) {
    return "Selected images may total at most 40 MiB.";
  }
}

export function isYouTubeUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return false;
    const host = url.hostname.toLowerCase();
    return (
      host === "youtube.com" ||
      host.endsWith(".youtube.com") ||
      host === "youtu.be"
    );
  } catch {
    return false;
  }
}

export function parseYouTubeUrls(value: string): string[] {
  const urls = [
    ...new Set(
      value
        .split(/\r?\n/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
  if (urls.length > 8) throw new Error("Add no more than eight YouTube links.");
  const invalid = urls.find((url) => !isYouTubeUrl(url));
  if (invalid)
    throw new Error(
      "YouTube links must use an HTTPS youtube.com or youtu.be address.",
    );
  return urls;
}

export function buildSubmissionMetadata(input: {
  title: string;
  description: string;
  images: readonly string[];
  youtubeUrls: readonly string[];
}): SubmissionMetadataBuild {
  const json = JSON.stringify({
    schema: "lil-nouns-round-submission-v1",
    title: input.title,
    description: input.description,
    images: [...input.images],
    youtubeUrls: [...input.youtubeUrls],
  });
  const bytes = toBytes(json);
  if (bytes.length > MAX_METADATA_BYTES) {
    throw new Error("Submission metadata is larger than 64 KiB.");
  }
  return { json, hash: keccak256(bytes), byteLength: bytes.length };
}

export function buildRoundMetadata(input: {
  title: string;
  description: string;
  image: string;
}): RoundMetadataBuild {
  const json = JSON.stringify({
    schema: "lil-nouns-round-v1",
    title: input.title,
    description: input.description,
    image: input.image,
  });
  const bytes = toBytes(json);
  if (bytes.length > MAX_METADATA_BYTES)
    throw new Error("Round metadata is larger than 64 KiB.");
  return {
    json,
    hash: keccak256(bytes),
    byteLength: bytes.length,
  };
}

export async function prepareDeterministicImage(
  file: File,
): Promise<PreparedContent> {
  const validationError = validateImageFiles([file]);
  if (validationError) throw new Error(validationError);
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!hasImageMagic(bytes, file.type)) {
    throw new Error(
      `${file.name} does not contain valid ${file.type} image bytes.`,
    );
  }
  return {
    ...(await createDeterministicCar(bytes)),
    name: file.name,
    mimeType: file.type,
  };
}

/** Builds exact raw-block CIDs/CARs before any transaction or upload. */
export async function prepareDeterministicSubmission(input: {
  files: readonly File[];
  title: string;
  description: string;
  youtubeUrls: readonly string[];
}): Promise<DeterministicSubmissionBuild> {
  const validationError = validateImageFiles(input.files);
  if (validationError) throw new Error(validationError);
  const images = await Promise.all(input.files.map(prepareDeterministicImage));
  const metadata = buildSubmissionMetadata({
    title: input.title,
    description: input.description,
    images: images.map((image) => image.uri),
    youtubeUrls: input.youtubeUrls,
  });
  const metadataContent = await createDeterministicCar(toBytes(metadata.json));
  return {
    ...metadata,
    uri: metadataContent.uri,
    originalImageCount: images.length,
    images,
    metadataCar: metadataContent.car,
  };
}

export async function prepareDeterministicRound(input: {
  file: File;
  title: string;
  description: string;
}): Promise<DeterministicRoundBuild> {
  const image = await prepareDeterministicImage(input.file);
  const metadata = buildRoundMetadata({
    title: input.title,
    description: input.description,
    image: image.uri,
  });
  const metadataContent = await createDeterministicCar(toBytes(metadata.json));
  return {
    ...metadata,
    uri: metadataContent.uri,
    image,
    metadataCar: metadataContent.car,
  };
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(
      ...bytes.subarray(offset, offset + chunkSize),
    );
  }
  return btoa(binary);
}

export type PinCommittedSubmissionResult = {
  submissionId: string;
  metadata: { cid: string; isDuplicate: boolean };
  images: Array<{ cid: string; isDuplicate: boolean }>;
};

export function committedSubmissionIdFromLogs(input: {
  round: Address;
  metadataHash: Hex;
  logs: readonly {
    address: Address;
    data: Hex;
    topics: readonly Hex[];
  }[];
}): bigint {
  for (const log of input.logs) {
    if (log.address.toLowerCase() !== input.round.toLowerCase()) continue;
    try {
      const decoded = decodeEventLog({
        abi: roundV5Abi,
        eventName: "SubmissionCreated",
        data: log.data,
        topics: log.topics as [signature: Hex, ...args: Hex[]],
        strict: true,
      });
      const args = decoded.args as
        | { metadataHash: Hex; submissionId: bigint }
        | undefined;
      if (args?.metadataHash === input.metadataHash) {
        return args.submissionId;
      }
    } catch {
      // A submission receipt can contain other round events; only this exact event is authoritative.
    }
  }
  throw new Error(
    "The confirmed transaction did not contain the expected submission commitment.",
  );
}

export function committedRoundAddressFromLogs(input: {
  factory: Address;
  factoryGeneration?: number;
  logs: readonly {
    address: Address;
    data: Hex;
    topics: readonly Hex[];
  }[];
}): Address {
  for (const log of input.logs) {
    if (log.address.toLowerCase() !== input.factory.toLowerCase()) continue;
    try {
      const decoded = decodeEventLog({
        abi: getRoundFactoryAbi(input.factoryGeneration),
        eventName: "RoundCreated",
        data: log.data,
        topics: log.topics as [signature: Hex, ...args: Hex[]],
        strict: true,
      });
      const round = (decoded.args as { round?: Address }).round;
      if (round) return round;
    } catch {
      // Factory receipts include fee and clone logs; only the exact creation event is authoritative.
    }
  }
  throw new Error(
    "The confirmed transaction did not contain the expected round creation event.",
  );
}

export async function pinCommittedRound(input: {
  chainId: number;
  round: Address;
  prepared: DeterministicRoundBuild;
  onStatus?: (status: string) => void;
}): Promise<{
  round: Address;
  metadata: { cid: string; isDuplicate: boolean };
  image: { cid: string; isDuplicate: boolean };
}> {
  input.onStatus?.("Pinning the confirmed round cover and metadata…");
  const result = await postApi<{
    round: Address;
    metadata: { cid: string; isDuplicate: boolean };
    image: { cid: string; isDuplicate: boolean };
  }>("/pin", {
    kind: "round",
    chainId: input.chainId,
    round: input.round,
    metadataCar: encodeBase64(input.prepared.metadataCar),
    image: {
      car: encodeBase64(input.prepared.image.car),
      name: input.prepared.image.name,
      mimeType: input.prepared.image.mimeType,
    },
  });
  input.onStatus?.("Round cover and metadata pinned to their onchain IDs.");
  return result;
}

/** Pins only after the V5 commitment is confirmed onchain. Retrying sends identical CAR bytes. */
export async function pinCommittedSubmission(input: {
  chainId: number;
  round: Address;
  submissionId: bigint;
  prepared: DeterministicSubmissionBuild;
  onStatus?: (status: string) => void;
}): Promise<PinCommittedSubmissionResult> {
  input.onStatus?.("Pinning the confirmed onchain media commitment…");
  const result = await postApi<PinCommittedSubmissionResult>(
    "/pin",
    {
      kind: "submission",
      chainId: input.chainId,
      round: input.round,
      submissionId: input.submissionId.toString(),
      metadataCar: encodeBase64(input.prepared.metadataCar),
      images: input.prepared.images.map((image) => ({
        car: encodeBase64(image.car),
        name: image.name,
        mimeType: image.mimeType,
      })),
    },
  );
  input.onStatus?.("Media pinned to the exact onchain content IDs.");
  return result;
}

export async function pinCommittedAdminImage(input: {
  chainId: number;
  round: Address;
  submissionId: bigint;
  imageIndex: number;
  prepared: PreparedContent;
  onStatus?: (status: string) => void;
}): Promise<{
  submissionId: string;
  imageIndex: number;
  image: { cid: string; isDuplicate: boolean };
}> {
  input.onStatus?.("Pinning the confirmed admin-added image commitment…");
  const result = await postApi<{
    submissionId: string;
    imageIndex: number;
    image: { cid: string; isDuplicate: boolean };
  }>("/pin", {
    kind: "admin-image",
    chainId: input.chainId,
    round: input.round,
    submissionId: input.submissionId.toString(),
    imageIndex: input.imageIndex,
    car: encodeBase64(input.prepared.car),
    name: input.prepared.name,
    mimeType: input.prepared.mimeType,
  });
  input.onStatus?.("Admin-added media pinned to its exact onchain content ID.");
  return result;
}

async function postApi<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${roundsUploadBase()}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => ({}))) as ApiEnvelope<T>;
  if (!response.ok || !payload.data) {
    throw new Error(
      payload.error?.message ||
        "Hosted upload is unavailable. Use manual metadata instead.",
    );
  }
  return payload.data;
}

function readCid(payload: unknown): string {
  const value = payload as { cid?: unknown; data?: { cid?: unknown } };
  const cid =
    typeof value?.data?.cid === "string" ? value.data.cid : value?.cid;
  if (
    typeof cid !== "string" ||
    !/^(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{20,})$/.test(cid)
  ) {
    throw new Error("The upload provider did not return a valid content ID.");
  }
  return cid;
}

async function uploadWithSignedUrl(
  url: string,
  file: Blob,
  name: string,
): Promise<string> {
  const form = new FormData();
  form.append("file", file, name);
  form.append("network", "public");
  const response = await fetch(url, { method: "POST", body: form });
  const payload: unknown = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error("Pinata rejected the sponsored upload.");
  return readCid(payload);
}

export async function prepareHostedSubmission(input: {
  wallet: Address;
  round: Address;
  chainId: number;
  files: readonly File[];
  title: string;
  description: string;
  youtubeUrls: readonly string[];
  signMessage: (message: string) => Promise<Hex>;
  onStatus?: (status: string) => void;
}): Promise<SubmissionMetadataBuild & { uri: string; imageUris: string[] }> {
  const validationError = validateImageFiles(input.files);
  if (validationError) throw new Error(validationError);
  const files: UploadManifest[] = input.files.map(({ name, type, size }) => ({
    name,
    type,
    size,
  }));

  input.onStatus?.("Requesting a one-time wallet challenge…");
  const challenge = await postApi<{
    challengeId: string;
    message: string;
    expiresAt: string;
  }>("/challenge", {
    wallet: input.wallet,
    round: input.round,
    chainId: input.chainId,
    files,
  });
  const signature = await input.signMessage(challenge.message);

  input.onStatus?.("Authorizing short-lived image uploads…");
  const authorization = await postApi<{
    uploads: Array<UploadManifest & { index: number; url: string }>;
    sessionToken: string;
    expiresAt: string;
  }>("/presign", {
    challengeId: challenge.challengeId,
    signature,
    wallet: input.wallet,
    round: input.round,
    chainId: input.chainId,
    files,
  });

  const ordered = [...authorization.uploads].sort((a, b) => a.index - b.index);
  if (
    ordered.length !== input.files.length ||
    ordered.some((upload, index) => {
      const selected = input.files[index];
      const manifest = files[index];
      return (
        upload.index !== index ||
        !selected ||
        !manifest ||
        upload.name !== manifest.name ||
        upload.type !== selected.type ||
        upload.size !== selected.size
      );
    })
  ) {
    throw new Error(
      "The upload authorization did not match the selected images.",
    );
  }
  if (ordered.length) {
    input.onStatus?.(
      `Uploading ${ordered.length} image${ordered.length === 1 ? "" : "s"}…`,
    );
  }
  const imageUris = await Promise.all(
    ordered.map(async (upload) => {
      const cid = await uploadWithSignedUrl(
        upload.url,
        input.files[upload.index],
        upload.name,
      );
      return `ipfs://${cid}`;
    }),
  );

  const metadata = buildSubmissionMetadata({
    title: input.title,
    description: input.description,
    images: imageUris,
    youtubeUrls: input.youtubeUrls,
  });
  input.onStatus?.("Authorizing exact submission metadata…");
  const metadataUpload = await postApi<{
    url: string;
    contentType: "application/json";
    expiresIn: number;
  }>("/metadata", {
    sessionToken: authorization.sessionToken,
    size: metadata.byteLength,
    hash: metadata.hash,
  });
  const cid = await uploadWithSignedUrl(
    metadataUpload.url,
    new Blob([metadata.json], { type: metadataUpload.contentType }),
    "submission.json",
  );
  input.onStatus?.("Metadata pinned. Confirm the onchain submission.");
  return { ...metadata, uri: `ipfs://${cid}`, imageUris };
}
