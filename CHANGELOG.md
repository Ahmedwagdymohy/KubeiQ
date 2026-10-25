# Changelog

All notable changes to KubeiQ. Versions follow [Semantic Versioning](https://semver.org/).

## Unreleased

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
