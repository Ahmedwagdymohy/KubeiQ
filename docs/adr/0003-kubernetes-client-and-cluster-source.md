# 0003 — Kubernetes Python client and ClusterSource abstraction

- **Status:** Accepted
- **Date:** 2026-10-21

## Context
The prototype shelled out to `kubectl`. That is slow, text-parsing based, an injection risk, requires the binary in images, and does not extend to private clusters.

## Decision
- Use the official `kubernetes` Python client with typed objects.
- All cluster access goes through a `ClusterSource` interface:
  - `KubeconfigSource` (now): lists contexts from kubeconfig, builds a client per context.
  - `AgentSource` (Phase 5): an in-cluster agent opens an outbound connection to the server; no inbound ports.
- Access is read-only; Secret values are never fetched.

## Consequences
- Collectors are unit-testable with mocked clients.
- Private-cluster support can be added without touching collectors or the agent.
