# 0007 — Cluster Map: our own product, built on Headlamp's map logic

- **Status:** Accepted
- **Date:** 2026-10-23

## Context
Users want to see their cluster as a picture: which pods, services, volumes and configs belong
together, and which are healthy. Options were embedding KubeView (MIT), embedding Headlamp
(Apache-2.0), or building our own view on proven libraries. The Kubernetes Dashboard is retired.

## Decision
Build **Cluster Map** as a second product module (`/map`, ADR 0006), reusing:
- **Headlamp's resource map logic** (kubernetes-sigs/headlamp, Apache-2.0): relations between kinds,
  grouping into connected components, main-node weights, shared-node cloning, collapsing, ELK layout
  settings, edge drawing and node design. Adapted files keep the original copyright header and say
  what changed; `NOTICE` credits Headlamp.
- **Kubernetes community icons** (CC-BY-4.0), as used by Headlamp.
- **React Flow** (`@xyflow/react`, MIT) for rendering and **elkjs** (EPL-2.0, used unmodified as a
  library) for layout.

What differs from Headlamp:
- **Health comes from KubeiQ's detectors**, so a red node carries a one-line root cause, not just a
  pod phase. Unexplained unhealthy pods are still flagged (catch-all detector).
- **Investigate**: any unhealthy node opens Cluster Doctor scoped to its namespace, starts an
  investigation and expands that workload's incident.
- **Read-only and secret-safe**: the backend builds the graph from our collectors; Secrets are never
  listed or read. Secret nodes are names taken from pod references.
- Relations are computed in the backend (`products/map`), so other clients (CLI, MCP) can reuse them.

## Consequences
- Fast to build, and the hard parts (layout, grouping) are already proven at scale in Headlamp.
- One more product sharing clusters, auth and design with Cluster Doctor.
- When Headlamp improves its map, we can port the changes; keep adapted code close to the original.
