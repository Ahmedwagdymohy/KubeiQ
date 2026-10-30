# 01. App Shell and Navigation

The frame every page lives in: the sidebar, a status bar for the cluster in scope, and fast ways
to move around.

## Today

- A 228px sidebar with Overview, Cluster Doctor, Cluster Map and Cluster Manager, then Settings and
  Docs. Cluster Manager has its own kind list with icons (feat/manager-icons).
- A 48px top bar with the page title, the cluster picker and the theme toggle.
- The cluster in scope is stored per browser (`lib/scope.ts`).

## Requirements

### Sidebar

- **MUST** group navigation the way people think about a cluster, each item with an icon:
  - **Products:** Overview, Cluster Doctor, Cluster Map, Cluster Manager.
  - **Insights:** Timeline (events), Pod Distribution (see 06).
  - **Resources**, collapsible groups: Workloads (Pods, Deployments, StatefulSets, DaemonSets,
    ReplicaSets, Jobs, CronJobs, Autoscalers), Network (Services, Ingresses, Network Policies,
    Endpoint Slices, Gateway API), Config (ConfigMaps, Secrets, quotas, limits), Storage, Access
    (service accounts, roles, bindings), Cluster (Nodes, Namespaces, Events, Custom Resources, Helm).
  - **System:** Settings, Activity (audit), Docs.
> Decided after testing (2026-10-30): the Resources groups are not in the app sidebar, because they
> repeated Cluster Manager's kind list. Kinds stay in Cluster Manager, where they can be pinned to
> the sidebar, and the command palette finds every kind.

- **MUST** keep one group open at a time; the group holding the current page opens by itself, and a
  closed group with the current page shows a small cyan dot.
- **MUST** let the sidebar collapse to an icon rail (tooltips on hover), remembered per user.
- **SHOULD** allow **pinning** up to 5 items into a Pinned group at the top: pin on hover, saved per
  user on the server, a short notice when the limit is reached.
- **MUST** show what a user may open. Items they lack access to are hidden, not shown and then
  blocked (better than "Access restricted" after the click).
- Resource pages reuse Cluster Manager's table and drawers (05); the sidebar is just a faster way in.

### Cluster status bar

A slim row under the top bar for the cluster in scope, so its health is always visible:

- **MUST** show: the cluster switcher (status dot, name), health (Healthy, Degraded, Unhealthy, No
  access), Kubernetes version, node and namespace counts.
- **SHOULD** show CPU, memory and disk usage as small bars when metrics-server is available, coloured
  by the cluster's thresholds (02), with "used / capacity" on hover. Hidden, not zero, without
  metrics-server.
- **MUST** degrade by width: on narrow screens only the switcher and health remain.
- **MUST** link a health problem to its fix: "No access" opens Settings › Clusters with the Fix
  ready; "Unhealthy" opens Cluster Doctor for that cluster.
- Health must be meaningful: reachable **and** readable (the can-read check), node readiness
  (all Ready: Healthy; at least half: Degraded; less: Unhealthy).

### Cluster switching

- **MUST** list every cluster in the switcher with its status and version, working clusters first,
  broken ones last with the reason (done in feat/one-step-connect), and "Add a cluster".
- **SHOULD** support Ctrl+1 to Ctrl+9 to switch, with a short confirmation.
- **MUST** keep the last cluster per user, falling back to the first working one.

### Command palette (Cmd/Ctrl+K)

AutoKube's palette only jumps between pages. Ours should do real work:

- **MUST** jump to pages and settings areas.
- **MUST** find resources by name across the cluster in scope ("payment" finds the Deployment,
  its pods and its Service), and open them in the drawer.
- **SHOULD** run actions: switch cluster, start an investigation of a resource, open logs, toggle
  the theme.
- **SHOULD** show recent items first.

### Breadcrumbs and page titles

- **MUST** show "Group / Page / Resource" with the resource kind and namespace; collapse the middle on
  narrow screens.

## Tier

Core. Pinning and layout preferences are per user, which works in every tier.

## Done when

- A new user finds any resource kind in two clicks or one search.
- The status bar shows the right health for a cluster that is unreachable, unreadable, partly
  NotReady and healthy (tested on kind with a node stopped).
- Keyboard: Cmd/Ctrl+K and Ctrl+1..9 work, and every control is reachable with Tab.
- Verified in light and dark, at 1440px and in a 390px phone frame.
