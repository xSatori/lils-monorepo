import type { GovernanceFeedItem } from "./types";

export function getActivityAction(item: GovernanceFeedItem) {
  switch (item.type) {
    case "proposal-vote":
      return `voted ${item.statusLabel?.toLowerCase() || "on"}`;
    case "proposal-created":
      return "created";
    case "proposal-active":
      return "opened voting on";
    case "proposal-ended":
      return "closed voting on";
    case "proposal-queued":
      return "queued";
    case "proposal-executed":
      return "executed";
    case "proposal-cancelled":
      return item.statusLabel === "Vetoed" ? "vetoed" : "cancelled";
    case "candidate-created":
      return "created candidate";
    case "candidate-updated":
      return "updated candidate";
    case "candidate-promoted":
      return "promoted candidate";
    case "candidate-cancelled":
      return "cancelled candidate";
    case "candidate-feedback":
      return item.statusLabel === "Comment"
        ? "commented on candidate"
        : `signaled ${item.statusLabel?.toLowerCase() || "on"} candidate`;
    case "candidate-signature":
      return "signed candidate";
    case "topic-created":
      return "opened topic";
    case "topic-closed":
      return "closed topic";
    case "topic-feedback":
      return item.statusLabel === "Comment"
        ? "commented on topic"
        : `signaled ${item.statusLabel?.toLowerCase() || "on"} topic`;
    case "topic-signature":
      return "signed topic";
    case "auction-bid":
      return "bid on";
    case "auction-live":
      return "started";
    case "vrgda-purchase":
      return "purchased";
    default:
      return item.statusLabel?.toLowerCase() || "updated";
  }
}

export function getActivityObject(item: GovernanceFeedItem) {
  if (item.type === "proposal-vote")
    return item.title.replace(/^(For|Against|Abstain|Vote) on /, "");
  if (item.type === "auction-bid") return item.title.replace(/^Bid on /, "");
  if (item.type === "vrgda-purchase")
    return item.title.replace(/^Purchased /, "");
  return item.title;
}

export function getSystemActivityAction(
  item: GovernanceFeedItem,
): string | undefined {
  if (item.actorAddress) return undefined;

  switch (item.type) {
    case "proposal-active":
      return "Voting started on";
    case "proposal-ended":
      return "Voting ended on";
    case "proposal-queued":
      return "Queued";
    case "proposal-executed":
      return "Executed";
    case "proposal-cancelled":
      return item.statusLabel === "Vetoed" ? "Vetoed" : "Cancelled";
    case "auction-live":
      return "Auction started";
    default:
      return undefined;
  }
}

export function shouldUseTimelineMarker(item: GovernanceFeedItem) {
  return Boolean(getSystemActivityAction(item));
}

export function getActivityValuePrefix(
  item: Pick<GovernanceFeedItem, "type">,
): "with" | "for" {
  return item.type === "proposal-vote" ? "with" : "for";
}
