// @ts-nocheck -- Bun's test globals are executed by Bun and are not in the app tsconfig.
import { describe, expect, it, mock } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { LifecycleState, PrizeVaultState, type RoundView } from "./types";

mock.module("react-router-dom", () => ({
  Link: ({
    to,
    children,
    ...props
  }: {
    to: string;
    children: React.ReactNode;
  }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  useSearchParams: () => [new URLSearchParams(), () => undefined],
}));

const { RoundCard } = await import("./RoundCard");

describe("Round card", () => {
  it("shows lifecycle without implementation or chain badges", () => {
    const round = {
      round: "0x1111111111111111111111111111111111111111",
      creator: "0x2222222222222222222222222222222222222222",
      implementationVersion: 5,
      lifecycleState: LifecycleState.Finalized,
      votingEnd: 1_750_000_000,
    } as RoundView;
    const markup = renderToStaticMarkup(<RoundCard round={round} />);

    expect(markup).toContain("Finalized");
    expect(markup).toContain("Voting ended");
    expect(markup).not.toContain("Sepolia test");
    expect(markup).not.toContain(">v5<");
  });

  it("identifies rounds whose prize vault is still unfunded", () => {
    const round = {
      round: "0x1111111111111111111111111111111111111111",
      creator: "0x2222222222222222222222222222222222222222",
      lifecycleState: LifecycleState.SubmissionsOpen,
      submissionsClose: 1_750_000_000,
      prizeVault: { state: PrizeVaultState.Funding },
    } as RoundView;
    const markup = renderToStaticMarkup(<RoundCard round={round} />);

    expect(markup).toContain("Prize funding required");
    expect(markup).not.toContain(">Submissions open<");
  });

  it("does not show a 1970 date for an unscheduled V6 round", () => {
    const round = {
      round: "0x1111111111111111111111111111111111111111",
      creator: "0x2222222222222222222222222222222222222222",
      implementationVersion: 6,
      scheduleConfigured: false,
      lifecycleState: LifecycleState.Upcoming,
      submissionsOpen: 0,
    } as RoundView;
    const markup = renderToStaticMarkup(<RoundCard round={round} />);
    expect(markup).toContain("Schedule not set");
    expect(markup).toContain("Not scheduled");
    expect(markup).not.toContain("1970");
  });

  it("loads an IPFS cover through the image proxy", () => {
    const cid = "bafkreibagcuzpsiht655vu4nrnb3bbh6ksk4hz7zhjru74jj2l2kstqtui";
    const round = {
      round: "0x1111111111111111111111111111111111111111",
      creator: "0x2222222222222222222222222222222222222222",
      lifecycleState: LifecycleState.Finalized,
      votingEnd: 1_750_000_000,
      metadata: { title: "Image round", image: `ipfs://${cid}` },
    } as RoundView;

    const markup = renderToStaticMarkup(<RoundCard round={round} />);
    expect(markup).toContain(`/api/rounds/uploads/image?cid=${cid}`);
    expect(markup).not.toContain("https://ipfs.io/ipfs/");
  });
});
