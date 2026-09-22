// @ts-nocheck -- Bun's test globals are executed by Bun and are not in the app tsconfig.
import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { SubmissionMediaUpload } from "./SubmissionMediaUpload";

describe("Submission media upload", () => {
  it("shows the sponsored upload flow and external video label without a method selector", () => {
    const markup = renderToStaticMarkup(
      <SubmissionMediaUpload
        commitFirst
        files={[]}
        onFilesChange={() => {}}
        youtubeLinks=""
        onYouTubeLinksChange={() => {}}
      />,
    );

    expect(markup).toContain("Wallet-authorized, host-sponsored Pinata upload");
    expect(markup).toContain("External Video Links");
    expect(markup).not.toContain("Metadata publishing method");
    expect(markup).not.toContain("Manual URI + hash");
  });
});
