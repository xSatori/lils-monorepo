type CandidateKind = "all" | "proposal" | "topic";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export interface LilCampCandidateSignature {
  id: string;
  signer: string;
  sig: string;
  expiration_timestamp?: string | number | null;
  reason?: string | null;
  block_timestamp?: string | number | null;
}

export interface LilCampCandidateFeedback {
  id: string;
  msg_sender: string;
  support: number;
  reason?: string | null;
  votes?: string | number | null;
  block_timestamp?: string | number | null;
}

export interface LilCampCandidateVersion {
  id: string;
  candidate_id?: string;
  version_number?: string | number | null;
  title?: string | null;
  description?: string | null;
  update_message?: string | null;
  block_timestamp?: string | number | null;
}

export interface LilCampCandidate {
  id: string;
  slug: string;
  proposer: string;
  title?: string | null;
  description?: string | null;
  targets?: string[] | null;
  values?: Array<string | number> | null;
  signatures_list?: string[] | null;
  calldatas?: string[] | null;
  encoded_proposal_hash?: string | null;
  proposal_id_to_update?: string | number | null;
  proposal_id?: string | number | null;
  created_timestamp?: string | number | null;
  last_updated_timestamp?: string | number | null;
  block_number?: string | number | null;
  canceled?: boolean | null;
  signature_count?: string | number | null;
  signatures?: LilCampCandidateSignature[];
  feedback?: LilCampCandidateFeedback[];
  versions?: LilCampCandidateVersion[];
}

interface CandidateListResponse {
  candidates?: LilCampCandidate[];
  candidate?: LilCampCandidate;
  error?: string;
}

interface CandidateDetailResponse {
  candidate?: LilCampCandidate;
  error?: string;
}

class LilCampApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly contentType?: string,
  ) {
    super(message);
    this.name = "LilCampApiError";
  }
}

function getLilCampApiBaseUrls(): string[] {
  const configuredBaseUrl = import.meta.env.VITE_LIL_CAMP_API_URL?.trim();
  return configuredBaseUrl ? ["", configuredBaseUrl] : [""];
}

function withQuery(url: string, params?: URLSearchParams): string {
  const query = params?.toString();
  return query ? `${url}?${query}` : url;
}

function joinApiPath(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, "")}${path}`;
}

function buildLilCampApiUrls(path: string, params?: URLSearchParams): string[] {
  const urls = new Set<string>();

  for (const rawBaseUrl of getLilCampApiBaseUrls()) {
    const baseUrl = rawBaseUrl.replace(/\/+$/, "");

    if (baseUrl.endsWith("/api/candidates") || baseUrl.endsWith("/api/lil/candidates")) {
      const candidatesPath = "/candidates";
      urls.add(
        path === candidatesPath
          ? baseUrl
          : joinApiPath(baseUrl, path.replace(candidatesPath, "")),
      );
    } else if (baseUrl.endsWith("/api/lil")) {
      urls.add(joinApiPath(baseUrl, path));
    } else if (baseUrl.endsWith("/api")) {
      urls.add(joinApiPath(baseUrl, `/lil${path}`));
      urls.add(joinApiPath(baseUrl, path));
    } else {
      urls.add(joinApiPath(baseUrl, `/api/lil${path}`));
      urls.add(joinApiPath(baseUrl, `/api${path}`));
    }
  }

  return Array.from(urls).map((url) => withQuery(url, params));
}

async function fetchLilCampJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
    cache: "no-cache",
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new LilCampApiError(
      `Lil Camp API request failed: ${response.status} ${response.statusText} ${body.slice(0, 240)}`,
      response.status,
      response.headers.get("content-type") || undefined,
    );
  }

  const contentType = response.headers.get("content-type") || "";
  const body = await response.text();

  if (!contentType.includes("application/json")) {
    throw new LilCampApiError(
      `Lil Camp API returned non-JSON from ${url}: ${contentType || "unknown content-type"} ${body.slice(0, 240)}`,
      response.status,
      contentType,
    );
  }

  try {
    return JSON.parse(body) as T;
  } catch (error) {
    throw new LilCampApiError(
      `Lil Camp API returned invalid JSON from ${url}: ${body.slice(0, 240)}`,
      response.status,
      contentType,
    );
  }
}

async function fetchFirstLilCampJson<T>(urls: string[]): Promise<T> {
  const errors: unknown[] = [];

  for (const url of urls) {
    try {
      return await fetchLilCampJson<T>(url);
    } catch (error) {
      errors.push(error);
      console.warn("[lilCampApi] Candidate API path failed, trying fallback", {
        url,
        error,
      });
    }
  }

  throw new Error(
    `All Lil Camp API paths failed. Tried: ${urls.join(", ")}. Last error: ${
      errors.length ? String(errors[errors.length - 1]) : "none"
    }`,
  );
}

function getField<T>(
  source: Record<string, any>,
  snakeKey: string,
  camelKey: string,
): T | undefined {
  return source[snakeKey] ?? source[camelKey];
}

function normalizeSignature(signature: Record<string, any>): LilCampCandidateSignature {
  return {
    id: signature.id,
    signer: signature.signer,
    sig: signature.sig,
    expiration_timestamp: getField(signature, "expiration_timestamp", "expirationTimestamp"),
    reason: signature.reason,
    block_timestamp: getField(signature, "block_timestamp", "blockTimestamp"),
  };
}

function normalizeFeedback(feedback: Record<string, any>): LilCampCandidateFeedback {
  return {
    id: feedback.id,
    msg_sender: getField(feedback, "msg_sender", "msgSender") || feedback.voter,
    support: feedback.support,
    reason: feedback.reason,
    votes: feedback.votes,
    block_timestamp: getField(feedback, "block_timestamp", "blockTimestamp"),
  };
}

function normalizeVersion(version: Record<string, any>): LilCampCandidateVersion {
  return {
    id: version.id,
    candidate_id: getField(version, "candidate_id", "candidateId"),
    version_number: getField(version, "version_number", "versionNumber"),
    title: version.title,
    description: version.description,
    update_message: getField(version, "update_message", "updateMessage"),
    block_timestamp: getField(version, "block_timestamp", "blockTimestamp"),
  };
}

function normalizeCandidate(candidate: Record<string, any>): LilCampCandidate {
  return {
    id: candidate.id,
    slug: candidate.slug,
    proposer: candidate.proposer,
    title: candidate.title,
    description: candidate.description,
    targets: candidate.targets,
    values: candidate.values,
    signatures_list: getField(candidate, "signatures_list", "signaturesList") || candidate.signatures_list,
    calldatas: candidate.calldatas,
    encoded_proposal_hash: getField(candidate, "encoded_proposal_hash", "encodedProposalHash"),
    proposal_id_to_update: getField(candidate, "proposal_id_to_update", "proposalIdToUpdate"),
    proposal_id: getField(candidate, "proposal_id", "proposalId"),
    created_timestamp: getField(candidate, "created_timestamp", "createdTimestamp"),
    last_updated_timestamp: getField(candidate, "last_updated_timestamp", "lastUpdatedTimestamp"),
    block_number: getField(candidate, "block_number", "blockNumber"),
    canceled: candidate.canceled,
    signature_count: getField(candidate, "signature_count", "signatureCount"),
    signatures: Array.isArray(candidate.signatures)
      ? candidate.signatures.map(normalizeSignature)
      : [],
    feedback: Array.isArray(candidate.feedback)
      ? candidate.feedback.map(normalizeFeedback)
      : [],
    versions: Array.isArray(candidate.versions)
      ? candidate.versions.map(normalizeVersion)
      : [],
  };
}

function isZeroValue(value: string | number | null | undefined): boolean {
  return (
    value === null ||
    value === undefined ||
    value === "" ||
    value.toString() === "0"
  );
}

export function isTopicCandidate(candidate: LilCampCandidate): boolean {
  const targets = candidate.targets || [];
  const values = candidate.values || [];
  const calldatas = candidate.calldatas || [];

  if (targets.length === 0 && calldatas.length === 0) return true;

  return (
    targets.length === 1 &&
    targets[0]?.toLowerCase() === ZERO_ADDRESS &&
    isZeroValue(values[0]) &&
    (calldatas.length === 0 || calldatas[0] === "0x" || calldatas[0] === "")
  );
}

export async function fetchLilCampCandidates(
  limit: number,
  kind: CandidateKind = "all",
): Promise<LilCampCandidate[]> {
  const params = new URLSearchParams({
    limit: String(limit),
  });

  if (kind !== "all") {
    params.set("kind", kind);
  }
  params.set("first", String(limit));

  const json = await fetchFirstLilCampJson<CandidateListResponse>(
    buildLilCampApiUrls("/candidates", params),
  );

  const candidates = (json.candidates || []).map((candidate) =>
    normalizeCandidate(candidate as Record<string, any>),
  );

  if (kind === "topic") return candidates.filter(isTopicCandidate);
  if (kind === "proposal") {
    return candidates.filter((candidate) => !isTopicCandidate(candidate));
  }

  return candidates;
}

export async function fetchLilCampCandidateById(
  id: string,
): Promise<LilCampCandidate | null> {
  const json = await fetchFirstLilCampJson<CandidateDetailResponse>(
    buildLilCampApiUrls(`/candidates/${encodeURIComponent(id)}`),
  );
  const rawCandidate =
    json.candidate ??
    (((json as Record<string, any>).id ? json : null) as LilCampCandidate | null);

  return rawCandidate ? normalizeCandidate(rawCandidate as Record<string, any>) : null;
}

export async function fetchLilCampCandidateBySlug(
  slug: string,
  kind: CandidateKind = "all",
): Promise<LilCampCandidate | null> {
  const params = new URLSearchParams({ slug });

  if (kind !== "all") {
    params.set("kind", kind);
  }

  const byQuery = await fetchFirstLilCampJson<CandidateListResponse>(
    buildLilCampApiUrls("/candidates", params),
  );
  const queryCandidate = byQuery.candidate
    ? normalizeCandidate(byQuery.candidate as Record<string, any>)
    : null;

  if (
    queryCandidate &&
    (kind === "all" ||
      (kind === "topic" && isTopicCandidate(queryCandidate)) ||
      (kind === "proposal" && !isTopicCandidate(queryCandidate)))
  ) {
    return queryCandidate;
  }

  const byPath = await fetchFirstLilCampJson<CandidateDetailResponse>(
    buildLilCampApiUrls(`/candidates/${encodeURIComponent(slug)}`),
  );
  const rawPathCandidate =
    byPath.candidate ??
    (((byPath as Record<string, any>).id ? byPath : null) as LilCampCandidate | null);
  const normalized = rawPathCandidate
    ? normalizeCandidate(rawPathCandidate as Record<string, any>)
    : null;

  if (!normalized) return null;
  if (kind === "topic" && !isTopicCandidate(normalized)) return null;
  if (kind === "proposal" && isTopicCandidate(normalized)) return null;

  return normalized;
}
