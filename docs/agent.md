# KubeiQ Agent (planned)

A small program that runs inside a cluster and connects **out** to KubeiQ, so KubeiQ can work
with clusters it cannot reach over the network. It is the `agent` connection method planned in
ADR 0003. Status: planned for Phase 5; it gets its own ADR when work starts.

## Why

Every way to connect today (server kubeconfig, the connect command, a pasted kubeconfig, GKE
identity) needs KubeiQ to open a connection to the cluster's API server. Real tests showed where
that breaks (see the connectivity notes in the roadmap):

- private control planes and authorized networks (GKE private clusters reached through a jump host,
  EKS and AKS private endpoints);
- clusters behind a corporate firewall or NAT, or on a laptop;
- teams that do not want the API server exposed at all, not even to KubeiQ.

With the agent, the cluster only needs to reach KubeiQ (outbound HTTPS). Nothing is opened on the
cluster side, and no kubeconfig or token for the cluster is stored in KubeiQ.

## How it works

```
 Cluster (private)                              KubeiQ
 ┌───────────────────────────────┐              ┌────────────────────────────┐
 │ kubeiq-agent (Deployment)     │  outbound    │ /api/v1/agent/connect      │
 │  ServiceAccount: read-only ───┼── wss:// ───▶│  AgentSource (ClusterSource)│
 │  forwards each request to the │   one TLS    │  Cluster Doctor, Map,      │
 │  in-cluster API server        │◀─ requests ──│  Manager, Explain chat     │
 └───────────────────────────────┘   responses  └────────────────────────────┘
```

1. An admin adds the cluster under Settings › Clusters › **Agent** and gets an install command
   with a one-time registration code (the connect codes of ADR 0014).
2. The command installs the agent: a Deployment, a ServiceAccount bound to `kubeiq-readonly`
   (no Secrets; `kubeiq-changes` only if chosen) and a Secret holding its credentials.
3. On first start the agent trades the registration code for a long-lived **agent token** (only a
   hash is stored in KubeiQ), then keeps one WebSocket open to KubeiQ and reconnects with backoff.
4. KubeiQ sends Kubernetes API requests through that connection. The agent forwards them to the
   API server with its own ServiceAccount, so it can never do more than its role allows, and
   streams the responses back (log follows and watches included).
5. In KubeiQ an `AgentSource` implements `ClusterSource`: it hands out an `ApiClient` whose
   requests go through the tunnel, so collectors, detectors, the AI agent, Map and Manager need no
   change. Settings shows the cluster connected within seconds, like the connect command does.

## Install

KubeiQ serves everything the command needs, so the agent version always matches the server:

```bash
# one-line install (what Settings shows, code and address filled in)
kubectl apply -f "https://kubeiq.example.com/api/v1/agent/install.yaml?code=<code>"

# or with Helm, for GitOps
helm install kubeiq-agent oci://ghcr.io/ahmedwagdymohy/charts/kubeiq-agent \
  --namespace kubeiq --create-namespace \
  --set url=https://kubeiq.example.com --set code=<code>
```

Chart values to plan for: `url`, `code` (or an existing token Secret), `changes` (bind
`kubeiq-changes`), `replicaCount`, `resources` (small defaults, e.g. 50m CPU / 64Mi), `nodeSelector`,
`tolerations`, `proxy` (an outbound HTTP proxy), `caBundle` (KubeiQ behind a private CA).

## Security

- The cluster opens no inbound port; KubeiQ never holds cluster credentials.
- Registration codes expire and work once; agent tokens are random, stored hashed, and revoked from
  Settings (the agent then disconnects and the cluster shows as revoked).
- Authorization stays in the cluster: the agent's ServiceAccount has the read-only role, so a
  compromised KubeiQ cannot read Secrets or change anything the role does not allow.
- TLS only (`wss://`). A private CA is supported with a CA bundle; there is no "skip verification".
- Every connection, revocation and change through the agent is audited (ADR 0009).

## Work to plan

- Tunnel protocol: framing for concurrent requests over one WebSocket, streaming bodies (logs,
  watches), timeouts, backpressure, reconnect without losing in-flight requests.
- `AgentSource` and the request transport behind the Kubernetes Python client.
- Agent binary (Go, small static image) published to GHCR, multi-arch, versioned with KubeiQ.
- Install manifest served by KubeiQ, Helm chart, uninstall (`kubectl delete` of the same manifest).
- Settings: Agent tab with the install command and live status; per-cluster revoke.
- Scaling: with several API replicas the tunnel lives on one of them, so requests are routed to
  that replica (the Redis broker from the scaling path in docs/architecture.md).
- Tests: protocol unit tests, and an end-to-end test on kind with the API server unreachable from
  KubeiQ.

## Troubleshooting (to document with the release)

| Symptom | Likely cause |
|---------|--------------|
| Agent pod restarts, TLS errors in its logs | Wrong KubeiQ address, or a private CA without `caBundle` |
| Cluster shows disconnected | The token was revoked, or KubeiQ is not reachable from the cluster |
| `connection refused` / timeouts | Egress blocked: network policy, firewall or a required HTTP proxy |
| Requests forbidden | Expected for Secrets; otherwise the role binding was removed |
