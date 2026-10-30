# 0015 — Usage history for trend lines

- **Status:** Accepted
- **Date:** 2026-10-30

## Context
The multi-cluster dashboard (docs/requirements/04) shows CPU and memory trends per cluster. A
competing product draws those lines from random data and reports reserved space as disk usage. Our
rule is real data only: if we show history, we store it.

## Decision
1. **Where:** a `usage_samples` table in KubeiQ's own database (Postgres in production, SQLite
   locally, ADR 0002). No time-series database: the volume is small (one row per cluster per minute).
2. **What:** per cluster, CPU and memory used and allocatable (from metrics-server), running and
   total pods, Ready and total nodes. Percentages are computed when read.
3. **When:** a background task samples every `KUBEIQ_USAGE_SAMPLE_SECONDS` (60 by default, 0 turns
   it off), only clusters in a project, not hidden, not logging in through a CLI, and with metrics
   on (Settings › Clusters › Usage). A cluster that is offline or unreadable records nothing, so
   gaps in the line are real gaps.
4. **How long:** raw samples for 24 hours; then averaged into 10-minute samples (`seconds = 600`)
   kept for 7 days. Downsampling runs hourly. A week of one cluster is about 2,300 rows.
5. **Disk:** real disk usage comes only from the kubelet's stats (`nodes/{name}/proxy/stats/summary`).
   `nodes/proxy` grants more than reading, so KubeiQ's read-only role does not include it. Identities
   that have it (an admin kubeconfig) show measured disk usage; others show none. We never show
   capacity minus allocatable as "used".
6. **Read:** `GET /api/v1/clusters/{id}/usage?hours=1..168`, for users who may read the whole
   cluster.

## Consequences
- Trend lines survive restarts and match what was measured; a fresh install starts with no history
  and says so.
- Longer retention can become a paid option later without changing the schema.
