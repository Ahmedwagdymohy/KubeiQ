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
