# 0016 — Cluster Security runs Trivy and Kubescape through a read-only proxy

- **Status:** Accepted
- **Date:** 2026-11-01

## Context
Cluster Security (docs/requirements/09) finds misconfigurations, vulnerable images and framework
gaps (NSA-CISA, MITRE ATT&CK, CIS). Mature open-source scanners already do the checking: Trivy
(Apache-2.0) for image vulnerabilities and workload settings, Kubescape (Apache-2.0) for framework
controls. Rewriting their rule sets would be years of work and always behind.

They are separate programs that read a cluster through a kubeconfig. ADR 0003 rules out `kubectl`
subprocesses and KubeiQ never writes credentials to disk; KubeiQ is also read-only by default
(ADR 0009) and never reads Secret values. Tested against a kind cluster, Kubescape tried to create
125 Events and to list Secrets, and Trivy starts a Job on a node unless told not to.

## Decision
1. **Run the scanners as subprocesses**, a narrow exception to ADR 0003: only these pinned scanners,
   only for Cluster Security. Everything else keeps using the Python client.
2. **Through a read-only proxy.** For each scan KubeiQ starts `ScanProxy` on 127.0.0.1: TLS with a
   certificate made for that scan (Go clients send tokens only over TLS) and a one-time token. The
   scanner's kubeconfig points at it and trusts exactly that certificate. The proxy adds the real
   credentials through the cluster's own `ApiClient`, so every connection method works (kubeconfig,
   upload, token, GKE, the planned agent), and refuses:
   - every write: only GET and HEAD pass, plus the self-access reviews scanners use;
   - Secrets, whatever the credentials allow;
   - exec, attach, port-forward and the API server's proxy.
   Refused requests are counted and shown with the scan.
3. **Isolated processes.** Each scanner runs with a throwaway home and temp directory, a minimal
   PATH and `KUBECONFIG` set, so it cannot fall back to `~/.kube/config`. Trivy runs with
   `--disable-node-collector --exclude-owned --exclude-kinds Secret --image-src remote`; Kubescape
   with `--keep-local` (results never leave KubeiQ) and `--exclude-kinds Secret`.
4. **Pinned, verified installs, on first use.** KubeiQ downloads Trivy 0.75.0 and Kubescape 4.0.15
   (releases at least two weeks old when pinned) into `<data_dir>/scanners`, checks each archive
   against the SHA-256 in `products/security/tools.py` and keeps only the binary. Images stay small
   (the scanners add about 300 MB unpacked) and installs that never scan download nothing.
   `KUBEIQ_TRIVY_PATH` / `KUBEIQ_KUBESCAPE_PATH` point at binaries an admin provides (air-gapped).
   A scanner on PATH is never used: its version and output format are unknown. Upgrading a scanner
   is a code change with new checksums and parser tests.
5. **One result.** Both reports become one model: findings (merged when the same object and field
   are reported by several checks or both scanners), vulnerabilities per image and framework
   controls. Findings are ranked by risk: severity, raised for workloads behind a LoadBalancer,
   NodePort or Ingress, running as root or privileged, or with critical CVEs that have a fix;
   lowered for Kubernetes' own system objects. The score is Kubescape's compliance score (Trivy's
   weighted pass rate when Kubescape did not run).
6. **Stored per scan** in `security_scans` and `security_items` (the last 10 scans per cluster).
   Viewing follows the user's namespaces; starting a scan, framework controls and the AI summary
   need access to the whole cluster.
7. **AI on top, never in charge** (ADR 0005): the scanners decide what is wrong; the model writes the
   summary and a fix for one finding against the live, redacted object. A fix is a strategic merge
   patch and a `kubectl patch` command built by KubeiQ; patches naming containers the object does
   not have are rejected. Nothing is applied automatically.

## Consequences
- Scanners cannot change a cluster or read Secrets even with an admin kubeconfig, and nothing they
  need is written to disk except a kubeconfig holding a token that only works with the proxy, for
  the length of one scan.
- The first scan needs internet access: the scanners themselves (about 160 MB), Trivy's
  vulnerability database and Kubescape's framework files; scanning images downloads their layers
  from the registries. Private registries need credentials Trivy cannot get (it never reads
  imagePullSecrets), so their images are not scanned yet.
- Node-level CIS checks (kube-bench, Kubescape's host scanner) need an in-cluster component and are
  shown as "not checked" until Phase 3.
- Scanner upgrades are deliberate: a new pin, new checksums, and the parsers re-tested against the
  new output.
