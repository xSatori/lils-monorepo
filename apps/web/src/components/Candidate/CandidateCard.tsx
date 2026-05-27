import { Link } from "react-router-dom";
import { ProposalIdea } from "@/data/goldsky/governance/ideaTypes";
import { EnsAvatar } from "../EnsAvatar";
import { EnsName } from "../EnsName";
import { getAddress } from "viem";
import { formatTimeLeft } from "@/utils/format";
import VotingBar from "./VotingBar";
import { makeUrlId } from "@/data/goldsky/governance/getProposalIdeas";
import { useReadNounsNftTokenGetCurrentVotes } from "@/data/generated/wagmi";

interface CandidateCardProps {
  candidate: ProposalIdea;
  proposalThreshold: number;
}

export default function CandidateCard({ candidate, proposalThreshold }: CandidateCardProps) {
  const timestamp = Math.floor(Date.now() / 1000);
  const timeDelta = Math.max(timestamp - candidate.createdTimestamp, 0);
  const timeAgo = formatTimeLeft(timeDelta, true);

  // Calculate voting power from sponsors (from latest version or direct sponsors array)
  const sponsors = candidate.latestVersion.contentSignatures || candidate.sponsors || [];
  const validSponsors = sponsors.filter(s => !s.canceled && s.expirationTimestamp > timestamp);
  const sponsorVotingPower = validSponsors.reduce(
    (sum, sponsor) => sum + (sponsor.signer.nounsRepresented?.length || 0),
    0
  );

  // Get proposer voting power from delegate
  const { data: proposerVotes } = useReadNounsNftTokenGetCurrentVotes({
    args: [getAddress(candidate.proposerAddress)],
  });
  const proposerVotingPower = proposerVotes ? Number(proposerVotes) : 0;
  const totalVotingPower = proposerVotingPower + sponsorVotingPower;

  const getStatus = () => {
    if (candidate.canceledTimestamp) return "canceled";
    if (candidate.latestVersion.proposalId) return "promoted";
    if (candidate.latestVersion.targetProposalId) return "update";
    return "active";
  };

  const status = getStatus();
  const promotedProposalId = candidate.latestVersion.proposalId;
  const candidatePath = `/candidates/${makeUrlId(candidate.id)}`;
  const cardPath = promotedProposalId ? `/vote/${promotedProposalId}` : candidatePath;

  return (
    <Link
      to={cardPath}
      className="flex flex-col gap-4 rounded-[16px] border p-6 transition-all hover:border-content-secondary"
    >
      {/* Status badges */}
      <div className="flex items-center gap-2">
        {status === "canceled" && (
          <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-medium text-red-700">
            Canceled
          </span>
        )}
        {status === "promoted" && (
          <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700">
            Promoted to Proposal {promotedProposalId}
          </span>
        )}
        {status === "update" && (
          <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700">
            Proposal Update
          </span>
        )}
      </div>

      {/* Title */}
      <h3 className="heading-5 line-clamp-2">{candidate.latestVersion.content.title}</h3>

      {/* Meta info */}
      <div className="flex items-center gap-2 text-content-secondary paragraph-sm">
        <EnsAvatar address={getAddress(candidate.proposerAddress)} size={24} />
        <EnsName address={getAddress(candidate.proposerAddress)} />
        <span>·</span>
        <span>{timeAgo}</span>
      </div>

      {/* Voting progress */}
      <VotingBar current={totalVotingPower} threshold={proposalThreshold} />

      {/* Stats */}
      <div className="flex items-center gap-4 text-content-secondary paragraph-sm">
        <span>{candidate.feedbackPosts?.length || 0} comments</span>
        <span>{validSponsors.length} sponsors</span>
        {promotedProposalId && <span>View onchain proposal</span>}
      </div>
    </Link>
  );
}

