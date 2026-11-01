"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { timeAgo } from "@/components/doctor/history-list";
import { ShieldIcon } from "@/components/icons";
import { ComplianceView } from "@/components/security/compliance";
import { FindingPanel } from "@/components/security/finding-panel";
import { FindingsView } from "@/components/security/findings";
import { OverviewView } from "@/components/security/overview";
import { VulnerabilitiesView } from "@/components/security/vulnerabilities";
import { useScopedClusters } from "@/components/shell/status-bar";
import { Spinner } from "@/components/ui";
import { api, type SecurityFinding } from "@/lib/api";

type Tab = "overview" | "findings" | "vulnerabilities" | "compliance";

/**
 * Cluster Security: Trivy and Kubescape scan the cluster in scope through a read-only window
 * (ADR 0016); their results are merged, ranked by risk and explained, with fixes written by AI.
 */
export function ClusterSecurity() {
  const { current } = useScopedClusters();
  const cluster = current?.id ?? null;
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("overview");
  const [open, setOpen] = useState<SecurityFinding | null>(null);
  const ai = useQuery({ queryKey: ["ai-status"], queryFn: api.aiStatus, staleTime: 60_000 });
  const status = useQuery({
    queryKey: ["security-status", cluster],
    queryFn: () => api.securityStatus(cluster!),
    enabled: Boolean(cluster),
    refetchInterval: (q) => (q.state.data?.latest?.status === "running" ? 2000 : false),
  });
  const latest = status.data?.latest ?? null;
  const done = status.data?.last_completed ?? null;
  const running = latest?.status === "running";
  const start = useMutation({
    mutationFn: () => api.startSecurityScan(cluster!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["security-status", cluster] }),
  });

  // When a scan finishes, everything shown comes from it.
  const finished = useRef<string | null>(null);
  useEffect(() => {
    if (!done || finished.current === done.id) return;
    if (finished.current !== null) {
      for (const key of ["security-overview", "security-findings", "security-vulnerabilities", "security-controls"]) {
        void queryClient.invalidateQueries({ queryKey: [key, cluster] });
      }
    }
    finished.current = done.id;
  }, [done, cluster, queryClient]);

  const tabs: [Tab, string][] = [
    ["overview", "Overview"],
    ["findings", "Findings"],
    ["vulnerabilities", "Vulnerabilities"],
    ["compliance", "Compliance"],
  ];
  const canScan = status.data?.can_scan ?? false;
  const missing = (status.data?.tools ?? []).filter((t) => !t.installed);

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="mr-auto flex flex-col gap-0.5">
          <h1 className="text-2xl font-semibold tracking-tight">Cluster Security</h1>
          {done && (
            <span className="text-sm text-muted">
              Scanned {timeAgo(done.finished_at ?? done.started_at)} by {done.started_by}
            </span>
          )}
        </div>
        {canScan && (
          <button
            type="button"
            onClick={() => start.mutate()}
            disabled={running || start.isPending}
            className="flex h-9 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-semibold text-accent-ink transition-colors hover:bg-accent-strong disabled:opacity-60"
          >
            {running ? "Scanning" : done ? "Scan again" : "Scan cluster"}
          </button>
        )}
      </div>

      {running && latest && (
        <p className="flex items-center gap-2 rounded-lg bg-surface px-4 py-3 text-sm text-muted">
          <Spinner /> {latest.step ?? "Scanning"}
        </p>
      )}
      {start.error && <p className="text-sm text-danger">{start.error.message}</p>}
      {latest?.status === "failed" && <p className="rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger">The last scan failed: {latest.error}</p>}
      {status.error && <p className="text-sm text-danger">{status.error.message}</p>}

      {status.data && !done && !running && (
        <section className="flex max-w-2xl flex-col gap-3 rounded-lg border border-border p-6">
          <ShieldIcon width={28} height={28} className="text-accent" />
          <h2 className="text-lg font-semibold">Find security problems in {current?.name}</h2>
          <p className="text-sm leading-relaxed text-muted">
            Trivy checks each workload&apos;s images for known vulnerabilities and its settings for risky defaults. Kubescape checks the
            cluster against the NSA-CISA, MITRE ATT&amp;CK and CIS frameworks. KubeiQ merges what both find, ranks it by real risk and
            writes fixes with AI. Scanners only read: KubeiQ blocks every change and every Secret.
          </p>
          {missing.length > 0 && (
            <p className="text-sm text-subtle">
              The first scan installs {missing.map((t) => `${t.name === "trivy" ? "Trivy" : "Kubescape"} ${t.version}`).join(" and ")} (about
              160 MB, checked against pinned checksums) and Trivy&apos;s vulnerability database. Scanning images also downloads their layers.
            </p>
          )}
          {!canScan && <p className="text-sm text-subtle">Ask someone with access to the whole cluster to run the first scan.</p>}
        </section>
      )}

      {done && cluster && (
        <>
          <nav className="flex gap-1 border-b border-border" aria-label="Security views">
            {tabs.map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                aria-current={tab === key ? "page" : undefined}
                className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                  tab === key ? "border-accent text-fg" : "border-transparent text-muted hover:text-fg"
                }`}
              >
                {label}
              </button>
            ))}
          </nav>
          {tab === "overview" && <OverviewView cluster={cluster} aiEnabled={Boolean(ai.data?.enabled)} onOpen={setOpen} onTab={setTab} />}
          {tab === "findings" && <FindingsView cluster={cluster} onOpen={setOpen} />}
          {tab === "vulnerabilities" && <VulnerabilitiesView cluster={cluster} />}
          {tab === "compliance" && <ComplianceView cluster={cluster} />}
        </>
      )}

      {open && cluster && <FindingPanel cluster={cluster} finding={open} aiEnabled={Boolean(ai.data?.enabled)} onClose={() => setOpen(null)} />}
    </div>
  );
}
