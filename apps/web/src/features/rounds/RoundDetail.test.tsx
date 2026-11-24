// @ts-nocheck -- Bun's test globals are executed by Bun and are not in the app tsconfig.
import { describe, expect, it, mock } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { canOpenRoundAdmin, roundDetailVisibility } from "./round-detail-ui";
import { AdminPanel, LifecycleActions } from "./RoundActions";
import { RoundTimeline } from "./RoundTimeline";
import { LifecycleState, PrizeVaultState } from "./types";

mock.module("./RoundAdminDialog", () => ({ RoundAdminDialog: () => null }));
mock.module("./RoundSubmissionDialog", () => ({
  RoundSubmissionDialog: () => null,
}));
mock.module("react-router-dom", () => ({
  Link: ({ to, children, ...props }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  useSearchParams: () => [new URLSearchParams(), () => undefined],
}));
const { RoundDetail, submissionVoteHistory } = await import("./RoundDetail");

describe("Rounds detail administration", () => {
  it("makes the entire submission summary the detail trigger with a circular vote count and no approved badge or metadata link", () => {
    const markup = renderToStaticMarkup(
      <RoundDetail
        round={
          {
            round: "0x1111111111111111111111111111111111111111",
            creator: "0x2222222222222222222222222222222222222222",
            lifecycleState: LifecycleState.Ended,
            metadata: { title: "Round", description: "Description" },
            submissions: [
              {
                id: 3n,
                owner: "0x2222222222222222222222222222222222222222",
                status: 1,
                votes: 7n,
                metadataURI: "ipfs://bafkreimetadata",
                metadata: {
                  title: "Entry title",
                  description: "Entry description",
                },
                adminAddedImages: [],
              },
            ],
            admins: [],
            voteActivity: [],
            winners: [],
            maxVotesPerSubmission: 25n,
            maxSubmissions: 50,
            maxSubmissionsPerWallet: 2,
            submissionsOpen: 1_700_000_000,
            submissionsClose: 1_700_000_300,
            votingStart: 1_700_000_600,
            votingEnd: 1_700_000_900,
            implementationVersion: 5,
          } as never
        }
        chainId={11155111}
        testMode
        isPending={false}
        onAction={async () => undefined}
      />,
    );

    expect(markup).toContain('aria-label="View submission 3: Entry title"');
    expect(markup).toContain('aria-label="7 votes"');
    expect(markup).toContain("rounded-full");
    expect(markup).toContain("#3");
    expect(markup).not.toContain(">Approved<");
    expect(markup).not.toContain("Open metadata");
  });

  it("orders individual votes newest first without collapsing repeat voters", () => {
    const voter = "0x2222222222222222222222222222222222222222";
    const history = submissionVoteHistory(
      {
        voteActivity: [
          {
            voter,
            submissionId: 3n,
            amount: 1n,
            voterSubmissionTotal: 1n,
            submissionTotal: 1n,
            blockNumber: 10n,
            logIndex: 2,
          },
          {
            voter,
            submissionId: 3n,
            amount: 2n,
            voterSubmissionTotal: 3n,
            submissionTotal: 3n,
            blockNumber: 12n,
            logIndex: 1,
          },
          {
            voter,
            submissionId: 4n,
            amount: 4n,
            voterSubmissionTotal: 4n,
            submissionTotal: 4n,
            blockNumber: 13n,
            logIndex: 0,
          },
          {
            voter,
            submissionId: 3n,
            amount: 3n,
            voterSubmissionTotal: 6n,
            submissionTotal: 6n,
            blockNumber: 12n,
            logIndex: 3,
          },
        ],
      } as never,
      3n,
    );

    expect(history.map((vote) => vote.amount)).toEqual([3n, 2n, 1n]);
  });

  it("accepts a wallet address or ENS name for round-admin updates", () => {
    const creator = "0x2222222222222222222222222222222222222222";
    const markup = renderToStaticMarkup(
      <AdminPanel
        round={
          { creator, votingStart: 1_700_000_000, submissions: [] } as never
        }
        account={creator}
        isAdmin
        isPending={false}
        onAction={async () => undefined}
      />,
    );

    expect(markup).toContain("Round admin wallet address or ENS name");
    expect(markup).toContain("name.eth");
  });
  it("links contracts, resolves cover and submission images, and blocks unfunded submission entry", () => {
    const roundAddress = "0x1111111111111111111111111111111111111111";
    const creator = "0x2222222222222222222222222222222222222222";
    const vault = "0x3333333333333333333333333333333333333333";
    const coverCid =
      "bafkreibagcuzpsiht655vu4nrnb3bbh6ksk4hz7zhjru74jj2l2kstqtui";
    const entryCid =
      "bafkreic7b5lzwrc6bazlbjyj3f2qf7gvrqsx2nlhsptnknxmjgcmykos5a";
    const markup = renderToStaticMarkup(
      <>
        <RoundDetail
          round={
            {
              round: roundAddress,
              creator,
              lifecycleState: LifecycleState.SubmissionsOpen,
              prizeVault: { address: vault, state: PrizeVaultState.Funding },
              metadata: {
                title: "Image round",
                description: "A test",
                image: `ipfs://${coverCid}`,
              },
              submissions: [
                {
                  id: 0n,
                  owner: creator,
                  status: 1,
                  votes: 0n,
                  metadataURI: "ipfs://bafkreimetadata",
                  metadata: {
                    title: "Entry",
                    description: "A picture",
                    images: [`ipfs://${entryCid}`],
                  },
                  adminAddedImages: [],
                },
              ],
              admins: [],
              voteActivity: [],
              winners: [],
              maxVotesPerSubmission: 25n,
              maxSubmissions: 50,
              maxSubmissionsPerWallet: 2,
              submissionsOpen: 1_700_000_000,
              submissionsClose: 1_700_000_300,
              votingStart: 1_700_000_600,
              votingEnd: 1_700_000_900,
              implementationVersion: 5,
            } as never
          }
          chainId={11155111}
          testMode
          isPending={false}
          onAction={async () => undefined}
        />
      </>,
    );

    for (const address of [roundAddress, creator, vault]) {
      expect(markup).toContain(
        `https://sepolia.etherscan.io/address/${address}`,
      );
    }
    expect(markup).toContain("Prize vault");
    expect(markup).toContain("Prize funding is incomplete");
    expect(markup).not.toContain("Submit entry");
    expect(markup).toContain(`https://ipfs.io/ipfs/${coverCid}`);
    expect(markup).toContain(`https://ipfs.io/ipfs/${entryCid}`);
  });
  it("shows the admin entry point only to connected global or round admins", () => {
    expect(
      canOpenRoundAdmin({
        account: undefined,
        isGlobalAdmin: true,
        isRoundAdmin: true,
      }),
    ).toBe(false);
    expect(
      canOpenRoundAdmin({
        account: "0x1111111111111111111111111111111111111111",
        isGlobalAdmin: false,
        isRoundAdmin: false,
      }),
    ).toBe(false);
    expect(
      canOpenRoundAdmin({
        account: "0x1111111111111111111111111111111111111111",
        isGlobalAdmin: true,
        isRoundAdmin: false,
      }),
    ).toBe(true);
    expect(
      canOpenRoundAdmin({
        account: "0x1111111111111111111111111111111111111111",
        isGlobalAdmin: false,
        isRoundAdmin: true,
      }),
    ).toBe(true);
  });
});

describe("Rounds detail primary actions", () => {
  it("shows the submission modal entry only while submissions are open", () => {
    Object.values(LifecycleState)
      .filter((state): state is LifecycleState => typeof state === "number")
      .forEach((state) => {
        expect(roundDetailVisibility(state).showSubmissionEntry).toBe(
          state === LifecycleState.SubmissionsOpen,
        );
      });
  });

  it("shows voting only while the round lifecycle is VotingOpen", () => {
    Object.values(LifecycleState)
      .filter((state): state is LifecycleState => typeof state === "number")
      .forEach((state) => {
        expect(roundDetailVisibility(state).showVotingPanel).toBe(
          state === LifecycleState.VotingOpen,
        );
      });
  });

  it("centers finalization only after conclusion and before finalization", () => {
    const renderActions = (
      lifecycleState: LifecycleState,
      finalized: boolean,
    ) =>
      renderToStaticMarkup(
        <LifecycleActions
          round={
            {
              lifecycleState,
              finalized,
              snapshotCaptured: true,
            } as never
          }
          isPending={false}
          onAction={async () => undefined}
        />,
      );

    const concluded = renderActions(LifecycleState.Ended, false);
    expect(concluded).toContain("justify-center");
    expect(concluded).toContain("Finalize deterministic results");
    expect(renderActions(LifecycleState.VotingOpen, false)).not.toContain(
      "Finalize deterministic results",
    );
    expect(renderActions(LifecycleState.Finalized, true)).not.toContain(
      "Finalize deterministic results",
    );
  });

  it("shows resumable finalization progress for V8 without manual snapshot capture", () => {
    const markup = renderToStaticMarkup(
      <LifecycleActions
        round={
          {
            implementationVersion: 8,
            lifecycleState: LifecycleState.Ended,
            finalized: false,
            snapshotCaptured: true,
            finalizationCursor: 50n,
            submissions: Array.from({ length: 100 }, (_, id) => ({ id })),
          } as never
        }
        isPending={false}
        onAction={async () => undefined}
      />,
    );

    expect(markup).toContain("50 of 100 submissions processed");
    expect(markup).toContain('role="progressbar"');
    expect(markup).toContain("Continue finalization");
    expect(markup).not.toContain("Capture voting snapshot");
    expect(markup).not.toContain("Finalize deterministic results");
  });

  it("allows V8 empty rounds to finalize", () => {
    const markup = renderToStaticMarkup(
      <LifecycleActions
        round={
          {
            implementationVersion: 8,
            lifecycleState: LifecycleState.Ended,
            finalized: false,
            snapshotCaptured: true,
            finalizationCursor: 0n,
            submissions: [],
          } as never
        }
        isPending={false}
        onAction={async () => undefined}
      />,
    );

    expect(markup).toContain("Start finalization");
    expect(markup).not.toContain('disabled=""');
  });
});

describe("Round timeline", () => {
  it("centers all four labels, indicators, and timestamps without list markers", () => {
    const markup = renderToStaticMarkup(
      <RoundTimeline
        round={
          {
            submissionsOpen: 1_700_000_000,
            submissionsClose: 1_700_000_300,
            votingStart: 1_700_000_600,
            votingEnd: 1_700_000_900,
            implementationVersion: 5,
          } as never
        }
      />,
    );

    expect(markup).toContain("list-none");
    expect(markup.match(/items-center text-center/g)?.length).toBe(4);
    expect(markup).toContain("Submissions open");
    expect(markup).toContain("Review begins");
    expect(markup).toContain("Voting starts");
    expect(markup).toContain("Voting ends");
  });
});
