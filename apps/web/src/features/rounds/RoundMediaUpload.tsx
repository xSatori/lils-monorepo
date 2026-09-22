import { ImagePlus, ShieldCheck, X } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import { ALLOWED_IMAGE_MIME_TYPES, MAX_IMAGE_BYTES } from "./media";

export function RoundMediaUpload({
  title,
  onTitleChange,
  description,
  onDescriptionChange,
  file,
  onFileChange,
}: {
  title: string;
  onTitleChange: (value: string) => void;
  description: string;
  onDescriptionChange: (value: string) => void;
  file?: File;
  onFileChange: (file?: File) => void;
}) {
  return (
    <fieldset className="grid gap-4 rounded-xl border bg-background-ternary p-4">
      <legend className="px-1 font-semibold">Round metadata</legend>
      <label className="grid gap-2 label-sm">
        <span>Round title</span>
        <Input
          required
          value={title}
          onChange={(event) => onTitleChange(event.target.value)}
        />
      </label>
      <label className="grid gap-2 label-sm">
        <span>Round description</span>
        <Textarea
          required
          className="min-h-28 rounded-xl border-2 bg-white text-base"
          value={description}
          onChange={(event) => onDescriptionChange(event.target.value)}
        />
      </label>
      <label className="grid min-h-28 cursor-pointer place-items-center gap-2 rounded-xl border-2 border-dashed bg-white p-4 text-center focus-within:ring-2">
        <ImagePlus className="h-6 w-6" aria-hidden="true" />
        <span className="font-semibold">Round cover image</span>
        <span className="text-content-secondary paragraph-sm">
          Exactly one JPEG, PNG, WebP, or GIF · 10 MiB maximum
        </span>
        <input
          className="sr-only"
          type="file"
          accept={ALLOWED_IMAGE_MIME_TYPES.join(",")}
          onChange={(event) => {
            onFileChange(event.target.files?.[0]);
            event.currentTarget.value = "";
          }}
        />
      </label>
      {file && (
        <div className="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2 paragraph-sm">
          <span className="min-w-0 truncate">
            {file.name} · {(file.size / (1024 * 1024)).toFixed(2)} MiB
          </span>
          <button
            type="button"
            className="flex min-h-11 min-w-11 items-center justify-center rounded-lg hover:bg-background-secondary focus-visible:ring-2"
            aria-label={`Remove ${file.name}`}
            onClick={() => onFileChange(undefined)}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}
      <p className="text-content-secondary paragraph-sm">
        The browser rejects unsupported formats and files larger than{" "}
        {MAX_IMAGE_BYTES / (1024 * 1024)} MiB before any transaction.
      </p>
      <p className="flex items-start gap-2 rounded-xl bg-white p-3 text-content-secondary paragraph-sm">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        The exact metadata and cover IDs are prepared before creation, committed
        onchain, then pinned to IPFS after the RoundCreated confirmation.
      </p>
    </fieldset>
  );
}
