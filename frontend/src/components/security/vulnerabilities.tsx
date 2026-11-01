"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { ChevronDownIcon, ChevronIcon } from "@/components/icons";
import { SEVERITIES, SeverityCounts, SeverityPill, targetLabel } from "@/components/security/shared";
import { api, type SecuritySeverity, type SecurityVulnerability } from "@/lib/api";

type Image = {
  image: string;
  vulns: SecurityVulnerability[];
  counts: Record<SecuritySeverity, number>;
  fixable: number;
  workloads: string[];
};

/** Known CVEs per image (Trivy), worst images first; an image opens into its CVEs. */
export function VulnerabilitiesView({ cluster }: { cluster: string }) {
  const data = useQuery({ queryKey: ["security-vulnerabilities", cluster], queryFn: () => api.securityVulnerabilities(cluster) });
  const [min, setMin] = useState<SecuritySeverity>("high");
  const [fixable, setFixable] = useState(false);
  const [text, setText] = useState("");
  const [open, setOpen] = useState<Set<string>>(new Set());
  const q = text.trim().toLowerCase();
  const images = useMemo(() => {
    const by = new Map<string, Image>();
    for (const v of data.data ?? []) {
      if (SEVERITIES.indexOf(v.severity) > SEVERITIES.indexOf(min)) continue;
      if (fixable && !v.fixed) continue;
      if (q && !`${v.image} ${v.id} ${v.package} ${v.title}`.toLowerCase().includes(q)) continue;
      const row = by.get(v.image) ?? { image: v.image, vulns: [], counts: { critical: 0, high: 0, medium: 0, low: 0 }, fixable: 0, workloads: [] };
      row.vulns.push(v);
      row.counts[v.severity] += 1;
      if (v.fixed) row.fixable += 1;
      for (const w of v.workloads) {
        const label = `${w.kind} ${targetLabel(w)}`;
        if (!row.workloads.includes(label)) row.workloads.push(label);
      }
      by.set(v.image, row);
    }
    return [...by.values()].sort((a, b) => b.counts.critical - a.counts.critical || b.counts.high - a.counts.high || b.vulns.length - a.vulns.length);
  }, [data.data, min, fixable, q]);
  const toggle = (image: string) => {
    const next = new Set(open);
    if (next.has(image)) next.delete(image);
    else next.add(image);
    setOpen(next);
  };

  if (data.isPending) return <p className="text-sm text-muted">Reading vulnerabilities</p>;
  if (data.error) return <p className="text-sm text-danger">{data.error.message}</p>;
  if ((data.data ?? []).length === 0)
    return <p className="text-sm text-muted">No known vulnerabilities in the scanned images, or Trivy could not read them.</p>;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="Lowest severity"
          value={min}
          onChange={(e) => setMin(e.target.value as SecuritySeverity)}
          className="h-8 rounded-lg border border-control bg-bg px-2 text-sm outline-none focus:border-accent"
        >
          <option value="critical">Critical only</option>
          <option value="high">High and above</option>
          <option value="medium">Medium and above</option>
          <option value="low">All</option>
        </select>
        <label className="flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" checked={fixable} onChange={(e) => setFixable(e.target.checked)} className="accent-accent" />
          Only with a fix
        </label>
        <input
          type="search"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Find an image, CVE or package"
          aria-label="Find an image, CVE or package"
          className="h-8 w-60 rounded-lg border border-control bg-bg px-2.5 text-sm outline-none focus:border-accent"
        />
      </div>

      <ul className="flex flex-col overflow-hidden rounded-lg border border-border">
        {images.length === 0 && <li className="px-4 py-6 text-sm text-muted">Nothing matches these filters</li>}
        {images.map((img) => (
          <li key={img.image} className="border-t border-border/70 first:border-t-0">
            <button type="button" onClick={() => toggle(img.image)} aria-expanded={open.has(img.image)} className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-left hover:bg-surface">
              {open.has(img.image) ? <ChevronDownIcon className="text-subtle" /> : <ChevronIcon className="text-subtle" />}
              <span className="min-w-0 flex-1 truncate font-mono text-sm">{img.image}</span>
              <SeverityCounts counts={img.counts} />
              <span className="text-xs text-subtle">{img.fixable} with a fix</span>
            </button>
            {open.has(img.image) && (
              <div className="flex flex-col gap-2 border-t border-border/70 bg-surface/50 px-4 py-3">
                <p className="text-xs text-subtle">Used by {img.workloads.join(", ")}</p>
                <ul className="flex flex-col">
                  {img.vulns.map((v) => (
                    <li key={`${v.id}:${v.package}`} className="grid grid-cols-[72px_minmax(0,1fr)] gap-x-3 gap-y-0.5 border-t border-border/50 py-2 text-sm first:border-t-0 sm:grid-cols-[72px_150px_minmax(0,1fr)_minmax(0,0.8fr)]">
                      <SeverityPill severity={v.severity} />
                      {v.url ? (
                        <a href={v.url} target="_blank" rel="noreferrer" className="font-mono text-xs text-accent hover:underline">
                          {v.id}
                        </a>
                      ) : (
                        <span className="font-mono text-xs">{v.id}</span>
                      )}
                      <span className="col-start-2 truncate text-muted sm:col-start-auto" title={v.title}>
                        {v.title || v.package}
                      </span>
                      <span className="col-start-2 font-mono text-xs text-subtle sm:col-start-auto">
                        {v.package} {v.installed}
                        {v.fixed ? <span className="text-healthy"> → {v.fixed}</span> : " (no fix yet)"}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
