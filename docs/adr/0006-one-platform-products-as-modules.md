# 0006 — One platform, products as modules

- **Status:** Accepted
- **Date:** 2026-10-22

## Context
KubeiQ will ship several products (Cluster Doctor first, more later). Each could be a separate
download, or all could live in one installable platform. Every product needs the same foundation:
cluster connections, LLM configuration, users and auth, licensing, history and audit.

## Decision
**One platform, one install. Products are modules inside it.**

- **One install** for everything: `docker compose up`, a `curl` install script, later `helm install kubeiq`.
  No per-product downloads.
- **Products are modules** of the app: each has its own UI route (`/doctor`), API routes and enable
  flag, and is listed under the header "Products" menu. Disabled products are hidden.
- **Shared platform code** is used by every product: clusters, collectors, LLM layer, redaction,
  auth, licensing, persistence.
- **Separate deliverables are access channels, not products:** the in-cluster agent, a future CLI
  and MCP server all talk to the same backend.
- **Marketing website is separate from the app:**
  - `website/` (kubeiq.io): landing page, one page per product, pricing, docs, and **one install
    page**. Every "Get Started" button leads there. Product pages say "Included in KubeiQ".
    Static site, deployed on its own.
  - `frontend/` (the self-hosted app): `/` is the app Home (product tiles, recent work), not marketing.
- **Pricing rule:** gate organization and scale features, never core usefulness.
  - Free (core, Apache-2.0): every core product, single user, a few clusters.
  - Pro: more clusters, teams, scheduled scans, reports, alerts.
  - Enterprise: SSO, RBAC, audit logs, per-org LLM keys, managed hosting.
  - A fully paid product lives in `ee/` and plugs into the same platform (ADR 0001); one license
    key unlocks paid features everywhere.

## Consequences
- Users connect a cluster and configure a model once; every product benefits.
- One release pipeline, one Helm chart, one upgrade path.
- Competes as a toolkit against platforms like AutoKube rather than as a set of single tools.
- Products must not import each other; they share code only through the platform layer.
- The website duplicates the design tokens of `frontend/src/app/globals.css`; keep them in sync.
