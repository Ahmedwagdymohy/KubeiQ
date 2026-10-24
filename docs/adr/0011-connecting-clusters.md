# 0011 — Connecting clusters: read-only service accounts and cloud identity

- **Status:** Accepted
- **Date:** 2026-10-24
- **Extends:** ADR 0003 (`ClusterSource`)

## Context
Pasting a kubeconfig was the only way to add a cluster. Two problems with it:
- Kubeconfigs from `gcloud`, `aws` and `az` log in by running that CLI (an `exec` plugin), which
  is not in KubeiQ's image, so cloud clusters did not connect.
- People paste their own admin kubeconfig, handing KubeiQ far more than the read-only access it
  needs.

## Decision
Two ways to connect, both read-only by default, chosen by where KubeiQ runs:

1. **A read-only service account, for any cluster** (`deploy/connect.sh`). Run where kubectl
   already reaches the cluster, it creates the namespace `kubeiq`, a ServiceAccount bound to
   `kubeiq-readonly` (no Secrets) and a token, and prints a kubeconfig with that token, the CA and
   the server. It works on GKE, EKS, AKS and any other cluster, private ones included when KubeiQ
   can reach the API server. `--changes` adds `kubeiq-changes`; `--remove` revokes everything.
   Settings › Clusters shows the provider's usual login command and this command.

2. **Cloud identity, when KubeiQ runs in the cloud: GKE first** (`clusters/gke.py`, method `gke`).
   KubeiQ uses the Google identity of its machine (Application Default Credentials: on a VM, the
   metadata server). An admin adds project IDs in Settings › Clusters › Google Cloud; KubeiQ lists
   their clusters through the GKE API every five minutes and connects with access tokens that
   expire within the hour. **Nothing is stored.** Access needs:
   - `roles/container.clusterViewer` on the project (list clusters, reach the API server), and
   - in each cluster, `kubeiq-readonly` bound to the service account's email
     (`connect.sh --google-identity <email>`).
   Private clusters use the private endpoint when "Use private endpoints" is set. Errors name the
   fix: missing role, VM access scopes without `cloud-platform`, the API not enabled.

## Consequences
- The `token` method planned in ADR 0003 is covered by uploads of the kubeconfig `connect.sh`
  prints, so it is not a separate source.
- EKS (instance role, EKS access entry with the view policy) and AKS (managed identity, Azure RBAC
  reader) follow the same pattern as GKE: a source that lists clusters through the cloud API and
  signs requests with the machine identity.
- `google-auth` becomes a direct dependency.
- Clusters KubeiQ cannot reach at all still need the in-cluster agent (roadmap).
