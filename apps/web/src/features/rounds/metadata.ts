import { configuredRoundsUploadBase } from "./upload-service";
import { isHex, keccak256, stringToHex, type Hex } from "viem";

import type { RoundMetadata, SubmissionMetadata } from "./types";
import { resolveContentUri } from "./validation";

export { resolveContentUri, validateSubmissionText } from "./validation";

export function contentHash(value: string): Hex {
  return keccak256(stringToHex(value));
}

export function parseContentHash(value: string): Hex | undefined {
  return isHex(value, { strict: true }) && value.length === 66
    ? value
    : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export async function fetchMetadata<
  T extends RoundMetadata | SubmissionMetadata,
>(uri: string, expectedHash?: Hex): Promise<T> {
  const base = configuredRoundsUploadBase();
  const cid = /^ipfs:\/\/([A-Za-z0-9]+)$/.exec(uri)?.[1];
  const sources = [
    ...(cid && base
      ? [`${base}/content?cid=${encodeURIComponent(cid)}`]
      : []),
    resolveContentUri(uri),
  ];
  let lastError: Error | undefined;
  let integrityError: Error | undefined;
  for (const source of sources) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);
    try {
      const response = await fetch(source, { signal: controller.signal });
      if (!response.ok) throw new Error(`Content returned ${response.status}.`);
      const raw = await response.text();
      if (
        expectedHash &&
        contentHash(raw).toLowerCase() !== expectedHash.toLowerCase()
      ) {
        integrityError = new Error(
          "Content does not match its onchain integrity hash.",
        );
        continue;
      }
      const value: unknown = JSON.parse(raw);
      if (
        !isRecord(value) ||
        typeof value.title !== "string" ||
        typeof value.description !== "string"
      ) {
        throw new Error("Content does not contain a title and description.");
      }
      if (
        (value.images !== undefined &&
          (!Array.isArray(value.images) ||
            !value.images.every((image) => typeof image === "string"))) ||
        (value.youtubeUrls !== undefined &&
          (!Array.isArray(value.youtubeUrls) ||
            !value.youtubeUrls.every((url) => typeof url === "string"))) ||
        (value.media !== undefined &&
          (!Array.isArray(value.media) ||
            !value.media.every(
              (item) =>
                isRecord(item) &&
                typeof item.uri === "string" &&
                typeof item.type === "string" &&
                ["image", "video", "audio"].includes(item.type) &&
                (item.alt === undefined || typeof item.alt === "string") &&
                (item.poster === undefined || typeof item.poster === "string"),
            )))
      ) {
        throw new Error("Content contains invalid media fields.");
      }
      return value as T;
    } catch (error) {
      lastError =
        error instanceof Error ? error : new Error("Content is unavailable.");
    } finally {
      clearTimeout(timeout);
    }
  }
  throw integrityError ?? lastError ?? new Error("Content is unavailable.");
}
