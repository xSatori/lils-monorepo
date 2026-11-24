import { useQuery } from "@tanstack/react-query";
import { Helmet } from "react-helmet-async";
import { Link, useParams } from "react-router-dom";
import MarkdownRenderer from "@/components/MarkdownRenderer";
import RoundImage from "@/components/Rounds/RoundImage";
import { formatAward, formatRoundDates } from "@/components/Rounds/utils";
import type { Round, RoundProposal, RoundVote } from "@/data/rounds/types";
import { useScrollToTop } from "@/hooks/rounds/useScrollToTop";
import index from "./archive/index.json";

const rounds = index as Round[];
type ArchiveDetail = { proposals: RoundProposal[]; votes: Record<string, RoundVote[]> };
const loadRecords = import.meta.glob<ArchiveDetail>(["./archive/*.json", "!./archive/index.json"], { import: "default" });
const shell = "mx-auto flex w-full max-w-[1200px] flex-col gap-6 px-4 py-8 md:px-8";
const panel = "rounded-[16px] border bg-white p-5 md:p-6";

function platform(round: Round) {
  return round.source === "prop-house" ? "Prop House" : "nouns.gg";
}

function roundLink(round: Round) {
  return `/rounds/${encodeURIComponent(round.handle)}`;
}

export function ArchiveRounds() {
  return (
    <section aria-labelledby="archived-rounds-title" className="flex flex-col gap-4">
      <div>
        <h2 id="archived-rounds-title" className="heading-5">Archived rounds</h2>
        <p className="text-content-secondary paragraph-sm">Historical rounds from nouns.gg and Prop House.</p>
      </div>
      <ul className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
        {rounds.map((round) => (
          <li key={round.handle}>
            <Link to={roundLink(round)} className="group flex h-full flex-col overflow-hidden rounded-[16px] border bg-white transition-all hover:-translate-y-0.5 hover:border-gray-500 hover:shadow-overlay focus-visible:ring-2">
              <div className="h-[170px] bg-background-secondary">
                <RoundImage src={round.image} className="h-full w-full object-cover" />
              </div>
              <div className="flex flex-1 flex-col gap-3 p-5">
                <span className="w-fit rounded-full bg-background-secondary px-3 py-1 label-sm">{platform(round)}</span>
                <h3 className="heading-4">{round.name}</h3>
                <p className="line-clamp-3 text-content-secondary paragraph-sm">{round.description}</p>
                <p className="mt-auto border-t pt-3 text-content-secondary label-sm">{formatRoundDates(round)}</p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ArchiveProposal({ round, proposal, votes }: { round: Round; proposal: RoundProposal; votes: RoundVote[] }) {
  return (
    <article className={shell}>
      <Helmet><title>{proposal.title} | Archived Lil Nouns Rounds</title></Helmet>
      <Link className="w-fit underline" to={roundLink(round)}>{round.name}</Link>
      <header className="flex flex-col gap-2">
        <p className="text-content-secondary label-sm">{platform(round)} · Archived proposal</p>
        <h1 className="heading-3">{proposal.title}</h1>
        <p className="break-words">{proposal.authorName || proposal.author} · {proposal.voteCount} votes</p>
        {proposal.place != null && <p>Award place {proposal.place}</p>}
      </header>
      {proposal.tldr && <p>{proposal.tldr}</p>}
      <div className={panel}>
        <MarkdownRenderer>{proposal.content}</MarkdownRenderer>
      </div>
      <details className={panel}>
        <summary className="cursor-pointer font-semibold">Vote history ({votes.length} records)</summary>
        {votes.length ? (
          <ul className="mt-3 divide-y">
            {votes.map((vote) => (
              <li key={vote.id} className="flex flex-wrap justify-between gap-2 py-2 text-sm">
                <span className="break-all">{vote.voterName || vote.voter}</span>
                <span>{vote.weight} votes · {new Date(vote.timestamp).toLocaleDateString()}</span>
              </li>
            ))}
          </ul>
        ) : <p className="mt-3">No individual ballots were preserved for this proposal.</p>}
      </details>
    </article>
  );
}

export function ArchiveRoundDetail() {
  useScrollToTop();
  const { handle, id } = useParams<{ handle: string; id: string }>();
  const round = rounds.find((candidate) => candidate.handle === handle);
  const detail = useQuery({
    queryKey: ["archived-round-records", handle],
    enabled: Boolean(round),
    queryFn: () => loadRecords[`./archive/${round!.handle}.json`]?.() ?? Promise.reject(new Error("Archive file is missing.")),
    staleTime: Infinity,
  });

  if (!round) return <div className={shell}><h1 className="heading-4">Archived round not found</h1><Link className="underline" to="/rounds">All rounds</Link></div>;
  if (detail.isPending) return <div role="status" className={shell}>Loading archived round…</div>;
  if (detail.isError) return <div role="alert" className={shell}>The archive could not be loaded.<button type="button" onClick={() => detail.refetch()} className="w-fit underline">Retry</button></div>;
  const { proposals, votes } = detail.data;
  if (id !== undefined) {
    const proposal = proposals.find((item) => String(item.id) === id);
    if (!proposal) return <div className={shell}><h1 className="heading-4">Archived proposal not found</h1><Link className="underline" to={roundLink(round)}>{round.name}</Link></div>;
    return <ArchiveProposal round={round} proposal={proposal} votes={votes[id] ?? []} />;
  }

  return (
    <article className={shell}>
      <Helmet><title>{round.name} | Archived Lil Nouns Rounds</title></Helmet>
      <Link className="w-fit underline" to="/rounds">All rounds</Link>
      <header className="flex flex-col gap-3">
        <p className="text-content-secondary label-sm">{platform(round)} · Archived round</p>
        <h1 className="heading-3">{round.name}</h1>
        <p>{formatRoundDates(round)}</p>
      </header>
      <div className={panel}><MarkdownRenderer>{round.content || round.description || ""}</MarkdownRenderer></div>
      {round.awards.length > 0 && (
        <section className={panel}>
          <h2 className="heading-5">Awards</h2>
          <ol className="mt-3 divide-y">
            {round.awards.map((award) => {
              const winner = proposals.find((p) => p.id === award.winnerProposalId);
              return (
                <li key={award.id} className="flex flex-wrap justify-between gap-2 py-3">
                  <span>Place {award.place} · {formatAward(award)}</span>
                  {winner ? <Link className="underline" to={`${roundLink(round)}/proposals/${winner.id}`}>{winner.title}</Link> : <span>Winner unavailable</span>}
                </li>
              );
            })}
          </ol>
        </section>
      )}
      <section className={panel}>
        <h2 className="heading-5">Proposals</h2>
        {proposals.length ? (
          <ul className="mt-3 divide-y">
            {proposals.map((proposal) => (
              <li key={proposal.id}>
                <Link to={`${roundLink(round)}/proposals/${proposal.id}`} className="flex flex-wrap justify-between gap-3 py-4 hover:underline">
                  <span className="font-semibold">{proposal.title}</span><span>{proposal.voteCount} votes</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : <p className="mt-3 text-content-secondary">Proposal records are unavailable in the source archive.</p>}
      </section>
      {round.sourceUrl && /^https?:\/\//i.test(round.sourceUrl) && (
        <a className="w-fit underline" href={round.sourceUrl} target="_blank" rel="noreferrer">Original {platform(round)} round</a>
      )}
    </article>
  );
}
