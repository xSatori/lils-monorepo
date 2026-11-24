import { configuredRoundsUploadBase } from "./upload-service";
import { useManualPins, ManualPinFiles } from "./ManualPinFiles";
import { useState, type FormEvent } from "react";
import {
  keccak256,
  type Address,
  type Hex,
  type TypedDataDefinition,
} from "viem";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { parseContentHash } from "./metadata";
import { RoundsStatus } from "./RoundsStatus";
import type { RoundAction } from "./RoundActions";
import type { RoundView } from "./types";
import { isContentAddressedUri, resolveImageUri } from "./validation";
import {
  ALLOWED_IMAGE_MIME_TYPES,
  pinCommittedAdminImage,
  prepareDeterministicImage,
  type PreparedContent,
} from "./media";

type Approval = { signer: Address; signature: Hex };
type ImagePackage = {
  chainId: number;
  round: Address;
  submissionId: string;
  nonce: string;
  imageURI: string;
  imageHash: Hex;
  deadline: string;
  approvals: Approval[];
};

const types = {
  SubmissionImage: [
    { name: "round", type: "address" },
    { name: "submissionId", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "imageURI", type: "string" },
    { name: "imageHash", type: "bytes32" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

function typedData(pkg: ImagePackage): TypedDataDefinition {
  return {
    domain: {
      name: "LilNounsRound",
      version: "5",
      chainId: pkg.chainId,
      verifyingContract: pkg.round,
    },
    types,
    primaryType: "SubmissionImage",
    message: {
      round: pkg.round,
      submissionId: BigInt(pkg.submissionId),
      nonce: BigInt(pkg.nonce),
      imageURI: pkg.imageURI,
      imageHash: pkg.imageHash,
      deadline: BigInt(pkg.deadline),
    },
  };
}

export function SubmissionImageAdmin({
  round,
  chainId,
  account,
  canApprove,
  isPending,
  signTypedData,
  onAction,
}: {
  round: RoundView;
  chainId: number;
  account?: Address;
  canApprove: boolean;
  isPending: boolean;
  signTypedData?: (data: TypedDataDefinition) => Promise<Hex>;
  onAction: RoundAction;
}) {
  const [submissionId, setSubmissionId] = useState("0");
  const [imageURI, setImageURI] = useState("");
  const [imageHash, setImageHash] = useState("");
  const [packageText, setPackageText] = useState("");
  const [error, setError] = useState("");
  const [pinStatus, setPinStatus] = useState("");
  const manual = useManualPins();
  const sponsored = Boolean(configuredRoundsUploadBase());
  const [preparedImage, setPreparedImage] = useState<PreparedContent>();
  const [pendingPin, setPendingPin] = useState<{
    submissionId: bigint;
    imageIndex: number;
    prepared: PreparedContent;
  }>();

  async function selectImage(file?: File) {
    setError("");
    setPinStatus("");
    setPreparedImage(undefined);
    if (!file) return;
    try {
      const prepared = await prepareDeterministicImage(file);
      setPreparedImage(prepared);
      setImageURI(prepared.uri);
      setImageHash(keccak256(prepared.bytes));
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Image preparation failed.",
      );
    }
  }

  function prepare(event: FormEvent) {
    event.preventDefault();
    setError("");
    const id = Number(submissionId);
    const submission = round.submissions[id];
    const hash = parseContentHash(imageHash.trim());
    if (!submission || !Number.isInteger(id) || id < 0)
      return setError("Choose an existing submission.");
    if (!isContentAddressedUri(imageURI.trim()) || !hash) {
      return setError(
        "Provide an ipfs:// or ar:// image URI and bytes32 integrity hash.",
      );
    }
    if (
      submission.originalImageCount + submission.adminAddedImages.length >=
      8
    ) {
      return setError("This submission already has the maximum eight images.");
    }
    const pkg: ImagePackage = {
      chainId,
      round: round.round,
      submissionId: String(id),
      nonce: String(submission.adminAddedImages.length),
      imageURI: imageURI.trim(),
      imageHash: hash,
      deadline: String(Math.floor(Date.now() / 1_000) + 20 * 60),
      approvals: [],
    };
    setPackageText(JSON.stringify(pkg, null, 2));
  }

  function parsePackage(): ImagePackage {
    const pkg = JSON.parse(packageText) as ImagePackage;
    if (
      pkg.chainId !== chainId ||
      pkg.round.toLowerCase() !== round.round.toLowerCase()
    ) {
      throw new Error("Approval package targets a different chain or round.");
    }
    if (
      !isContentAddressedUri(pkg.imageURI) ||
      !parseContentHash(pkg.imageHash)
    ) {
      throw new Error("Approval package contains an invalid image commitment.");
    }
    if (BigInt(pkg.deadline) < BigInt(Math.floor(Date.now() / 1_000))) {
      throw new Error("Approval package has expired.");
    }
    return pkg;
  }

  async function sign() {
    setError("");
    try {
      if (!account || !canApprove || !signTypedData)
        throw new Error("A current round or global admin wallet is required.");
      const pkg = parsePackage();
      const signature = await signTypedData(typedData(pkg));
      const approvals = pkg.approvals.filter(
        (approval) => approval.signer.toLowerCase() !== account.toLowerCase(),
      );
      approvals.push({ signer: account, signature });
      setPackageText(JSON.stringify({ ...pkg, approvals }, null, 2));
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Approval signing failed.",
      );
    }
  }

  async function execute() {
    setError("");
    try {
      const pkg = parsePackage();
      if (
        pkg.approvals.length !== 2 ||
        pkg.approvals[0].signer.toLowerCase() ===
          pkg.approvals[1].signer.toLowerCase()
      ) {
        throw new Error("Exactly two distinct admin approvals are required.");
      }
      if (!sponsored) {
        if (!preparedImage || preparedImage.uri !== pkg.imageURI || keccak256(preparedImage.bytes).toLowerCase() !== pkg.imageHash.toLowerCase()) throw new Error("Select the exact approved image file before verifying the pin.");
        if (!(await manual.prepareOrVerify([preparedImage]))) return;
      }
      await onAction("appendSubmissionImage", [
        BigInt(pkg.submissionId),
        pkg.imageURI,
        pkg.imageHash,
        BigInt(pkg.nonce),
        BigInt(pkg.deadline),
        pkg.approvals[0],
        pkg.approvals[1],
      ]);
      if (!sponsored) {
        manual.clear();
        setPinStatus("Image verified and appended onchain.");
        return;
      }
      const imageIndex = Number(BigInt(pkg.nonce));
      if (
        preparedImage &&
        preparedImage.uri === pkg.imageURI &&
        keccak256(preparedImage.bytes).toLowerCase() ===
          pkg.imageHash.toLowerCase()
      ) {
        const recovery = {
          submissionId: BigInt(pkg.submissionId),
          imageIndex,
          prepared: preparedImage,
        };
        setPendingPin(recovery);
        await pinExactImage(recovery);
      } else {
        setPinStatus(
          "The append is confirmed onchain. Reselect the exact committed image file to pin it through the sponsored host, or pin the CID independently.",
        );
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Image append failed.");
    }
  }

  async function pinExactImage(recovery: {
    submissionId: bigint;
    imageIndex: number;
    prepared: PreparedContent;
  }) {
    setError("");
    try {
      await pinCommittedAdminImage({
        chainId,
        round: round.round,
        ...recovery,
        onStatus: setPinStatus,
      });
      setPendingPin(undefined);
    } catch (cause) {
      setPendingPin(recovery);
      setError(
        `The append is confirmed onchain, but the exact image is not yet pinned. ${
          cause instanceof Error ? cause.message : "Retry the exact CAR."
        }`,
      );
    }
  }

  return (
    <section
      className="rounded-[16px] border bg-white p-5"
      aria-labelledby="image-help-title"
    >
      <h2 id="image-help-title" className="heading-6">
        Two-admin image assistance
      </h2>
      <p className="mt-2 text-content-secondary paragraph-sm">
        Prepare and share this JSON package. Two distinct current global/round
        admins sign the exact permanent append; any wallet may execute it before
        voting starts.
      </p>
      <form onSubmit={prepare} className="mt-4 grid gap-3">
        <Input
          aria-label="Submission ID"
          type="number"
          min={0}
          value={submissionId}
          onChange={(event) => setSubmissionId(event.target.value)}
        />
        <label className="grid gap-2 label-sm">
          Exact image file for deterministic CID and post-append pinning
          <input
            type="file"
            accept={ALLOWED_IMAGE_MIME_TYPES.join(",")}
            onChange={(event) => void selectImage(event.target.files?.[0])}
          />
        </label>
        <Input
          aria-label="Image URI"
          placeholder="ipfs://…"
          value={imageURI}
          onChange={(event) => setImageURI(event.target.value)}
        />
        <Input
          aria-label="Image hash"
          placeholder="0x…"
          value={imageHash}
          onChange={(event) => setImageHash(event.target.value)}
        />
        <Button type="submit" variant="secondary">
          Prepare approval package
        </Button>
      </form>
      {imageURI && isContentAddressedUri(imageURI) && (
        <img
          src={resolveImageUri(imageURI)}
          alt="Proposed admin-added media preview"
          className="mt-4 max-h-64 w-full rounded-xl bg-background-ternary object-contain"
        />
      )}
      <label className="mt-4 grid gap-2 label-sm">
        Shareable approval package
        <Textarea
          className="min-h-52 font-mono text-xs"
          value={packageText}
          onChange={(event) => setPackageText(event.target.value)}
        />
      </label>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          disabled={!canApprove || !packageText}
          onClick={sign}
        >
          Review and sign
        </Button>
        <Button
          type="button"
          disabled={!account || !packageText || isPending}
          onClick={execute}
        >
          Execute two approvals
        </Button>
        <ManualPinFiles files={manual.files} />
        {pendingPin && (
          <Button
            type="button"
            variant="secondary"
            onClick={() => void pinExactImage(pendingPin)}
          >
            Retry exact image pin
          </Button>
        )}
      </div>
      {pinStatus && (
        <div className="mt-3">
          <RoundsStatus kind="info">{pinStatus}</RoundsStatus>
        </div>
      )}
      {error && (
        <div className="mt-3">
          <RoundsStatus kind="error">{error}</RoundsStatus>
        </div>
      )}
    </section>
  );
}
