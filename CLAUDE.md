# KubeiQ — Working Guide

This file is the entry point for any working session on this repo (human or AI).
Read it first, then check `docs/ROADMAP.md` for the current phase and next open task.

## What KubeiQ is

An open-core platform that brings AI to Kubernetes operations: AI investigations,
agents, MCP, and a self-hosted multi-cluster dashboard. The first product is
**Cluster Doctor**, the AI Kubernetes troubleshooting agent.

**Product model (ADR 0006):** KubeiQ is one platform installed with one command. Every product
(Cluster Doctor, future ones) is a module inside it, sharing clusters, LLM config, auth and
licensing. Never ship a product as a separate download. Paid tiers gate organization and scale
features (teams, SSO, RBAC, audit, more clusters), never core usefulness.

- **Core (OSS, Apache-2.0):** everything outside `ee/`.
- **Pro / Enterprise (commercial, `ee/`):** RBAC, SSO (generic OIDC/LDAP/SAML), audit logs,
  managed hosting. Sign in with Google is core (ADR 0013).
  Enabled at runtime by a license key. Core must never import from `ee/`; `ee/` plugs into core
  through explicit extension points.

## Key decisions (see `docs/adr/`)

| ADR | Decision |
|-----|----------|
| 0001 | Open-core: Apache-2.0 core + commercial `ee/` |
| 0002 | Self-hosted data layer: Postgres (SQLite for local), own auth, SSE for realtime. No BaaS (InsForge dropped) |
| 0003 | Cluster access via official Kubernetes Python client behind a `ClusterSource` abstraction (kubeconfig now, in-cluster agent later). No `kubectl` subprocess |
| 0004 | LLM access via LiteLLM (provider-agnostic: OpenRouter, OpenAI, Anthropic, Bedrock, Azure, Ollama) |
| 0005 | Hybrid diagnosis: deterministic detectors first, then tool-calling LLM agent; async investigations streamed over SSE |
| 0007 | Cluster Map (`/map`): our own product reusing Headlamp's map logic (Apache-2.0, credited in `NOTICE`); health from our detectors |
| 0006 | One platform, one install; products are modules (own route, API, enable flag). Marketing site in `website/` is separate from the app |
| 0008 | Sign-in: master key admin (LiteLLM-style), users, sessions; projects scope clusters/namespaces (viewer/editor); free plan 3 users |
| 0009 | Cluster changes are off by default; admin switch, editors only, confirmed in UI, every attempt audited |
| 0010 | Production: Caddy serves app + API on one origin (HTTPS with a domain), Postgres in Compose, images on GHCR |
| 0011 | Connecting clusters: `deploy/connect.sh` read-only service account (any cluster); GKE through the machine's Google identity, nothing stored |
| 0012 | Projects hold the clusters (lists show projects' clusters, admins too); first sign-in opens /welcome; free plan 3 users, 1 project, 3 clusters |
| 0013 | Sign in with Google is free core (OIDC + PKCE on the server, invite only: admins allow emails with a role); generic OIDC/LDAP/SAML stay `ee/` |
| 0014 | One command connects a cluster: a one-time code, KubeiQ serves `connect.sh`, tests the cluster before saving, links local Docker networks (minikube) |

Do not reverse an ADR silently — write a new ADR that supersedes it.

## Repository layout

```
backend/            FastAPI service (Python 3.12, uv). Package: backend/src/kubeiq
  src/kubeiq/
    api/            HTTP routes (versioned under /api/v1)
    core/           config, logging, shared utilities
    clusters/       ClusterSource abstraction: kubeconfig, uploaded kubeconfigs, GKE (cloud identity)
    connect/        one-command connect: one-time codes, served copy of deploy/connect.sh + rbac (make sync-connect)
    collectors/     read-only evidence collectors (pods, events, logs, deployments, network)
    detectors/      deterministic rule engine (CrashLoopBackOff, ImagePull, OOM, ...)
    agent/          LLM agent: tools, prompts, structured output
    investigations/ orchestration, async jobs, progress events
    security/       redaction of secrets/PII before anything reaches an LLM
    settings/       Settings page backend: AI model + kubeconfig uploads, Fernet-encrypted, override env
    auth/           master key, users, sessions, projects/access checks (deps.py), plan limits, audit
    db/             persistence models, sessions, Alembic migrations (applied at startup)
    products/map/   Cluster Map: extra collectors, relations (ported from Headlamp), health, /api/v1/map
    products/manager/ Cluster Manager: kind discovery, Table API lists, YAML, events, logs, actions
  tests/
frontend/           The self-hosted app: Next.js (TypeScript, Tailwind, App Router, React Query)
  src/app/page.tsx    Overview: cluster ledger (workload health per cluster), failing workloads, recent investigations
  src/app/doctor/     Cluster Doctor (/doctor?id=<investigation>; ?cluster=&namespace=&focus=<ref> starts a scan)
  src/app/map/        Cluster Map (React Flow + ELK); graph logic in src/lib/map (adapted from Headlamp)
  src/app/manager/    Cluster Manager (?cluster&namespace&kind&name&in are shareable)
  src/app/login/      Sign-in page; AuthGate (components/auth) sends signed-out users here
  src/app/welcome/    First sign-in: create the project, then add clusters (AuthGate sends new admins)
  src/app/settings/   Settings: AI model, clusters, cluster changes, users, projects, activity, account
  src/components/     UI building blocks (ui.tsx, icons.tsx), shell/ (sidebar + top bar frame), overview/, doctor/ ...
  src/hooks/          use-investigation (SSE progress), use-me (signed-in user, access), use-can-edit, use-hash
  src/lib/api.ts      typed API client and SSE helper; lib/scope.ts = cluster in scope (top bar), lib/fleet.ts = workload health
website/            Marketing site (live at kubeiq.pages.dev): landing, product pages, pricing, install. Static export
ee/                 Commercial features (separate license)
deploy/             install.sh (the one-line installer), uninstall.sh (removes only what it set up), connect.sh (read-only cluster access; edit here, then
                    `make sync-connect`), Caddyfile, rbac/
examples/           Intentionally broken workloads for testing diagnoses
docs/               Architecture, roadmap, ADRs
```

## Commands

```bash
# Backend
cd backend && uv sync                 # install
uv run uvicorn kubeiq.main:app --reload
uv run pytest                         # tests
uv run ruff check . && uv run ruff format --check .
uv run mypy src

# Frontend
cd frontend && pnpm install
pnpm dev                              # http://localhost:3000
pnpm lint && pnpm build

# Website (marketing)
cd website && pnpm install && pnpm dev   # http://localhost:3001
pnpm lint && pnpm build                 # static export to website/out
# Pushes to main that touch website/ deploy it to Cloudflare Pages (.github/workflows/website.yml)

# Full stack
docker compose up --build             # proxy, app, API and Postgres; everything on :3000
make check                            # everything CI runs; run before every commit
make fmt                              # auto-format backend
make sync-connect                     # after editing deploy/connect.sh or deploy/rbac (KubeiQ serves copies)
cd backend && uv run alembic revision --autogenerate -m "..."   # new DB migration

# Local test cluster
kind create cluster --name kubeiq-dev # adds context kind-kubeiq-dev

# Sign in locally: user "admin", password = master key (never print or commit it)
#   backend/.kubeiq-master-key  (generated on first start when KUBEIQ_MASTER_KEY is unset)
# API calls: curl -H "Authorization: Bearer $(cat backend/.kubeiq-master-key)" ...
```

## Engineering rules

- **Read-only by default.** Cluster changes exist only in Cluster Manager, behind the admin switch,
  for admins and project editors, with a UI confirmation and an audit record (ADR 0009). Never read
  Secret values: fetch Secrets as `PartialObjectMetadata`.
- **Every API route checks access.** Routers are mounted behind `current_principal`; per-request
  scope checks use `auth.deps.check(user, "read"|"edit", cluster_id, namespace)`. New endpoints
  that touch a cluster must call it. Tests authenticate with the master key from `tests/conftest.py`.
- **Redact before LLM.** All logs/evidence pass through `security/` redaction before being sent
  to any model.
- **Multi-tenant ready.** Every persisted entity carries `org_id`, even in single-tenant mode.
- **Structured everything.** Pydantic models at every boundary; LLM output is schema-validated.
- **Bounded evidence.** Collectors cap log lines/bytes; never dump an entire cluster into a prompt.
- **Config via env** (`KUBEIQ_*`, see `backend/.env.example`). No secrets in code or git.
  Values saved in Settings override env. Secrets saved there are encrypted (`settings/crypto.py`)
  and are write-only: APIs return `*_set` / last-4 hints, never the value.
- **UI follows `docs/design.md`**: logo-cyan accent, dark + light themes, Manrope for all text
  (mono only for commands/resource refs), concise root causes, no internals shown to users.
  Use the Tailwind tokens (`bg-surface`, `text-muted`, `bg-accent`, ...), never hard-coded colors.
- **Fix commands must be complete.** Users copy them as-is. Build them with `detectors/commands.py`:
  fill values from evidence, named placeholders only for unknowable values, verify on the workload.
- Products live in the app sidebar (the shell in `components/shell/app-shell.tsx`, mounted by
  `providers.tsx`): Cluster Doctor (`/doctor`), Cluster Map (`/map`), Cluster Manager (`/manager`).
  A new product = a new module: its own route, API router and enable flag, using only shared
  platform code (never importing another product). Add it to the website too (product page).
- Code adapted from Headlamp (Apache-2.0) keeps its copyright header plus a "Modified by the KubeiQ
  Authors" note saying what changed. Reference clone: `~/Desktop/headlamp-reference`.
- Website vs app: marketing copy, pricing and install instructions belong in `website/`; the app
  never shows marketing. Every "Get Started" points to the single install page. `website/` shares the
  brand tokens (accent, ink, status colours) with `frontend/src/app/globals.css`; change both together.
  The grounds differ by design: the app is "Sheet", the website "Helm" (see `docs/design.md`).
- Frontend uses Next.js 16 — read `frontend/AGENTS.md` and the bundled docs before using new APIs.
- Verify UI changes visually: headless Chrome screenshots (`--headless=new --screenshot`, add
  `--force-dark-mode` for dark). Minimum width is 500px, so test phone layouts in a 390px iframe.
  After renaming/moving files, restart `next dev` with a clean `.next` (stale cache causes
  false hydration errors).
- Keep `.gitignore` patterns narrow. A broad glob (`kubeconfig*`) once hid `kubeconfig.py` from git
  *and* from ruff. For risky changes, verify on a fresh clone: `git clone . /tmp/k && make -C /tmp/k check-backend`.
- Keep code simple and modular; match surrounding style; add tests with every feature.

## Git workflow

Branches (full guide in `CONTRIBUTING.md`):

| Branch | Purpose | Branches from | Merges into |
|--------|---------|---------------|-------------|
| `main` | Released code only. Every commit is a release or a hotfix; tags `vX.Y.Z` live here | — | — |
| `staging` | Integration: finished features collect and get tested together before a release | `main` | `main` (release) |
| `feat/<name>` | One feature | `staging` | `staging` |
| `fix/<name>` | One bug fix | `staging` | `staging` |
| `hotfix/<name>` | Urgent fix for a released version | `main` | `main`, then `main` into `staging` |
| `docs/`, `chore/`, `refactor/`, `ci/` | Non-feature work | `staging` | `staging` |

- Never commit directly to `main` or `staging`; work on a branch, in a git worktree
  (e.g. `/tmp/kq-<name>`) so the main checkout stays untouched.
- A branch merges into `staging` only after it is tested and approved (`make check` green).
  Merge with `--no-ff` so each feature stays one visible unit; delete the branch afterwards.
- A release merges `staging` into `main` (`--no-ff`), bumps the version, updates `CHANGELOG.md`
  and tags `vX.Y.Z`. Features land under `## Unreleased` in `CHANGELOG.md` as they reach `staging`.
- Keep feature branches current by merging `staging` into them, not by rebasing shared branches.
- Conventional commits: `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`, `ci:` with
  optional scope, e.g. `feat(backend): add pod collector`.
- Short, professional messages. **No AI/Claude attribution or co-author lines** in commits or PRs.
- Commit in logical units and push after each completed unit.

## Definition of done (per feature)

1. `make check` passes (same checks as CI). Never commit unformatted code.
2. `docs/ROADMAP.md` checkbox ticked; new decisions captured as an ADR.
3. This file updated if layout, commands, or rules changed.
4. Committed and pushed on its branch, then merged into `staging` once approved.
