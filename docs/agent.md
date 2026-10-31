# KubeiQ Agent

A small program that runs inside a cluster and connects **out** to KubeiQ, so KubeiQ can work
with clusters it cannot reach over the network. It is the `agent` connection method of ADR 0003;
the design and its reasons are in [ADR 0017](adr/0017-kubeiq-agent.md).

## Why

Every other way to connect (server kubeconfig, the connect command, a pasted kubeconfig, a token,
GKE identity) needs KubeiQ to open a connection to the cluster's API server. That breaks for:

- private control planes and authorized networks (GKE private clusters, EKS and AKS private
  endpoints);
- clusters behind a corporate firewall or NAT, or on a laptop;
- teams that do not want the API server exposed at all, not even to KubeiQ.

With the agent, the cluster only needs to reach KubeiQ (outbound HTTPS). Nothing is opened on the
cluster side, and no kubeconfig or token for the cluster is stored in KubeiQ.

## How it works

```
 Cluster (private)                              KubeiQ (one API process)
 ┌───────────────────────────────┐              ┌──────────────────────────────────────┐
 │ kubeiq-agent (Deployment)     │  outbound    │ /api/v1/agent/connect  (tunnel)      │
 │  reverse proxy, adds its own  │── wss:// ───▶│   ▲ one stream per HTTP connection   │
 │  read-only SA token           │   one TLS    │   │                                  │
 │  ▼                            │◀─ streams ───│ gateway 127.0.0.1:<port>             │
 │ in-cluster API server         │              │   ▲ ApiClient of AgentSource         │
 └───────────────────────────────┘              │ Doctor, Map, Manager, assistant      │
                                                └──────────────────────────────────────┘
```

1. An admin adds the cluster under Settings › Clusters › Add › **Agent**, names it, and gets one
   `kubectl apply` command with a one-time install code (one hour, works once). The cluster shows
   right away as waiting for its agent, in the chosen project.
2. The command applies the manifest KubeiQ serves at `/api/v1/agent/install.yaml?code=…`: the
   `kubeiq-agent` namespace, a ServiceAccount bound to `kubeiq-readonly` (no Secrets;
   `kubeiq-changes` only with the "allow changes" option), a Secret holding the code, a Role that
   lets the agent patch that one Secret, and the Deployment.
3. On start the agent trades the code at `/api/v1/agent/register` for a long-lived **agent token**
   (only its SHA-256 hash is stored in KubeiQ) and saves the token in its Secret. It then keeps
   one WebSocket open to KubeiQ and reconnects with backoff (1 s up to 60 s, with jitter).
4. KubeiQ's Kubernetes client talks plain HTTP to a gateway on `127.0.0.1`, which knows the
   cluster by a random per-cluster secret and copies each connection, byte for byte, into a
   stream of the tunnel. The agent serves every stream with a reverse proxy to its API server that
   drops KubeiQ's `Authorization` and `Impersonate-*` headers and adds its own ServiceAccount
   token. Requests, log follows, watches and the terminal (exec upgrade) all work.
5. `AgentSource` implements `ClusterSource`, so collectors, detectors, the AI agent, Map and
   Manager need no change. Settings shows the cluster connected within seconds, with its last
   seen time, agent version and Kubernetes version.

### Tunnel protocol

Each binary WebSocket message is one frame: 1-byte type, 4-byte big-endian stream id, payload.

| Type | Meaning |
|------|---------|
| 1 OPEN | KubeiQ opens a stream (one HTTP connection of its client) |
| 2 DATA | Up to 32 KiB of the stream's bytes |
| 3 CLOSE | The sender sends no more data on the stream |
| 4 RESET | Abort the stream both ways (optional reason) |
| 5 WINDOW | Credit: the receiver handed on this many bytes (uint32) |

Each side may have at most 256 KiB in flight per stream; a peer that sends more gets its stream
reset. Text messages carry JSON control; the agent sends
`{"type":"hello","protocol":1,"version":"…","kubernetes":"…"}` after connecting. KubeiQ's server
pings every 20 seconds; the agent drops a connection that is silent for 90. Implementations:
`backend/src/kubeiq/tunnel/` (both ends, the agent end for tests) and `agent/mux.go`.

## Install

KubeiQ serves the manifest, so the agent version always matches the server:

```bash
# what Settings shows, with the code filled in
kubectl apply -f "https://kubeiq.example.com/api/v1/agent/install.yaml?code=<code>"
# when the cluster reaches KubeiQ at another address than your browser does
kubectl apply -f "https://kubeiq.example.com/api/v1/agent/install.yaml?code=<code>&url=https://kubeiq.internal"
# uninstall (the shared kubeiq-readonly / kubeiq-changes ClusterRoles stay)
kubectl delete --ignore-not-found -f https://kubeiq.example.com/api/v1/agent/uninstall.yaml
```

To install again (a new cluster, after a revoke, or an expired code), use **New Install Command**
in the cluster's Connection tab and apply it; the running agent picks up the new code from its
Secret without a restart.

The image is `ghcr.io/ahmedwagdymohy/kubeiq-agent:<KubeiQ version>`, published with the other
images (`.github/workflows/images.yml`). `KUBEIQ_AGENT_IMAGE` makes the manifest use another one
(a mirror, or a local build: `docker build --build-arg VERSION=dev -t kubeiq-agent:dev agent`).

Agent settings (environment): `KUBEIQ_URL` (required), `KUBEIQ_CA_BUNDLE` (a PEM file, for KubeiQ
behind a private CA), `HTTPS_PROXY` / `NO_PROXY` (outbound proxy), `KUBEIQ_AGENT_NAMESPACE`,
`KUBEIQ_AGENT_SECRET`, `KUBEIQ_AGENT_CREDENTIALS` (where the Secret is mounted).

## Security

- The cluster opens no inbound port; KubeiQ never holds cluster credentials.
- Install codes expire after an hour and work once; agent tokens are random and stored as hashes.
  Revoke in Settings closes the tunnel at once (close code 4401) and the token stops working.
- Authorization stays in the cluster: the agent's ServiceAccount has the read-only role, so a
  compromised KubeiQ cannot read Secrets or change anything the role does not allow. The agent
  refuses requests for its own Secret and for tokens of its own ServiceAccount.
- The gateway listens on 127.0.0.1 only and needs a per-cluster secret that exists only in
  KubeiQ's memory.
- TLS is verified against the system CAs plus `KUBEIQ_CA_BUNDLE`; there is no "skip
  verification". Plain `http://` works for local installs only, and the agent warns about it.
- Adding a cluster, new codes, registration, connections and revokes are in the activity log.
- The image is distroless, runs as non-root with a read-only root filesystem and no capabilities.

## Limits and follow-ups

- A tunnel lives in the API process that accepted it. Several API replicas need the Redis broker
  from the scaling path in docs/architecture.md to route requests to it.
- In-flight requests fail when the tunnel drops; clients retry (watches and live views do).
- One agent per cluster (`replicas: 1`): a second connection replaces the first.
- Helm chart (`url`, `code` or an existing token Secret, `changes`, `resources`, `nodeSelector`,
  `tolerations`, `proxy`, `caBundle`) is still to do.
- End-to-end test on kind with the API server unreachable from KubeiQ is still to do.

## Troubleshooting

| Symptom | Likely cause |
|---------|--------------|
| Agent pod logs TLS errors | Wrong KubeiQ address, or a private CA without `KUBEIQ_CA_BUNDLE` |
| "KubeiQ refused the install code" | The code was used or expired: get a New Install Command and apply it |
| Cluster shows disconnected | The pod is not running, or KubeiQ is not reachable from the cluster |
| Cluster shows revoked | An admin revoked it: apply a New Install Command to reconnect |
| `connection refused` / timeouts in the agent log | Egress blocked: network policy, firewall or a required HTTP proxy |
| Requests forbidden | Expected for Secrets; otherwise the role binding was removed |
| Waiting forever with `localhost` in the command | The cluster cannot reach localhost: set the KubeiQ address it can reach |
