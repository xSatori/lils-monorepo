import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  DrawerDialog,
  DrawerDialogContent,
  DrawerDialogContentInner,
  DrawerDialogTitle,
} from "../ui/DrawerDialog";
import { getTopics } from "@/data/goldsky/governance/getTopics";
import { Topic } from "@/data/goldsky/governance/getTopics";
import LoadingSkeletons from "../LoadingSkeletons";
import { Separator } from "../ui/separator";
import { MessageSquare } from "lucide-react";
import { formatTimeLeft } from "@/utils/format";
import { Button } from "../ui/button";
import TopicMarkdownPreview from "../Topic/TopicMarkdownPreview";

interface TopicsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function TopicCard({ topic }: { topic: Topic }) {
  const timestamp = Math.floor(Date.now() / 1000);
  const timeDelta = Math.max(timestamp - topic.createdTimestamp, 0);
  const timeAgo = formatTimeLeft(timeDelta, true);

  // Calculate signature stats
  const validSignatures = topic.signatures.filter(s => s.status === 'valid');
  const forSignatures = validSignatures.filter(s => s.support === 1).length;
  const againstSignatures = validSignatures.filter(s => s.support === 0).length;
  const totalSignatures = forSignatures + againstSignatures;
  const forPercentage = totalSignatures > 0 ? (forSignatures / totalSignatures) * 100 : 0;
  const commentCount = topic.feedback.length;

  // Create URL from topic ID (format: creator-slug)
  const topicUrl = `/topics/${topic.id}`;

  return (
    <Link
      to={topicUrl}
      className="flex w-full justify-between rounded-[16px] border p-6 transition-colors hover:bg-background-ternary"
    >
      <div className="flex w-full flex-col gap-3">
        <h3 className="heading-6">{topic.title}</h3>
        <TopicMarkdownPreview title={topic.title} className="line-clamp-2">
          {topic.description}
        </TopicMarkdownPreview>
        
        {/* Sentiment Bar */}
        {totalSignatures > 0 && (
          <div className="flex items-center gap-2">
            <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full flex">
                <div 
                  className="bg-semantic-positive" 
                  style={{ width: `${forPercentage}%` }}
                />
                <div 
                  className="bg-semantic-negative" 
                  style={{ width: `${100 - forPercentage}%` }}
                />
              </div>
            </div>
            <span className="text-content-secondary label-xs">
              {Math.round(forPercentage)}% support
            </span>
          </div>
        )}

        <div className="flex items-center gap-4 text-content-secondary label-sm">
          <span className="flex items-center gap-1">
            <MessageSquare className="w-4 h-4" />
            {commentCount}
          </span>
          <span>•</span>
          <span className="text-semantic-positive">{forSignatures} for</span>
          <span>•</span>
          <span className="text-semantic-negative">{againstSignatures} against</span>
          <span>•</span>
          <span>{timeAgo}</span>
        </div>
      </div>
    </Link>
  );
}

export default function TopicsDialog({ open, onOpenChange }: TopicsDialogProps) {
  const { data: topics = [], isLoading } = useQuery({
    queryKey: ['topics'],
    queryFn: () => getTopics(1000),
    staleTime: 30_000,
    gcTime: 5 * 60 * 1000,
    enabled: open, // Only fetch when dialog is open
  });

  // Filter out canceled topics
  const activeTopics = topics.filter(t => !t.canceled);

  return (
    <DrawerDialog open={open} onOpenChange={onOpenChange}>
      <DrawerDialogContent className="md:max-w-[min(95vw,1200px)] md:h-[95vh] md:!top-[2.5%] md:!translate-y-0">
        <DrawerDialogTitle className="sr-only">
          All Topics
        </DrawerDialogTitle>
        <DrawerDialogContentInner className="p-0 md:flex-col md:h-full">
          <div className="flex w-full h-full flex-col gap-6 overflow-y-auto px-6 pb-6 md:px-8 md:pt-6">
            <div className="flex items-center justify-between">
              <h2 className="heading-2">Topics</h2>
            </div>
            <Separator className="h-[2px]" />
            <div className="flex w-full">
              <Link to="/topics" className="w-full">
                <Button variant="secondary" className="w-full">
                  View all topics
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
            ) : activeTopics.length > 0 ? (
              <div className="flex flex-col gap-6">
                {activeTopics.map((topic) => (
                  <TopicCard key={topic.id} topic={topic} />
                ))}
              </div>
            ) : (
              <div className="flex h-[200px] w-full items-center justify-center rounded-[16px] border bg-gray-50 text-center">
                <div className="flex flex-col gap-2">
                  <p className="heading-6">No topics found</p>
                  <p className="text-content-secondary paragraph-sm">
                    Be the first to start a discussion!
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
