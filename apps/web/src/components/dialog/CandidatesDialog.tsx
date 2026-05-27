import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  DrawerDialog,
  DrawerDialogContent,
  DrawerDialogContentInner,
  DrawerDialogTitle,
} from "../ui/DrawerDialog";
import { getProposalIdeas } from "@/data/goldsky/governance/getProposalIdeas";
import CandidateCard from "../Candidate/CandidateCard";
import LoadingSkeletons from "../LoadingSkeletons";
import { Separator } from "../ui/separator";
import { Button } from "../ui/button";
import { useProposalThreshold } from "@/hooks/useProposalThreshold";

interface CandidatesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function CandidatesDialog({ open, onOpenChange }: CandidatesDialogProps) {
  const { data: candidates = [], isLoading } = useQuery({
    queryKey: ['candidates'],
    queryFn: () => getProposalIdeas(1000),
    staleTime: 30_000,
    gcTime: 5 * 60 * 1000,
    enabled: open, // Only fetch when dialog is open
  });

  const proposalThreshold = useProposalThreshold();

  // Filter active candidates (not canceled, not promoted, not updates)
  const activeCandidates = candidates.filter(i => {
    const isActive = !i.canceledTimestamp && 
                     !i.latestVersion.proposalId && 
                     !i.latestVersion.targetProposalId;
    return isActive;
  });

  return (
    <DrawerDialog open={open} onOpenChange={onOpenChange}>
      <DrawerDialogContent className="md:max-w-[min(95vw,1200px)] md:h-[95vh] md:!top-[2.5%] md:!translate-y-0">
        <DrawerDialogTitle className="sr-only">
          All Candidates
        </DrawerDialogTitle>
        <DrawerDialogContentInner className="p-0 md:flex-col md:h-full">
          <div className="flex w-full h-full flex-col gap-6 overflow-y-auto px-6 pb-6 md:px-8 md:pt-6">
            <div className="flex items-center justify-between">
              <h2 className="heading-2">Candidates</h2>
            </div>
            <Separator className="h-[2px]" />
            <div className="flex w-full">
              <Link to="/candidates" className="w-full">
                <Button variant="secondary" className="w-full">
                  View all candidates
                </Button>
              </Link>
            </div>

            {isLoading ? (
              <div className="flex flex-col gap-6">
                <LoadingSkeletons
                  count={10}
                  className="h-[200px] w-full rounded-[16px]"
                />
              </div>
            ) : activeCandidates.length > 0 ? (
              <div className="flex flex-col gap-6">
                {activeCandidates.map((candidate) => (
                  <CandidateCard
                    key={candidate.id}
                    candidate={candidate}
                    proposalThreshold={proposalThreshold ?? 0}
                  />
                ))}
              </div>
            ) : (
              <div className="flex h-[200px] w-full items-center justify-center rounded-[16px] border bg-gray-50 text-center">
                <div className="flex flex-col gap-2">
                  <p className="heading-6">No active candidates</p>
                  <p className="text-content-secondary paragraph-sm">
                    Be the first to create a candidate proposal!
                  </p>
                </div>
              </div>
            )}
          </div>
        </DrawerDialogContentInner>
      </DrawerDialogContent>
    </DrawerDialog>
  );
}

