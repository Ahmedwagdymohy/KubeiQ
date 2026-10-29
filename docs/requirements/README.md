# Product Requirements: A Professional Kubernetes Workspace

What KubeiQ needs to feel like a complete, professional Kubernetes product, beyond Cluster Doctor's
diagnoses. These documents are the backlog for that work: each one lists requirements, the UX we
want, what exists today, and how we know it is done.

## Where this comes from

- **Our own tests** on kind, minikube and private GKE (see the connectivity notes in
  `docs/agent.md` and the roadmap).
- **A study of AutoKube** (github.com/autokubeio/autokube, v1.0.0, May 2026), a competing Kubernetes
  manager whose shell, settings and cluster management are well done.

> **AutoKube is licensed under the Business Source License 1.1**, which forbids using its code in a
> competing product until four years after each release. KubeiQ is Apache-2.0 open core and
> competes with it. **We take ideas and UX patterns only, and write every line ourselves.** Do not
> copy code, markup, styles, icons or text from that repository.

## Principles

1. **KubeiQ, not a clone.** Our app is the calm "Sheet" design (docs/design.md): Manrope, one cyan
   accent, light and dark. Borrow structure and flows, never their look.
2. **AI troubleshooting stays the center.** Every new screen should lead to an answer: a broken
   pod row offers Investigate, a warning event offers Explain, a log view offers Analyze.
3. **Read-only by default** (ADR 0009). Every change (edit YAML, scale, drain, exec) sits behind the
   admin switch, is confirmed in the UI and audited.
4. **Real data only.** No placeholder charts. If we show history, we store it; if metrics-server is
   missing, we say so and hide the numbers.
5. **Open core** (ADR 0001, 0006). Paid tiers gate organization and scale (SSO, custom roles, audit
   export, more clusters), never core usefulness. Each document marks the tier.

## The documents

| # | Area | What it covers |
|---|------|----------------|
| 01 | [App shell and navigation](01-app-shell-and-navigation.md) | Grouped sidebar with kind icons, pinning, cluster status bar, cluster switching, command palette |
| 02 | [Cluster management](02-cluster-management.md) | The Clusters screen, labels and environments, add/edit dialog, test all, thresholds, the agent |
| 03 | [Settings](03-settings.md) | Settings layout and every area: general, appearance, users and sign-in, AI, notifications, license, danger zone |
| 04 | [Multi-cluster dashboard](04-dashboard.md) | Overview cards per cluster, layout sizes, label filters, real usage history |
| 05 | [Resource views](05-resource-views.md) | Tables with status, usage and column settings, live updates, bottom drawers for YAML, logs, terminal and files, actions |
| 06 | [Insights](06-insights.md) | Pod distribution across nodes, events timeline, health-first map |
| 07 | [AI features](07-ai.md) | Log analysis, the cluster assistant, how they connect to Cluster Doctor |
| 08 | [Access, audit and notifications](08-access-audit-notifications.md) | Roles and permissions per cluster, audit log, alerts to Slack, email and webhooks |

## Suggested order

| Phase | Work | Why first |
|-------|------|-----------|
| 1 | 01 shell and status bar, 02 Clusters screen | Every page sits in the shell; connecting clusters is where people struggle today |
| 2 | 05 tables and drawers (logs, YAML), 04 dashboard | The daily work: find a resource, read it, see usage |
| 3 | 07 AI log analysis and assistant, 06 timeline | Our edge, built on the views above |
| 4 | 03 remaining settings, 08 notifications and roles, 06 pod distribution | Teams and operations at scale |

Each item becomes a roadmap checkbox when it is scheduled, and an ADR when it makes a decision
(for example how usage history is stored).
