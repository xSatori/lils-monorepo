type CandidateKind = "all" | "topic";

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

function getLilCampApiBaseUrl(): string {
  return import.meta.env.VITE_LIL_CAMP_API_URL?.trim() || "";
}

function buildLilCampApiUrl(path: string, params?: URLSearchParams): string {
  const baseUrl = getLilCampApiBaseUrl().replace(/\/+$/, "");
  const apiPath = baseUrl.endsWith("/api/lil")
    ? `${baseUrl}${path}`
    : `${baseUrl}/api/lil${path}`;
  const query = params?.toString();

  return query ? `${apiPath}?${query}` : apiPath;
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
    throw new Error(
      `Lil Camp API request failed: ${response.status} ${response.statusText} ${body}`,
    );
  }

  return response.json() as Promise<T>;
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

  const json = await fetchLilCampJson<CandidateListResponse>(
    buildLilCampApiUrl("/candidates", params),
  );

  return json.candidates || [];
}

export async function fetchLilCampCandidateById(
  id: string,
): Promise<LilCampCandidate | null> {
  const json = await fetchLilCampJson<CandidateDetailResponse>(
    buildLilCampApiUrl(`/candidates/${encodeURIComponent(id)}`),
  );

  return json.candidate || null;
}

export async function fetchLilCampCandidateBySlug(
  slug: string,
  kind: CandidateKind = "all",
): Promise<LilCampCandidate | null> {
  const params = new URLSearchParams({ slug });

  if (kind !== "all") {
    params.set("kind", kind);
  }

  const json = await fetchLilCampJson<CandidateListResponse>(
    buildLilCampApiUrl("/candidates", params),
  );

  return json.candidate || null;
}
