// @ts-nocheck
import { describe, expect, it } from "bun:test";

import { DESKTOP_NAV_ITEMS } from "./navConfig";

describe("desktop nav config", () => {
  it("uses Play as the governance dropdown between Explore and Feed", () => {
    expect(DESKTOP_NAV_ITEMS.map((item) => item.name)).toEqual([
      "Explore",
      "Play",
      "Feed",
      "Learn",
    ]);

    const playItem = DESKTOP_NAV_ITEMS.find((item) => item.name === "Play");

    expect(playItem?.children?.map((item) => item.name)).toEqual([
      "Vote",
      "Ideas",
      "Topics",
    ]);
    expect(playItem?.children?.map((item) => item.href)).toEqual([
      "/vote",
      "/candidates",
      "/topics",
    ]);
  });
});
