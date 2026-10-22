export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export type Health = {
  status: string;
  service: string;
  version: string;
};

export type Cluster = {
  id: string;
  name: string;
  method: "kubeconfig" | "token" | "agent";
  server: string | null;
  namespace: string | null;
  is_default: boolean;
  status: { reachable: boolean; version: string | null; error: string | null } | null;
};

export type Severity = "critical" | "warning" | "info";

export type AgentStep = { tool: string; arguments: Record<string, unknown>; ok: boolean };

export type Diagnosis = {
  incident_id: string;
  title: string;
  workload: string;
  severity: Severity;
  root_cause: string;
  explanation: string;
  fix_steps: string[];
  commands: string[];
  prevention: string | null;
  confidence: number;
  confidence_reasons: string[];
  evidence: string[];
  affected: string[];
  related: string[];
  source: "rules" | "ai";
  agent_steps: AgentStep[];
  note: string | null;
};

export type Report = {
  cluster_id: string;
  namespace: string | null;
  healthy: boolean;
  diagnoses: Diagnosis[];
  gaps: { collector: string; error: string }[];
  llm_model: string | null;
  duration_seconds: number;
};

export type InvestigationStatus = "queued" | "running" | "completed" | "failed";

export type ProgressEvent = {
  seq: number;
  step: string;
  status: "started" | "completed" | "failed";
  detail: string | null;
  created_at: string;
};

export type InvestigationSummary = {
  id: string;
  cluster_id: string;
  namespace: string | null;
  status: InvestigationStatus;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  llm_model: string | null;
  healthy: boolean | null;
  incident_count: number;
  summary: string | null;
  severity: Severity | null;
  error: string | null;
};

export type Investigation = InvestigationSummary & {
  report: Report | null;
  events: ProgressEvent[];
};

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      cache: "no-store",
      ...init,
      headers: { "content-type": "application/json", ...init?.headers },
    });
  } catch {
    throw new ApiError("Cannot reach the KubeiQ backend. Is it running?", 0);
  }
  if (!response.ok) {
    let detail = `Request failed (${response.status})`;
    try {
      const body = await response.json();
      if (typeof body.detail === "string") detail = body.detail;
    } catch {
      // keep the generic message
    }
    throw new ApiError(detail, response.status);
  }
  return response.json() as Promise<T>;
}

const encodeCluster = (id: string) => id.split("/").map(encodeURIComponent).join("/");

export const api = {
  health: (signal?: AbortSignal) => request<Health>("/healthz", { signal }),
  clusters: () => request<Cluster[]>("/api/v1/clusters"),
  namespaces: (clusterId: string) =>
    request<string[]>(`/api/v1/clusters/${encodeCluster(clusterId)}/namespaces`),
  startInvestigation: (clusterId: string, namespace: string | null) =>
    request<InvestigationSummary>("/api/v1/investigations", {
      method: "POST",
      body: JSON.stringify({ cluster_id: clusterId, namespace }),
    }),
  investigation: (id: string) => request<Investigation>(`/api/v1/investigations/${id}`),
  investigations: (limit = 20) =>
    request<InvestigationSummary[]>(`/api/v1/investigations?limit=${limit}`),
};

/** Subscribe to live progress. Returns a function that closes the stream. */
export function streamInvestigation(
  id: string,
  onEvent: (event: ProgressEvent) => void,
  onEnd: (status: InvestigationStatus | "unknown") => void,
): () => void {
  const source = new EventSource(`${API_BASE_URL}/api/v1/investigations/${id}/events`);
  source.addEventListener("progress", (message) => {
    onEvent(JSON.parse((message as MessageEvent).data) as ProgressEvent);
  });
  source.addEventListener("end", (message) => {
    onEnd(JSON.parse((message as MessageEvent).data).status);
    source.close();
  });
  source.onerror = () => {
    // EventSource retries on its own; give up only if the server closed the stream for good.
    if (source.readyState === EventSource.CLOSED) onEnd("unknown");
  };
  return () => source.close();
}

/** Backwards-compatible helper used by the landing page status pill. */
export const getHealth = api.health;
