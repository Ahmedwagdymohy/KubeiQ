# Architecture

## Overview

```
┌──────────────┐  HTTPS / SSE   ┌────────────────────────── KubeiQ Server ───────────────────────────┐
│   Frontend   │ ─────────────▶ │  API (FastAPI)                                                     │
│  (Next.js)   │ ◀───────────── │    │                                                               │
└──────────────┘   progress     │    ▼                                                               │
                                │  Investigation Service ──▶ Job runner (in-process → Redis workers) │
                                │    │                                                               │
                                │    ├─▶ Collectors (read-only, bounded) ──┐                         │
                                │    │                                     ▼                         │
                                │    ├─▶ Detectors (deterministic rules)   Redaction                 │
                                │    │                                     │                         │
                                │    └─▶ AI Agent (tool calling) ◀─────────┘                         │
                                │           │  LiteLLM                                               │
                                │    Persistence (Postgres / SQLite)                                 │
                                └────────────┬───────────────────────────────┬───────────────────────┘
                                             │ ClusterSource                 │
                              ┌──────────────▼─────────┐        ┌────────────▼─────────────┐
                              │ Kubeconfig source      │        │ Agent source (Phase 5)   │
                              │ direct K8s API access  │        │ in-cluster agent dials   │
                              └──────────────┬─────────┘        │ out; no open ports       │
                                             ▼                  └────────────┬─────────────┘
                                     Kubernetes clusters  ◀──────────────────┘
```

## Investigation flow

1. `POST /api/v1/investigations {cluster, namespace?, target?}` → returns `investigation_id` immediately.
2. Client subscribes to `GET /api/v1/investigations/{id}/events` (SSE).
3. Job runs:
   1. **Collect** — pods, events, deployments, services/endpoints scoped to the request; logs only for unhealthy containers, capped by lines/bytes.
   2. **Detect** — deterministic detectors produce `Finding`s with evidence references. Obvious cases are resolved here without an LLM.
   3. **Reason** — the agent receives findings + summarized evidence and may call read-only tools (`get_pod`, `get_logs`, `get_events`, `describe_deployment`, ...) to dig deeper.
   4. **Diagnose** — schema-validated `Diagnosis`: root cause, explanation, fix steps, commands, prevention, confidence + supporting evidence.
4. Result persisted; final SSE event emitted.

## Inside the pipeline: collectors → detectors → diagnosis

One simple rule: **collectors fetch, detectors think.**
Collectors talk to Kubernetes but make no decisions. Detectors make decisions but never talk to Kubernetes.

```
 Request (cluster, namespace?, target?)
      │
      ▼
 ┌─ 1. COLLECT ───────────────────────────────┐   talks to Kubernetes (read-only)
 │  Pods · Events · Workloads · Services ·    │   run in parallel
 │  Nodes  ──▶ then Logs (only broken pods)   │
 └────────────────────┬───────────────────────┘
                      ▼
 ┌─ 2. REDACT ────────────────────────────────┐   strip passwords, tokens, keys
 └────────────────────┬───────────────────────┘
                      ▼
            Evidence Bundle (one tidy package)
                      │
 ┌─ 3. DETECT ────────▼───────────────────────┐   pure rules, no network
 │  CrashLoop · OOM · ImagePull · Pending ·   │
 │  Probes · Rollout · Service selector       │
 └────────────────────┬───────────────────────┘
                      ▼ Findings
 ┌─ 4. CORRELATE ─────▼───────────────────────┐   group duplicates, find cause vs symptom
 └────────────────────┬───────────────────────┘
                      ▼ Incidents
          ┌───────────┴────────────┐
     cause is clear           cause is unclear
          │                        │
   Diagnosis directly        5. AI AGENT digs deeper
          └───────────┬────────────┘   with read-only tools
                      ▼
                  Diagnosis
```

### 1. Collectors — gather the facts

| Collector | Looks at | Keeps (only what matters) |
|-----------|----------|---------------------------|
| Pods | all pods in scope | status, restart count, last exit code/reason, image, limits, probes, env var *names* |
| Events | recent warning events | reason, message, how often, when |
| Workloads | Deployments, StatefulSets, DaemonSets | desired vs ready replicas, rollout conditions |
| Services | Services + endpoints | selector, how many pods actually match |
| Nodes | nodes | pressure conditions, taints, free capacity |
| Logs | **only unhealthy containers** | last ~200 lines of current *and previous* run, error lines first |

- If one collector fails (e.g. no permission to read nodes), the others still run. The gap is recorded and lowers confidence.
- Each collector reports progress ("Pods: 148 checked, 3 unhealthy") — this is what the live UI shows.
- Every item gets an ID like `Pod/default/payment-7f9` so later steps can point back to their evidence.

### 2. Redact — protect secrets
Passwords, tokens, API keys and connection strings are masked **before** evidence moves on. Nothing downstream — including the AI — ever sees them.

### 3. Detectors — recognize known failures
Each detector is a small rule: *look at the evidence bundle, return findings*. No network calls, so each one is easy to test with sample data.

| Detector | Notices | Narrows the cause by |
|----------|---------|----------------------|
| CrashLoop | container keeps restarting | exit code + known log patterns (missing env var, connection refused, ...) |
| OOM | container killed for memory | its memory limit — cause is certain |
| ImagePull | image can't be pulled | event text: wrong tag vs. missing credentials vs. registry unreachable |
| Pending | pod never scheduled | not enough CPU/memory, node selector, taints, unbound volume |
| Probes | readiness/liveness failing | which probe, how often |
| Rollout | deployment stuck | links to the new pods that are failing |
| Selector | service has no endpoints | finds pods with *almost* matching labels (likely typo) |

A finding looks like: *"Pod payment-7f9 is CrashLoopBackOff (12 restarts). Likely cause: DATABASE_URL missing. Evidence: BackOff event, log line 41."*

### 4. Correlate — one problem, not twenty alerts
- **Group:** 5 crashing replicas of one Deployment → 1 incident.
- **Cause vs symptom:** Service has no endpoints ← pods not ready ← CrashLoop ← missing `DATABASE_URL`. The deepest clear cause is the root cause; the rest is listed as impact.

### 5. AI agent — only when needed
- **Clear cause** (OOM, wrong image tag, label typo): the diagnosis is built directly — fast, free, repeatable.
- **Unclear cause** (unknown error in logs, several competing signals): the AI gets *only that incident* plus read-only tools (`get_logs`, `get_events`, `describe_node`, ...) to investigate further.

This keeps AI cost low and answers focused, even on clusters with thousands of pods.

## Confidence

Confidence is derived, not invented: it combines detector matches, agreement between detectors and
the LLM, and evidence coverage (e.g. logs available vs. missing). The LLM's self-reported score is
one input, never the only one.

## Security model

- Read-only Kubernetes permissions; Secret values never fetched.
- Redaction of tokens, passwords, keys, connection strings before LLM calls.
- LLM provider is user-controlled (can be fully local via Ollama).
- Mutating actions (future) require approval and are audited.

## Scaling path

| Concern | MVP | Scale |
|---------|-----|-------|
| Jobs | in-process async tasks | Redis queue + worker pods |
| Storage | SQLite | Postgres |
| Realtime | SSE from API process | SSE backed by Redis pub/sub |
| Clusters | kubeconfig | in-cluster agents over outbound tunnel |
| Tenancy | single org | `org_id` everywhere → managed multi-tenant SaaS |
