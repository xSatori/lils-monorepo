import type { GovernanceFeedItem } from "./types";

export function getActivityValuePrefix(
  item: Pick<GovernanceFeedItem, "type">,
): "with" | "for" {
  return item.type === "proposal-vote" ? "with" : "for";
}
