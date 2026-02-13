import { graphQLFetch } from "@/data/utils/graphQLFetch";
import { CHAIN_CONFIG, NOUNS_DAO_GOLDSKY_URL } from "@/config";
import { getAddress } from "viem";
import { getTopicsOnchain } from "@/data/nounsDaoData/getTopicsOnchain";

// Helpers to resolve endpoints (prefer Goldsky, fallback to The Graph)
const getGoldskyUrls = () => CHAIN_CONFIG.goldskyUrl;
const getGraphUrls = () => CHAIN_CONFIG.subgraphUrl;

/** Topics exist only on Lil Nouns subgraph; Nouns DAO subgraph has no `topics` field */
function isTopicsSupportedSubgraph(): boolean {
  const primary = getGoldskyUrls().primary;
  return primary !== NOUNS_DAO_GOLDSKY_URL;
}

const query = `
  query GetTopics($first: Int = 1000) {
    topics(
      first: $first
      orderBy: createdTimestamp
      orderDirection: desc
    ) {
      id
      creator {
        id
      }
      slug
      title
      description
      encodedTopicHash
      canceled
      createdTimestamp
      createdBlock
      createdTransactionHash
      lastUpdatedTimestamp
      lastUpdatedBlock
      lastUpdatedTransactionHash
    }
  }
`;

const batchFeedbackQuery = `
  query GetBatchTopicFeedback($topicIds: [ID!]!) {
    topicFeedbacks(
      where: {
        topic_in: $topicIds
      }
      orderBy: createdTimestamp
      orderDirection: desc
    ) {
      id
      topic {
        id
      }
      voter {
        id
      }
      support
      reason
      voteReplies {
        reply
        quotedReason
        replyVote {
          id
          voter { id }
          support
          reason
        }
      }
      createdTimestamp
      createdBlock
      createdTransactionHash
    }
  }
`;

const batchSignaturesQuery = `
  query GetBatchTopicSignatures($topicIds: [ID!]!) {
    topicSignatures(
      where: {
        topic_in: $topicIds
      }
      orderBy: createdTimestamp
      orderDirection: desc
    ) {
      id
      topic {
        id
      }
      signer {
        id
      }
      sig
      expirationTimestamp
      support
      sigDigest
      reason
      createdTimestamp
      createdBlock
      createdTransactionHash
    }
  }
`;

const feedbackQuery = `
  query GetTopicFeedback($topicId: ID!) {
    topicFeedbacks(
      where: {
        topic: $topicId
      }
      orderBy: createdTimestamp
      orderDirection: desc
    ) {
      id
      voter {
        id
      }
      support
      reason
      createdTimestamp
      createdBlock
      createdTransactionHash
    }
  }
`;

const signaturesQuery = `
  query GetTopicSignatures($topicId: ID!) {
    topicSignatures(
      where: {
        topic: $topicId
      }
      orderBy: createdTimestamp
      orderDirection: desc
    ) {
      id
      signer {
        id
      }
      sig
      expirationTimestamp
      support
      sigDigest
      reason
      createdTimestamp
      createdBlock
      createdTransactionHash
    }
  }
`;

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
  support: number; // 0=against, 1=for, 2=abstain
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
  support: number; // 0=against, 1=for, 2=abstain
  sigDigest: string;
  reason: string;
  createdTimestamp: number;
  createdBlock: number;
  createdTransactionHash: string;
  status: 'valid' | 'expired';
}

interface TopicsResponse {
  topics: Array<{
    id: string;
    creator: {
      id: string;
    };
    slug: string;
    title: string;
    description: string;
    encodedTopicHash: string;
    canceled: boolean;
    createdTimestamp: string;
    createdBlock: string;
    createdTransactionHash: string;
    lastUpdatedTimestamp: string;
    lastUpdatedBlock: string;
    lastUpdatedTransactionHash: string;
  }>;
}

interface TopicFeedbackResponse {
  topicFeedbacks: Array<{
    id: string;
    topic?: {
      id: string;
    };
    voter: {
      id: string;
    };
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
    createdTimestamp: string;
    createdBlock: string;
    createdTransactionHash: string;
  }>;
}

interface TopicSignaturesResponse {
  topicSignatures: Array<{
    id: string;
    topic?: {
      id: string;
    };
    signer: {
      id: string;
    };
    sig: string;
    expirationTimestamp: string;
    support: number;
    sigDigest: string;
    reason: string;
    createdTimestamp: string;
    createdBlock: string;
    createdTransactionHash: string;
  }>;
}

/**
 * Fetch all topics from Goldsky subgraph.
 * Topics are a Lil Nouns–only feature; when config points at Nouns DAO subgraph, returns [].
 */
export async function getTopics(limit: number = 1000): Promise<Topic[]> {
  try {
    if (!isTopicsSupportedSubgraph()) {
      return [];
    }
    // Try Goldsky first, fall back to decentralized subgraph if needed
    let data = await graphQLFetch(
      getGoldskyUrls().primary,
      query,
      { first: limit },
      { cache: "no-cache" }
    ) as TopicsResponse | null;

    if (!data && getGoldskyUrls().fallback) {
      data = await graphQLFetch(
        getGoldskyUrls().fallback,
        query,
        { first: limit },
        { cache: "no-cache" }
      ) as TopicsResponse | null;
    }

    if (!data && getGraphUrls()?.primary) {
      data = await graphQLFetch(
        getGraphUrls().primary,
        query,
        { first: limit },
        { cache: "no-cache" }
      ) as TopicsResponse | null;
    }

    if (!data && getGraphUrls()?.fallback) {
      data = await graphQLFetch(
        getGraphUrls().fallback,
        query,
        { first: limit },
        { cache: "no-cache" }
      ) as TopicsResponse | null;
    }

    if (!data?.topics || data.topics.length === 0) {
      const onchainTopics = await getTopicsOnchain();
      return onchainTopics;
    }

    // Fetch all feedback and signatures in batch queries (much faster than N+1 queries)
    const topicIds = data.topics.map(t => t.id);
    let allFeedback: Record<string, TopicFeedback[]> = {};
    let allSignatures: Record<string, TopicSignature[]> = {};

    // Fetch feedback in batch
    try {
      const feedbackData = await graphQLFetch(
        getGoldskyUrls().primary,
        batchFeedbackQuery,
        { topicIds },
        { cache: "no-cache" }
      ) as TopicFeedbackResponse;

      // Group feedback by topic ID
      (feedbackData?.topicFeedbacks || []).forEach(fb => {
        const topicId = fb.topic?.id || '';
        if (!allFeedback[topicId]) {
          allFeedback[topicId] = [];
        }
        allFeedback[topicId].push({
          id: fb.id,
          voterAddress: fb.voter.id,
          support: fb.support,
          reason: fb.reason || '',
          voteReplies: fb.voteReplies?.map((vr) => ({
            reply: vr.reply,
            quotedReason: vr.quotedReason ?? undefined,
            replyVote: {
              id: vr.replyVote.id,
              voter: { id: vr.replyVote.voter.id },
              support: vr.replyVote.support ?? fb.support,
              reason: vr.replyVote.reason ?? '',
            },
          })) || [],
          createdTimestamp: parseInt(fb.createdTimestamp),
          createdBlock: parseInt(fb.createdBlock),
          createdTransactionHash: fb.createdTransactionHash,
        });
      });
    } catch (error) {
      console.error('Failed to fetch batch feedback:', error);
    }

    // Fetch signatures in batch
    try {
      const signaturesData = await graphQLFetch(
        getGoldskyUrls().primary,
        batchSignaturesQuery,
        { topicIds },
        { cache: "no-cache" }
      ) as TopicSignaturesResponse;

      // Group signatures by topic ID
      (signaturesData?.topicSignatures || []).forEach(sig => {
        const topicId = sig.topic?.id || '';
        if (!allSignatures[topicId]) {
          allSignatures[topicId] = [];
        }

        const expirationTimestamp = parseInt(sig.expirationTimestamp);
        const isExpired = expirationTimestamp * 1000 < Date.now();

        allSignatures[topicId].push({
          id: sig.id,
          signerAddress: sig.signer.id,
          sig: sig.sig,
          expirationTimestamp,
          support: sig.support,
          sigDigest: sig.sigDigest,
          reason: sig.reason || '',
          createdTimestamp: parseInt(sig.createdTimestamp),
          createdBlock: parseInt(sig.createdBlock),
          createdTransactionHash: sig.createdTransactionHash,
          status: isExpired ? 'expired' : 'valid',
        });
      });
    } catch (error) {
      console.error('Failed to fetch batch signatures:', error);
    }

    // Convert topics to Topic format; filter out malformed records missing creator
    const topics = data.topics
      .filter((topic) => !!topic.creator?.id)
      .map((topic) => {
        let creator: string;
        try {
          creator = getAddress(topic.creator.id);
        } catch (e) {
          console.warn('Skipping topic with invalid creator address', topic.id, topic.creator?.id);
          return null;
        }

        return {
          id: topic.id,
          creator,
          slug: topic.slug,
          title: topic.title,
          description: topic.description,
          encodedTopicHash: topic.encodedTopicHash,
          canceled: topic.canceled,
          createdTimestamp: parseInt(topic.createdTimestamp),
          createdBlock: parseInt(topic.createdBlock),
          createdTransactionHash: topic.createdTransactionHash,
          lastUpdatedTimestamp: parseInt(topic.lastUpdatedTimestamp),
          lastUpdatedBlock: parseInt(topic.lastUpdatedBlock),
          lastUpdatedTransactionHash: topic.lastUpdatedTransactionHash,
          feedback: allFeedback[topic.id] || [],
          signatures: allSignatures[topic.id] || [],
        };
      })
      .filter((t): t is Topic => t !== null);

    return topics;
  } catch (error) {
    console.error('Failed to fetch topics:', error);
    return [];
  }
}

const singleTopicQuery = `
  query GetTopic($id: ID!) {
    topic(id: $id) {
      id
      creator {
        id
      }
      slug
      title
      description
      encodedTopicHash
      canceled
      createdTimestamp
      createdBlock
      createdTransactionHash
      lastUpdatedTimestamp
      lastUpdatedBlock
      lastUpdatedTransactionHash
    }
  }
`;

/**
 * Fetch a single topic by ID from Goldsky subgraph
 */
export async function getTopic(id: string): Promise<Topic | null> {
  try {
    // Try Goldsky first, fallback to decentralized subgraph
    let data = await graphQLFetch(
      getGoldskyUrls().primary,
      singleTopicQuery,
      { id },
      { cache: "no-cache" }
    ) as { topic: TopicsResponse['topics'][0] | null } | null;

    if (!data && getGoldskyUrls().fallback) {
      data = await graphQLFetch(
        getGoldskyUrls().fallback,
        singleTopicQuery,
        { id },
        { cache: "no-cache" }
      ) as { topic: TopicsResponse['topics'][0] | null } | null;
    }

    if (!data && getGraphUrls()?.primary) {
      data = await graphQLFetch(
        getGraphUrls().primary,
        singleTopicQuery,
        { id },
        { cache: "no-cache" }
      ) as { topic: TopicsResponse['topics'][0] | null } | null;
    }

    if (!data && getGraphUrls()?.fallback) {
      data = await graphQLFetch(
        getGraphUrls().fallback,
        singleTopicQuery,
        { id },
        { cache: "no-cache" }
      ) as { topic: TopicsResponse['topics'][0] | null } | null;
    }

    if (!data?.topic) {
      const onchainTopics = await getTopicsOnchain();
      const fallback = onchainTopics.find(t => t.id === id);
      return fallback || null;
    }

    const topic = data.topic;

    // Fetch feedback for this topic
    let feedback: TopicFeedback[] = [];
    try {
      const feedbackData = await graphQLFetch(
        getGoldskyUrls().primary,
        feedbackQuery,
        { topicId: topic.id },
        { cache: "no-cache" }
      ) as TopicFeedbackResponse;

      feedback = (feedbackData?.topicFeedbacks || []).map(fb => ({
        id: fb.id,
        voterAddress: fb.voter.id,
        support: fb.support,
        reason: fb.reason || '',
        createdTimestamp: parseInt(fb.createdTimestamp),
        createdBlock: parseInt(fb.createdBlock),
        createdTransactionHash: fb.createdTransactionHash,
      }));
    } catch (error) {
      console.error('Failed to fetch feedback for topic:', error);
    }

    // Fetch signatures for this topic
    let signatures: TopicSignature[] = [];
    try {
        const signaturesData = await graphQLFetch(
          getGoldskyUrls().primary,
          signaturesQuery,
          { topicId: topic.id },
          { cache: "no-cache" }
        ) as TopicSignaturesResponse;

        signatures = (signaturesData?.topicSignatures || [])
          .filter(sig => !!sig.signer?.id)
          .map(sig => {
            const expirationTimestamp = parseInt(sig.expirationTimestamp);
            const isExpired = expirationTimestamp * 1000 < Date.now();

            return {
              id: sig.id,
              signerAddress: sig.signer.id,
              sig: sig.sig,
              expirationTimestamp,
              support: sig.support,
              sigDigest: sig.sigDigest,
              reason: sig.reason || '',
              createdTimestamp: parseInt(sig.createdTimestamp),
              createdBlock: parseInt(sig.createdBlock),
              createdTransactionHash: sig.createdTransactionHash,
              status: isExpired ? 'expired' : 'valid',
            };
          });
    } catch (error) {
      console.error('Failed to fetch signatures for topic:', error);
    }

    return {
      id: topic.id,
      creator: getAddress(topic.creator.id),
      slug: topic.slug,
      title: topic.title,
      description: topic.description,
      encodedTopicHash: topic.encodedTopicHash,
      canceled: topic.canceled,
      createdTimestamp: parseInt(topic.createdTimestamp),
      createdBlock: parseInt(topic.createdBlock),
      createdTransactionHash: topic.createdTransactionHash,
      lastUpdatedTimestamp: parseInt(topic.lastUpdatedTimestamp),
      lastUpdatedBlock: parseInt(topic.lastUpdatedBlock),
      lastUpdatedTransactionHash: topic.lastUpdatedTransactionHash,
      feedback,
      signatures,
    };
  } catch (error) {
    console.error('Failed to fetch topic:', error);
    return null;
  }
}

// Helper functions
export function normalizeTopicId(id: string): string {
  // ID format from URL can be: slug-creator (without 0x) or creator-slug (with 0x)
  // Return format should be: creator-slug (lowercase creator, with 0x)
  const fullyDecodedId = decodeURIComponent(id);
  const parts = fullyDecodedId.split("-");

  // Check if first part is an address (starts with 0x)
  const creatorFirst = parts[0].startsWith("0x");

  if (creatorFirst) {
    // Format: 0xabc-some-slug
    const creatorId = parts[0].toLowerCase();
    const slug = parts.slice(1).join("-");
    return `${creatorId}-${slug}`;
  } else {
    // Format: some-slug-abc (where abc is the creator without 0x)
    const creatorId = `0x${parts[parts.length - 1]}`.toLowerCase();
    const slug = parts.slice(0, -1).join("-");
    return `${creatorId}-${slug}`;
  }
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
