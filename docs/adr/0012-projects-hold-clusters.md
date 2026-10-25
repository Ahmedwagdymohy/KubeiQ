# 0012 — Projects hold the clusters; first sign-in sets one up

- **Status:** Accepted
- **Date:** 2026-10-25
- **Supersedes:** the "admins see everything" and plan parts of ADR 0008

## Context
After signing in, an admin saw every context of the server's kubeconfig and every uploaded
cluster, and projects only limited what other users saw. New users had no guided start, and a
free plan defined by users alone did not match how KubeiQ is used: by clusters.

## Decision
- **Clusters live in projects.** A cluster is in use when a project's scope includes it. Every
  list (cluster pickers, Overview, Doctor, Map, Manager) shows only clusters in a project, for
  admins too (`Access.in_projects`). Connected clusters that are in no project are "available":
  admins see them in Settings and when adding clusters (`GET /api/v1/clusters?all=true`), and may
  still reach any connected cluster through single-cluster routes, to set projects up.
- **First sign-in.** While an admin has no project (`Me.setup_needed`), the app opens `/welcome`:
  create the project, then add clusters, by picking connected ones or connecting a new one with
  the same flows as Settings (ADR 0011). A kubeconfig added there joins the project directly.
  A user who is in no project sees a screen asking them to contact an admin.
- **Free plan: 3 users, 1 project, 3 clusters** (distinct clusters across projects), in
  `auth/plan.py`, which a license will raise. `GET /api/v1/plan` reports use. Over a limit,
  KubeiQ answers 402 to adding more; installs already over a limit keep working (swapping a
  cluster is allowed, adding one is not).

## Consequences
- Upgraded installs without a project open the welcome page on the next admin sign-in, and show
  no clusters until one is added. Nothing is deleted.
- The master key behaves like the admin: lists show projects' clusters.
- Pricing on the website states the three limits.
