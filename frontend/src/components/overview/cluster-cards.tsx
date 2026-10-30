"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

import { timeAgo } from "@/components/doctor/history-list";
import { KindIcon } from "@/components/manager/kind-icons";
import { Modal } from "@/components/modal";
import type { ClusterHealth } from "@/components/overview/use-fleet";
import { LabelChip, LabelList } from "@/components/settings/cluster-labels";
import { METHOD_LABEL } from "@/components/settings/cluster-dialog";
import { secondaryButton } from "@/components/settings/fields";
import { Sparkline } from "@/components/sparkline";
import { Dot } from "@/components/ui";
import { useMe } from "@/hooks/use-me";
import { useWorkspace } from "@/hooks/use-workspace";
import { api, type ClusterHealthState, type ClusterSummary, type Gauge, type Thresholds } from "@/lib/api";
import { investigateHref, managerHref } from "@/lib/fleet";
import { bytes, cores, DEFAULT_THRESHOLDS, percent, USAGE_BAR, usageTone } from "@/lib/usage";

export type CardSize = "glance" | "standard" | "detailed" | "full";
export type CardSort = "name" | "health" | "cpu" | "memory";
export const SIZES: [CardSize, string][] = [
  ["glance", "Glance"],
  ["standard", "Standard"],
  ["detailed", "Detailed"],
  ["full", "Full"],
];

const HEALTH: Record<ClusterHealthState, { label: string; tone: string; text: string }> = {
  healthy: { label: "Healthy", tone: "healthy", text: "text-healthy" },
  degraded: { label: "Degraded", tone: "warning", text: "text-warning" },
  unhealthy: { label: "Unhealthy", tone: "critical", text: "text-danger" },
  "no-access": { label: "No access", tone: "warning", text: "text-warning" },
  offline: { label: "Offline", tone: "critical", text: "text-danger" },
};
const RANK: ClusterHealthState[] = ["offline", "unhealthy", "no-access", "degraded", "healthy"];
const GRID: Record<CardSize, string> = {
  glance: "sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4",
  standard: "md:grid-cols-2 2xl:grid-cols-3",
  detailed: "lg:grid-cols-2",
  full: "xl:grid-cols-2",
};

function useSummary(id: string, enabled: boolean) {
  return useQuery({
    queryKey: ["cluster-summary", id],
    queryFn: () => api.clusterSummary(id),
    enabled,
    refetchInterval: 30_000,
  });
}

/**
 * The fleet as cards: one per cluster, at the size the user picked, filtered by labels (cards
 * that do not match dim, so the fleet stays in view) and sorted by name, health or usage.
 */
export function ClusterCards({
  health,
  size,
  sort,
  labels,
}: {
  health: ClusterHealth[];
  size: CardSize;
  sort: CardSort;
  labels: string[];
}) {
  const [open, setOpen] = useState<ClusterHealth | null>(null);
  const summaries = useQuery({
    queryKey: ["cluster-summaries", health.map((h) => h.cluster.id).join(",")],
    queryFn: () => Promise.all(health.map((h) => api.clusterSummary(h.cluster.id).catch(() => null))),
    enabled: sort !== "name" && health.length > 0,
    refetchInterval: 60_000,
  });
  const byId = new Map(health.map((h, i) => [h.cluster.id, summaries.data?.[i] ?? null]));
  const key = (h: ClusterHealth) => {
    const s = byId.get(h.cluster.id);
    if (sort === "health") return RANK.indexOf(s?.health ?? "healthy");
    if (sort === "cpu") return -(s?.cpu ? percent(s.cpu) : -1);
    if (sort === "memory") return -(s?.memory ? percent(s.memory) : -1);
    return 0;
  };
  const ordered = [...health].sort((a, b) => key(a) - key(b) || a.cluster.name.localeCompare(b.cluster.name));
  const matches = (h: ClusterHealth) =>
    labels.length === 0 || labels.every((l) => h.cluster.labels?.some((c) => c.name === l));

  return (
    <>
      <div className={`grid grid-cols-1 gap-4 ${GRID[size]}`}>
        {ordered.map((h) => (
          <ClusterCard key={h.cluster.id} health={h} size={size} dim={!matches(h)} onOpen={() => setOpen(h)} />
        ))}
      </div>
      {open && (
        <Modal title={open.cluster.name} description={`${METHOD_LABEL[open.cluster.method]} · ${open.cluster.status?.version ?? ""}`} onClose={() => setOpen(null)} wide>
          <div className="p-5">
            <CardBody health={open} size="full" large />
          </div>
        </Modal>
      )}
    </>
  );
}

function ClusterCard({ health, size, dim, onOpen }: { health: ClusterHealth; size: CardSize; dim: boolean; onOpen: () => void }) {
  const { cluster } = health;
  const summary = useSummary(cluster.id, true);
  const state = summary.data ? HEALTH[summary.data.health] : null;
  return (
    <section
      className={`flex flex-col gap-4 rounded-lg border border-border bg-bg p-4 transition-opacity ${dim ? "opacity-40" : ""}`}
      aria-label={cluster.name}
    >
      <header className="flex items-start gap-3">
        <span className="mt-1.5">
          <Dot tone={state?.tone ?? "info"} pulse={summary.isPending} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <button type="button" onClick={onOpen} className="min-w-0 truncate text-left font-mono text-[14px] font-medium hover:underline">
            {cluster.name}
          </button>
          <span className="text-xs text-subtle">
            {[cluster.status?.version && `Kubernetes ${cluster.status.version}`, METHOD_LABEL[cluster.method]]
              .filter(Boolean)
              .join(" · ")}
          </span>
          {size !== "glance" && <LabelList labels={cluster.labels} max={4} />}
        </div>
        {state && <span className={`shrink-0 text-sm font-medium ${state.text}`}>{state.label}</span>}
      </header>
      <CardBody health={health} size={size} />
      <button type="button" onClick={onOpen} className="self-start text-sm font-medium text-muted transition-colors hover:text-fg">
        Open
      </button>
    </section>
  );
}

function CardBody({ health, size, large = false }: { health: ClusterHealth; size: CardSize; large?: boolean }) {
  const { cluster } = health;
  const admin = useMe().data?.role === "admin";
  const workspace = useWorkspace();
  const summary = useSummary(cluster.id, true);
  const s = summary.data;
  const detailed = size === "detailed" || size === "full";
  const usage = useQuery({
    queryKey: ["usage", cluster.id, 24],
    queryFn: () => api.usage(cluster.id, 24),
    enabled: detailed && Boolean(s?.nodes !== null && s?.health !== "offline"),
    refetchInterval: 60_000,
  });
  const events = useQuery({
    queryKey: ["feed", cluster.id, "warnings", 5],
    queryFn: () => api.feed(cluster.id, { warnings: true, limit: 5 }),
    enabled: size === "full" && s?.health !== "offline" && s?.health !== "no-access",
    refetchInterval: 30_000,
  });
  if (!s) return <div className="h-16 rounded-md bg-surface" />;

  if (s.health === "offline" || s.health === "no-access")
    return (
      <div className="flex flex-col gap-2 rounded-md bg-surface p-3 text-sm">
        <p className="break-words text-muted">{s.reason ?? (s.health === "offline" ? "Cluster unreachable" : "KubeiQ cannot read this cluster")}</p>
        {admin && (
          <Link href="/settings#clusters" className="self-start font-medium text-accent hover:underline">
            Fix in Settings
          </Link>
        )}
      </div>
    );

  const metricsOff = cluster.settings?.metrics === false || !workspace.show_usage;
  const thresholds = cluster.settings ?? { cpu: DEFAULT_THRESHOLDS, memory: DEFAULT_THRESHOLDS };
  const failing = health.workloads.filter((w) => w.status !== "healthy");

  return (
    <div className="flex flex-col gap-4">
      <dl className={`grid gap-3 text-sm ${size === "glance" ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-4"}`}>
        <Stat label="Nodes" value={s.nodes_ready === s.nodes ? `${s.nodes}` : `${s.nodes_ready} of ${s.nodes} ready`} warn={s.nodes_ready !== s.nodes} />
        <Stat label="Pods running" value={`${s.pods_running} of ${s.pods}`} />
        {size !== "glance" && <Stat label="Namespaces" value={`${s.namespaces}`} />}
        {size !== "glance" && <Stat label="Workloads" value={health.state === "ready" ? `${health.workloads.length}` : "-"} />}
        {size === "glance" && !metricsOff && s.cpu && <Stat label="CPU" value={`${Math.round(percent(s.cpu))}%`} />}
        {size === "glance" && !metricsOff && s.memory && <Stat label="Memory" value={`${Math.round(percent(s.memory))}%`} />}
      </dl>

      {size !== "glance" && !metricsOff && (
        <div className="flex flex-col gap-2.5">
          {s.cpu && <Meter label="CPU" gauge={s.cpu} t={thresholds.cpu} detail={detailed ? `${cores(s.cpu.used)} of ${cores(s.cpu.capacity)} cores` : null} />}
          {s.memory && <Meter label="Memory" gauge={s.memory} t={thresholds.memory} detail={detailed ? `${bytes(s.memory.used)} of ${bytes(s.memory.capacity)}` : null} />}
          {s.disk && <Meter label="Disk" gauge={s.disk} t={DEFAULT_THRESHOLDS} detail={detailed ? `${bytes(s.disk.used)} of ${bytes(s.disk.capacity)}` : null} />}
          {!s.metrics && <MetricsMissing summary={s} />}
        </div>
      )}
      {size === "glance" && !metricsOff && !s.metrics && <MetricsMissing summary={s} />}

      {detailed && !metricsOff && s.metrics && (
        <div className={`grid gap-4 ${large ? "" : "sm:grid-cols-2"}`}>
          <Trend label="CPU, 24 hours" field="cpu" points={usage.data ?? []} large={large} />
          <Trend label="Memory, 24 hours" field="memory" points={usage.data ?? []} large={large} />
        </div>
      )}

      {detailed && (
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-medium text-subtle">
            {failing.length ? `Failing workloads (${failing.length})` : "Workloads"}
          </p>
          {health.state !== "ready" ? (
            <p className="text-sm text-muted">Reading workloads</p>
          ) : failing.length === 0 ? (
            <p className="text-sm text-muted">All {health.workloads.length} workloads are healthy</p>
          ) : (
            <ul className="flex flex-col">
              {failing.slice(0, large ? 10 : 3).map((w) => (
                <li key={w.ref} className="flex items-center gap-2 border-t border-border/70 py-2 text-sm first:border-t-0">
                  <Dot tone={w.status === "error" ? "critical" : "warning"} />
                  <Link href={managerHref(cluster.id, w)} className="min-w-0 flex-1 truncate hover:underline">
                    <span className="font-medium">{w.name}</span>
                    <span className="ml-2 text-xs text-subtle">{w.reason ?? `${w.kind} in ${w.namespace}`}</span>
                  </Link>
                  <Link href={investigateHref(cluster.id, w)} className="shrink-0 text-sm font-medium text-accent hover:underline">
                    Investigate
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {size === "full" && (
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-medium text-subtle">Latest warnings</p>
          {events.data?.length === 0 && <p className="text-sm text-muted">No warning events</p>}
          <ul className="flex flex-col">
            {events.data?.map((e, i) => (
              <li key={i} className="flex items-start gap-2 border-t border-border/70 py-2 text-sm first:border-t-0">
                <span className="mt-0.5 text-warning">
                  <KindIcon resource={(e.kind ?? "").toLowerCase() + "s"} width={14} height={14} />
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate">
                    <span className="font-medium">{e.reason}</span>
                    <span className="ml-2 font-mono text-xs text-subtle">
                      {e.kind}/{e.name}
                    </span>
                  </span>
                  <span className="line-clamp-2 text-xs text-muted">{e.message}</span>
                </span>
                <span className="shrink-0 text-xs text-subtle">{e.last_seen ? timeAgo(e.last_seen) : ""}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {large && (
        <div className="flex flex-wrap gap-2">
          <Link href={`/doctor?cluster=${encodeURIComponent(cluster.id)}`} className={secondaryButton}>
            Investigate
          </Link>
          <Link href={`/map?cluster=${encodeURIComponent(cluster.id)}`} className={secondaryButton}>
            Open Map
          </Link>
          {cluster.labels?.map((l) => <LabelChip key={l.name} label={l} />)}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, warn = false }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="flex flex-col">
      <dt className="text-xs text-subtle">{label}</dt>
      <dd className={`tabular-nums ${warn ? "text-warning" : "text-fg"} font-medium`}>{value}</dd>
    </div>
  );
}

function Meter({ label, gauge, t, detail }: { label: string; gauge: Gauge; t: Thresholds; detail: string | null }) {
  const value = percent(gauge);
  return (
    <div className="grid grid-cols-[64px_minmax(0,1fr)_auto] items-center gap-3 text-sm" title={`${label}: ${Math.round(value)}%`}>
      <span className="text-muted">{label}</span>
      <span className="h-1.5 overflow-hidden rounded-full bg-surface-2">
        <span className={`block h-full rounded-full ${USAGE_BAR[usageTone(value, t)]}`} style={{ width: `${Math.min(100, value)}%` }} />
      </span>
      <span className="text-right tabular-nums text-muted">
        {Math.round(value)}%{detail && <span className="ml-2 text-xs text-subtle">{detail}</span>}
      </span>
    </div>
  );
}

function MetricsMissing({ summary }: { summary: ClusterSummary }) {
  return (
    <p className="text-xs text-subtle" title="kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml">
      {summary.metrics_error ?? "Usage needs metrics-server"}
    </p>
  );
}

function Trend({ label, field, points, large }: { label: string; field: "cpu" | "memory"; points: Parameters<typeof Sparkline>[0]["points"]; large: boolean }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs text-subtle">{label}</span>
      <Sparkline points={points} field={field} label={label} height={large ? 96 : 36} />
    </div>
  );
}
