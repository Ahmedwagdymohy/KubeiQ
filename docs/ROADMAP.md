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
- [ ] Collectors (read-only, bounded): pods, events, logs, deployments, services/endpoints
- [x] Redaction module for secrets/tokens in logs and env
- [ ] Read-only RBAC manifest (ClusterRole) for in-cluster use

## Phase 3 — Diagnosis engine
- [ ] Deterministic detectors: CrashLoopBackOff, ImagePullBackOff, OOMKilled, Pending/FailedScheduling, probe failures, rollout stuck, selector mismatch / no endpoints
- [ ] LiteLLM client (timeouts, retries, model config)
- [ ] Tool-calling agent with read-only tools; structured `Diagnosis` output
- [ ] Evidence-based confidence scoring

## Phase 4 — Product experience
- [ ] Persistence (SQLAlchemy + Alembic; Postgres / SQLite) with `org_id`
- [ ] Bearer-token cluster connection (`token` ClusterSource, token encrypted at rest)
- [ ] Async investigations: `POST /api/v1/investigations`, SSE progress stream
- [ ] Dashboard: cluster picker, investigate, live progress, diagnosis card, history
- [ ] Local auth (single admin bootstrap, sessions)
- [ ] Broken-workload scenarios in `examples/` + kind-based e2e test

## Phase 5 — Production & distribution
- [ ] Helm chart
- [ ] In-cluster agent (outbound connection, no open ports) as a second `ClusterSource`
- [ ] Release pipeline: versioned images to GHCR, changelog

## Later — Pro / Enterprise (`ee/`)
- [ ] License key validation & feature flags
- [ ] RBAC with cluster-scoped roles
- [ ] OIDC / LDAP SSO, group → role mapping
- [ ] Audit logs + export
- [ ] Managed multi-tenant hosting
