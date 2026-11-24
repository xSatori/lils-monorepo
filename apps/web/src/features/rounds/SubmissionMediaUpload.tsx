import { ImagePlus, Link as LinkIcon, ShieldCheck, X } from "lucide-react";

import { configuredRoundsUploadBase } from "./upload-service";
import { Textarea } from "@/components/ui/textarea";

import {
  ALLOWED_IMAGE_MIME_TYPES,
  MAX_IMAGE_COUNT,
  MAX_TOTAL_IMAGE_BYTES,
} from "./media";

function formatBytes(bytes: number) {
  return `${(bytes / (1024 * 1024)).toFixed(bytes >= 1024 * 1024 ? 1 : 2)} MiB`;
}

export function SubmissionMediaUpload({
  commitFirst,
  files,
  onFilesChange,
  youtubeLinks,
  onYouTubeLinksChange,
}: {
  commitFirst: boolean;
  files: readonly File[];
  onFilesChange: (files: File[]) => void;
  youtubeLinks: string;
  onYouTubeLinksChange: (value: string) => void;
}) {
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  return (
    <fieldset className="grid gap-4 rounded-xl border bg-background-ternary p-4">
      <legend className="px-1 font-semibold">Submission metadata</legend>
      <div className="rounded-xl bg-white p-3 text-content-secondary paragraph-sm">
        <p className="flex items-center gap-2 font-semibold text-content-primary">
          <ShieldCheck className="h-4 w-4" aria-hidden="true" />
          {configuredRoundsUploadBase() ? "Wallet-authorized, host-sponsored Pinata upload" : "Pin media on IPFS"}
        </p>
        <p className="mt-1">
          {!configuredRoundsUploadBase() ? "Prepare your files, pin them with your IPFS provider, then verify them before submitting." : commitFirst
            ? "Submit your entry first, then we securely upload your images. If the upload fails, you can retry without submitting again."
            : "Historical rounds sign a free, one-time upload message and pin media before the onchain submission."}
        </p>
      </div>
      <label className="grid min-h-28 cursor-pointer place-items-center gap-2 rounded-xl border-2 border-dashed bg-white p-4 text-center focus-within:ring-2">
        <ImagePlus className="h-6 w-6" aria-hidden="true" />
        <span className="font-semibold">
          Choose up to {MAX_IMAGE_COUNT} images
        </span>
        <span className="text-content-secondary paragraph-sm">
          JPEG, PNG, WebP, or GIF · 10 MiB each ·{" "}
          {formatBytes(MAX_TOTAL_IMAGE_BYTES)} total
        </span>
        <input
          className="sr-only"
          type="file"
          multiple
          accept={ALLOWED_IMAGE_MIME_TYPES.join(",")}
          onChange={(event) => {
            onFilesChange(Array.from(event.target.files || []));
            event.currentTarget.value = "";
          }}
        />
      </label>
      {files.length > 0 && (
        <div>
          <div className="flex items-center justify-between gap-3 text-content-secondary label-sm">
            <span>{files.length} selected</span>
            <span>{formatBytes(totalBytes)}</span>
          </div>
          <ul className="mt-2 grid gap-2" aria-label="Selected images">
            {files.map((file, index) => (
              <li
                key={`${file.name}-${file.size}-${index}`}
                className="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2 paragraph-sm"
              >
                <span className="min-w-0 truncate">{file.name}</span>
                <button
                  type="button"
                  className="flex min-h-11 min-w-11 items-center justify-center rounded-lg hover:bg-background-secondary focus-visible:ring-2"
                  aria-label={`Remove ${file.name}`}
                  onClick={() =>
                    onFilesChange(
                      files.filter((_, itemIndex) => itemIndex !== index),
                    )
                  }
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <label className="grid gap-2 label-sm">
        <span className="flex items-center gap-2">
          <LinkIcon className="h-4 w-4" aria-hidden="true" />
          External Video Links
        </span>
        <Textarea
          className="min-h-24 rounded-xl border-2 bg-white text-base"
          value={youtubeLinks}
          onChange={(event) => onYouTubeLinksChange(event.target.value)}
          placeholder="https://youtu.be/…"
        />
        <span className="text-content-secondary paragraph-sm">
          Optional: one HTTPS YouTube URL per line. Links are included in
          metadata; video files are never uploaded or proxied.
        </span>
      </label>
    </fieldset>
  );
}
