"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

import { ChevronDownIcon, ChevronIcon } from "@/components/icons";
import { NamespacePicker } from "@/components/manager/namespace-picker";
import { useScopedClusters } from "@/components/shell/status-bar";
import { api, type NodeLoad, type PodDot } from "@/lib/api";
import { bytes, cores, DEFAULT_THRESHOLDS, USAGE_BAR, usageTone } from "@/lib/usage";

const DOT: Record<PodDot["tone"], string> = { ok: "bg-healthy", warning: "bg-warning", bad: "bg-danger", done: "bg-subtle" };
type Sort = "pods" | "cpu" | "memory" | "name";

function share(used: number | null, requested: number, capacity: number) {
  return capacity ? (100 * (used ?? requested)) / capacity : 0;
}

/**
 * How pods spread across nodes: a balance score, a bar per node against its allocatable pods with
 * the average marked, node cards with usage, and nodes that look like they could go.
 */
export function PodDistribution() {
  const { current } = useScopedClusters();
  const cluster = current?.id ?? null;
  const [namespace, setNamespace] = useState("");
  const [text, setText] = useState("");
  const [sort, setSort] = useState<Sort>("pods");
  const [open, setOpen] = useState<Set<string>>(new Set());
  const namespaces = useQuery({ queryKey: ["namespaces", cluster], queryFn: () => api.namespaces(cluster!), enabled: Boolean(cluster) });
  const data = useQuery({
    queryKey: ["distribution", cluster, namespace],
    queryFn: () => api.distribution(cluster!, namespace || null),
    enabled: Boolean(cluster),
    refetchInterval: 30_000,
  });
  const d = data.data;
  const q = text.trim().toLowerCase();
  const nodes = (d?.nodes ?? [])
    .filter((n) => !q || n.name.toLowerCase().includes(q) || n.pods.some((p) => p.name.toLowerCase().includes(q)))
    .sort((a, b) =>
      sort === "name"
        ? a.name.localeCompare(b.name)
        : sort === "cpu"
          ? share(b.cpu_used, b.cpu_requested, b.cpu_capacity) - share(a.cpu_used, a.cpu_requested, a.cpu_capacity)
          : sort === "memory"
            ? share(b.memory_used, b.memory_requested, b.memory_capacity) - share(a.memory_used, a.memory_requested, a.memory_capacity)
            : b.pods.length - a.pods.length,
    );
  const most = Math.max(1, ...nodes.map((n) => Math.max(n.pods.length, n.pods_capacity)));
  const candidates = (d?.nodes ?? []).filter((n) => n.candidate);
  const toggle = (name: string) => {
    const next = new Set(open);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    setOpen(next);
  };

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-2xl font-semibold tracking-tight">Pod Distribution</h1>
        <NamespacePicker value={namespace} namespaces={namespaces.data ?? []} allowAll onChange={setNamespace} />
        <input
          type="search"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Find a node or pod"
          aria-label="Find a node or pod"
          className="h-8 w-52 rounded-lg border border-control bg-bg px-2.5 text-sm outline-none focus:border-accent"
        />
        <select aria-label="Sort nodes" value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="h-8 rounded-lg border border-control bg-bg px-2 text-sm outline-none focus:border-accent">
          <option value="pods">Sort by pods</option>
          <option value="cpu">Sort by CPU</option>
          <option value="memory">Sort by memory</option>
          <option value="name">Sort by name</option>
        </select>
      </div>

      {data.isPending && cluster && <p className="text-sm text-muted">Reading nodes and pods</p>}
      {data.error && <p className="text-sm text-danger">{data.error.message}</p>}

      {d && (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Card title="Balance">
              <span className="flex items-baseline gap-2">
                <span className="text-3xl font-semibold tabular-nums">{d.score}</span>
                <span className={d.score >= 80 ? "text-healthy" : d.score >= 50 ? "text-warning" : "text-danger"}>{d.verdict}</span>
              </span>
              <span className="text-xs text-subtle">How evenly pods spread over the nodes that take new pods</span>
            </Card>
            <Card title="Average">
              <span className="text-3xl font-semibold tabular-nums">{d.average}</span>
              <span className="text-xs text-subtle">pods per schedulable node{namespace ? `, in ${namespace}` : ""}</span>
            </Card>
            <Card title="Issues">
              {d.issues.length === 0 ? (
                <span className="text-sm text-muted">No cordoned or not-ready nodes, nothing pending</span>
              ) : (
                <ul className="flex flex-col gap-1 text-sm text-warning">
                  {d.issues.map((i) => (
                    <li key={i}>{i}</li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <section className="flex flex-col rounded-lg border border-border">
            <div className="flex items-center justify-between gap-4 px-4 py-3">
              <h2 className="font-semibold">Pods per node</h2>
              <span className="flex items-center gap-1.5 text-xs text-subtle">
                <span className="h-3 w-px bg-fg" /> average
              </span>
            </div>
            <ul className="flex flex-col border-t border-border">
              {nodes.map((n) => (
                <li key={n.name} className="border-t border-border/70 first:border-t-0">
                  <button type="button" onClick={() => toggle(n.name)} aria-expanded={open.has(n.name)} className="grid w-full grid-cols-[16px_minmax(120px,220px)_minmax(0,1fr)_80px] items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-surface">
                    {open.has(n.name) ? <ChevronDownIcon width={14} height={14} className="text-subtle" /> : <ChevronIcon width={14} height={14} className="text-subtle" />}
                    <span className="truncate font-mono text-[13px]">{n.name}</span>
                    <span className="relative h-2.5 rounded-full bg-surface-2" title={`${n.pods.length} of ${n.pods_capacity} pods`}>
                      <span className="absolute inset-y-0 left-0 rounded-full bg-accent" style={{ width: `${(100 * n.pods.length) / most}%` }} />
                      <span className="absolute -top-1 h-[18px] w-px bg-fg" style={{ left: `${(100 * d.average) / most}%` }} aria-hidden="true" />
                    </span>
                    <span className="text-right tabular-nums text-muted">
                      {n.pods.length} / {n.pods_capacity}
                    </span>
                  </button>
                  {open.has(n.name) && (
                    <div className="flex flex-wrap gap-1 px-4 pb-3 pl-11">
                      {n.pods.map((p) => (
                        <span key={`${p.namespace}/${p.name}`} title={`${p.namespace}/${p.name} · ${p.phase}`} className={`h-3 w-3 rounded-[3px] ${DOT[p.tone]}`} />
                      ))}
                      {n.pods.length === 0 && <span className="text-sm text-muted">No pods</span>}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>

          {d.pending.length > 0 && cluster && (
            <section className="flex flex-col gap-2 rounded-lg border border-border p-4">
              <h2 className="font-semibold">Pending pods</h2>
              <p className="text-sm text-muted">No node has taken these yet. Cluster Doctor explains why (resources, taints, affinity, volumes)</p>
              <ul className="flex flex-col">
                {d.pending.map((p) => (
                  <li key={`${p.namespace}/${p.name}`} className="flex items-center gap-3 border-t border-border/70 py-2 text-sm first:border-t-0">
                    <span className="h-2 w-2 rounded-full bg-warning" />
                    <span className="min-w-0 flex-1 truncate font-mono text-[13px]">
                      {p.namespace}/{p.name}
                    </span>
                    <Link
                      href={`/doctor?${new URLSearchParams({ cluster, namespace: p.namespace, focus: `Pod/${p.namespace}/${p.name}` })}`}
                      className="text-sm font-medium text-accent hover:underline"
                    >
                      Investigate
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {nodes.map((n) => (
              <NodeCard key={n.name} node={n} metrics={d.metrics} />
            ))}
          </div>

          <section className="flex flex-col gap-2 rounded-lg border border-border p-4">
            <h2 className="font-semibold">Scale-down candidates</h2>
            {namespace ? (
              <p className="text-sm text-muted">Shown for all namespaces only, since every pod counts</p>
            ) : candidates.length === 0 ? (
              <p className="text-sm text-muted">None. Every worker node runs enough pods, or is tainted, cordoned or not ready</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {candidates.map((n) => (
                  <li key={n.name} className="text-sm">
                    <span className="font-mono text-[13px] font-medium">{n.name}</span>
                    <p className="text-muted">{n.candidate}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-border p-4">
      <span className="text-sm font-medium text-muted">{title}</span>
      {children}
    </div>
  );
}

function Ring({ value, max }: { value: number; max: number }) {
  const r = 22;
  const c = 2 * Math.PI * r;
  const part = max ? Math.min(1, value / max) : 0;
  return (
    <svg viewBox="0 0 56 56" width="56" height="56" role="img" aria-label={`${value} of ${max} pods`}>
      <circle cx="28" cy="28" r={r} fill="none" stroke="var(--surface-2)" strokeWidth="6" />
      <circle
        cx="28"
        cy="28"
        r={r}
        fill="none"
        stroke="var(--accent)"
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray={`${part * c} ${c}`}
        transform="rotate(-90 28 28)"
      />
      <text x="28" y="32" textAnchor="middle" fontSize="12" fontWeight="600" fill="var(--text)">
        {value}
      </text>
    </svg>
  );
}

function Bar({ label, used, requested, capacity, format }: { label: string; used: number | null; requested: number; capacity: number; format: (n: number) => string }) {
  const value = used ?? requested;
  const pct = capacity ? (100 * value) / capacity : 0;
  return (
    <div className="grid grid-cols-[60px_minmax(0,1fr)_auto] items-center gap-2 text-xs" title={`${format(value)} of ${format(capacity)}${used === null ? " requested" : ""}`}>
      <span className="text-muted">{label}</span>
      <span className="h-1.5 overflow-hidden rounded-full bg-surface-2">
        <span className={`block h-full rounded-full ${USAGE_BAR[usageTone(pct, DEFAULT_THRESHOLDS)]}`} style={{ width: `${Math.min(100, pct)}%` }} />
      </span>
      <span className="tabular-nums text-muted">
        {format(value)} / {format(capacity)}
        {used === null ? " req" : ""}
      </span>
    </div>
  );
}

function NodeCard({ node, metrics }: { node: NodeLoad; metrics: boolean }) {
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <div className="flex items-center gap-3">
        <Ring value={node.pods.length} max={node.pods_capacity} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="truncate font-mono text-[13px] font-medium">{node.name}</span>
          <span className="flex flex-wrap gap-1.5 text-xs">
            <span className={node.ready ? "text-healthy" : "text-danger"}>{node.ready ? "Ready" : "Not ready"}</span>
            {node.unschedulable && <span className="text-warning">Cordoned</span>}
            <span className="text-subtle">{node.roles.join(", ")}</span>
          </span>
          <span className="text-xs text-muted">
            {node.running} running · {node.pending} pending · {node.failed} failed
          </span>
        </div>
      </div>
      <Bar label="CPU" used={metrics ? node.cpu_used : null} requested={node.cpu_requested} capacity={node.cpu_capacity} format={cores} />
      <Bar label="Memory" used={metrics ? node.memory_used : null} requested={node.memory_requested} capacity={node.memory_capacity} format={bytes} />
      {node.taints.length > 0 && (
        <p className="truncate font-mono text-[11px] text-subtle" title={node.taints.join("\n")}>
          {node.taints.join(", ")}
        </p>
      )}
      {node.candidate && <p className="text-xs text-accent">Could be removed</p>}
    </section>
  );
}
