# 0003 — Kubernetes Python client and ClusterSource abstraction

- **Status:** Accepted
- **Date:** 2026-10-21

## Context
The prototype shelled out to `kubectl`. That is slow, text-parsing based, an injection risk, requires the binary in images, and does not extend to private clusters.

## Decision
- Use the official `kubernetes` Python client with typed objects.
- All cluster access goes through a `ClusterSource` interface. Three connection methods are planned:

  | Method | Use case | Phase |
  |--------|----------|-------|
  | `kubeconfig` | local or VPN-reachable clusters (kind, minikube, k3s, VPN) | 2 |
  | `token` | managed clusters (EKS, GKE, AKS) via ServiceAccount bearer token + API URL + CA; token encrypted at rest | 4 (needs persistence) |
  | `agent` | private clusters behind firewalls; in-cluster agent dials out, no inbound ports | 5 |

- Cluster IDs are `<method>:<name>` (e.g. `kubeconfig:kind-dev`), so sources never collide.
- In Docker, kubeconfig servers on `127.0.0.1`/`localhost` can be rewritten to `host.docker.internal`
  (`KUBEIQ_KUBECONFIG_LOCALHOST_ALIAS`) while TLS still verifies against `localhost`.
- Access is read-only; Secret values are never fetched.

## Consequences
- Collectors are unit-testable with mocked clients.
- Private-cluster support can be added without touching collectors or the agent.
