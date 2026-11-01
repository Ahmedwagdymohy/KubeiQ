"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { KindIcon } from "@/components/manager/kind-icons";
import { kindResource, SEVERITIES, SeverityPill, SYSTEM_REASON, targetLabel } from "@/components/security/shared";
import { api, type SecurityFinding, type SecuritySeverity } from "@/lib/api";

const CATEGORIES: [SecurityFinding["category"] | "all", string][] = [
  ["all", "All areas"],
  ["workload", "Workloads"],
  ["access", "Access (RBAC)"],
  ["network", "Network"],
  ["cluster", "Cluster"],
];

/** Every finding, highest risk first, with filters. Kubernetes' own objects are hidden by default. */
export function FindingsView({ cluster, onOpen }: { cluster: string; onOpen: (f: SecurityFinding) => void }) {
  const data = useQuery({ queryKey: ["security-findings", cluster], queryFn: () => api.securityFindings(cluster) });
  const [severity, setSeverity] = useState<SecuritySeverity | "all">("all");
  const [category, setCategory] = useState<SecurityFinding["category"] | "all">("all");
  const [namespace, setNamespace] = useState("");
  const [text, setText] = useState("");
  const [system, setSystem] = useState(false);
  const all = useMemo(() => data.data ?? [], [data.data]);
  const namespaces = useMemo(() => [...new Set(all.map((f) => f.target.namespace ?? ""))].sort(), [all]);
  const q = text.trim().toLowerCase();
  const hiddenSystem = all.filter((f) => f.reasons.includes(SYSTEM_REASON)).length;
  const shown = all.filter(
    (f) =>
      (system || !f.reasons.includes(SYSTEM_REASON)) &&
      (severity === "all" || f.severity === severity) &&
      (category === "all" || f.category === category) &&
      (!namespace || (f.target.namespace ?? "") === namespace) &&
      (!q || `${f.title} ${f.target.kind} ${targetLabel(f.target)} ${f.checks.map((c) => c.id).join(" ")}`.toLowerCase().includes(q)),
  );
  const filtered = severity !== "all" || category !== "all" || namespace !== "" || q !== "";

  if (data.isPending) return <p className="text-sm text-muted">Reading findings</p>;
  if (data.error) return <p className="text-sm text-danger">{data.error.message}</p>;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-control p-0.5 text-sm" role="group" aria-label="Severity">
          {(["all", ...SEVERITIES] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSeverity(s)}
              aria-pressed={severity === s}
              className={`rounded-md px-2.5 py-1 capitalize ${severity === s ? "bg-surface-2 font-medium text-fg" : "text-muted hover:text-fg"}`}
            >
              {s}
            </button>
          ))}
        </div>
        <select
          aria-label="Area"
          value={category}
          onChange={(e) => setCategory(e.target.value as typeof category)}
          className="h-8 rounded-lg border border-control bg-bg px-2 text-sm outline-none focus:border-accent"
        >
          {CATEGORIES.map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
        <select
          aria-label="Namespace"
          value={namespace}
          onChange={(e) => setNamespace(e.target.value)}
          className="h-8 rounded-lg border border-control bg-bg px-2 text-sm outline-none focus:border-accent"
        >
          <option value="">All namespaces</option>
          {namespaces.map((n) => (
            <option key={n || "-"} value={n}>
              {n || "Cluster-wide"}
            </option>
          ))}
        </select>
        <input
          type="search"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Find a finding or object"
          aria-label="Find a finding or object"
          className="h-8 w-56 rounded-lg border border-control bg-bg px-2.5 text-sm outline-none focus:border-accent"
        />
        <label className="ml-auto flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" checked={system} onChange={(e) => setSystem(e.target.checked)} className="accent-accent" />
          Show Kubernetes&apos; own ({hiddenSystem})
        </label>
      </div>

      <section className="overflow-hidden rounded-lg border border-border">
        <div className="hidden grid-cols-[88px_minmax(0,1fr)_minmax(0,0.9fr)_140px] gap-3 border-b border-border px-4 py-2 text-xs font-medium text-subtle md:grid">
          <span>Severity</span>
          <span>Finding</span>
          <span>Object</span>
          <span>Found by</span>
        </div>
        {shown.length === 0 && (
          <p className="flex items-center gap-3 px-4 py-6 text-sm text-muted">
            {filtered ? "Nothing matches these filters" : "No findings"}
            {filtered && (
              <button
                type="button"
                onClick={() => {
                  setSeverity("all");
                  setCategory("all");
                  setNamespace("");
                  setText("");
                }}
                className="text-accent hover:underline"
              >
                Clear filters
              </button>
            )}
          </p>
        )}
        <ul>
          {shown.map((f) => (
            <li key={f.key} className="border-t border-border/70 first:border-t-0">
              <button
                type="button"
                onClick={() => onOpen(f)}
                className="grid w-full grid-cols-[88px_minmax(0,1fr)] items-center gap-x-3 gap-y-1 px-4 py-2.5 text-left hover:bg-surface md:grid-cols-[88px_minmax(0,1fr)_minmax(0,0.9fr)_140px]"
              >
                <SeverityPill severity={f.severity} />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-medium">{f.title}</span>
                  {f.reasons.filter((r) => r !== SYSTEM_REASON).length > 0 && (
                    <span className="truncate text-xs text-warning">{f.reasons.filter((r) => r !== SYSTEM_REASON).join(" · ")}</span>
                  )}
                </span>
                <span className="col-start-2 flex min-w-0 items-center gap-1.5 text-sm text-muted md:col-start-auto">
                  <KindIcon resource={kindResource(f.target.kind)} width={14} height={14} className="shrink-0 text-subtle" />
                  <span className="truncate">
                    <span className="text-subtle">{f.target.kind} </span>
                    {targetLabel(f.target)}
                  </span>
                </span>
                <span className="hidden text-xs capitalize text-subtle md:block">{[...new Set(f.checks.map((c) => c.tool))].sort().join(" + ")}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
      <p className="text-xs text-subtle">
        {shown.length} of {all.length} findings. The same problem reported by both scanners, or by several checks, shows once.
      </p>
    </div>
  );
}
