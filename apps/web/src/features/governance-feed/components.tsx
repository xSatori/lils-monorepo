import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ChevronRight,
  CircleDot,
  FileText,
  Gavel,
  MessageSquare,
  MoreHorizontal,
  PenLine,
  Search,
  Sparkles,
} from "lucide-react";
import clsx from "clsx";

import Identity from "@/components/Identity";
import { EnsAvatar } from "@/components/EnsAvatar";
import { EnsName } from "@/components/EnsName";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/utils/shadcn";

import {
  getActivityAction,
  getActivityObject,
  getActivityValuePrefix,
  getSystemActivityAction,
  shouldUseTimelineMarker,
} from "./activity-copy";
import { filterFeedItems } from "./feed-adapters";
import type {
  FeedDigestItem,
  GovernanceFeedCategory,
  GovernanceFeedItem,
} from "./types";

const filters: Array<{ label: string; value: GovernanceFeedCategory }> = [
  { label: "All", value: "all" },
  { label: "Proposal activity", value: "proposal" },
  { label: "Candidate activity", value: "candidate" },
  { label: "Topic activity", value: "topic" },
  { label: "Auction / VRGDA activity", value: "auction" },
];

const categoryStyles: Record<Exclude<GovernanceFeedCategory, "all">, string> = {
  proposal: "bg-blue-100 text-blue-700",
  candidate: "bg-yellow-100 text-yellow-800",
  topic: "bg-green-100 text-green-700",
  auction: "bg-gray-200 text-gray-700",
};

const timelineCategoryLabels: Record<GovernanceFeedCategory, string> = {
  all: "Show everything",
  proposal: "Proposal activity",
  candidate: "Candidate activity",
  topic: "Topic activity",
  auction: "Auction / VRGDA activity",
};

function formatRelativeTime(timestamp: number) {
  const diffSeconds = Math.max(Math.floor(Date.now() / 1000) - timestamp, 0);
  const minutes = Math.floor(diffSeconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return "Just now";
}

function iconForItem(item: GovernanceFeedItem) {
  if (item.category === "proposal") return FileText;
  if (item.category === "candidate") return PenLine;
  if (item.category === "topic") return MessageSquare;
  if (item.type.startsWith("vrgda")) return Sparkles;
  return Gavel;
}

function voteActivityColor(item: GovernanceFeedItem) {
  if (item.statusLabel === "For") return "text-green-700";
  if (item.statusLabel === "Against") return "text-red-700";
  if (item.statusLabel === "Abstain") return "text-content-secondary";
  return "text-content-primary";
}

function FeedActor({ item }: { item: GovernanceFeedItem }) {
  if (item.actorAddress) {
    return (
      <span className="min-w-0 font-bold text-content-primary">
        <EnsName address={item.actorAddress} />
      </span>
    );
  }

  const Icon = iconForItem(item);
  return (
    <span className="inline-flex items-center gap-2 font-bold text-content-primary">
      <span className="flex size-6 items-center justify-center rounded-full bg-background-secondary text-content-secondary">
        <Icon className="size-3.5" />
      </span>
      Lil Nouns
    </span>
  );
}

export function FeedFilterBar({
  activeFilter,
  onFilterChange,
}: {
  activeFilter: GovernanceFeedCategory;
  onFilterChange: (filter: GovernanceFeedCategory) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {filters.map((filter) => (
        <button
          key={filter.value}
          onClick={() => onFilterChange(filter.value)}
          className={clsx(
            "rounded-full px-4 py-2 text-sm font-bold transition-colors",
            activeFilter === filter.value
              ? "bg-content-primary text-white"
              : "bg-background-secondary text-content-secondary hover:text-content-primary",
          )}
        >
          {filter.label}
        </button>
      ))}
    </div>
  );
}

export function FeedLoadingState({ count = 8 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-4">
      {Array.from({ length: count }).map((_, index) => (
        <Skeleton key={index} className="h-[132px] w-full rounded-[16px]" />
      ))}
    </div>
  );
}

export function DarkFeedLoadingState({ count = 10 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-6">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="flex items-center gap-3">
          <Skeleton className="size-7 rounded-full bg-background-secondary" />
          <Skeleton className="h-5 flex-1 rounded-full bg-background-secondary" />
          <Skeleton className="h-5 w-12 rounded-full bg-background-secondary" />
        </div>
      ))}
    </div>
  );
}

export function FeedEmptyState({
  activeFilter,
}: {
  activeFilter: GovernanceFeedCategory;
}) {
  return (
    <div className="flex min-h-[260px] items-center justify-center rounded-[16px] border border-border-secondary bg-white p-8 text-center">
      <div className="flex max-w-[360px] flex-col items-center gap-2">
        <CircleDot className="h-8 w-8 text-content-secondary" />
        <h2 className="heading-6">No activity found</h2>
        <p className="paragraph-sm text-content-secondary">
          {activeFilter === "all"
            ? "Governance activity will appear here once data is available."
            : "Try a different activity filter."}
        </p>
      </div>
    </div>
  );
}

export function FeedErrorState({ error }: { error: unknown }) {
  return (
    <div className="rounded-[16px] border border-red-100 bg-red-50 p-5">
      <h2 className="heading-6 text-red-700">Feed data failed to load</h2>
      <p className="paragraph-sm mt-1 text-red-700">
        {error instanceof Error
          ? error.message
          : "Refresh the page or try again shortly."}
      </p>
    </div>
  );
}

export function DarkFeedErrorState({ error }: { error: unknown }) {
  return (
    <div className="rounded-[8px] border border-red-100 bg-red-50 p-4">
      <h2 className="label-md text-red-700">Feed data failed to load</h2>
      <p className="paragraph-sm mt-1 text-red-700">
        {error instanceof Error
          ? error.message
          : "Refresh the page or try again shortly."}
      </p>
    </div>
  );
}

export function FeedItemCard({
  item,
  compact = false,
}: {
  item: GovernanceFeedItem;
  compact?: boolean;
}) {
  const Icon = iconForItem(item);

  return (
    <Link
      to={item.href}
      className={cn(
        "group flex gap-4 rounded-[16px] border border-border-secondary bg-white p-5 transition-all hover:-translate-y-0.5 hover:border-border-primary hover:shadow-sm",
        compact && "p-4",
      )}
    >
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-background-secondary text-content-primary">
        <Icon className="h-5 w-5" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span
            className={cn(
              "rounded-full px-2.5 py-1 text-xs font-bold",
              categoryStyles[item.category],
            )}
          >
            {item.statusLabel || item.category}
          </span>
          <span className="label-sm text-content-secondary">
            {formatRelativeTime(item.timestamp)}
          </span>
          {item.metaLabel && (
            <span className="label-sm text-content-secondary">
              {item.metaLabel}
            </span>
          )}
        </div>

        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className={cn("label-lg break-words", compact && "label-md")}>
              {item.title}
            </h3>
            {item.description && (
              <p className="paragraph-sm mt-1 line-clamp-2 break-words text-content-secondary">
                {item.description}
              </p>
            )}
          </div>
          <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-content-secondary transition-transform group-hover:translate-x-0.5" />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          {item.actorAddress && (
            <Identity
              address={item.actorAddress}
              avatarSize={22}
              className="text-sm text-content-primary"
            />
          )}
          {item.valueLabel && (
            <span className="label-sm text-content-secondary">
              {item.valueLabel}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

export function ActivityFeedItem({
  item,
  compact = false,
}: {
  item: GovernanceFeedItem;
  compact?: boolean;
}) {
  const Icon = iconForItem(item);
  const isTimelineItem = shouldUseTimelineMarker(item);
  const isProposalVote = item.type === "proposal-vote";
  const systemActivityAction = getSystemActivityAction(item);

  return (
    <Link
      to={item.href}
      className="group grid grid-cols-[28px_minmax(0,1fr)_32px] items-start gap-3 py-2 text-content-secondary transition-colors hover:text-content-primary"
    >
      <div className="relative flex justify-center pt-0.5">
        {isTimelineItem ? (
          <>
            <span className="absolute top-8 h-8 w-px bg-border-secondary" />
            <span className="mt-2 size-2 rounded-full bg-content-secondary" />
          </>
        ) : item.actorAddress ? (
          <EnsAvatar address={item.actorAddress} size={compact ? 22 : 26} />
        ) : (
          <span className="flex size-7 items-center justify-center rounded-full bg-background-secondary text-content-secondary">
            <Icon className="size-3.5" />
          </span>
        )}
      </div>

      <div className="min-w-0 pt-0.5">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-1 text-[15px] leading-6 md:text-[16px]">
          {isProposalVote ? (
            <>
              <span className="font-bold text-content-primary">
                {item.actorAddress ? (
                  <EnsName address={item.actorAddress} />
                ) : (
                  "Lil Nouns"
                )}
              </span>
              <span className={cn("font-bold", voteActivityColor(item))}>
                voted {item.statusLabel || "Vote"}
                {item.voteCountLabel ? ` (${item.voteCountLabel})` : ""}
              </span>
            </>
          ) : (
            <>
              {systemActivityAction ? (
                <span>{systemActivityAction}</span>
              ) : (
                <>
                  {item.actorAddress ? (
                    <FeedActor item={item} />
                  ) : (
                    <span className="font-bold text-content-primary">
                      Lil Nouns
                    </span>
                  )}
                  <span>{getActivityAction(item)}</span>
                </>
              )}
            </>
          )}
          <span className="font-bold text-content-primary">
            {getActivityObject(item)}
          </span>
          {!isProposalVote && item.valueLabel && (
            <span>
              {getActivityValuePrefix(item)} {item.valueLabel}
            </span>
          )}
          <span className="text-content-secondary">
            - {formatRelativeTime(item.timestamp).replace(" ago", "")}
          </span>
        </div>
        {item.description && (
          <p className="mt-0.5 line-clamp-2 max-w-[760px] text-[13px] leading-5 text-content-secondary">
            {item.description}
          </p>
        )}
      </div>

      <div className="flex justify-end pt-1">
        <MoreHorizontal className="size-4 text-content-secondary opacity-70 transition-opacity group-hover:opacity-100" />
      </div>
    </Link>
  );
}

export function GovernanceActivityFeed({
  items,
  isLoading,
  error,
  initialCount = 20,
  compact = false,
}: {
  items: GovernanceFeedItem[];
  isLoading: boolean;
  error: unknown;
  initialCount?: number;
  compact?: boolean;
}) {
  const [activeFilter, setActiveFilter] =
    useState<GovernanceFeedCategory>("all");
  const [visibleCount, setVisibleCount] = useState(initialCount);
  const filteredItems = useMemo(
    () => filterFeedItems(items, activeFilter),
    [activeFilter, items],
  );
  const visibleItems = filteredItems.slice(0, visibleCount);
  const hasVisibleItems = visibleItems.length > 0;

  return (
    <div className="flex flex-col gap-5">
      <FeedFilterBar
        activeFilter={activeFilter}
        onFilterChange={(filter) => {
          setActiveFilter(filter);
          setVisibleCount(initialCount);
        }}
      />

      {error ? <FeedErrorState error={error} /> : null}
      {isLoading && !hasVisibleItems && (
        <FeedLoadingState count={compact ? 5 : 8} />
      )}
      {!isLoading && !error && filteredItems.length === 0 && (
        <FeedEmptyState activeFilter={activeFilter} />
      )}

      {hasVisibleItems && (
        <div className="flex flex-col gap-4">
          {visibleItems.map((item) => (
            <FeedItemCard key={item.id} item={item} compact={compact} />
          ))}
        </div>
      )}

      {hasVisibleItems && visibleCount < filteredItems.length && (
        <Button
          variant="secondary"
          className="self-center"
          onClick={() => setVisibleCount((count) => count + initialCount)}
        >
          Show more
        </Button>
      )}
    </div>
  );
}

export function DarkGovernanceActivityFeed({
  items,
  isLoading,
  error,
  initialCount = 20,
  compact = false,
}: {
  items: GovernanceFeedItem[];
  isLoading: boolean;
  error: unknown;
  initialCount?: number;
  compact?: boolean;
}) {
  const [activeFilter, setActiveFilter] =
    useState<GovernanceFeedCategory>("all");
  const [visibleCount, setVisibleCount] = useState(initialCount);
  const [searchValue, setSearchValue] = useState("");

  const filteredItems = useMemo(() => {
    const byCategory = filterFeedItems(items, activeFilter);
    const query = searchValue.trim().toLowerCase();
    if (!query) return byCategory;

    return byCategory.filter((item) =>
      [item.title, item.description, item.statusLabel, item.valueLabel]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [activeFilter, items, searchValue]);
  const visibleItems = filteredItems.slice(0, visibleCount);
  const hasVisibleItems = visibleItems.length > 0;

  return (
    <div className="flex flex-col gap-7">
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-content-secondary" />
        <input
          value={searchValue}
          onChange={(event) => {
            setSearchValue(event.target.value);
            setVisibleCount(initialCount);
          }}
          placeholder="Search..."
          className="h-[58px] w-full rounded-[6px] border border-border-secondary bg-background-secondary pl-12 pr-4 text-[20px] text-content-primary outline-none placeholder:text-content-secondary focus:border-border-primary"
        />
      </div>

      <div>
        <select
          value={activeFilter}
          onChange={(event) => {
            setActiveFilter(event.target.value as GovernanceFeedCategory);
            setVisibleCount(initialCount);
          }}
          className="h-10 rounded-[6px] border border-border-secondary bg-white px-3 text-[15px] font-semibold text-content-primary outline-none focus:border-border-primary"
        >
          {filters.map((filter) => (
            <option key={filter.value} value={filter.value}>
              {timelineCategoryLabels[filter.value]}
            </option>
          ))}
        </select>
      </div>

      {error ? <DarkFeedErrorState error={error} /> : null}
      {isLoading && !hasVisibleItems && (
        <DarkFeedLoadingState count={compact ? 8 : 12} />
      )}
      {!isLoading && !error && filteredItems.length === 0 && (
        <div className="rounded-[8px] border border-border-secondary bg-white p-8 text-center">
          <p className="label-md text-content-primary">No activity found</p>
          <p className="paragraph-sm mt-1 text-content-secondary">
            {searchValue
              ? "Try a different search or filter."
              : "Governance activity will appear here once data is available."}
          </p>
        </div>
      )}

      {hasVisibleItems && (
        <div className="flex flex-col">
          {visibleItems.map((item) => (
            <ActivityFeedItem key={item.id} item={item} compact={compact} />
          ))}
        </div>
      )}

      {hasVisibleItems && visibleCount < filteredItems.length && (
        <button
          className="self-start rounded-[6px] border border-border-secondary px-4 py-2 text-[15px] font-semibold text-content-primary transition-colors hover:border-border-primary hover:bg-background-secondary"
          onClick={() => setVisibleCount((count) => count + initialCount)}
        >
          Show more
        </button>
      )}
    </div>
  );
}

export function DigestCard({
  title,
  items,
  emptyLabel,
}: {
  title: string;
  items: FeedDigestItem[];
  emptyLabel: string;
}) {
  return (
    <section className="rounded-[16px] border border-border-secondary bg-white p-5">
      <h2 className="heading-6">{title}</h2>
      {items.length === 0 ? (
        <p className="paragraph-sm mt-3 text-content-secondary">{emptyLabel}</p>
      ) : (
        <div className="mt-4 flex flex-col divide-y divide-border-secondary">
          {items.map((item) => (
            <Link
              key={item.id}
              to={item.href}
              className="group flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0"
            >
              <div className="min-w-0">
                <p className="label-md line-clamp-2">{item.title}</p>
                <p className="paragraph-sm text-content-secondary">
                  {item.meta}
                </p>
              </div>
              <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-content-secondary transition-transform group-hover:translate-x-0.5" />
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
