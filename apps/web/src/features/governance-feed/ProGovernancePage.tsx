import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { ChevronDown, Maximize2, Minimize2, Plus, Radio, Vote, type LucideIcon } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { getAddress } from "viem";
import { useQuery } from "@tanstack/react-query";

import { makeUrlId } from "@/data/goldsky/governance/getProposalIdeas";
import { makeTopicUrlId } from "@/data/goldsky/governance/getTopics";
import type { ProposalOverview } from "@/data/goldsky/governance/common";
import { getAllVoters } from "@/data/goldsky/governance/getAllVoters";
import { EnsName } from "@/components/EnsName";
import { cn } from "@/utils/shadcn";
import { VoterList, type VoterSortMode } from "@/features/voters/components";
import { useVoterTokenStats } from "@/features/voters/useVoterTokenStats";

import { DarkGovernanceActivityFeed } from "./components";
import { getProposalBuckets } from "./proposal-status";
import { useGovernanceFeedData } from "./useGovernanceFeedData";

type SidebarTabId = "digest" | "proposals" | "topics" | "candidates" | "voters";

const sidebarTabs: Array<{ id: SidebarTabId; label: string }> = [
  { id: "digest", label: "Digest" },
  { id: "proposals", label: "Proposals" },
  { id: "candidates", label: "Candidates" },
  { id: "topics", label: "Topics" },
  { id: "voters", label: "Voters" },
];

function formatStatus(value: string) {
  return value
    .replace("metagov_", "metagov ")
    .replace(/^\w/, (letter) => letter.toUpperCase());
}

function formatRelativeTime(timestamp: number) {
  const diffSeconds = Math.max(Math.floor(Date.now() / 1000) - timestamp, 0);
  const days = Math.floor(diffSeconds / 86_400);
  const hours = Math.floor(diffSeconds / 3_600);

  if (days > 0) return `${days} days ago`;
  if (hours > 0) return `${hours} hours ago`;
  return "today";
}

function proposalTotalVotes(proposal: ProposalOverview) {
  return proposal.forVotes + proposal.againstVotes + proposal.abstainVotes;
}

function isPassedProposal(proposal: ProposalOverview) {
  return (
    proposal.state === "successful" ||
    proposal.state === "queued" ||
    proposal.state === "executed"
  );
}

function normalizeAddressKey(address: string) {
  try {
    return getAddress(address).toLowerCase();
  } catch {
    return null;
  }
}

function ProposalDigestRow({ proposal }: { proposal: ProposalOverview }) {
  const total = Math.max(proposalTotalVotes(proposal), 1);
  const forWidth = (proposal.forVotes / total) * 100;
  const againstWidth = (proposal.againstVotes / total) * 100;
  const abstainWidth = (proposal.abstainVotes / total) * 100;
  const isNegative =
    proposal.state === "failed" ||
    proposal.state === "cancelled" ||
    proposal.state === "vetoed";

  return (
    <Link to={`/vote/${proposal.id}`} className="group block py-3">
      <p className="text-[14px] text-content-secondary">
        Prop {proposal.id} by{" "}
        <span className="font-semibold text-content-primary">
          <EnsName address={proposal.proposerAddress} />
        </span>
      </p>
      <h3 className="mt-0.5 line-clamp-2 text-[17px] font-bold leading-5 text-content-primary transition-colors group-hover:text-semantic-accent">
        {proposal.title}
      </h3>
      <div className="mt-2 h-1 w-full overflow-hidden bg-background-secondary">
        <div className="flex h-full">
          <span className="bg-emerald-400" style={{ width: `${forWidth}%` }} />
          <span className="bg-gray-400" style={{ width: `${abstainWidth}%` }} />
          <span className="bg-rose-500" style={{ width: `${againstWidth}%` }} />
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[12px] text-content-secondary">
        <span
          className={
            isNegative
              ? "rounded-[3px] bg-red-100 px-2 py-1 font-bold uppercase text-red-700"
              : "rounded-[3px] bg-background-secondary px-2 py-1 font-bold uppercase text-content-primary"
          }
        >
          {formatStatus(proposal.state)}
        </span>
        <span className="rounded-[3px] bg-background-secondary px-2 py-1">
          {proposal.forVotes} / {proposal.quorumVotes} for
        </span>
        <span className="rounded-[3px] bg-background-secondary px-2 py-1">{proposal.abstainVotes}</span>
        <span className="rounded-[3px] bg-background-secondary px-2 py-1">{proposal.againstVotes} against</span>
      </div>
    </Link>
  );
}

function CandidateRows({
  items,
  limit,
}: {
  items: Array<ReturnType<typeof useGovernanceFeedData>["candidates"][number] & { href: string }>;
  limit?: number;
}) {
  const visibleItems = typeof limit === "number" ? items.slice(0, limit) : items;

  if (visibleItems.length === 0) {
    return <p className="text-[15px] text-content-secondary">No recent candidates found.</p>;
  }

  return (
    <div className="flex flex-col gap-5">
      {visibleItems.map((candidate, index) => (
        <Link key={`${candidate.id}-${index}`} to={candidate.href} className="group block">
          <p className="text-[14px] text-content-secondary">
            Candidate by{" "}
            <span className="font-semibold text-content-primary">
              <EnsName address={getAddress(candidate.proposerAddress)} />
            </span>
          </p>
          <h3 className="mt-0.5 line-clamp-2 text-[17px] font-bold leading-5 text-content-primary group-hover:text-semantic-accent">
            {candidate.latestVersion.content.title}
          </h3>
          <p className="text-[14px] text-content-secondary">
            {candidate.feedbackPosts.length > 0
              ? `Last comment ${formatRelativeTime(candidate.feedbackPosts[0].createdTimestamp)}`
              : `Last updated ${formatRelativeTime(candidate.lastUpdatedTimestamp)}`}
          </p>
        </Link>
      ))}
    </div>
  );
}

function TopicRows({
  items,
  limit,
}: {
  items: Array<ReturnType<typeof useGovernanceFeedData>["topics"][number] & { href: string }>;
  limit?: number;
}) {
  const visibleItems = typeof limit === "number" ? items.slice(0, limit) : items;

  if (visibleItems.length === 0) {
    return <p className="text-[15px] text-content-secondary">No recent topics found.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {visibleItems.map((topic) => {
        const lastCommentTimestamp = topic.feedback.reduce(
          (latest, feedback) => Math.max(latest, feedback.createdTimestamp),
          0,
        );

        return (
          <Link key={topic.id} to={topic.href} className="group block">
            <p className="text-[14px] text-content-secondary">
              Topic by{" "}
              <span className="font-semibold text-content-primary">
                <EnsName address={getAddress(topic.creator)} />
              </span>
            </p>
            <h3 className="line-clamp-2 text-[17px] font-bold leading-5 text-content-primary group-hover:text-semantic-accent">
              {topic.title}
            </h3>
            <p className="text-[14px] text-content-secondary">
              {lastCommentTimestamp > 0
                ? `Last comment ${formatRelativeTime(lastCommentTimestamp)}`
                : `Last updated ${formatRelativeTime(topic.lastUpdatedTimestamp)}`}
            </p>
          </Link>
        );
      })}
    </div>
  );
}

function DigestSection({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <section>
      <div className="mb-3 flex items-center gap-2 text-[14px] font-bold uppercase tracking-wide text-content-secondary">
        <button
          type="button"
          aria-label={`${isCollapsed ? "Expand" : "Collapse"} ${title}`}
          aria-expanded={!isCollapsed}
          className="flex size-5 items-center justify-center rounded-[4px] transition-colors hover:bg-background-secondary hover:text-content-primary"
          onClick={() => setIsCollapsed((value) => !value)}
        >
          <ChevronDown
            className={cn(
              "size-4 transition-transform duration-150",
              isCollapsed && "-rotate-90",
            )}
            aria-hidden="true"
          />
        </button>
        <span>{title}</span>
        {subtitle && (
          <span className="font-normal normal-case tracking-normal text-content-secondary">
            {subtitle}
          </span>
        )}
      </div>
      {!isCollapsed && children}
    </section>
  );
}

const quickLinks: Array<[string, string, LucideIcon]> = [
  ["Vote", "/vote", Vote],
  ["Create", "/new", Plus],
  ["Feed", "/feed", Radio],
  ["Ideas", "/candidates", Plus],
];

export default function ProGovernancePage() {
  const { feedItems, proposals, candidates, topics, isLoading, error } =
    useGovernanceFeedData();
  const { data: voters = [], isLoading: isLoadingVoters } = useQuery({
    queryKey: ["pro-governance-voters"],
    queryFn: () => getAllVoters(500),
    staleTime: 5 * 60 * 1000,
  });
  const [activeSidebarTab, setActiveSidebarTab] = useState<SidebarTabId>("digest");
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(false);
  const [voterSortMode, setVoterSortMode] = useState<VoterSortMode>("most-revoted");
  const tokenStatsByAddress = useVoterTokenStats(
    voters,
    isSidebarExpanded ? voters.length : 100,
    activeSidebarTab === "voters",
  );

  const proposalBuckets = useMemo(() => getProposalBuckets(proposals), [proposals]);
  const submittedProposalCountsByAddress = useMemo(() => {
    const counts = new Map<string, number>();
    const counted = new Set<string>();

    const incrementOnce = (address: string, itemId: string) => {
      const addressKey = normalizeAddressKey(address);
      if (!addressKey) return;

      const countKey = `${addressKey}:${itemId}`;
      if (counted.has(countKey)) return;

      counted.add(countKey);
      counts.set(addressKey, (counts.get(addressKey) ?? 0) + 1);
    };

    proposals.forEach((proposal) => {
      incrementOnce(proposal.proposerAddress, `proposal:${proposal.id}`);
    });

    candidates.forEach((candidate) => {
      incrementOnce(candidate.proposerAddress, `candidate:${candidate.id}`);
    });

    return counts;
  }, [candidates, proposals]);
  const passedAuthoredOrSponsoredCountsByAddress = useMemo(() => {
    const counts = new Map<string, number>();
    const counted = new Set<string>();
    const passedProposalIds = new Set(
      proposals.filter(isPassedProposal).map((proposal) => proposal.id),
    );

    const incrementOnce = (address: string, proposalId: number) => {
      const addressKey = normalizeAddressKey(address);
      if (!addressKey) return;

      const countKey = `${addressKey}:${proposalId}`;
      if (counted.has(countKey)) return;

      counted.add(countKey);
      counts.set(addressKey, (counts.get(addressKey) ?? 0) + 1);
    };

    proposals.forEach((proposal) => {
      if (!passedProposalIds.has(proposal.id)) return;
      incrementOnce(proposal.proposerAddress, proposal.id);
    });

    candidates.forEach((candidate) => {
      const proposalId = candidate.latestVersion.proposalId;
      if (!proposalId || !passedProposalIds.has(proposalId)) return;

      incrementOnce(candidate.proposerAddress, proposalId);
      candidate.sponsors.forEach((sponsor) => {
        incrementOnce(sponsor.signer.id, proposalId);
      });
      candidate.latestVersion.contentSignatures?.forEach((sponsor) => {
        incrementOnce(sponsor.signer.id, proposalId);
      });
    });

    return counts;
  }, [candidates, proposals]);
  const activeProposals = proposalBuckets.active.slice(0, 3);
  const concludedProposals = proposalBuckets.concluded.slice(0, 5);
  const newCandidateItems = candidates.slice(0, 4).map((candidate) => ({
    ...candidate,
    href: `/candidates/${makeUrlId(candidate.id)}`,
  }));
  const recentTopicItems = topics.slice(0, 4).map((topic) => ({
    ...topic,
    href: `/topics/${makeTopicUrlId(topic.id)}`,
  }));
  const allTopicItems = topics.map((topic) => ({
    ...topic,
    href: `/topics/${makeTopicUrlId(topic.id)}`,
  }));
  const allCandidateItems = candidates.map((candidate) => ({
    ...candidate,
    href: `/candidates/${makeUrlId(candidate.id)}`,
  }));
  const sidebarLimit = isSidebarExpanded ? undefined : 8;
  const renderSidebarContent = () => {
    if (activeSidebarTab === "proposals") {
      return (
        <div className="flex flex-col gap-8">
          <DigestSection title="Active proposals">
            <div className="flex flex-col divide-y divide-border-secondary">
              {activeProposals.length === 0 ? (
                <p className="text-[15px] text-content-secondary">No active proposals right now.</p>
              ) : (
                activeProposals.map((proposal) => (
                  <ProposalDigestRow key={`tab-active-${proposal.id}`} proposal={proposal} />
                ))
              )}
            </div>
          </DigestSection>

          <DigestSection title="Recently concluded proposals">
            <div className="flex flex-col divide-y divide-border-secondary">
              {concludedProposals.length === 0 ? (
                <p className="text-[15px] text-content-secondary">No concluded proposals found.</p>
              ) : (
                concludedProposals.map((proposal) => (
                  <ProposalDigestRow key={`tab-concluded-${proposal.id}`} proposal={proposal} />
                ))
              )}
            </div>
          </DigestSection>
        </div>
      );
    }

    if (activeSidebarTab === "topics") {
      return <TopicRows items={allTopicItems} limit={sidebarLimit} />;
    }

    if (activeSidebarTab === "candidates") {
      return <CandidateRows items={allCandidateItems} limit={sidebarLimit} />;
    }

    if (activeSidebarTab === "voters") {
      return (
        <>
          {isLoadingVoters ? (
            <p className="text-[15px] text-content-secondary">Loading voters...</p>
          ) : (
            <VoterList
              voters={voters}
              tokenStatsByAddress={tokenStatsByAddress}
              submittedProposalCountsByAddress={submittedProposalCountsByAddress}
              passedAuthoredOrSponsoredCountsByAddress={
                passedAuthoredOrSponsoredCountsByAddress
              }
              compact
              fillHeight={!isSidebarExpanded}
              expandedSort={isSidebarExpanded}
              sortMode={voterSortMode}
              onSortModeChange={setVoterSortMode}
              emptyLabel="No voter stats found."
            />
          )}
        </>
      );
    }

    return (
      <div className="flex flex-col gap-8">
        <DigestSection title="New candidates" subtitle="- Created within the last 30 days">
          <CandidateRows items={newCandidateItems} />
        </DigestSection>

        <DigestSection title="Active proposals">
          <div className="flex flex-col divide-y divide-border-secondary">
            {activeProposals.length === 0 ? (
              <p className="text-[15px] text-content-secondary">No active proposals right now.</p>
            ) : (
              activeProposals.map((proposal) => (
                <ProposalDigestRow key={`active-${proposal.id}`} proposal={proposal} />
              ))
            )}
          </div>
        </DigestSection>

        <DigestSection title="Recently concluded proposals">
          <div className="flex flex-col divide-y divide-border-secondary">
            {concludedProposals.length === 0 ? (
              <p className="text-[15px] text-content-secondary">No concluded proposals found.</p>
            ) : (
              concludedProposals.map((proposal) => (
                <ProposalDigestRow key={`concluded-${proposal.id}`} proposal={proposal} />
              ))
            )}
          </div>
        </DigestSection>

        <DigestSection title="Recent topics">
          <TopicRows items={recentTopicItems} />
        </DigestSection>

        <div className="flex flex-wrap gap-2 border-t border-border-secondary pt-5">
          {quickLinks.map(([label, href, Icon]) => (
            <Link
              key={href}
              to={href}
              className="inline-flex h-9 items-center gap-2 rounded-[6px] border border-border-secondary px-3 text-[14px] font-semibold text-content-primary transition-colors hover:border-border-primary hover:bg-background-secondary"
            >
              <Icon className="size-4" />
              {label}
            </Link>
          ))}
        </div>
      </div>
    );
  };

  return (
    <>
      <Helmet>
        <title>Lil Nouns Pro Governance Client</title>
        <meta
          name="description"
          content="A pro governance dashboard for Lil Nouns proposals, candidates, topics, votes, auctions, and VRGDA activity."
        />
        <link rel="canonical" href="https://pro.lilnouns.club/" />
        <meta property="og:title" content="Lil Nouns Pro Governance Client" />
        <meta
          property="og:description"
          content="A focused governance dashboard for Lil Nouns DAO operators and voters."
        />
      </Helmet>

      <div className="min-h-[calc(100vh-64px)] w-full bg-background-primary text-content-primary">
        <div
          data-governance-pro-layout
          data-sidebar-expanded={isSidebarExpanded}
          className={cn(
            "mx-auto grid w-full gap-12 px-5 py-8 pb-24 md:px-10",
            isSidebarExpanded
              ? "max-w-[1320px] lg:grid-cols-1"
              : "max-w-[1720px] lg:grid-cols-[minmax(0,0.58fr)_minmax(420px,0.42fr)] xl:gap-20",
          )}
        >
          <section className={cn("min-w-0", isSidebarExpanded && "lg:hidden")}>
            <DarkGovernanceActivityFeed
              items={feedItems}
              isLoading={isLoading}
              error={error}
              initialCount={16}
              compact
            />
          </section>

          <aside className="min-w-0 pt-3">
            <div className="mb-8 flex items-start gap-3 border-b border-border-secondary">
              <nav
                role="tablist"
                aria-label="Governance digest views"
                className="flex min-w-0 flex-1 items-center gap-8 overflow-x-auto text-[17px] font-semibold text-content-secondary"
              >
                {sidebarTabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={activeSidebarTab === tab.id}
                    onClick={() => setActiveSidebarTab(tab.id)}
                    className={cn(
                      "shrink-0 border-b-2 border-transparent pb-3 text-left transition-colors hover:text-content-primary",
                      activeSidebarTab === tab.id && "border-semantic-accent text-content-primary",
                    )}
                  >
                    {tab.label}
                  </button>
                ))}
              </nav>

              <button
                type="button"
                aria-label={isSidebarExpanded ? "Collapse sidebar" : "Expand sidebar"}
                onClick={() => setIsSidebarExpanded((value) => !value)}
                className="mb-2 inline-flex h-9 shrink-0 items-center gap-2 rounded-[6px] border border-border-secondary px-3 text-[14px] font-semibold text-content-primary transition-colors hover:border-border-primary hover:bg-background-secondary"
              >
                {isSidebarExpanded ? (
                  <>
                    <Minimize2 className="size-4" />
                    <span className="hidden sm:inline">Collapse</span>
                  </>
                ) : (
                  <>
                    <Maximize2 className="size-4" />
                    <span className="hidden sm:inline">Expand</span>
                  </>
                )}
              </button>
            </div>

            {renderSidebarContent()}
          </aside>
        </div>
      </div>
    </>
  );
}
