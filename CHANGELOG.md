# Changelog

All notable changes to KubeiQ. Versions follow [Semantic Versioning](https://semver.org/).

## 0.3.0 — 2026-10-30

### Added
- **Ask about an issue.** Every diagnosed issue in Cluster Doctor has a follow-up chat: ask why
  it started, what else it affects or how to check the fix. Answers use the diagnosis and look
  at the live cluster (logs, events, pods) with read-only access, showing each check as it runs.
  Questions and answers stay on the investigation, so the team sees the same thread.
- **Connect a cluster with one command** (ADR 0014). Settings › Clusters shows a command with a
  one-time code; run it where kubectl works and the cluster appears in KubeiQ, in your project,
  by itself. KubeiQ tests the cluster before saving it and says why when it cannot reach it.
- **minikube and kind on the same machine just work.** The connect command and the installer link
  KubeiQ to the cluster's Docker network.
- **Every cluster in one place.** Settings › Clusters puts each cluster in your project with one
  switch, and new clusters join it by themselves (the command, a pasted file, GKE). Contexts of the
  server's kubeconfig can be hidden, and those that log in through gcloud, aws or az get a Fix: one
  command gives KubeiQ its own read-only access, and the new cluster takes the old one's place.
- **Uninstall** with one command (`deploy/uninstall.sh`): removes KubeiQ's containers, data,
  images and install directory, and nothing else. `--keep-data` keeps it to come back later.
- **GKE: Check Access** lists a project's clusters before you add it and shows, per cluster, the
  exact commands for any missing access.

### Changed
- Cluster Manager shows an icon for every kind, and side menus use a bolder weight.
- The top bar opens on a cluster that works, lists working clusters first and says which ones
  need a fix. Overview links broken clusters to Settings and tells admins about connected clusters
  that are in no project.
- Cluster health also checks that KubeiQ may read the cluster, and unreachable clusters say why
  (no answer, refused, unknown host, certificate) with the address.
- KubeiQ serves `connect.sh` itself, so the script always matches the server.

### Fixed
- Logs of a Service in Cluster Manager failed with "Request failed (422)". Validation errors now
  show their message instead of the status code.
- "No contexts in this file" no longer shows while KubeiQ is still checking the clusters.
- A Google Cloud VM without a service account gets one plain sentence instead of Google's error
  page, and the project ID is filled into every command.
- The installer stopped with "the input device is not a TTY" on some Docker Compose versions
  when run as `curl ... | sh`, before starting KubeiQ.

## 0.2.0 — 2026-10-25

### Added
- **Projects hold the clusters.** KubeiQ works with the clusters in a project, for admins too.
  The first admin sign-in opens a welcome setup: create a project, then add its clusters
  (ADR 0012).
- **Free plan: 3 users, 1 project, 3 clusters.** Settings › Projects shows the usage. Installs
  already over a limit keep working; only adding more is refused.
- **Invite only.** Admins allow people by email under Settings › Users, as Admin, Editor or
  Viewer; editors and viewers join the project at once. Nobody else can sign in.
- **Sign in with Google** (free, ADR 0013), with your own OAuth client in Settings › Sign-In.
  Allowed people sign in with their Google account, without a password.
- **Connect any cluster with read-only access**: `deploy/connect.sh` creates a service account
  for KubeiQ (no access to Secrets) and prints its kubeconfig, for GKE, EKS, AKS and any other
  cluster (ADR 0011).
- **GKE through the server's Google identity**: add project IDs and KubeiQ finds their clusters,
  with short-lived tokens and no stored key. Settings guides the service account setup.
- **Logs on workloads and Services** in Cluster Manager: pick one of their pods, the ones with
  problems first.

### Changed
- Settings › Clusters shows everything connected and two ways to add a cluster: Kubeconfig or
  Google Cloud.
- The API runs as the user who installed KubeiQ, so it can read that user's `~/.kube/config`
  on Linux. A kubeconfig it cannot read is reported instead of failing the cluster list.
- `KUBEIQ_CORS_ORIGINS` also accepts a comma-separated list.

### Upgrading from 0.1.0
Run the installer again. It sets the user the API runs as and pulls the 0.2.0 images; the
database is migrated on start. On the next admin sign-in, create a project and add your
clusters: until then, KubeiQ shows no clusters. Nothing is deleted.

## 0.1.0 — 2026-10-24

First release: Cluster Doctor, Cluster Map and Cluster Manager in one self-hosted install, with
a one-origin proxy, automatic HTTPS for a domain, Postgres, generated secrets and published
images (ADR 0010).
