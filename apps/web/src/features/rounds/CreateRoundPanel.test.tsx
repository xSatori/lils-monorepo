// @ts-nocheck -- Bun's test globals are executed by Bun and are not in the app tsconfig.
import { describe, expect, it, mock } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

mock.module("@/components/ui/dialog", () => ({
  default: ({ children }: { children: (props: object) => React.ReactNode }) =>
    children({ titleProps: {} }),
}));

const {
  CreateRoundPanel,
  buildOrderedPrizeAllocations,
  baseOrFixedVotesForStrategy,
  submissionLimitForVersion,
} = await import("./CreateRoundPanel");

const factory = {
  creationFee: 100_000_000_000_000n,
  treasury: "0x1111111111111111111111111111111111111111",
  paused: false,
  testMode: false,
};

describe("Create round prize plan", () => {
  it("offers three voting strategies and hides the base votes field for delegated voting", () => {
    const markup = renderToStaticMarkup(
      <CreateRoundPanel
        factory={{ ...factory, activeImplementationVersion: 7 } as never}
        factoryGeneration={5}
        votingPowerAdapter="0x2222222222222222222222222222222222222222"
        isConnected
        isCorrectChain
        isPending={false}
        onCreate={async () => {}}
      />,
    );
    expect(markup).not.toContain("One per eligible wallet");
    expect(markup).toContain("Fixed per eligible wallet");
    expect(markup).not.toContain("Base or fixed votes");
    expect(markup).toContain("Information about per-entry vote cap");
    expect(markup).toMatch(
      /<label[^>]*>Per-entry vote cap<\/label><button[^>]*type="button"/,
    );
    expect(markup).toContain("Information about submissions per wallet");
    expect(markup).toContain("Information about total submissions");
    expect(markup).toContain('max="1000"');
    expect(markup).toContain('value="1000"');
  });

  it("only sends base or fixed votes for the two strategies that use them", () => {
    expect(baseOrFixedVotesForStrategy(1, "123")).toBe(0n);
    expect(baseOrFixedVotesForStrategy(2, "1")).toBe(1n);
    expect(baseOrFixedVotesForStrategy(3, "10")).toBe(10n);
    expect(() => baseOrFixedVotesForStrategy(2, "0")).toThrow();
    expect(() => baseOrFixedVotesForStrategy(3, "1.5")).toThrow();
  });

  it("keeps the deployed V6 limit while V7 permits one thousand", () => {
    expect(submissionLimitForVersion(6)).toBe(100);
    expect(submissionLimitForVersion(7)).toBe(1000);
    const markup = renderToStaticMarkup(
      <CreateRoundPanel
        factory={{ ...factory, activeImplementationVersion: 6 } as never}
        factoryGeneration={5}
        votingPowerAdapter="0x2222222222222222222222222222222222222222"
        isConnected
        isCorrectChain
        isPending={false}
        onCreate={async () => {}}
      />,
    );
    expect(markup).toContain('max="100"');
    expect(markup).not.toContain('max="1000"');
  });

  it("defers schedule inputs for V6 rounds", () => {
    const markup = renderToStaticMarkup(
      <CreateRoundPanel
        factory={{ ...factory, activeImplementationVersion: 6 } as never}
        factoryGeneration={5}
        votingPowerAdapter="0x2222222222222222222222222222222222222222"
        isConnected
        isCorrectChain
        isPending={false}
        onCreate={async () => {}}
      />,
    );
    expect(markup).not.toContain("Submission and review schedule");
    expect(markup).toContain("fund the prizes and seal the vault");
    const vaultSection = markup.indexOf("Onchain prize vault");
    const reminder = markup.indexOf("After creating the round");
    const createButton = markup.indexOf("Prepare round files");
    expect(reminder).toBeGreaterThan(vaultSection);
    expect(createButton).toBeGreaterThan(reminder);
    expect(markup.slice(reminder - 300, reminder)).toContain(
      "text-semantic-negative",
    );
  });

  it("shows the current onchain fee rather than a fixed frontend fee", () => {
    const markup = renderToStaticMarkup(
      <CreateRoundPanel
        factory={
          {
            ...factory,
            creationFee: 10_000_000_000_000_000n,
            activeImplementationVersion: 7,
          } as never
        }
        factoryGeneration={5}
        votingPowerAdapter="0x2222222222222222222222222222222222222222"
        isConnected
        isCorrectChain
        isPending={false}
        onCreate={async () => {}}
      />,
    );
    expect(markup).toContain("0.01");
    expect(markup).toContain("Prepare round files");
  });
  it("starts with one real allocation and explains post-creation funding", () => {
    const markup = renderToStaticMarkup(
      <CreateRoundPanel
        factory={factory as never}
        factoryGeneration={5}
        votingPowerAdapter="0x2222222222222222222222222222222222222222"
        isConnected
        isCorrectChain
        isPending={false}
        account="0x3333333333333333333333333333333333333333"
        onCreate={async () => {}}
      />,
    );

    expect(markup).toContain("Prize 1");
    expect(markup).not.toContain("Prize 2");
    expect(markup).toContain("Add prize");
    expect(markup).toContain("funded after round creation");
    expect(markup).not.toContain("Generation-three rounds");
    expect(markup).not.toContain("Sponsored IPFS upload");
    expect(markup).not.toContain("Manual URI + hash");
    expect(markup).toContain("Round title");
    expect(markup).toContain("Round cover image");
    expect(markup).not.toContain("Winner count");
    expect(markup).not.toContain("Winner placement");
    expect(markup).toContain("Amount (ETH)");
    expect(markup).not.toContain("Amount (wei)");
    expect(markup).not.toContain("Remove prize 1");
  });

  it("places description bounds together and prizes before status", () => {
    const markup = renderToStaticMarkup(
      <CreateRoundPanel
        factory={factory as never}
        factoryGeneration={5}
        votingPowerAdapter="0x2222222222222222222222222222222222222222"
        isConnected={false}
        isCorrectChain
        isPending={false}
        onCreate={async () => {}}
      />,
    );

    const minDescription = markup.indexOf("Minimum description length");
    const maxDescription = markup.indexOf("Maximum description length");
    const prizes = markup.indexOf("Onchain prize vault");
    const unsupportedStatus = markup.indexOf(
      "Connect a wallet to create a round",
    );

    expect(minDescription).toBeGreaterThan(-1);
    expect(maxDescription).toBeGreaterThan(minDescription);
    expect(prizes).toBeGreaterThan(maxDescription);
    expect(unsupportedStatus).toBeGreaterThan(prizes);
  });

  it("offers wallet connection instead of a disabled create action when disconnected", () => {
    const disconnected = renderToStaticMarkup(
      <CreateRoundPanel
        factory={{ ...factory, activeImplementationVersion: 8 } as never}
        factoryGeneration={8}
        votingPowerAdapter="0x2222222222222222222222222222222222222222"
        isConnected={false}
        isCorrectChain
        isPending={false}
        onConnect={() => {}}
        onCreate={async () => {}}
      />,
    );
    expect(disconnected).toMatch(
      /<button[^>]*type="button"[^>]*>\s*<span[^>]*>Connect wallet<\/span><\/button>/,
    );
    expect(disconnected).not.toContain("Create round ·");

    const connected = renderToStaticMarkup(
      <CreateRoundPanel
        factory={{ ...factory, activeImplementationVersion: 8 } as never}
        factoryGeneration={8}
        votingPowerAdapter="0x2222222222222222222222222222222222222222"
        isConnected
        isCorrectChain
        isPending={false}
        onConnect={() => {}}
        onCreate={async () => {}}
      />,
    );
    expect(connected).toContain("Prepare round files");
    expect(connected).not.toMatch(/<span[^>]*>Connect wallet<\/span>/);
  });

  it("groups voting and submission fields and places the metadata note last", () => {
    const markup = renderToStaticMarkup(
      <CreateRoundPanel
        factory={factory as never}
        factoryGeneration={5}
        votingPowerAdapter="0x2222222222222222222222222222222222222222"
        isConnected={false}
        isCorrectChain
        isPending={false}
        onCreate={async () => {}}
      />,
    );

    const metadataNote = markup.indexOf("The exact metadata and cover IDs");
    const coverLimit = markup.indexOf(
      "The browser rejects unsupported formats",
    );
    const votingSection = markup.indexOf("Voting Details");
    const submissionSection = markup.indexOf("Submission Details");
    const vaultSection = markup.indexOf("Onchain prize vault");

    expect(metadataNote).toBeGreaterThan(coverLimit);
    expect(votingSection).toBeGreaterThan(metadataNote);
    expect(submissionSection).toBeGreaterThan(votingSection);
    expect(vaultSection).toBeGreaterThan(submissionSection);
    expect(markup.slice(votingSection, submissionSection)).toContain(
      "Per-entry vote cap",
    );
    expect(markup.slice(submissionSection, vaultSection)).toContain(
      "Maximum description length",
    );
  });

  it("derives winner count and sequential contract ranks from prize order", () => {
    const rows = Array.from({ length: 3 }, () => ({
      winnerRank: "99",
      assetType: "0",
      token: "",
      tokenId: "0",
      amount: "1",
    }));
    const allocations = buildOrderedPrizeAllocations(rows);
    expect(allocations.map((allocation) => allocation.winnerRank)).toEqual([
      0, 1, 2,
    ]);
    expect(() => buildOrderedPrizeAllocations([])).toThrow("one prize");
    expect(() =>
      buildOrderedPrizeAllocations(Array.from({ length: 21 }, () => rows[0])),
    ).toThrow("20 prizes");
  });

  it("converts human ETH amounts to exact wei before committing prize plans", () => {
    const ethPrize = {
      winnerRank: "0",
      assetType: "0",
      token: "",
      tokenId: "0",
      amount: "0.125",
    };
    expect(buildOrderedPrizeAllocations([ethPrize])[0].amount).toBe(
      125_000_000_000_000_000n,
    );
    expect(() =>
      buildOrderedPrizeAllocations([
        { ...ethPrize, amount: "0.0000000000000000001" },
      ]),
    ).toThrow("at most 18 decimal places");
    expect(() =>
      buildOrderedPrizeAllocations([{ ...ethPrize, amount: "0" }]),
    ).toThrow("positive");
    expect(
      buildOrderedPrizeAllocations([
        {
          ...ethPrize,
          assetType: "3",
          token: "0x1111111111111111111111111111111111111111",
          amount: "2",
        },
      ])[0].amount,
    ).toBe(2n);
  });
});
