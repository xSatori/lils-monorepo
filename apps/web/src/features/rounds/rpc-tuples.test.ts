// @ts-nocheck -- Bun's test globals are executed by Bun and are not in the app tsconfig.
import { describe, expect, it } from "bun:test";

import { normalizeSubmissionImageTuple, normalizeSubmissionTuple } from "./rpc";

const owner = "0x1111111111111111111111111111111111111111";
const hash = `0x${"a".repeat(64)}`;

describe("round RPC tuple decoding", () => {
  it("decodes a named V8 submission struct returned by Viem", () => {
    const fields = [
      owner,
      0,
      0,
      123n,
      5,
      11,
      1,
      hash,
      hash,
      "ipfs://bafytest",
      hash,
    ];
    const names = [
      "owner",
      "submissionType",
      "status",
      "createdAt",
      "titleLength",
      "descriptionLength",
      "originalImageCount",
      "titleHash",
      "descriptionHash",
      "metadataURI",
      "metadataHash",
    ];
    const named = Object.fromEntries(
      names.map((name, index) => [name, fields[index]]),
    );
    expect(normalizeSubmissionTuple(named, 8)).toEqual(fields);
    expect(normalizeSubmissionTuple(fields, 8)).toEqual(fields);
  });

  it("decodes legacy submissions without the image-count field", () => {
    const fields = [
      owner,
      0,
      0,
      123n,
      5,
      11,
      hash,
      hash,
      "ipfs://bafytest",
      hash,
    ];
    const names = [
      "owner",
      "submissionType",
      "status",
      "createdAt",
      "titleLength",
      "descriptionLength",
      "titleHash",
      "descriptionHash",
      "metadataURI",
      "metadataHash",
    ];
    const named = Object.fromEntries(
      names.map((name, index) => [name, fields[index]]),
    );
    expect(normalizeSubmissionTuple(named, 4)).toEqual(fields);
  });

  it("decodes named appended-image structs and fails closed on missing fields", () => {
    const image = {
      imageURI: "ipfs://bafyimage",
      imageHash: hash,
      signerA: owner,
      signerB: owner,
      executor: owner,
      appendedAt: 456n,
    };
    expect(normalizeSubmissionImageTuple(image)).toEqual(Object.values(image));
    expect(() =>
      normalizeSubmissionImageTuple({ ...image, signerA: undefined }),
    ).toThrow("missing required fields");
  });
});
