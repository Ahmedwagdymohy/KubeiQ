# Changelog

All notable changes to KubeiQ. Versions follow [Semantic Versioning](https://semver.org/).

## Unreleased

### Added
- **A sidebar that knows Kubernetes.** Products, then the resources grouped the way people think
  (Workloads, Network, Config, Storage, Access, Cluster), one group open at a time. Pin up to five
  items to the top, or collapse the sidebar to an icon rail; both follow you to any browser.
- **Cluster status bar.** The cluster in scope, its health (reachable, readable, nodes Ready),
  version, nodes, namespaces, pods and CPU and memory usage when metrics-server runs. "No access"
  opens its fix; "Degraded" opens Cluster Doctor.
- **Command palette (Ctrl+K).** Jump to any page, resource kind or setting, find objects by name in
  the cluster in scope and open or investigate them, switch clusters, toggle the theme.
- **Ctrl+1 to Ctrl+9** switch clusters. KubeiQ remembers your last cluster per user.
- Breadcrumbs: Cluster Manager / Deployments / checkout.
- **Clusters screen.** One row per cluster with its labels, how it connects, its default namespace,
  when it was added and whether it works, each tested on its own (Test, Test All). Edit a cluster in
  one dialog: General (display name, labels, default namespace, project), Connection (test, replace
  credentials) and Usage (metrics on or off, CPU and memory warning and critical levels that colour
  every usage bar).
- **Labels and environments.** Presets (production, staging, development, ...) and custom labels
  with colours, shown in the cluster switcher. Changes on a production cluster ask for its name.
- **Connect with a token.** API server address, ServiceAccount token and CA, tested before saving.
  TLS is always verified; there is no switch to skip it.

- **Cluster cards on Overview.** Switch between the ledger and a card per cluster, at four sizes
  (Glance, Standard, Detailed, Full): health, nodes, pods, namespaces, CPU, memory and disk bars,
  24-hour trend lines, failing workloads with Investigate, the latest warnings. Filter by label
  (other cards dim), sort by health, name or usage, and open a card into a large view. Your choice
  is saved per user.
- **Usage history** (ADR 0015): KubeiQ records each cluster's usage every minute, keeps a day of
  minutes and a week of 10-minute averages, so trend lines show measured data only. Disk usage comes
  from the kubelet when KubeiQ's identity may read it, and is never guessed.

- **Resource tables that read like kubectl and more.** Pods show their real reason as a coloured
  pill (CrashLoopBackOff, ImagePullBackOff, Init:Error), a dot per container, restarts highlighted,
  CPU and memory against their limits, node and IP; workloads their images and strategy; nodes their
  usage, pods of allocatable and taints. Sort by any column, show, hide and reorder columns (saved per
  user and kind), compact rows, a searchable namespace picker, and click a namespace to filter.
  Failing rows offer Investigate.
- **Live lists.** Tables follow the cluster through Kubernetes watches, batched so a crash-looping pod
  does not flicker, with a Live indicator; big lists render only the rows on screen (5,000 rows).

- **Edit YAML with a diff.** Edit an object, review what the API server would store (a dry run),
  then apply. A few seconds later KubeiQ checks whether something in the cluster set fields back
  (an autoscaler) and says which. Create objects from YAML the same way.
- **Terminal and files.** Open a shell in a container (bash, ash or sh, whichever it has; distroless
  images get the `kubectl debug` command), browse its files and download one. Both need cluster
  changes on and an editor, and every session and download is recorded.
- **A better log viewer.** Live or paused (new lines wait), search with next and previous, wrap,
  timestamps, errors and warnings coloured, copy and download.
- **More actions.** Drain a node (respects disruption budgets, skips DaemonSet pods), run a CronJob
  now, suspend and resume CronJobs and Jobs. Production clusters ask for their name first.

- **Analyze logs with AI.** One click in the log viewer: a summary, the lines that matter (click one
  to jump to it), the root cause, fix steps with complete commands and what to watch next, from
  bounded, redacted logs plus the pod's status and events. Ask follow-up questions in place.
- **Cluster assistant.** The sparkle button in the top bar opens an assistant for the cluster in
  scope: "why is checkout failing", "which pods restarted today". It looks at the cluster live with
  read-only tools it picks itself (each check shows as it runs), stays inside the namespaces you may
  read, and keeps your conversations (rename, delete). It starts with suggestions from the
  cluster's current problems.

- **Timeline.** Everything that happened in a cluster in one live feed: Kubernetes events plus
  KubeiQ's own entries (investigations, changes made in Cluster Manager, terminals, connections).
  Filter by type, source, namespace and text; open an event's details; Explain a warning with the
  assistant.
- **Pod Distribution.** A balance score for how evenly pods spread, pods per node against
  allocatable with the average marked, node cards with usage, pending pods with Investigate, and
  nodes that look safe to remove, with why.
- **Health-first map.** Cluster Map's overview shows failing apps first, then degraded, then healthy.

- **Settings, regrouped.** Areas grouped as Workspace, People, Intelligence, Operations and System.
  New: General (show usage, namespaces in lists, compact rows, typing the name to delete, for the
  whole workspace), Appearance (theme, row density, code font, for you), License (plan, limits and
  usage), a fuller About with Copy diagnostics, and a Danger Zone (clear activity, remove all
  clusters, reset the workspace), each with a typed confirmation and recorded.
- **Users show their status.** Invited until the first sign-in, then the last sign-in time; revoke an
  invitation, send a new password, or copy the sign-in link for Google users.

- **Notifications.** Alerts in Slack, Microsoft Teams, Discord, Telegram, email or a signed webhook,
  each with Send test. Rules: a cluster unreachable (and back), lost read access, a workload failing
  longer than N minutes, a node NotReady, a critical Cluster Doctor finding, warning events with
  chosen reasons, plan limits. One check per cluster per minute feeds every rule; an alert goes out
  once, again after the cooldown, and when resolved, never during quiet hours. Choose per cluster
  which channels and rules apply. Alerts link back to KubeiQ (set `KUBEIQ_APP_URL`).
- **Activity you can search.** Filter by action, user, cluster and text, page through it, and open an
  entry's details; it refreshes by itself.
- Every change endpoint is covered by a test that a viewer cannot use it.

### Changed
- The read-only role reads metrics and the remaining built-in kinds (still no Secrets). Run the
  connect command again on existing clusters to show usage.
- The optional changes role adds what the new actions need (update and create on common kinds,
  pod eviction, pod exec). Apply it again where cluster changes are on.

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
