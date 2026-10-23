# 0008 — Users, master key sign-in and project-scoped access

- **Status:** Accepted
- **Date:** 2026-10-23

## Context
Settings holds AI keys and cluster credentials, and Cluster Manager shows everything in a cluster.
KubeiQ cannot be exposed beyond localhost without sign-in. Teams also want to give people access to
some clusters and namespaces only. We want the first sign-in to work with no setup, like LiteLLM.

## Decision
- **Master key.** One key per install: `KUBEIQ_MASTER_KEY`, or generated on first start into
  `<KUBEIQ_DATA_DIR>/.kubeiq-master-key` (mode 600) and logged once. The installer writes it to
  `backend/.env` and prints it. The built-in admin signs in as `admin` (`KUBEIQ_ADMIN_USERNAME`)
  with the key as password. API clients can send `Authorization: Bearer <master key>`.
- **Users** with scrypt password hashes (standard library). Roles: `admin` (everything) or `user`.
  Admins create users; a generated password is shown once. Users can change their password.
- **Sessions**: random token in an HttpOnly, SameSite=Lax cookie (`kubeiq_session`, 7 days by
  default, `Secure` on HTTPS). Only a SHA-256 of the token is stored. Five failed sign-ins per
  username in five minutes are refused.
- **Projects** are the access boundary: a list of scopes (`cluster_id` + namespaces, empty = all)
  and members with a role, `viewer` (look and investigate) or `editor` (also make changes when
  changes are on, ADR 0009). A user's access is the union of their projects.
- **Enforcement in the backend** on every route: clusters and namespaces lists are filtered;
  investigations, map, evidence and manager calls check the cluster and namespace. Seeing all
  namespaces or cluster-wide kinds needs a scope with all namespaces. Settings, users, projects and
  activity are admin only. Health checks and sign-in are public.
- **Activity log** (`audit_events`): sign-ins (including failures), user, project and settings
  changes, and every cluster change.
- **Plans.** The free plan allows 3 users (`auth/plan.py`). A Pro license (`ee/`) will raise it
  through that module, so core still never imports `ee/` (ADR 0001).

## Consequences
- Fresh installs are protected immediately, with nothing to configure.
- Every persisted table keeps `org_id` (ADR 0002); multi-org needs no schema change.
- SSO (OIDC, LDAP) and custom roles remain Enterprise features on top of these users and projects.
- Losing the master key means editing `backend/.env` (or the key file) and restarting.
