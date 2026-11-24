import { useState } from "react";
import { Button } from "@/components/ui/button";
import { type PinFile, verifyPinFiles } from "./manual-pins";

export function useManualPins() {
  const [files, setFiles] = useState<PinFile[]>([]);
  async function prepareOrVerify(next: PinFile[]) {
    if (next.length !== files.length || next.some((file, index) => file.uri !== files[index]?.uri)) {
      setFiles(next);
      return false;
    }
    await verifyPinFiles(next);
    return true;
  }
  return { files, prepareOrVerify, clear: () => setFiles([]) };
}

function download(file: PinFile) {
  const url = URL.createObjectURL(new Blob([new Uint8Array(file.car)], { type: "application/vnd.ipld.car" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = file.uri.slice(7) + ".car";
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ManualPinFiles({ files }: { files: PinFile[] }) {
  if (!files.length) return null;
  return (
    <section aria-label="IPFS files" className="grid gap-2 rounded-xl border p-4">
      <p>Download each CAR and import it into an IPFS pinning service that supports CAR imports. Keep the files pinned. Submit the form again to verify the published bytes before signing.</p>
      {files.map((file, index) => (
        <Button type="button" variant="secondary" key={file.uri + index} onClick={() => download(file)}>
          Download {file.name} CAR
        </Button>
      ))}
    </section>
  );
}
