# 05. Resource Views

The daily work in a Kubernetes tool: find resources, read their state, open their YAML, logs or a
shell. Cluster Manager has the base (Table API lists, YAML, events, logs, a few actions); this is
what makes it professional.

## Tables

- **MUST** keep the server's own columns (Table API) and add **status-aware columns** for the main
  kinds:
  - **Pods:** status as a coloured pill using the real reason (CrashLoopBackOff, ImagePullBackOff,
    OOMKilled), ready (1/2), a dot per container (ready, waiting, terminated) with name and restarts on
    hover, restarts highlighted above 0 and strongly above 10, CPU and memory as bars coloured by the
    cluster thresholds, node, IP, age.
  - **Deployments, StatefulSets, DaemonSets:** ready, up to date, available, strategy, images.
  - **Nodes:** status, roles, CPU and memory usage, pods of allocatable, taints, cordoned.
- **MUST** sort by any column, filter by name and namespace (a searchable namespace picker with
  "All namespaces"), and show "N of M".
- **SHOULD** let users show, hide, reorder and resize columns, saved per user and per kind; compact
  rows as an option.
- **MUST** handle large clusters: virtual scrolling, no freeze at 5,000 pods.
- Clicking a namespace badge filters by it. A failing row offers **Investigate** (Cluster Doctor).

## Live updates

- **MUST** update lists live through Kubernetes watches streamed to the browser (SSE), one shared
  connection per list, reconnecting with backoff, and show a Live indicator.
- **MUST** batch updates (about every 200 ms) so crash-looping pods do not flicker; an add and a
  delete of the same object in one batch cancel out.
- Usage columns refresh separately (metrics every few seconds while the page is open).
- Agent clusters may poll instead of watching until the tunnel supports streams (docs/agent.md).

## Drawers

A resizable panel from the bottom (or the side panel we have today on wide screens), the same
look for every tool:

- **YAML:** read-only by default with syntax highlighting, folding, copy and download.
  **Edit** (behind ADR 0009) opens an editor; **Save** shows a **diff** first, applies, and warns when
  Kubernetes reverted fields ("replicas was changed back by the autoscaler"). `managedFields` hidden.
- **Describe:** a readable summary of the object (status, conditions, events) for people who do
  not read YAML.
- **Logs:** follow live, choose the container, previous run, pause (buffering new lines), search
  with next and previous match, wrap, timestamps, colour by level, copy, download, and **Analyze**
  with AI (07).
- **Terminal** (exec, behind ADR 0009 and its own permission): choose container and shell, fall back
  between bash, sh and ash automatically, a clear message for images without a shell (distroless),
  reconnect, font size. Every session audited.
- **Files** (behind the same permission): browse a container's filesystem and download a file.

## Actions

All behind ADR 0009 (admin switch, permission, confirmation, audit):

- Scale (exists), restart (exists), delete (exists).
- CronJob: trigger now, suspend and resume. Job: suspend.
- Node: cordon, uncordon, drain (eviction API, respects disruption budgets, skips DaemonSet pods,
  reports evicted and skipped).
- **SHOULD** add what the reference lacks: apply YAML (create), port-forward, Helm releases with
  history, values and rollback.

## Secrets

Never show values (engineering rules): keys and sizes only.

## Tier

Core. Exec, file access and changes depend on roles (08); custom roles are `ee/`.

## Done when

- The pods table shows correct reasons, container dots and usage on the broken examples
  (`examples/`), updates live, and stays smooth with 5,000 pods.
- Each drawer works in both themes, at desktop and phone width, with keyboard shortcuts listed.
- Every change and exec session appears in Activity.
