# 0017 — The KubeiQ Agent: an outbound tunnel for private clusters

- **Status:** Accepted
- **Date:** 2026-10-31
- **Extends:** ADR 0003 (ClusterSource: the `agent` method), ADR 0014 (one-time codes)

## Context
Every connection method so far needs KubeiQ to reach the cluster's API server. Private control
planes, clusters behind NAT or a firewall, and teams that will not expose the API server at all
cannot be connected (see `docs/agent.md`). ADR 0003 planned an in-cluster agent behind the same
`ClusterSource` abstraction, so collectors, detectors, the AI agent, Map and Manager do not change.

## Decision
1. **The agent dials out.** A Deployment in the cluster opens one WebSocket to
   `/api/v1/agent/connect` (wss://, through an HTTP proxy if one is set) and keeps it open,
   reconnecting with exponential backoff and jitter (1 s to 60 s). The cluster opens no port.
2. **Streams of bytes, not API calls.** The tunnel multiplexes byte streams. Every binary message
   is a frame: type (OPEN, DATA, CLOSE, RESET, WINDOW), a 32-bit stream id, a payload of at most
   32 KiB. Only KubeiQ opens streams. Flow control is per stream: at most 256 KiB in flight, credit
   returned with WINDOW frames, a peer that ignores it gets its stream reset. Text messages carry
   JSON control (the agent's `hello` with its version and the Kubernetes version). Because a stream
   is just a byte pipe, plain requests, log follows, watches and the exec terminal's WebSocket
   upgrade all work without special cases; the format is small enough to implement twice
   (`backend/src/kubeiq/tunnel/protocol.py`, `agent/mux.go`).
3. **A local gateway keeps `ApiClient` unchanged.** KubeiQ listens on `127.0.0.1:<random port>`.
   `AgentSource.api_client()` returns an ordinary `ApiClient` whose host is that gateway and
   whose bearer token is a random per-cluster secret held only in memory. The gateway reads the
   first request head, finds the cluster by that secret (constant-time compare), opens a stream
   on the cluster's live tunnel and then copies bytes both ways. No other local process can use a
   tunnel without the secret. When the agent is offline the gateway answers 503 with a Kubernetes
   `Status` and an `X-KubeiQ-Agent: disconnected` header, which `describe_error` turns into "The
   KubeiQ agent for this cluster is not connected". Considered: a custom urllib3 connection class
   (does not cover the exec WebSocket, which uses websocket-client), a Unix socket (same problem),
   and an API-call protocol (re-implements HTTP, breaks streaming and upgrades).
4. **The agent holds the credentials; KubeiQ holds none.** Each stream is served by Go's
   `httputil.ReverseProxy` to the in-cluster API server. It removes `Authorization` and every
   `Impersonate-*` header that came through the tunnel and adds its own ServiceAccount token
   (re-read as the kubelet rotates it). It refuses requests for its own Secret and for tokens of
   its own ServiceAccount. What KubeiQ can do is exactly what the agent's role allows:
   `kubeiq-readonly` (no Secrets), plus `kubeiq-changes` only if the install command asked for it
   (ADR 0009 still gates changes in KubeiQ).
5. **Go, no dependencies.** The agent is a static Go binary on distroless (`agent/`): small,
   multi-arch by cross-compiling, no shell in the image, runs as non-root with a read-only root
   filesystem and all capabilities dropped. It uses only the standard library, including a small
   WebSocket client (`agent/ws.go`), so it is easy to audit and builds without fetching modules.
   Python was considered (the same mux code on both ends) but needs a much larger image and an
   HTTP/1.1 proxy with upgrade support written by hand.
6. **Install codes and tokens.** An admin adds a cluster under Settings › Clusters › Agent and gets
   a one-time install code (`kqi_`, 24 random bytes, one hour, stored as a SHA-256 hash, like
   ADR 0014). `GET /api/v1/agent/install.yaml?code=…` serves the manifest with the code, KubeiQ's
   address (from the request, or `url=` when the cluster reaches KubeiQ at another address) and
   the image of this KubeiQ version (`KUBEIQ_AGENT_IMAGE` overrides). Serving checks the code but
   does not use it up. The agent trades it once at `POST /api/v1/agent/register` for an agent
   token (`kqa_`, 32 random bytes, stored as a SHA-256 hash) and saves the token in its own Secret
   (a Role allows `patch` on that one Secret only). The Secret is mounted, and read on every
   attempt, so applying a new install command takes effect without a restart.
7. **Revoke.** Revoking clears the token hash and closes the live tunnel with code 4401; the
   cluster stays listed as revoked until it is removed or installed again with a new code.
   Adding, new codes, registration, connections (not reconnects within five minutes) and revokes
   are audited. Every row (`agent_clusters`) carries `org_id`.

## Consequences
- Private clusters connect with one `kubectl apply`, and nothing for them is stored in KubeiQ
  but hashes.
- A tunnel lives in the API process that accepted it. With several API replicas (or uvicorn
  workers) requests must be routed to that process: the Redis broker on the scaling path in
  `docs/architecture.md`. Until then KubeiQ runs one API process, as it does today.
- In-flight requests fail when the tunnel drops; clients retry (watches and SSE already do).
- One agent per cluster: a second connection replaces the first.
- Plain `http://` is accepted only because local installs serve KubeiQ over HTTP; the agent warns,
  and there is no switch to skip TLS verification for `https://`.
