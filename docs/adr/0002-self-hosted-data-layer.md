# 0002 — Self-hosted data layer (no BaaS)

- **Status:** Accepted
- **Date:** 2026-10-21

## Context
The prototype used InsForge for auth, history, and realtime. Self-hosted users cannot depend on a third-party backend, and Enterprise needs SSO/LDAP/audit under our control.

## Decision
- Persistence: SQLAlchemy + Alembic; **Postgres** in production, **SQLite** for single-container local installs.
- Auth: built-in local auth in core; OIDC/LDAP in `ee/`.
- Realtime: **Server-Sent Events** from the API (Redis pub/sub when horizontally scaled).
- Every entity carries `org_id` from day one.

## Consequences
- No vendor lock-in; one `docker run` works offline.
- We own auth/session code and must keep it secure and tested.
