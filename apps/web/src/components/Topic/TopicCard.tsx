import { Link } from "react-router-dom";
import { MessageSquare } from "lucide-react";
import { formatTimeLeft } from "@/utils/format";
import { Topic } from "@/data/goldsky/governance/getTopics";
import TopicMarkdownPreview from "./TopicMarkdownPreview";

interface TopicCardProps {
  topic: Topic;
}

export default function TopicCard({ topic }: TopicCardProps) {
  const timestamp = Math.floor(Date.now() / 1000);
  const timeDelta = Math.max(timestamp - topic.createdTimestamp, 0);
  const timeAgo = formatTimeLeft(timeDelta, true);

  // Signature stats
  const validSignatures = topic.signatures?.filter(s => s.status === "valid") ?? [];
  const forSignatures = validSignatures.filter(s => s.support === 1).length;
  const againstSignatures = validSignatures.filter(s => s.support === 0).length;
  const totalSignatures = forSignatures + againstSignatures;
  const forPercentage = totalSignatures > 0 ? (forSignatures / totalSignatures) * 100 : 0;

  const commentCount = topic.feedback?.length ?? 0;
  const topicUrl = `/topics/${topic.id}`;

  return (
    <Link
      to={topicUrl}
      className="flex flex-col gap-4 rounded-[16px] border p-6 transition-all hover:border-content-secondary"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-2">
          <h3 className="heading-5">{topic.title}</h3>
          <TopicMarkdownPreview title={topic.title}>
            {topic.description}
          </TopicMarkdownPreview>
        </div>
        {topic.canceled && (
          <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-medium text-red-700">
            Canceled
          </span>
        )}
      </div>

      {/* Sentiment bar */}
      {totalSignatures > 0 && (
        <div className="flex items-center gap-2">
          <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
            <div className="flex h-full">
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

      <div className="flex items-center gap-3 text-content-secondary paragraph-sm">
        <span className="flex items-center gap-1">
          <MessageSquare className="h-4 w-4" />
          {commentCount}
        </span>
        <span>•</span>
        <span className="text-semantic-positive">{forSignatures} for</span>
        <span>•</span>
        <span className="text-semantic-negative">{againstSignatures} against</span>
        <span>•</span>
        <span>{timeAgo}</span>
      </div>
    </Link>
  );
}
