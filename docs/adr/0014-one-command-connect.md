# 0014 — Connecting a cluster with one command

- **Status:** Accepted
- **Date:** 2026-10-26
- **Extends:** ADR 0011 (connecting clusters)

## Context
ADR 0011's `connect.sh` printed a kubeconfig that people then pasted into Settings. Testing it on
a Linux server with minikube showed how many steps could go wrong:
- the command had `<name>` and `<context>` placeholders nobody explained;
- the file had to be copied from the terminal into the browser;
- KubeiQ runs in Docker and minikube on its own Docker network, so KubeiQ could not reach it, and
  the only message was "Cluster unreachable";
- a cluster added in Settings was not in a project, so it stayed hidden (ADR 0012);
- the script always came from GitHub `main`, whatever version the server ran;
- GKE clusters showed as healthy without read access, because any identity may read `/version`.

## Decision
1. **One-time connect codes.** Settings › Clusters › Add asks the server for a code and shows one
   command. The code is random (24 bytes), stored only as a SHA-256 hash, expires after 15 minutes
   and connects one cluster. Only admins create codes; each carries the project the cluster joins
   (the only project when there is one).
2. **KubeiQ serves `connect.sh`** at `/api/v1/connect.sh`, with its own address filled in from the
   request (Host / X-Forwarded-* headers, validated as a plain host name). The script therefore
   matches the server and reports back to the address it was downloaded from. `deploy/connect.sh`
   stays the source and keeps working from GitHub without a code (it prints a kubeconfig, as
   before); the backend ships a copy (`make sync-connect`, checked by a test).
3. **The public endpoints accept nothing but a valid code.** `GET /api/v1/connect/check` lets the
   script stop before touching the cluster when the code is bad. `POST /api/v1/connect` takes the
   kubeconfig (64 KB at most), **tests it first** (version, then listing namespaces) and only then
   saves it encrypted, adds the cluster to the code's project within the plan's limit, marks the
   code used and writes an audit record in the name of the admin who created the code. When the
   cluster cannot be reached it replies 409 with the reason, and the code stays usable so the
   command can run again. Settings polls the code and shows waiting, the reason of a failure, or
   the connected cluster.
4. **Local clusters in Docker.** On a 409, the script looks for KubeiQ's backend container
   (label `io.kubeiq.service=backend`) and for the container at the API server's address (IP or
   name). When both run on this machine it joins KubeiQ to that Docker network, records it as
   `KUBEIQ_NETWORKS` in KubeiQ's `.env`, and tries again. The installer joins `minikube` and the
   recorded networks on every install and update, and skips networks that no longer exist.
5. **Health means "can read".** Cluster checks list one namespace after the version; a 401/403
   marks the cluster reachable but unreadable, with the fix. Network errors name the address and
   the likely cause (no answer, refused, unknown host, certificate).
6. **GKE: check before adding.** `POST /api/v1/settings/gke/check` lists a project's clusters and
   tests each one without saving anything. Settings shows, per cluster, the exact `gcloud` and
   `connect.sh --google-identity` commands for whatever is missing, all values filled in.

## Consequences
- Pasting a kubeconfig remains for machines that cannot reach KubeiQ (air-gapped admins).
- A code in a terminal's history is useless after 15 minutes or once used.
- The connect endpoints are the first API routes without a session; they are limited to the code
  and to adding one kubeconfig.
- Clusters KubeiQ cannot reach over the network at all still need the in-cluster agent (roadmap).
