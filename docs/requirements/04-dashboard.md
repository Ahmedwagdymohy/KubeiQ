# 04. Multi-Cluster Dashboard

Overview today answers "is anything broken and what do I do?" with the cluster ledger. A
dashboard of cluster cards adds the fleet view teams expect, without losing that answer.

## Today

Overview: title with the finding, the AI notice, the cluster ledger (workload health per cluster
and namespace), failing workloads, recent investigations.

## Requirements

### Cluster cards

- **MUST** offer a card per cluster next to the ledger (a Cards / Ledger switch, remembered per
  user). Each card: status dot, name, version and method, labels, health badge.
- Card content by size:
  - **Glance:** health, CPU and memory percent, nodes, pods running of total.
  - **Standard:** plus labels, nodes, pods, namespaces, CPU, memory and disk bars.
  - **Detailed:** plus absolute values ("2.4 of 8 cores"), usage trend lines, workload counts and
    failing workloads with Investigate.
  - **Full:** plus the latest warning events with Explain.
- **SHOULD** offer layout presets (Glance, Standard, Detailed, Full) and let users drag and resize
  cards into a custom layout, saved per user; Reset returns to the preset.
- **MUST** let a card open into a large view of that cluster.
- **MUST** filter by labels with chips; non-matching cards dim rather than disappear, so the fleet
  stays in view. Sort by name, health, CPU or memory.
- Offline or unreadable clusters show the reason and Fix, not empty numbers.

### Real usage data

- **MUST** take usage from metrics-server (`metrics.k8s.io` nodes and pods). Without it: "Usage needs
  metrics-server" with the install command, no fake numbers.
- **MUST** compute disk from real usage (kubelet summary stats or metrics), not capacity minus
  allocatable.
- **MUST** store a light history so trend lines are real: a sample per cluster every minute, kept
  for 7 days (Postgres table, downsampled for older data). Decide the storage in an ADR.

## Do better than the reference

- The reference draws trend lines from random data and reports reserved space as disk usage. Ours
  shows only measured data.
- Every card leads to action: Investigate, Explain, Fix.

## Tier

Core. Longer history retention MAY be a paid option later.

## Done when

- With three clusters (one healthy, one degraded, one offline) the cards show correct health,
  usage and reasons, in both themes.
- Trend lines match recorded samples; restarting KubeiQ keeps the history.
- A user's layout and filters survive sign-out and another browser.
