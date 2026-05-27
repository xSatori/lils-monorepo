import { getAddress } from "viem";
import {
  fetchLilCampCandidateById,
  fetchLilCampCandidateBySlug,
  fetchLilCampCandidates,
  LilCampCandidate,
} from "@/data/ponder/lilCampApi";
import { ProposalIdea, SponsorSignature, FeedbackPost } from "./ideaTypes";

function toNumber(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === "") {
    return 0;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toProposalId(value: string | number | null | undefined): number | null {
  const parsed = toNumber(value);
  return parsed > 0 ? parsed : null;
}

function getCandidateTitle(candidate: LilCampCandidate): string {
  return candidate.title || candidate.slug.replace(/-/g, " ");
}

function mapCandidateToIdea(candidate: LilCampCandidate): ProposalIdea | null {
  try {
    const proposerAddress = getAddress(candidate.proposer);
    const createdTimestamp = toNumber(candidate.created_timestamp);
    const lastUpdatedTimestamp =
      toNumber(candidate.last_updated_timestamp) || createdTimestamp;

    const sponsors: SponsorSignature[] = (candidate.signatures || []).map(
      (signature) => {
        const expirationTimestamp = toNumber(signature.expiration_timestamp);
        const expired = expirationTimestamp > 0 && expirationTimestamp * 1000 < Date.now();

        return {
          sig: signature.sig,
          signer: {
            id: getAddress(signature.signer),
            nounsRepresented: [],
          },
          expirationTimestamp,
          canceled: expired,
          status: expired ? "expired" : "valid",
        };
      },
    );

    const feedbackPosts: FeedbackPost[] = (candidate.feedback || []).map(
      (feedback) => ({
        id: feedback.id,
        voterAddress: getAddress(feedback.msg_sender),
        support: feedback.support,
        reason: feedback.reason || "",
        votes: toNumber(feedback.votes),
        createdTimestamp: toNumber(feedback.block_timestamp),
      }),
    );

    const versions =
      candidate.versions && candidate.versions.length > 0
        ? candidate.versions.map((version) => ({
            id: version.id,
            createdTimestamp: toNumber(version.block_timestamp),
          }))
        : [
            {
              id: `${candidate.id}-latest`,
              createdTimestamp: lastUpdatedTimestamp,
            },
          ];

    return {
      id: candidate.id,
      proposerAddress,
      slug: candidate.slug,
      createdTimestamp,
      canceledTimestamp: candidate.canceled ? lastUpdatedTimestamp : null,
      lastUpdatedTimestamp,
      latestVersion: {
        id: versions[0]?.id || `${candidate.id}-latest`,
        createdTimestamp: lastUpdatedTimestamp,
        updateMessage: candidate.versions?.[0]?.update_message || undefined,
        content: {
          title: getCandidateTitle(candidate),
          description: candidate.description || "",
          targets: candidate.targets || [],
          values: (candidate.values || []).map((value) => value.toString()),
          signatures: candidate.signatures_list || [],
          calldatas: candidate.calldatas || [],
        },
        targetProposalId: toProposalId(candidate.proposal_id_to_update),
        proposalId: null,
        contentSignatures: sponsors,
      },
      versions,
      feedbackPosts,
      sponsors,
    };
  } catch (error) {
    console.warn("[getProposalIdeas] Skipping malformed Ponder candidate", {
      id: candidate.id,
      proposer: candidate.proposer,
      error,
    });
    return null;
  }
}

export async function getProposalIdeas(limit: number = 1000): Promise<ProposalIdea[]> {
  try {
    const candidates = await fetchLilCampCandidates(limit, "proposal");
    const ideas = candidates
      .map(mapCandidateToIdea)
      .filter((idea): idea is ProposalIdea => idea !== null);

    console.log("[getProposalIdeas] Received Ponder candidates:", ideas.length);
    return ideas;
  } catch (error) {
    console.error("[getProposalIdeas] Failed to fetch Ponder candidates:", error);
    return [];
  }
}

export async function getProposalIdea(id: string): Promise<ProposalIdea | null> {
  try {
    let candidate = await fetchLilCampCandidateById(id);

    if (!candidate) {
      candidate = await fetchLilCampCandidateBySlug(extractSlugFromId(id));
    }

    return candidate ? mapCandidateToIdea(candidate) : null;
  } catch (error) {
    try {
      const candidate = await fetchLilCampCandidateBySlug(extractSlugFromId(id));
      return candidate ? mapCandidateToIdea(candidate) : null;
    } catch (fallbackError) {
      console.error("[getProposalIdea] Failed to fetch Ponder candidate:", {
        id,
        error,
        fallbackError,
      });
      return null;
    }
  }
}

export function normalizeIdeaId(id: string): string {
  const fullyDecodedId = decodeURIComponent(id);
  const parts = fullyDecodedId.split("-");

  if (parts[0].startsWith("0x")) {
    const proposerId = parts[0].toLowerCase();
    const slug = parts.slice(1).join("-");
    return `${proposerId}-${slug}`;
  }

  const proposerId = `0x${parts[parts.length - 1]}`.toLowerCase();
  const slug = parts.slice(0, -1).join("-");
  return `${proposerId}-${slug}`;
}

export function extractSlugFromId(ideaId: string): string {
  const slugParts = ideaId.split("-").slice(1);
  return slugParts.join("-");
}

export function makeUrlId(id: string): string {
  const proposerId = id.split("-")[0];
  const slug = extractSlugFromId(id);
  return `${slug}-${proposerId.slice(2)}`;
}
