# 09. Cluster Security

A product module (ADR 0006) that answers "how exposed is this cluster, and what do I fix first?",
built on open-source scanners and KubeiQ's AI (ADR 0016).

## Tools and how they fit

| Kind | Tools | How KubeiQ uses them |
|---|---|---|
| Scanners that work from outside with read access | **Trivy**, **Kubescape** | KubeiQ runs them (Phase 1) |
| Manifest and infrastructure-code scanners | KubeLinter, Checkov | YAML from the cluster, uploads, a Git repo, edits before apply (Phase 2) |
| Must run inside the cluster | kube-bench, Falco, Trivy Operator | Installed by an admin, results read by KubeiQ (Phase 3) |
| Infrastructure, not scanners | Calico, Istio, OPA Gatekeeper | Their state read when installed: policy coverage, mTLS, violations (Phase 2) |

Terrascan and kubeaudit are left out: Checkov and Kubescape cover their checks.

## Phase 1 (built)

- **MUST** run Trivy (image vulnerabilities, workload settings, RBAC) and Kubescape (NSA-CISA,
  MITRE ATT&CK, CIS) on demand, one scan per cluster at a time, in the background with progress.
- **MUST** keep scanners read-only and away from Secrets, whatever the credentials (ADR 0016).
- **MUST** merge what both report: one finding per problem per object, listing every check and
  scanner that found it.
- **MUST** rank by real risk, not severity alone: exposure (LoadBalancer, NodePort, Ingress),
  root or privileged, critical CVEs with a fix; Kubernetes' own objects lower and hidden by default.
- **Pages:** Overview (score and trend, counts, framework scores, highest risks, AI summary, how the
  scanners ran), Findings (filters by severity, area, namespace, text), Vulnerabilities (per image,
  fixed versions, the workloads that run it), Compliance (controls per framework, why some are not
  checked).
- **AI:** a plain summary with priorities and quick wins; per finding, Fix with AI (a patch and a
  complete `kubectl patch` command against the live object, never applied by KubeiQ) and Explain
  (the assistant).
- **Access:** results follow the user's namespaces; scanning, controls and the summary need the
  whole cluster. Starting a scan is audited.

## Phase 2

- Manifest scan (KubeLinter, Checkov): paste YAML, upload Helm or Terraform, a Git repo; check
  Cluster Manager edits before they are applied.
- Network: pods with no NetworkPolicy, namespaces open to all, Istio mTLS coverage, Calico policies;
  shown on the Cluster Map.
- Policies: Gatekeeper violations; custom Rego checked against the live cluster (`ee/`).
- Private registries: image scanning with registry credentials saved in Settings (encrypted).

## Phase 3

- kube-bench as a Job and Kubescape's host scanner for node-level CIS checks.
- Falco runtime alerts through the notification channels, with AI triage.
- Scheduled scans, history beyond 10 scans, alerts for new critical findings.

## Tier

Scanning, findings, AI fixes: core. Scheduled compliance reports, export (PDF, CSV), custom
policies: `ee/`.

## Done when (Phase 1)

- A scan of a kind cluster with the examples shows merged findings, a score that matches
  Kubescape's, and no Secret read or write reaches the API server (the proxy's count shows them).
- A viewer limited to one namespace sees only that namespace's findings and cannot start a scan.
- Fix with AI on "runs as root" returns a patch for the real container names.
