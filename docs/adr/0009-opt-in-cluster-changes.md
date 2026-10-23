# 0009 — Cluster changes are opt-in, confirmed and audited

- **Status:** Accepted
- **Date:** 2026-10-23

## Context
KubeiQ started strictly read-only. Cluster Manager (the third product, like Headlamp) is far more
useful if people can scale, restart or delete without switching to a terminal. Changes are also
the riskiest thing KubeiQ could do.

## Decision
- **Off by default.** An admin turns on "Cluster Changes" in Settings (`settings` key `changes`).
  Until then the API refuses every change.
- **Small, explicit action set** in `products/manager/actions.py`: scale (Deployments, StatefulSets,
  ReplicaSets), restart (the `kubectl rollout restart` annotation), delete, cordon and uncordon.
  There is no free-form YAML apply or exec yet.
- **Who:** admins, and project editors in their own scopes (ADR 0008). Viewers never.
- **Confirmation in the UI**: every action asks first; delete needs the resource name typed.
- **Audit**: every attempt, successful or not, is written to the activity log with user, cluster,
  namespace and target.
- **Cluster RBAC still applies.** KubeiQ uses the credentials it was given. For a service account,
  `deploy/rbac/kubeiq-changes.yaml` grants only what these actions need.
- **Secrets stay unread.** Cluster Manager fetches Secrets as metadata only
  (`PartialObjectMetadata`), so values never leave the API server, and drops the
  `last-applied-configuration` annotation that can contain them.

## Consequences
- The product copy says "read-only by default" instead of "read-only".
- New actions (exec, port-forward, edit YAML, Helm) each need the same gating and audit, and a
  roadmap entry; exec and edit should also get their own admin switch.
