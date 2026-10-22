# Roadmap

Status legend: `[x]` done · `[ ]` open · `[~]` in progress.
Update this file in the same commit that completes a task.

## Phase 1 — Foundation
- [x] Repository governance: license, README, CLAUDE.md, ADRs, roadmap
- [x] Design system (`docs/design.md`)
- [x] Backend skeleton: FastAPI, config, structured logging, `/healthz` `/readyz`, tests
- [x] Frontend skeleton: Next.js + Tailwind landing/dashboard shell with backend status
- [x] Docker images + `docker-compose.yml`
- [x] CI: backend lint/type/test, frontend lint/build

## Phase 2 — Cluster access & evidence
- [x] `ClusterSource` abstraction + kubeconfig implementation (list contexts, per-context client)
- [x] `GET /api/v1/clusters` — list clusters from kubeconfig with reachability/version
- [x] Collectors (read-only, bounded): pods, events, logs, workloads, services/endpoints, nodes
- [x] `POST /api/v1/evidence` — raw evidence bundle for debugging
- [x] Redaction module for secrets/tokens in logs and env
- [x] Read-only RBAC manifest (`deploy/rbac/kubeiq-readonly.yaml`)

## Phase 3 — Diagnosis engine
- [x] Deterministic detectors: CrashLoopBackOff, ImagePullBackOff, OOMKilled, Pending/FailedScheduling, probe failures, rollout stuck, selector mismatch / no endpoints
- [x] Catch-all for unexplained unhealthy pods; config-error and init-container detectors
- [x] LiteLLM client (timeouts, retries, any provider incl. LiteLLM proxy)
- [x] Tool-calling agent with read-only tools; structured `Diagnosis` output (verified live via LiteLLM proxy)
- [x] Agent tool: read ConfigMap contents (redacted; `configmaps` added to RBAC)
- [x] Agent tools: Job/CronJob support in `describe_workload`
- [x] Run AI investigations for multiple incidents in parallel
- [x] Evidence-based confidence scoring
- [x] `POST /api/v1/diagnose` — synchronous end-to-end diagnosis

## Phase 4 — Product experience
- [x] Persistence (SQLAlchemy + Alembic; Postgres / SQLite) with `org_id`, migrations on startup
- [ ] Bearer-token cluster connection (`token` ClusterSource, token encrypted at rest)
- [x] Async investigations: `POST /api/v1/investigations`, SSE progress stream with replay, history API
- [x] `GET /api/v1/clusters/{id}/namespaces`
- [x] Dashboard: cluster picker, investigate, live progress, diagnosis cards, history, shareable links
- [ ] Local auth (single admin bootstrap, sessions)
- [ ] Broken-workload scenarios in `examples/` + kind-based e2e test

## Phase 5 — Production & distribution
- [ ] Helm chart
- [ ] In-cluster agent (outbound connection, no open ports) as a second `ClusterSource`
- [ ] Release pipeline: versioned images to GHCR, changelog

## Later — Cluster Doctor features
- [ ] "Explain" chat on each incident: ask follow-up questions with the incident's evidence as context
- [ ] PDF reports: download a professional investigation report in the KubeiQ theme

## Later — LLM configuration
- [ ] Provider picker in the UI (model, endpoint, key) instead of env vars only
- [ ] Per-organization LLM keys and model settings (Enterprise)
- [ ] Model routing: a cheaper/faster model for simple tasks (summaries, explanations), the strong model for investigations

## Later — Learning loop
- [ ] Record which incidents go to the AI and its conclusions; promote frequent conclusions to new rules

## Later — Pro / Enterprise (`ee/`)
- [ ] License key validation & feature flags
- [ ] RBAC with cluster-scoped roles
- [ ] OIDC / LDAP SSO, group → role mapping
- [ ] Audit logs + export
- [ ] Managed multi-tenant hosting
