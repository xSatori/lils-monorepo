import type { DeterministicRoundBuild, DeterministicSubmissionBuild, PreparedContent } from "./media";

export type PinFile = Pick<PreparedContent, "name" | "bytes" | "uri" | "car">;

export function pinFiles(build: DeterministicRoundBuild | DeterministicSubmissionBuild): PinFile[] {
  const images = "images" in build ? build.images : [build.image];
  return [
    { name: "metadata.json", bytes: new TextEncoder().encode(build.json), uri: build.uri, car: build.metadataCar },
    ...images,
  ];
}

/** Verify public availability of the current, locally prepared raw blocks before committing their CIDs. */
export async function verifyPinFiles(files: PinFile[], read: typeof fetch = fetch) {
  for (const file of files) {
    const cid = file.uri.slice("ipfs://".length);
    const response = await read("https://ipfs.io/ipfs/" + encodeURIComponent(cid), {
      signal: AbortSignal.timeout(20000),
      cache: "no-store",
    });
    if (!response.ok || !response.body) throw new Error("Could not retrieve " + file.name + ". Pin its CAR and retry verification.");
    const reader = response.body.getReader();
    let offset = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (offset + value.length > file.bytes.length ||
            !value.every((byte, index) => byte === file.bytes[offset + index])) {
          throw new Error("Pinned bytes differ for " + file.name + ".");
        }
        offset += value.length;
      }
      if (offset !== file.bytes.length) throw new Error("Incomplete pinned file: " + file.name + ".");
    } finally {
      await reader.cancel();
    }
  }
}
