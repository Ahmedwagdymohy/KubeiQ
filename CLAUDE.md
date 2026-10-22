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
- **Pro / Enterprise (commercial, `ee/`):** RBAC, SSO (OIDC/LDAP), audit logs, managed hosting.
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

Do not reverse an ADR silently — write a new ADR that supersedes it.

## Repository layout

```
backend/            FastAPI service (Python 3.12, uv). Package: backend/src/kubeiq
  src/kubeiq/
    api/            HTTP routes (versioned under /api/v1)
    core/           config, logging, shared utilities
    clusters/       ClusterSource abstraction + kubeconfig implementation
    collectors/     read-only evidence collectors (pods, events, logs, deployments, network)
    detectors/      deterministic rule engine (CrashLoopBackOff, ImagePull, OOM, ...)
    agent/          LLM agent: tools, prompts, structured output
    investigations/ orchestration, async jobs, progress events
    security/       redaction of secrets/PII before anything reaches an LLM
    settings/       Settings page backend: AI model + kubeconfig uploads, Fernet-encrypted, override env
    db/             persistence models, sessions, Alembic migrations (applied at startup)
    products/map/   Cluster Map: extra collectors, relations (ported from Headlamp), health, /api/v1/map
  tests/
frontend/           The self-hosted app: Next.js (TypeScript, Tailwind, App Router, React Query)
  src/app/page.tsx    App Home: product tiles and recent investigations (not marketing)
  src/app/doctor/     Cluster Doctor (/doctor?id=<investigation>; ?cluster=&namespace=&focus=<ref> starts a scan)
  src/app/map/        Cluster Map (React Flow + ELK); graph logic in src/lib/map (adapted from Headlamp)
  src/app/settings/   Settings (gear icon in the header): AI model, clusters, about
  src/components/     UI building blocks (ui.tsx, icons.tsx), header, doctor/ components
  src/hooks/          use-investigation: start/open runs and follow SSE progress
  src/lib/api.ts      typed API client and SSE helper
website/            Marketing site (kubeiq.io): landing, product pages, pricing, install. Static export
ee/                 Commercial features (separate license)
deploy/             Compose / Helm assets, install.sh (the one-line installer)
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

# Full stack
docker compose up --build             # frontend :3000, backend :8000
make check                            # everything CI runs; run before every commit
make fmt                              # auto-format backend
cd backend && uv run alembic revision --autogenerate -m "..."   # new DB migration

# Local test cluster
kind create cluster --name kubeiq-dev # adds context kind-kubeiq-dev
```

## Engineering rules

- **Read-only by default.** Cluster access is read-only. Never read Secret values. Any mutating
  action (future) requires explicit user approval and an audit record.
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
- Products live under the header "Products" menu; Cluster Doctor (`/doctor`) is the first.
  A new product = a new module: its own route, API router and enable flag, using only shared
  platform code (never importing another product). Add it to the website too (product page).
- Code adapted from Headlamp (Apache-2.0) keeps its copyright header plus a "Modified by the KubeiQ
  Authors" note saying what changed. Reference clone: `~/Desktop/headlamp-reference`.
- Website vs app: marketing copy, pricing and install instructions belong in `website/`; the app
  never shows marketing. Every "Get Started" points to the single install page. `website/` mirrors
  the design tokens in `frontend/src/app/globals.css`; change both together.
- Frontend uses Next.js 16 — read `frontend/AGENTS.md` and the bundled docs before using new APIs.
- Verify UI changes visually: headless Chrome screenshots (`--headless=new --screenshot`, add
  `--force-dark-mode` for dark). Minimum width is 500px, so test phone layouts in a 390px iframe.
  After renaming/moving files, restart `next dev` with a clean `.next` (stale cache causes
  false hydration errors).
- Keep `.gitignore` patterns narrow. A broad glob (`kubeconfig*`) once hid `kubeconfig.py` from git
  *and* from ruff. For risky changes, verify on a fresh clone: `git clone . /tmp/k && make -C /tmp/k check-backend`.
- Keep code simple and modular; match surrounding style; add tests with every feature.

## Git workflow

- Default branch: `main`. Conventional commits: `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`,
  `test:`, `ci:` with optional scope, e.g. `feat(backend): add pod collector`.
- Short, professional messages. **No AI/Claude attribution or co-author lines** in commits or PRs.
- Commit in logical units and push after each completed unit.

## Definition of done (per feature)

1. `make check` passes (same checks as CI). Never commit unformatted code.
2. `docs/ROADMAP.md` checkbox ticked; new decisions captured as an ADR.
3. This file updated if layout, commands, or rules changed.
4. Committed and pushed.
