// Empty in the Docker image (same origin, behind the proxy); the local API in development.
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export type Health = {
  status: string;
  service: string;
  version: string;
};

export type Cluster = {
  id: string;
  name: string;
  method: "kubeconfig" | "upload" | "gke" | "token" | "agent";
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

export type ChatMessage = {
  id: number;
  role: "user" | "assistant";
  author: string | null;
  content: string;
  created_at: string;
};

export type ChatThread = { ai_enabled: boolean; messages: ChatMessage[] };

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
  local_kubeconfig: { path: string; contexts: number; error: string | null };
};

export type GkeProject = { project_id: string; internal_ip: boolean };
export type GkeSettings = {
  identity: {
    email: string | null;
    error: string | null;
    vm: { name: string; zone: string; project_id: string } | null;
  };
  projects: (GkeProject & { clusters: number; error: string | null })[];
};

export type GoogleSettings = {
  enabled: boolean;
  client_id: string;
  client_secret_set: boolean;
  client_secret_hint: string | null;
  redirect_uri: string;
};
export type GoogleSettingsInput = {
  enabled: boolean;
  client_id: string;
  client_secret: string | null; // null keeps the saved secret
};

export type Usage = { used: number; max: number };
export type Plan = { plan: string; users: Usage; projects: Usage; clusters: Usage };

export type WorkloadPod = { name: string; status: string; ready: string; restarts: number };

export type Role = "admin" | "user";
export type InviteRole = "admin" | "editor" | "viewer";
export type ProjectRole = "viewer" | "editor";
export type ProjectAccess = { project_id: string; project: string; role: ProjectRole };

export type Me = {
  username: string;
  role: Role;
  builtin: boolean;
  projects: ProjectAccess[];
  access: { cluster_id: string; namespaces: string[] | null; role: ProjectRole }[];
  changes_enabled: boolean;
  setup_needed: boolean;
  auth_provider: "password" | "google";
};

export type User = {
  id: string;
  username: string;
  role: Role;
  builtin: boolean;
  auth_provider: "password" | "google";
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

export type KindInfo = {
  group: string;
  version: string;
  resource: string;
  kind: string;
  label: string;
  namespaced: boolean;
  verbs: string[];
};
export type KindCategory = { name: string; kinds: KindInfo[] };
export type ResourceRow = {
  name: string;
  namespace: string | null;
  created: string | null;
  cells: (string | number | boolean | null)[];
};
export type ResourceList = {
  columns: { name: string; type: string; description: string }[];
  rows: ResourceRow[];
  truncated: boolean;
};
export type KubeObject = {
  object: Record<string, unknown> & {
    metadata?: {
      name?: string;
      namespace?: string;
      creationTimestamp?: string;
      labels?: Record<string, string>;
      annotations?: Record<string, string>;
      ownerReferences?: { kind: string; name: string }[];
    };
    spec?: Record<string, unknown>;
    status?: Record<string, unknown>;
  };
  yaml: string;
  values_hidden: boolean;
};
export type KubeEvent = {
  type: string;
  reason: string;
  message: string;
  count: number;
  last_seen: string | null;
};
export type PodLogs = { container: string; containers: string[]; lines: string[]; truncated: boolean };
export type ObjectRef = {
  group: string;
  version: string;
  resource: string;
  namespace: string | null;
  name: string;
};
export type ClusterAction = ObjectRef & {
  cluster_id: string;
  action: "scale" | "restart" | "delete" | "cordon" | "uncordon";
  replicas?: number;
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
      // FastAPI validation errors are a list; show the first message, not a bare status code.
      else if (Array.isArray(body.detail) && body.detail[0]?.msg)
        detail = `${body.detail[0].msg}: ${(body.detail[0].loc ?? []).slice(1).join(".")}`;
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

const query = (params: Record<string, string | number | boolean | null | undefined>) =>
  Object.entries(params)
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join("&");

export const api = {
  me: () => request<Me>("/api/v1/auth/me"),
  login: (username: string, password: string) =>
    request<Me>("/api/v1/auth/login", json("POST", { username, password })),
  logout: () => request<void>("/api/v1/auth/logout", json("POST")),
  signInMethods: () => request<{ google: boolean }>("/api/v1/auth/providers"),
  googleSettings: () => request<GoogleSettings>("/api/v1/settings/google"),
  saveGoogleSettings: (body: GoogleSettingsInput) =>
    request<GoogleSettings>("/api/v1/settings/google", json("PUT", body)),
  changePassword: (current: string, next: string) =>
    request<void>("/api/v1/auth/password", json("POST", { current, new: next })),
  users: () => request<Users>("/api/v1/users"),
  inviteUser: (body: { email: string; role: InviteRole; project_id?: string }) =>
    request<User>("/api/v1/users/invite", json("POST", body)),
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
  /** Clusters in the signed-in user's projects (ADR 0012). */
  clusters: () => request<Cluster[]>("/api/v1/clusters"),
  /** Admins: every connected cluster, also those not in a project yet. */
  allClusters: () => request<Cluster[]>("/api/v1/clusters?all=true"),
  plan: () => request<Plan>("/api/v1/plan"),
  namespaces: (clusterId: string) =>
    request<string[]>(`/api/v1/clusters/${encodeCluster(clusterId)}/namespaces`),
  startInvestigation: (clusterId: string, namespace: string | null) =>
    request<InvestigationSummary>("/api/v1/investigations", {
      method: "POST",
      body: JSON.stringify({ cluster_id: clusterId, namespace }),
    }),
  investigation: (id: string) => request<Investigation>(`/api/v1/investigations/${id}`),
  /** Newest first; pass the last item's created_at as `before` for the next page. */
  investigations: (limit = 20, before?: string) =>
    request<InvestigationSummary[]>(
      `/api/v1/investigations?limit=${limit}${before ? `&before=${encodeURIComponent(before)}` : ""}`,
    ),
  chat: (investigationId: string, incidentId: string) =>
    request<ChatThread>(
      `/api/v1/investigations/${investigationId}/chat?${query({ incident_id: incidentId })}`,
    ),
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
  gke: () => request<GkeSettings>("/api/v1/settings/gke"),
  putGke: (projects: GkeProject[]) =>
    request<GkeSettings>("/api/v1/settings/gke", { method: "PUT", body: JSON.stringify({ projects }) }),
  kinds: (clusterId: string) =>
    request<KindCategory[]>(`/api/v1/manager/resources?${query({ cluster_id: clusterId })}`),
  resources: (clusterId: string, kind: KindInfo, namespace: string | null) =>
    request<ResourceList>(
      `/api/v1/manager/list?${query({
        cluster_id: clusterId,
        group: kind.group,
        version: kind.version,
        resource: kind.resource,
        namespace: kind.namespaced ? namespace : null,
      })}`,
    ),
  object: (clusterId: string, ref: ObjectRef) =>
    request<KubeObject>(`/api/v1/manager/object?${query({ cluster_id: clusterId, ...ref })}`),
  events: (clusterId: string, kind: string, namespace: string | null, name: string) =>
    request<KubeEvent[]>(
      `/api/v1/manager/events?${query({ cluster_id: clusterId, kind, namespace, name })}`,
    ),
  workloadPods: (clusterId: string, ref: ObjectRef & { namespace: string }) =>
    request<WorkloadPod[]>(`/api/v1/manager/pods?${query({ cluster_id: clusterId, ...ref })}`),
  logs: (
    clusterId: string,
    namespace: string,
    pod: string,
    opts: { container?: string; tail: number; previous: boolean },
  ) =>
    request<PodLogs>(
      `/api/v1/manager/logs?${query({ cluster_id: clusterId, namespace, pod, ...opts })}`,
    ),
  runAction: (body: ClusterAction) =>
    request<{ ok: boolean; message: string }>("/api/v1/manager/actions", json("POST", body)),
  changesSetting: () => request<{ enabled: boolean }>("/api/v1/settings/changes"),
  saveChangesSetting: (enabled: boolean) =>
    request<{ enabled: boolean }>("/api/v1/settings/changes", json("PUT", { enabled })),
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


/**
 * Ask a follow-up question about an incident. `onStep` gets each live check the AI runs
 * ("Reading logs of pod web-1"); resolves with the stored question and answer.
 */
export async function askIncident(
  investigationId: string,
  incidentId: string,
  message: string,
  onStep: (detail: string) => void,
  signal?: AbortSignal,
): Promise<ChatMessage[]> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/v1/investigations/${investigationId}/chat`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json", accept: "text/event-stream" },
      body: JSON.stringify({ incident_id: incidentId, message }),
      signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new ApiError("Cannot reach the KubeiQ backend. Is it running?", 0);
  }
  if (!response.ok || !response.body) {
    let detail = `Request failed (${response.status})`;
    try {
      const body = await response.json();
      if (typeof body.detail === "string") detail = body.detail;
    } catch {
      // keep the generic message
    }
    if (response.status === 401) window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    throw new ApiError(detail, response.status);
  }

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value.replace(/\r\n/g, "\n");
    let end: number;
    while ((end = buffer.indexOf("\n\n")) !== -1) {
      const block = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      let event = "message";
      const data: string[] = [];
      for (const line of block.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
      }
      if (!data.length) continue; // pings
      const payload = JSON.parse(data.join("\n"));
      if (event === "step") onStep(payload.detail);
      else if (event === "messages") return payload as ChatMessage[];
      else if (event === "error") throw new ApiError(payload.detail, 502);
    }
  }
  throw new ApiError("The answer was interrupted. Try again", 0);
}
