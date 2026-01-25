import { Info } from "lucide-react";
import { TooltipPopover } from "../ui/tooltipPopover";
import clsx from "clsx";
import { DetailedProposal } from "@/data/goldsky/governance/common";
import { ProposalActions } from "./ProposalActions";

export default function VotingSummary({
  forVotes,
  againstVotes,
  abstainVotes,
  quorumVotes,
  proposal,
  alwaysShowAbstain = false,
  isNounsDao = false,
}: {
  forVotes: number;
  againstVotes: number;
  abstainVotes: number;
  quorumVotes: number;
  proposal?: DetailedProposal;
  alwaysShowAbstain?: boolean;
  isNounsDao?: boolean;
}) {
  const items: { name: string; votes: number }[] = [
    { name: "For", votes: forVotes },
    { name: "Against", votes: againstVotes },
    ...(alwaysShowAbstain || abstainVotes > 0 ? [{ name: "Abstain", votes: abstainVotes }] : []),
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex h-[76px] items-center justify-between rounded-[12px] border p-3">
        {items.map((item, i) => (
          <div
            key={i}
            className="flex h-[30px] flex-1 flex-col items-center justify-center border-l first:border-none"
          >
            <div className="label-sm">{item.name}</div>
            <div
              className={clsx("text-content-secondary heading-5", {
                "text-semantic-positive": item.name == "For",
                "text-semantic-negative": item.name == "Against",
              })}
            >
              {item.votes}
            </div>
          </div>
        ))}
      </div>
      {quorumVotes > 0 && (
      <div className="flex gap-1 text-content-secondary paragraph-sm">
        Quorum: <span className="font-bold">{quorumVotes}</span>
        <TooltipPopover
          trigger={
            <Info
              size={16}
              strokeWidth={3}
              className="stroke-content-secondary"
            />
          }
        >
          The amount of FOR votes required for the proposal to pass. This
          adjusts based on the number of against votes.
        </TooltipPopover>
      </div>
      )}
      {proposal && (
        <div className="mt-2">
          <ProposalActions proposal={proposal} isNounsDao={isNounsDao} />
        </div>
      )}
    </div>
  );
}
