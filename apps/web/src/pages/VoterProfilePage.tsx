import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Helmet } from "react-helmet-async";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownLeft, ArrowUpRight, Check, Copy, ExternalLink, MoreHorizontal } from "lucide-react";
import { type Address, isAddress } from "viem";

import { EnsAvatar } from "@/components/EnsAvatar";
import { EnsName } from "@/components/EnsName";
import LoadingSkeletons from "@/components/LoadingSkeletons";
import { getCandidatesForAddress, getProposalsForAddress, getTopicsForAddress } from "@/data/goldsky/governance/getUserProposals";
import { getVotesForVoter, type VoterVote } from "@/data/goldsky/governance/getVotesByVoter";
import { makeUrlId } from "@/data/goldsky/governance/getProposalIdeas";
import { makeTopicUrlId } from "@/data/goldsky/governance/getTopics";
import type { ProposalOverview } from "@/data/goldsky/governance/common";
import type { ProposalIdea } from "@/data/goldsky/governance/ideaTypes";
import type { Topic } from "@/data/goldsky/governance/getTopics";
import { getVoterDelegationProfile } from "@/data/goldsky/governance/getVoterDelegationProfile";
import { calculateVotePlacementBreakdown } from "@/features/voters/voteBreakdown";
import { normalizeProposalStatusByTiming } from "@/features/governance-feed/proposal-status";
import type { PonderNoun } from "@/data/ponder/nouns/types";
import { getExplorerLink } from "@/utils/blockExplorer";
import { buildNounImage } from "@/utils/nounImages/nounImage";
import { cn } from "@/utils/shadcn";
import { resolveEnsAddress } from "@/utils/ensResolution";

type CreatedTab = "proposals" | "candidates" | "topics";
type ActivityFilter = "everything" | "votes" | "proposals";

interface VoterProfileData {
  address: Address;
  ownedNouns: PonderNoun[];
  representedNouns: PonderNoun[];
  currentVotingPower: number;
  delegateAddress?: Address;
  tokenHoldersRepresented: number;
  proposals: ProposalOverview[];
  candidates: ProposalIdea[];
  topics: Topic[];
  votes: VoterVote[];
}

function formatNumber(value: number) {
  return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function pluralize(value: number, singular: string, plural = `${singular}s`) {
  return `${formatNumber(value)} ${value === 1 ? singular : plural}`;
}

function formatDate(timestamp: number) {
  if (!timestamp) return "Unknown date";
  return new Date(timestamp * 1000).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function supportLabel(support: number) {
  if (support === 1) return "For";
  if (support === 0) return "Against";
  if (support === 2) return "Abstain";
  return "Vote";
}

function supportTone(support: number) {
  if (support === 1) return "text-green-700";
  if (support === 0) return "text-red-700";
  if (support === 2) return "text-content-secondary";
  return "text-content-primary";
}

function proposalStatusLabel(value: string) {
  if (value === "failed") return "DEFEATED";
  return value.replace("metagov_", "metagov ").replace(/_/g, " ").toUpperCase();
}

function isNegativeProposalStatus(value: string) {
  return value === "failed" || value === "vetoed";
}

function isPositiveProposalStatus(value: string) {
  return value === "executed" || value === "succeeded" || value === "successful" || value === "queued";
}

function makeNounImage(noun: PonderNoun) {
  return buildNounImage(
    {
      background: { seed: noun.background, name: "" },
      body: { seed: noun.body, name: "" },
      accessory: { seed: noun.accessory, name: "" },
      head: { seed: noun.head, name: "" },
      glasses: { seed: noun.glasses, name: "" },
    },
    "full",
  );
}

function normalizeAddress(value: string | undefined) {
  return value?.toLowerCase();
}

function NounBadge({ noun, profileAddress }: { noun: PonderNoun; profileAddress: Address }) {
  const owner = normalizeAddress(noun.owner);
  const delegate = normalizeAddress(noun.delegate);
  const address = profileAddress.toLowerCase();
  const isDelegatedFromAnotherWallet = owner !== address && delegate === address;
  const isDelegatedToAnotherWallet = owner === address && Boolean(delegate) && delegate !== address;
  const DelegationIcon = isDelegatedFromAnotherWallet ? ArrowDownLeft : ArrowUpRight;
  const delegationLabel = isDelegatedFromAnotherWallet
    ? "Delegated from another wallet"
    : "Delegated to another wallet";

  return (
    <div className="flex w-[58px] flex-col items-center gap-0.5">
      <div className="relative size-[48px] overflow-hidden rounded-full border border-border-secondary bg-background-secondary">
        <img src={makeNounImage(noun)} alt={`Lil Noun ${noun.id}`} className="h-full w-full object-cover" />
        {(isDelegatedFromAnotherWallet || isDelegatedToAnotherWallet) && (
          <span
            className={cn(
              "absolute bottom-0 right-0 flex size-4 items-center justify-center rounded-full border border-white text-white",
              isDelegatedFromAnotherWallet ? "bg-green-700" : "bg-content-primary",
            )}
            title={delegationLabel}
            aria-label={delegationLabel}
          >
            <DelegationIcon className="size-3" aria-hidden="true" strokeWidth={3} />
          </span>
        )}
      </div>
      <span className="max-w-full truncate text-[12px] text-content-secondary">{noun.id}</span>
    </div>
  );
}

function ProfileActionsMenu({ address }: { address: Address }) {
  const [isOpen, setIsOpen] = useState(false);
  const [hasCopied, setHasCopied] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    function handlePointerDown(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [isOpen]);

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(address);
      setHasCopied(true);
      window.setTimeout(() => setHasCopied(false), 1400);
    } catch (error) {
      console.error("Failed to copy voter address:", error);
    }
  }

  return (
    <div ref={menuRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setIsOpen((value) => !value)}
        className="inline-flex h-11 items-center rounded-[8px] border border-border-secondary px-4 text-content-primary transition-colors hover:border-border-primary hover:bg-background-secondary"
        aria-label="Open voter actions"
        aria-expanded={isOpen}
      >
        <MoreHorizontal className="size-5" aria-hidden="true" />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-[calc(100%+8px)] z-20 w-52 overflow-hidden rounded-[8px] border border-border-secondary bg-white py-1 shadow-lg">
          <button
            type="button"
            onClick={copyAddress}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-[14px] font-semibold text-content-primary transition-colors hover:bg-background-secondary"
          >
            {hasCopied ? (
              <Check className="size-4 text-green-700" aria-hidden="true" />
            ) : (
              <Copy className="size-4" aria-hidden="true" />
            )}
            {hasCopied ? "Copied address" : "Copy address"}
          </button>
          <a
            href={getExplorerLink(address)}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 px-3 py-2 text-[14px] font-semibold text-content-primary transition-colors hover:bg-background-secondary"
          >
            <ExternalLink className="size-4" aria-hidden="true" />
            View on Etherscan
          </a>
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  sublabel,
  children,
}: {
  label: string;
  value: string | number;
  sublabel?: string;
  children?: ReactNode;
}) {
  return (
    <div className="rounded-[8px] border border-border-secondary bg-white p-5">
      <p className="text-[15px] font-bold text-content-primary">{value} {label}</p>
      {sublabel && <p className="mt-2 text-[14px] text-content-secondary">{sublabel}</p>}
      {children}
    </div>
  );
}

function VoteBreakdown({ votes }: { votes: VoterVote[] }) {
  const totals = calculateVotePlacementBreakdown(votes);
  const total = Math.max(totals.forVotes + totals.againstVotes + totals.abstainVotes, 1);
  const forWidth = (totals.forVotes / total) * 100;
  const abstainWidth = (totals.abstainVotes / total) * 100;
  const againstWidth = (totals.againstVotes / total) * 100;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-[14px] font-bold">
        <span className="text-green-700">For {formatNumber(totals.forVotes)}</span>
        <span className="text-content-secondary">
          Abstain {formatNumber(totals.abstainVotes)} ·{" "}
          <span className="text-red-700">Against {formatNumber(totals.againstVotes)}</span>
        </span>
      </div>
      <div className="flex h-4 overflow-hidden rounded-[3px] bg-background-secondary">
        <span className="bg-green-500" style={{ width: `${forWidth}%` }} />
        <span className="bg-gray-400" style={{ width: `${abstainWidth}%` }} />
        <span className="bg-red-500" style={{ width: `${againstWidth}%` }} />
      </div>
      <p className="text-right text-[14px] text-content-secondary">
        Voted on {totals.totalVotes} proposals (~{totals.reasonPercent}% with reason)
      </p>
    </div>
  );
}

function CreatedTabs({
  activeTab,
  onChange,
  counts,
}: {
  activeTab: CreatedTab;
  onChange: (tab: CreatedTab) => void;
  counts: Record<CreatedTab, number>;
}) {
  const tabs: Array<{ id: CreatedTab; label: string }> = [
    { id: "proposals", label: "Proposals" },
    { id: "candidates", label: "Candidates" },
    { id: "topics", label: "Topics" },
  ];

  return (
    <div className="flex border-b border-border-secondary">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={cn(
            "mr-8 border-b-2 border-transparent pb-3 text-[16px] font-semibold text-content-secondary transition-colors hover:text-content-primary",
            activeTab === tab.id && "border-semantic-accent text-content-primary",
          )}
        >
          {tab.label}{tab.id === "proposals" ? ` (${counts.proposals})` : counts[tab.id] ? ` (${counts[tab.id]})` : ""}
        </button>
      ))}
    </div>
  );
}

function ProposalRow({ proposal }: { proposal: ProposalOverview }) {
  const normalizedProposal = normalizeProposalStatusByTiming(proposal);
  const isNegative = isNegativeProposalStatus(normalizedProposal.state);
  const isPositive = isPositiveProposalStatus(normalizedProposal.state);

  return (
    <Link to={`/vote/${proposal.id}`} className="grid gap-3 py-5 md:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0">
        <p className="text-[14px] text-content-secondary">
          Prop {proposal.id} by <EnsName address={proposal.proposerAddress} className="font-semibold" />
        </p>
        <h3 className="mt-1 line-clamp-2 text-[18px] font-bold leading-6 text-content-primary">{proposal.title}</h3>
        <p className="mt-2 text-[14px] text-content-secondary">Voting ended {formatDate(proposal.votingEndTimestamp)}</p>
      </div>
      <div className="flex min-w-0 items-center justify-start gap-2 whitespace-nowrap md:justify-end">
        <span className="rounded-[3px] bg-background-secondary px-2 py-1 text-[12px] text-content-secondary">
          {formatNumber(proposal.forVotes)} / {formatNumber(proposal.quorumVotes)} for
        </span>
        <span className="rounded-[3px] bg-background-secondary px-2 py-1 text-[12px] text-content-secondary">
          {formatNumber(proposal.abstainVotes)}
        </span>
        <span className="rounded-[3px] bg-background-secondary px-2 py-1 text-[12px] text-content-secondary">
          {formatNumber(proposal.againstVotes)} against
        </span>
        <span
          className={cn(
            "rounded-[3px] px-2 py-1 text-[12px] font-bold uppercase",
            isNegative && "bg-red-100 text-red-700",
            isPositive && "bg-green-100 text-green-700",
            !isNegative && !isPositive && "bg-background-secondary text-content-primary",
          )}
        >
          {proposalStatusLabel(normalizedProposal.state)}
        </span>
      </div>
    </Link>
  );
}

function CreatedPanel({
  activeTab,
  proposals,
  candidates,
  topics,
}: {
  activeTab: CreatedTab;
  proposals: ProposalOverview[];
  candidates: ProposalIdea[];
  topics: Topic[];
}) {
  if (activeTab === "proposals") {
    return proposals.length ? (
      <div className="divide-y divide-border-secondary">
        {proposals.map((proposal) => <ProposalRow key={proposal.id} proposal={proposal} />)}
      </div>
    ) : (
      <p className="py-5 text-content-secondary">No proposals created by this wallet.</p>
    );
  }

  if (activeTab === "candidates") {
    return candidates.length ? (
      <div className="divide-y divide-border-secondary">
        {candidates.map((candidate) => (
          <Link key={candidate.id} to={`/candidates/${makeUrlId(candidate.id)}`} className="block py-5">
            <p className="text-[14px] text-content-secondary">Candidate by <EnsName address={candidate.proposerAddress as Address} /></p>
            <h3 className="mt-1 line-clamp-2 text-[18px] font-bold text-content-primary">
              {candidate.latestVersion.content.title}
            </h3>
            <p className="mt-2 text-[14px] text-content-secondary">
              Updated {formatDate(candidate.lastUpdatedTimestamp)}
            </p>
          </Link>
        ))}
      </div>
    ) : (
      <p className="py-5 text-content-secondary">No candidates created by this wallet.</p>
    );
  }

  return topics.length ? (
    <div className="divide-y divide-border-secondary">
      {topics.map((topic) => (
        <Link key={topic.id} to={`/topics/${makeTopicUrlId(topic.id)}`} className="block py-5">
          <p className="text-[14px] text-content-secondary">Topic by <EnsName address={topic.creator as Address} /></p>
          <h3 className="mt-1 line-clamp-2 text-[18px] font-bold text-content-primary">{topic.title}</h3>
          <p className="mt-2 text-[14px] text-content-secondary">
            {topic.feedback.length} comments, {topic.signatures.length} signatures
          </p>
        </Link>
      ))}
    </div>
  ) : (
    <p className="py-5 text-content-secondary">No topics created by this wallet.</p>
  );
}

type ActivityItem =
  | { id: string; type: "vote"; timestamp: number; vote: VoterVote }
  | { id: string; type: "proposal"; timestamp: number; proposal: ProposalOverview }
  | { id: string; type: "candidate"; timestamp: number; candidate: ProposalIdea }
  | { id: string; type: "topic"; timestamp: number; topic: Topic };

function ActivityRow({ item, address }: { item: ActivityItem; address: Address }) {
  if (item.type === "vote") {
    return (
      <Link to={`/vote/${item.vote.proposalId}`} className="block border-l border-border-secondary py-4 pl-5">
        <p className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-1 text-[15px] font-semibold leading-6">
          <span className="text-content-primary">
            <EnsName address={address} />
          </span>
          <span className={cn("font-bold", supportTone(item.vote.supportDetailed))}>
            voted {supportLabel(item.vote.supportDetailed)} ({formatNumber(item.vote.votes)})
          </span>
          <span className="line-clamp-2 text-content-primary">
            Proposal {item.vote.proposalId}: {item.vote.proposalTitle}
          </span>
          <span className="text-content-secondary">· {formatDate(item.timestamp)}</span>
        </p>
        {item.vote.reason && (
          <p className="mt-2 line-clamp-3 text-[15px] leading-6 text-content-secondary">{item.vote.reason}</p>
        )}
      </Link>
    );
  }

  if (item.type === "proposal") {
    return (
      <Link to={`/vote/${item.proposal.id}`} className="block border-l border-border-secondary py-4 pl-5">
        <p className="text-[15px] font-semibold text-content-primary">
          Proposal {item.proposal.id}: {item.proposal.title}
        </p>
        <p className="mt-1 text-[15px] text-content-secondary">created by <EnsName address={address} /> · {formatDate(item.timestamp)}</p>
      </Link>
    );
  }

  if (item.type === "candidate") {
    return (
      <Link to={`/candidates/${makeUrlId(item.candidate.id)}`} className="block border-l border-border-secondary py-4 pl-5">
        <p className="text-[15px] font-semibold text-content-primary">
          Candidate: {item.candidate.latestVersion.content.title}
        </p>
        <p className="mt-1 text-[15px] text-content-secondary">created by <EnsName address={address} /> · {formatDate(item.timestamp)}</p>
      </Link>
    );
  }

  return (
    <Link to={`/topics/${makeTopicUrlId(item.topic.id)}`} className="block border-l border-border-secondary py-4 pl-5">
      <p className="text-[15px] font-semibold text-content-primary">Topic: {item.topic.title}</p>
      <p className="mt-1 text-[15px] text-content-secondary">created by <EnsName address={address} /> · {formatDate(item.timestamp)}</p>
    </Link>
  );
}

async function getVoterProfileData(addressParam: string): Promise<VoterProfileData> {
  const resolved = await resolveEnsAddress(addressParam);
  if (!isAddress(resolved)) {
    throw new Error("Invalid address or unresolvable ENS name");
  }

  const address = resolved as Address;
  const [delegation, proposals, candidates, topics, votes] = await Promise.all([
    getVoterDelegationProfile(address),
    getProposalsForAddress(address),
    getCandidatesForAddress(address),
    getTopicsForAddress(address),
    getVotesForVoter(address),
  ]);

  return {
    address,
    ownedNouns: delegation.ownedNouns,
    representedNouns: delegation.representedNouns,
    currentVotingPower: delegation.currentVotingPower,
    delegateAddress: delegation.delegateAddress,
    tokenHoldersRepresented: delegation.tokenHoldersRepresented,
    proposals,
    candidates,
    topics,
    votes,
  };
}

export default function VoterProfilePage() {
  const { address: addressParam } = useParams<{ address: string }>();
  const [activeCreatedTab, setActiveCreatedTab] = useState<CreatedTab>("proposals");
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>("everything");

  const profileQuery = useQuery({
    queryKey: ["voter-profile", addressParam],
    queryFn: () => getVoterProfileData(addressParam || ""),
    enabled: !!addressParam,
    retry: false,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });

  const data = profileQuery.data;
  const displayedNouns = useMemo(() => {
    if (!data) return [];

    return [...data.ownedNouns].sort((a, b) => Number(b.id) - Number(a.id));
  }, [data]);
  const isDelegatingAway =
    data?.delegateAddress &&
    data.delegateAddress.toLowerCase() !== data.address.toLowerCase();
  const delegatedLilNounCount = data ? Math.max(data.currentVotingPower - data.ownedNouns.length, 0) : 0;
  const activityItems = useMemo<ActivityItem[]>(() => {
    if (!data) return [];

    const items: ActivityItem[] = [
      ...data.votes.map((vote) => ({
        id: `vote-${vote.id}`,
        type: "vote" as const,
        timestamp: vote.blockTimestamp,
        vote,
      })),
      ...data.proposals.map((proposal) => ({
        id: `proposal-${proposal.id}`,
        type: "proposal" as const,
        timestamp: proposal.createdTimestamp ?? proposal.votingStartTimestamp,
        proposal,
      })),
      ...data.candidates.map((candidate) => ({
        id: `candidate-${candidate.id}`,
        type: "candidate" as const,
        timestamp: candidate.createdTimestamp,
        candidate,
      })),
      ...data.topics.map((topic) => ({
        id: `topic-${topic.id}`,
        type: "topic" as const,
        timestamp: topic.createdTimestamp,
        topic,
      })),
    ].sort((a, b) => b.timestamp - a.timestamp);

    if (activityFilter === "votes") return items.filter((item) => item.type === "vote");
    if (activityFilter === "proposals") return items.filter((item) => item.type === "proposal");
    return items;
  }, [activityFilter, data]);

  if (profileQuery.isLoading) {
    return (
      <div className="w-full max-w-[1500px] p-6 md:p-10">
        <LoadingSkeletons count={6} className="mb-4 h-[96px] rounded-[8px]" />
      </div>
    );
  }

  if (!data || profileQuery.error) {
    return (
      <div className="w-full max-w-[900px] p-6 md:p-10">
        <h1 className="heading-3">Voter not found</h1>
        <p className="mt-2 text-content-secondary">Enter a valid wallet address or resolvable ENS name.</p>
      </div>
    );
  }

  return (
    <>
      <Helmet>
        <title>Voter Profile | Lil Nouns DAO</title>
        <meta
          name="description"
          content="Lil Nouns voter profile with represented nouns, created proposals, candidates, topics, and votes placed."
        />
      </Helmet>

      <div className="grid w-full max-w-[1720px] gap-10 px-6 py-8 pb-20 md:px-10 lg:grid-cols-[minmax(0,0.6fr)_minmax(380px,0.4fr)]">
        <main className="min-w-0">
          <header className="mb-9 flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3">
              <div className="min-w-0">
                <h1 className="truncate text-[40px] font-black leading-none text-content-primary md:text-[52px]">
                  <EnsName address={data.address} />
                </h1>
                <p className="mt-3 break-all text-[16px] text-content-secondary">{data.address}</p>
              </div>
              <EnsAvatar address={data.address} size={88} />
            </div>
            <ProfileActionsMenu address={data.address} />
          </header>

          <section className="mb-12 flex flex-wrap gap-x-3 gap-y-5">
            {displayedNouns.length === 0 ? (
              <p className="rounded-[8px] border border-border-secondary bg-white p-4 text-content-secondary">
                No owned Lil Nouns found.
              </p>
            ) : (
              displayedNouns
                .slice(0, 36)
                .map((noun) => (
                  <NounBadge key={noun.id} noun={noun} profileAddress={data.address} />
                ))
            )}
          </section>

          <section>
            <CreatedTabs
              activeTab={activeCreatedTab}
              onChange={setActiveCreatedTab}
              counts={{
                proposals: data.proposals.length,
                candidates: data.candidates.length,
                topics: data.topics.length,
              }}
            />
            <CreatedPanel
              activeTab={activeCreatedTab}
              proposals={data.proposals}
              candidates={data.candidates}
              topics={data.topics}
            />
          </section>
        </main>

        <aside className="min-w-0 lg:pt-0">
          <div className="sticky top-6 flex flex-col gap-8">
            <StatCard
              label="lil nouns represented"
              value={data.currentVotingPower}
              sublabel={
                data.ownedNouns.length > 0
                  ? `Owns ${pluralize(data.ownedNouns.length, "lil noun")}`
                  : "No owned lil nouns found"
              }
            >
              {isDelegatingAway && (
                <p className="mt-4 text-[15px] text-content-secondary">
                  Delegating votes to{" "}
                  <EnsName address={data.delegateAddress!} className="font-bold text-content-primary" />
                </p>
              )}
              {data.tokenHoldersRepresented > 0 && (
                <p className="mt-2 text-[14px] text-content-secondary">
                  Delegated {pluralize(delegatedLilNounCount, "lil noun")} by {pluralize(data.tokenHoldersRepresented, "wallet")}
                </p>
              )}
            </StatCard>

            <VoteBreakdown votes={data.votes} />

            <div className="flex justify-end">
              <label className="inline-flex items-center gap-2 text-[15px] font-semibold text-content-secondary">
                Show:
                <select
                  value={activityFilter}
                  onChange={(event) => setActivityFilter(event.target.value as ActivityFilter)}
                  className="h-10 rounded-[6px] border border-border-secondary bg-white px-3 text-[15px] font-bold text-content-primary outline-none focus:border-border-primary"
                >
                  <option value="everything">Everything</option>
                  <option value="votes">Votes</option>
                  <option value="proposals">Proposals</option>
                </select>
              </label>
            </div>

            <section className="flex flex-col">
              {activityItems.length === 0 ? (
                <p className="rounded-[8px] border border-border-secondary bg-white p-4 text-content-secondary">
                  No profile activity found.
                </p>
              ) : (
                activityItems.slice(0, 60).map((item) => (
                  <ActivityRow key={item.id} item={item} address={data.address} />
                ))
              )}
            </section>
          </div>
        </aside>
      </div>
    </>
  );
}
