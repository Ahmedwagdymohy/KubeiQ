"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { SeverityPill } from "@/components/security/shared";
import { api, type SecurityControl } from "@/lib/api";

const STATUS: Record<SecurityControl["status"], { label: string; tone: string }> = {
  failed: { label: "Failed", tone: "text-danger" },
  passed: { label: "Passed", tone: "text-healthy" },
  skipped: { label: "Not checked", tone: "text-subtle" },
};

/** NSA-CISA, MITRE ATT&CK and CIS (Kubescape): each control, pass or fail, and why some are skipped. */
export function ComplianceView({ cluster }: { cluster: string }) {
  const data = useQuery({ queryKey: ["security-controls", cluster], queryFn: () => api.securityControls(cluster), retry: false });
  const frameworks = useMemo(() => [...new Set((data.data ?? []).map((c) => c.framework))], [data.data]);
  const [picked, setPicked] = useState<string | null>(null);
  const [status, setStatus] = useState<SecurityControl["status"] | "all">("failed");
  const framework = picked ?? frameworks[0] ?? null;

  if (data.isPending) return <p className="text-sm text-muted">Reading controls</p>;
  if (data.error) return <p className="text-sm text-muted">{data.error.message}</p>;
  if (!framework) return <p className="text-sm text-muted">Kubescape did not run in the last scan.</p>;
  const controls = (data.data ?? []).filter((c) => c.framework === framework);
  const shown = controls.filter((c) => status === "all" || c.status === status);
  const count = (s: SecurityControl["status"]) => controls.filter((c) => c.status === s).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-control p-0.5 text-sm" role="group" aria-label="Framework">
          {frameworks.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setPicked(f)}
              aria-pressed={framework === f}
              className={`rounded-md px-2.5 py-1 ${framework === f ? "bg-surface-2 font-medium text-fg" : "text-muted hover:text-fg"}`}
            >
              {f}
            </button>
          ))}
        </div>
        <div className="flex rounded-lg border border-control p-0.5 text-sm" role="group" aria-label="Status">
          {(["failed", "passed", "skipped", "all"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              aria-pressed={status === s}
              className={`rounded-md px-2.5 py-1 ${status === s ? "bg-surface-2 font-medium text-fg" : "text-muted hover:text-fg"}`}
            >
              {s === "all" ? "All" : STATUS[s].label} {s !== "all" && <span className="tabular-nums text-subtle">{count(s)}</span>}
            </button>
          ))}
        </div>
      </div>

      <ul className="flex flex-col overflow-hidden rounded-lg border border-border">
        {shown.length === 0 && <li className="px-4 py-6 text-sm text-muted">No controls here</li>}
        {shown.map((c) => (
          <li key={c.id} className="grid grid-cols-[88px_minmax(0,1fr)] items-center gap-x-3 gap-y-1 border-t border-border/70 px-4 py-2.5 text-sm first:border-t-0 md:grid-cols-[88px_72px_minmax(0,1fr)_160px]">
            <span className={`text-xs font-semibold ${STATUS[c.status].tone}`}>{STATUS[c.status].label}</span>
            <span className="hidden font-mono text-xs text-subtle md:block">{c.id}</span>
            <span className="flex min-w-0 flex-col">
              <span className="truncate font-medium" title={c.name}>
                {c.name}
              </span>
              {c.note && <span className="truncate text-xs text-subtle">{c.note}</span>}
            </span>
            <span className="col-start-2 flex items-center gap-2 md:col-start-auto md:justify-end">
              <SeverityPill severity={c.severity} />
              {c.status !== "skipped" && (
                <span className="text-xs tabular-nums text-subtle">
                  {c.failed} of {c.failed + c.passed} fail
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
