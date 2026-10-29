# 06. Insights: Pod Distribution, Timeline, Map

Views that answer questions no single resource page can: is the load balanced, what just happened,
what is connected to what.

## Pod Distribution

How pods spread across nodes, for capacity and cost decisions.

- **MUST** show summary cards: a **balance score** (0 to 100, how evenly pods spread; Well balanced,
  Moderate, Imbalanced), average pods per node, issues (cordoned, NotReady nodes, Pending pods).
- **MUST** show a bar per node with pods against allocatable and a marker for the average; a row
  expands into its pods, coloured by phase.
- **MUST** show node cards: pods of allocatable as a ring, running, pending and failed counts, CPU
  and memory bars, cores and memory, labels such as role, taints, cordoned.
- **SHOULD** flag **scale-down candidates** (Ready, schedulable, not control-plane, untainted,
  nearly empty) and explain why.
- Filters: namespace (counts follow it), search nodes and pods, sort by pods, CPU, memory or name.
- **SHOULD** connect to Cluster Doctor: Pending pods and imbalance offer Investigate.

## Timeline

A feed of what happened in the cluster.

- **MUST** stream Kubernetes events live, newest first: reason, object, namespace, message, count,
  source, age; Normal and Warning clearly marked; a warnings count in the header.
- **MUST** filter by type, namespace and text; "Clear filters" in the empty state.
- **MUST** open an event's details (first and last seen, count, object, labels).
- **SHOULD** go beyond the reference by adding KubeiQ's own entries to the feed: investigations
  started and finished, changes made in Cluster Manager, clusters connected or lost.
- Each warning offers **Explain** (07) and a link to its object.

## Map

Cluster Map exists (React Flow, ADR 0007). Patterns worth adopting:

- **MUST** sort the overview health first: unhealthy namespaces and apps at the top, then degraded,
  healthy, idle.
- **SHOULD** show a compact strip of pod dots per app in the overview.
- Keep our graph: the reference uses cards only, which hides relationships.

## Tier

Core.

## Done when

- On a kind cluster with a cordoned node and Pending pods, Pod Distribution shows the issue, the
  score drops, and Investigate explains the Pending pods.
- The timeline shows events within two seconds of `kubectl get events` and survives a reconnect.
