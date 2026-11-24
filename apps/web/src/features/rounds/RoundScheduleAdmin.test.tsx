// @ts-nocheck -- Bun's test globals are executed by Bun and are not in the app tsconfig.
import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { RoundScheduleAdmin } from "./RoundScheduleAdmin";
import { PrizeVaultState } from "./types";

const round = {
  implementationVersion: 6,
  scheduleConfigured: false,
  submissionsOpen: 0,
  submissionsClose: 0,
  votingStart: 0,
  votingEnd: 0,
  prizeVault: { state: PrizeVaultState.Funding },
};

describe("V6 admin scheduling", () => {
  it("does not offer scheduling until the vault is sealed", () => {
    const markup = renderToStaticMarkup(
      <RoundScheduleAdmin
        round={round as never}
        isAdmin
        testMode={false}
        isPending={false}
        onAction={async () => {}}
      />,
    );
    expect(markup).toContain("Seal the fully funded prize vault");
    expect(markup).not.toContain("Set schedule</span>");
  });

  it("offers scheduling after the vault is sealed", () => {
    const markup = renderToStaticMarkup(
      <RoundScheduleAdmin
        round={
          { ...round, prizeVault: { state: PrizeVaultState.Sealed } } as never
        }
        isAdmin
        testMode={false}
        isPending={false}
        onAction={async () => {}}
      />,
    );
    expect(markup).toContain("Set schedule");
    expect(markup).toContain("Submissions open");
  });
});
