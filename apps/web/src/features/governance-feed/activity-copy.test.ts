// @ts-nocheck
import { describe, expect, it } from "bun:test";

import {
  getActivityAction,
  getActivityObject,
  getActivityValuePrefix,
  getSystemActivityAction,
  shouldUseTimelineMarker,
} from "./activity-copy";
import type { GovernanceFeedItem, GovernanceFeedItemType } from "./types";

const actorAddress =
  "0x000000000000000000000000000000000000dEaD" as `0x${string}`;

function feedItem(
  type: GovernanceFeedItemType,
  overrides: Partial<GovernanceFeedItem> = {},
): GovernanceFeedItem {
  return {
    id: type,
    category: "proposal",
    type,
    title: "Proposal 42: Fund public goods",
    timestamp: 100,
    href: "/vote/42",
    ...overrides,
  };
}

describe("governance activity copy", () => {
  it("keeps for for non-vote value labels", () => {
    expect(getActivityValuePrefix({ type: "auction-bid" })).toBe("for");
  });

  it("uses the proposal creator as the actor instead of a system timeline label", () => {
    const item = feedItem("proposal-created", { actorAddress });

    expect(shouldUseTimelineMarker(item)).toBe(false);
    expect(getSystemActivityAction(item)).toBeUndefined();
    expect(getActivityAction(item)).toBe("created");
    expect(getActivityObject(item)).toBe("Proposal 42: Fund public goods");
  });

  it("uses passive system copy for proposal lifecycle state changes", () => {
    const expectations: Array<[GovernanceFeedItemType, string]> = [
      ["proposal-active", "Voting started on"],
      ["proposal-ended", "Voting ended on"],
      ["proposal-queued", "Queued"],
      ["proposal-executed", "Executed"],
      ["proposal-cancelled", "Cancelled"],
    ];

    for (const [type, action] of expectations) {
      const item = feedItem(type);

      expect(shouldUseTimelineMarker(item)).toBe(true);
      expect(getSystemActivityAction(item)).toBe(action);
      expect(getActivityObject(item)).toBe("Proposal 42: Fund public goods");
    }
  });

  it("keeps proposal votes, auction bids, and purchases actor-led", () => {
    const actorLedItems: GovernanceFeedItem[] = [
      feedItem("proposal-vote", {
        actorAddress,
        title: "For on Proposal 42: Fund public goods",
        statusLabel: "For",
      }),
      feedItem("auction-bid", {
        category: "auction",
        actorAddress,
        title: "Bid on Lil Noun 42",
      }),
      feedItem("vrgda-purchase", {
        category: "auction",
        actorAddress,
        title: "Purchased Lil Noun 42",
      }),
    ];

    for (const item of actorLedItems) {
      expect(shouldUseTimelineMarker(item)).toBe(false);
      expect(getSystemActivityAction(item)).toBeUndefined();
    }

    expect(getActivityObject(actorLedItems[0])).toBe(
      "Proposal 42: Fund public goods",
    );
    expect(getActivityAction(actorLedItems[1])).toBe("bid on");
    expect(getActivityObject(actorLedItems[1])).toBe("Lil Noun 42");
    expect(getActivityAction(actorLedItems[2])).toBe("purchased");
    expect(getActivityObject(actorLedItems[2])).toBe("Lil Noun 42");
  });
});
