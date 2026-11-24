// @ts-nocheck -- Bun's test globals are executed by Bun and are not in the app tsconfig.
import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { SubmissionMediaUpload } from "./SubmissionMediaUpload";

describe("Submission media upload", () => {
  it("shows the self-pinning flow and external video label without a method selector", () => {
    const markup = renderToStaticMarkup(
      <SubmissionMediaUpload
        commitFirst
        files={[]}
        onFilesChange={() => {}}
        youtubeLinks=""
        onYouTubeLinksChange={() => {}}
      />,
    );

    expect(markup).toContain("Pin media on IPFS");
    expect(markup).toContain("External Video Links");
    expect(markup).not.toContain("Metadata publishing method");
    expect(markup).not.toContain("Manual URI + hash");
  });
});
