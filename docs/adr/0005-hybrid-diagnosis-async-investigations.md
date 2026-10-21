# 0005 — Hybrid diagnosis and async investigations

- **Status:** Accepted
- **Date:** 2026-10-21

## Context
Dumping all cluster evidence into one prompt does not scale (context limits, cost, vague answers). Investigations take 30–120s, exceeding typical HTTP timeouts.

## Decision
- **Detectors first:** deterministic rules turn raw state into `Finding`s; obvious issues resolve without an LLM.
- **Agent second:** a tool-calling agent with read-only tools fetches only the evidence it needs; output is schema-validated.
- **Confidence** is computed from evidence and detector/LLM agreement, not only model self-report.
- **Async:** `POST /api/v1/investigations` returns an id; progress streams over SSE. In-process tasks first, Redis-backed workers when scaling.

## Consequences
- Lower cost and latency; deterministic, testable results for common failures.
- Agent tools double as the foundation for a future MCP server.
