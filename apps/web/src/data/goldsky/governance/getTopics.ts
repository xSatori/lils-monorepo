import { getAddress } from "viem";
import {
  fetchLilCampCandidateById,
  fetchLilCampCandidateBySlug,
  fetchLilCampCandidates,
  LilCampCandidate,
} from "@/data/ponder/lilCampApi";

export interface Topic {
  id: string;
  creator: string;
  slug: string;
  title: string;
  description: string;
  encodedTopicHash: string;
  canceled: boolean;
  createdTimestamp: number;
  createdBlock: number;
  createdTransactionHash: string;
  lastUpdatedTimestamp: number;
  lastUpdatedBlock: number;
  lastUpdatedTransactionHash: string;
  feedback: TopicFeedback[];
  signatures: TopicSignature[];
}

export interface TopicFeedback {
  id: string;
  voterAddress: string;
  support: number;
  reason: string;
  voteReplies?: Array<{
    reply: string;
    quotedReason?: string | null;
    replyVote: {
      id: string;
      voter: { id: string };
      support?: number | null;
      reason?: string | null;
    };
  }>;
  createdTimestamp: number;
  createdBlock: number;
  createdTransactionHash: string;
}

export interface TopicSignature {
  id: string;
  signerAddress: string;
  sig: string;
  expirationTimestamp: number;
  support: number;
  sigDigest: string;
  reason: string;
  createdTimestamp: number;
  createdBlock: number;
  createdTransactionHash: string;
  status: "valid" | "expired";
}

function toNumber(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === "") {
    return 0;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function mapCandidateToTopic(candidate: LilCampCandidate): Topic | null {
  try {
    const createdTimestamp = toNumber(candidate.created_timestamp);
    const lastUpdatedTimestamp =
      toNumber(candidate.last_updated_timestamp) || createdTimestamp;
    const createdBlock = toNumber(candidate.block_number);

    const signatures: TopicSignature[] = (candidate.signatures || []).map(
      (signature) => {
        const expirationTimestamp = toNumber(signature.expiration_timestamp);
        const expired = expirationTimestamp > 0 && expirationTimestamp * 1000 < Date.now();

        return {
          id: signature.id,
          signerAddress: getAddress(signature.signer),
          sig: signature.sig,
          expirationTimestamp,
          support: 1,
          sigDigest: "",
          reason: signature.reason || "",
          createdTimestamp: toNumber(signature.block_timestamp),
          createdBlock,
          createdTransactionHash: "0x",
          status: expired ? "expired" : "valid",
        };
      },
    );

    const feedback: TopicFeedback[] = (candidate.feedback || []).map((item) => ({
      id: item.id,
      voterAddress: getAddress(item.msg_sender),
      support: item.support,
      reason: item.reason || "",
      createdTimestamp: toNumber(item.block_timestamp),
      createdBlock,
      createdTransactionHash: "0x",
    }));

    return {
      id: candidate.id,
      creator: getAddress(candidate.proposer),
      slug: candidate.slug,
      title: candidate.title || candidate.slug.replace(/-/g, " "),
      description: candidate.description || "",
      encodedTopicHash: candidate.encoded_proposal_hash || "",
      canceled: !!candidate.canceled,
      createdTimestamp,
      createdBlock,
      createdTransactionHash: "0x",
      lastUpdatedTimestamp,
      lastUpdatedBlock: createdBlock,
      lastUpdatedTransactionHash: "0x",
      feedback,
      signatures,
    };
  } catch (error) {
    console.warn("[getTopics] Skipping malformed Ponder topic", {
      id: candidate.id,
      proposer: candidate.proposer,
      error,
    });
    return null;
  }
}

export async function getTopics(limit: number = 1000): Promise<Topic[]> {
  try {
    const candidates = await fetchLilCampCandidates(limit, "topic");
    return candidates
      .map(mapCandidateToTopic)
      .filter((topic): topic is Topic => topic !== null);
  } catch (error) {
    console.error("[getTopics] Failed to fetch Ponder topics:", error);
    return [];
  }
}

export async function getTopic(id: string): Promise<Topic | null> {
  try {
    let candidate = await fetchLilCampCandidateById(id);

    if (!candidate) {
      candidate = await fetchLilCampCandidateBySlug(extractSlugFromTopicId(id), "topic");
    }

    return candidate ? mapCandidateToTopic(candidate) : null;
  } catch (error) {
    try {
      const candidate = await fetchLilCampCandidateBySlug(
        extractSlugFromTopicId(id),
        "topic",
      );
      return candidate ? mapCandidateToTopic(candidate) : null;
    } catch (fallbackError) {
      console.error("[getTopic] Failed to fetch Ponder topic:", {
        id,
        error,
        fallbackError,
      });
      return null;
    }
  }
}

export function normalizeTopicId(id: string): string {
  const fullyDecodedId = decodeURIComponent(id);
  const parts = fullyDecodedId.split("-");

  if (parts[0].startsWith("0x")) {
    const creatorId = parts[0].toLowerCase();
    const slug = parts.slice(1).join("-");
    return `${creatorId}-${slug}`;
  }

  const creatorId = `0x${parts[parts.length - 1]}`.toLowerCase();
  const slug = parts.slice(0, -1).join("-");
  return `${creatorId}-${slug}`;
}

export function extractSlugFromTopicId(topicId: string): string {
  const slugParts = topicId.split("-").slice(1);
  return slugParts.join("-");
}

export function makeTopicUrlId(id: string): string {
  const creatorId = id.split("-")[0];
  const slug = extractSlugFromTopicId(id);
  return `${slug}-${creatorId.slice(2)}`;
}
