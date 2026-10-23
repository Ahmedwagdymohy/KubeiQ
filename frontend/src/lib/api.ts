export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export type Health = {
  status: string;
  service: string;
  version: string;
};

export type Cluster = {
  id: string;
  name: string;
  method: "kubeconfig" | "upload" | "token" | "agent";
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
  verify?: string[]; // missing on reports saved before it existed
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
  checked: Record<string, number>;
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

export type MapStatus = "healthy" | "warning" | "error";

export type MapNode = {
  id: string;
  kind: string;
  name: string;
  namespace: string | null;
  status: MapStatus;
  reason: string | null;
  investigate: string | null;
  facts: Record<string, string>;
  labels: Record<string, string>;
};

export type MapEdge = {
  id: string;
  source: string;
  target: string;
  shared: "source" | "target" | null;
};

export type ClusterMap = {
  cluster_id: string;
  namespace: string | null;
  collected_at: string;
  nodes: MapNode[];
  edges: MapEdge[];
  counts: Record<MapStatus, number>;
  gaps: { collector: string; error: string }[];
};

export type Provider = {
  id: string;
  label: string;
  prefix: string;
  needs_key: boolean;
  needs_base: boolean;
  base_placeholder: string | null;
  needs_api_version: boolean;
  model_placeholder: string;
  help: string | null;
};

export type AISettings = {
  enabled: boolean;
  provider: string;
  model: string;
  api_base: string | null;
  api_version: string | null;
  api_key_set: boolean;
  api_key_hint: string | null;
  max_incidents: number;
  max_steps: number;
  active_source: "settings" | "environment" | "none";
  active_model: string | null;
};

/** What the form sends. api_key: undefined keeps the saved key, "" removes it. */
export type AISettingsInput = {
  enabled: boolean;
  provider: string;
  model: string;
  api_base: string | null;
  api_version: string | null;
  api_key?: string;
  max_incidents: number;
  max_steps: number;
};

export type TestResult = { ok: boolean; model: string | null; message: string; latency_ms: number | null };

export type StoredKubeconfig = {
  id: string;
  name: string;
  contexts: string[];
  warnings: string[];
  created_at: string;
};

export type About = {
  version: string;
  database: string;
  secrets: string;
  local_kubeconfig: { path: string; contexts: number };
};

export type Role = "admin" | "user";
export type ProjectRole = "viewer" | "editor";
export type ProjectAccess = { project_id: string; project: string; role: ProjectRole };

export type Me = {
  username: string;
  role: Role;
  builtin: boolean;
  projects: ProjectAccess[];
  access: { cluster_id: string; namespaces: string[] | null; role: ProjectRole }[];
  changes_enabled: boolean;
};

export type User = {
  id: string;
  username: string;
  role: Role;
  builtin: boolean;
  created_at: string;
  projects: ProjectAccess[];
  password?: string | null; // only right after it was generated
};

export type Users = { users: User[]; max_users: number; plan: string };

export type ProjectScope = { cluster_id: string; namespaces: string[] };
export type ProjectMember = { user_id: string; role: ProjectRole; username?: string };

export type Project = {
  id: string;
  name: string;
  description: string | null;
  scopes: ProjectScope[];
  members: ProjectMember[];
  created_at: string;
};

export type ProjectInput = Omit<Project, "id" | "created_at">;

export type AuditEvent = {
  id: number;
  created_at: string;
  username: string;
  action: string;
  target: string | null;
  cluster_id: string | null;
  namespace: string | null;
  detail: string | null;
  ok: boolean;
};

/** Fired when the backend says the session is gone, so the app can send the user to sign in. */
export const UNAUTHORIZED_EVENT = "kubeiq:unauthorized";

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
      credentials: "include",
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
    if (response.status === 401 && !path.startsWith("/api/v1/auth/")) {
      window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    }
    throw new ApiError(detail, response.status);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

const encodeCluster = (id: string) => id.split("/").map(encodeURIComponent).join("/");

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  body: body === undefined ? undefined : JSON.stringify(body),
});

export const api = {
  me: () => request<Me>("/api/v1/auth/me"),
  login: (username: string, password: string) =>
    request<Me>("/api/v1/auth/login", json("POST", { username, password })),
  logout: () => request<void>("/api/v1/auth/logout", json("POST")),
  changePassword: (current: string, next: string) =>
    request<void>("/api/v1/auth/password", json("POST", { current, new: next })),
  users: () => request<Users>("/api/v1/users"),
  createUser: (body: { username: string; role: Role; password?: string }) =>
    request<User>("/api/v1/users", json("POST", body)),
  updateUser: (id: string, body: { role?: Role; reset_password?: boolean }) =>
    request<User>(`/api/v1/users/${id}`, json("PATCH", body)),
  deleteUser: (id: string) => request<void>(`/api/v1/users/${id}`, json("DELETE")),
  projects: () => request<Project[]>("/api/v1/projects"),
  createProject: (body: ProjectInput) => request<Project>("/api/v1/projects", json("POST", body)),
  updateProject: (id: string, body: ProjectInput) =>
    request<Project>(`/api/v1/projects/${id}`, json("PUT", body)),
  deleteProject: (id: string) => request<void>(`/api/v1/projects/${id}`, json("DELETE")),
  audit: (limit = 100) => request<AuditEvent[]>(`/api/v1/audit?limit=${limit}`),
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
  providers: () => request<Provider[]>("/api/v1/settings/providers"),
  aiSettings: () => request<AISettings>("/api/v1/settings/ai"),
  saveAISettings: (body: AISettingsInput) =>
    request<AISettings>("/api/v1/settings/ai", { method: "PUT", body: JSON.stringify(body) }),
  testAISettings: (body: AISettingsInput) =>
    request<TestResult>("/api/v1/settings/ai/test", { method: "POST", body: JSON.stringify(body) }),
  kubeconfigs: () => request<StoredKubeconfig[]>("/api/v1/settings/kubeconfigs"),
  addKubeconfig: (name: string, content: string) =>
    request<StoredKubeconfig>("/api/v1/settings/kubeconfigs", {
      method: "POST",
      body: JSON.stringify({ name, content }),
    }),
  deleteKubeconfig: (id: string) =>
    request<void>(`/api/v1/settings/kubeconfigs/${id}`, { method: "DELETE" }),
  about: () => request<About>("/api/v1/settings/about"),
  map: (clusterId: string, namespace: string | null) =>
    request<ClusterMap>(
      `/api/v1/map?cluster_id=${encodeURIComponent(clusterId)}` +
        (namespace ? `&namespace=${encodeURIComponent(namespace)}` : ""),
    ),
};

/** Subscribe to live progress. Returns a function that closes the stream. */
export function streamInvestigation(
  id: string,
  onEvent: (event: ProgressEvent) => void,
  onEnd: (status: InvestigationStatus | "unknown") => void,
): () => void {
  const source = new EventSource(`${API_BASE_URL}/api/v1/investigations/${id}/events`, {
    withCredentials: true,
  });
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
