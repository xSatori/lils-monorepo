// @ts-nocheck
import { describe, expect, it } from "bun:test";

import { DESKTOP_NAV_ITEMS } from "./navConfig";

describe("desktop nav config", () => {
  it("keeps Rounds discoverable after Feed in the Play dropdown", () => {
    expect(DESKTOP_NAV_ITEMS.map((item) => item.name)).toEqual([
      "Explore",
      "Play",
      "Learn",
    ]);

    const playItem = DESKTOP_NAV_ITEMS.find((item) => item.name === "Play");

    expect(playItem?.children?.map((item) => item.name)).toEqual([
      "Vote",
      "Ideas",
      "Topics",
      "Feed",
      "Rounds",
    ]);
    expect(playItem?.children?.map((item) => item.href)).toEqual([
      "/vote",
      "/candidates",
      "/topics",
      "/feed",
      "/rounds",
    ]);
  });
});
