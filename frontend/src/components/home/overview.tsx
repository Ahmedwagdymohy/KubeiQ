"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

import { headline, timeAgo, tone } from "@/components/doctor/history-list";
import { AINotice } from "@/components/home/ai-notice";
import { Dot, Panel, Skeleton } from "@/components/ui";
import { useAllNamespaces } from "@/hooks/use-me";
import { api, type Cluster, type MapStatus } from "@/lib/api";
import {
  byNamespace,
  clusterName,
  countBy,
  investigateHref,
  managerHref,
  workloadsFromMap,
  type Workload,
} from "@/lib/fleet";

const CELL: Record<MapStatus, string> = {
  healthy: "bg-accent/70 hover:bg-accent",
  warning: "bg-warning",
  error: "bg-danger",
};
const FAILING_ROWS = 5;

const linkText = "text-sm text-muted transition-colors hover:text-fg";

export function Overview() {
  const clusters = useQuery({ queryKey: ["clusters"], queryFn: api.clusters });
  const [chosen, setChosen] = useState<string | null>(null);
  const cluster =
    chosen ?? clusters.data?.find((c) => c.is_default)?.id ?? clusters.data?.[0]?.id ?? null;
  const allNamespaces = useAllNamespaces(cluster);
  const namespaces = useQuery({
    queryKey: ["namespaces", cluster],
    queryFn: () => api.namespaces(cluster!),
    enabled: Boolean(cluster) && !allNamespaces,
  });
  const scope = allNamespaces ? null : (namespaces.data?.[0] ?? null);
  const map = useQuery({
    queryKey: ["map", cluster, scope ?? ""],
    queryFn: () => api.map(cluster!, scope),
    enabled: Boolean(cluster) && (allNamespaces || Boolean(scope)),
    refetchInterval: 30_000,
  });

  const workloads = map.data ? workloadsFromMap(map.data) : [];
  const failing = workloads.filter((w) => w.status !== "healthy");
  const name = cluster ? clusterName(cluster) : "";

  return (
    <main className="flex flex-1 flex-col gap-4 px-5 py-5 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-4 pb-2">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
          <p className="text-muted">
            {!map.data
              ? "Reading cluster health"
              : failing.length
                ? `${failing.length} of ${workloads.length} workloads need attention in ${name}`
                : `All ${workloads.length} workloads are healthy in ${name}`}
          </p>
          <AINotice />
        </div>
        <div className="flex items-center gap-4">
          {map.data && (
            <button
              type="button"
              onClick={() => map.refetch()}
              className={`hidden sm:inline ${linkText}`}
              title="Refresh"
            >
              Updated{" "}
              {new Date(map.data.collected_at).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </button>
          )}
          {cluster && (
            <Link
              href={`/doctor?cluster=${encodeURIComponent(cluster)}${scope ? `&namespace=${encodeURIComponent(scope)}` : ""}`}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-ink transition-opacity hover:opacity-85"
            >
              Investigate Cluster
            </Link>
          )}
        </div>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-4 lg:col-span-2">
          <Panel
            title="Workload Health"
            action={
              clusters.data && clusters.data.length > 1 ? (
                <ClusterSelect clusters={clusters.data} value={cluster} onChange={setChosen} />
              ) : (
                <span className="text-sm text-muted">{name}</span>
              )
            }
          >
            <HealthBlock
              loading={map.isPending}
              error={map.error?.message}
              onRetry={() => map.refetch()}
              cluster={cluster}
              workloads={workloads}
            />
          </Panel>
          <Panel
            title="Recent Investigations"
            action={
              <Link href="/doctor" className={linkText}>
                View all
              </Link>
            }
          >
            <RecentInvestigations />
          </Panel>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <Panel
            title="Failing Now"
            action={
              cluster && (
                <Link href={`/map?cluster=${encodeURIComponent(cluster)}`} className={linkText}>
                  Open map
                </Link>
              )
            }
          >
            <FailingList
              loading={map.isPending}
              cluster={cluster}
              failing={failing}
              checked={workloads.length}
            />
          </Panel>
          <Panel
            title="Clusters"
            action={
              <Link href="/settings#clusters" className={linkText}>
                Manage
              </Link>
            }
          >
            <ClusterList />
          </Panel>
        </div>
      </div>
    </main>
  );
}

function ClusterSelect({
  clusters,
  value,
  onChange,
}: {
  clusters: Cluster[];
  value: string | null;
  onChange: (id: string) => void;
}) {
  return (
    <select
      aria-label="Cluster"
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-md border border-control bg-bg px-2 py-1 text-sm text-fg outline-none focus:border-accent"
    >
      {clusters.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </select>
  );
}

function Figure({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "danger" | "warning";
}) {
  const color =
    value && tone === "danger"
      ? "text-danger"
      : value && tone === "warning"
        ? "text-warning"
        : value
          ? "text-fg"
          : "text-subtle";
  return (
    <div className="flex flex-col gap-1 px-5 py-4">
      <span className="text-sm text-muted">{label}</span>
      <span className={`text-2xl font-medium ${color}`}>{value}</span>
    </div>
  );
}

function HealthBlock({
  loading,
  error,
  onRetry,
  cluster,
  workloads,
}: {
  loading: boolean;
  error?: string;
  onRetry: () => void;
  cluster: string | null;
  workloads: Workload[];
}) {
  if (error)
    return (
      <p className="px-5 pb-5 text-sm text-muted">
        Could not read this cluster. {error}{" "}
        <button
          type="button"
          onClick={onRetry}
          className="text-fg underline-offset-4 hover:underline"
        >
          Retry
        </button>
      </p>
    );
  const counts = countBy(workloads);
  const groups = byNamespace(workloads);
  return (
    <>
      <div className="grid grid-cols-2 border-y border-border sm:grid-cols-4 [&>*]:border-border sm:[&>*+*]:border-l max-sm:[&>*:nth-child(even)]:border-l max-sm:[&>*:nth-child(n+3)]:border-t">
        {loading ? (
          [0, 1, 2, 3].map((i) => (
            <div key={i} className="flex flex-col gap-2 px-5 py-4">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-7 w-10" />
            </div>
          ))
        ) : (
          <>
            <Figure label="Workloads" value={workloads.length} />
            <Figure label="Failing" value={counts.error} tone="danger" />
            <Figure label="Degraded" value={counts.warning} tone="warning" />
            <Figure label="Healthy" value={counts.healthy} />
          </>
        )}
      </div>
      <ul className="flex flex-col py-2">
        {loading &&
          [0, 1, 2].map((i) => (
            <li key={i} className="flex items-center gap-4 px-5 py-2.5">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3.5 flex-1" />
            </li>
          ))}
        {!loading && groups.length === 0 && (
          <li className="px-5 py-3 text-sm text-muted">No workloads in this cluster yet</li>
        )}
        {groups.map((group) => (
          <li
            key={group.namespace}
            className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-5 py-3 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)_auto]"
          >
            <span className="truncate font-mono text-sm text-fg" title={group.namespace}>
              {group.namespace}
            </span>
            <span className="col-span-2 row-start-2 flex flex-wrap gap-1 sm:col-span-1 sm:row-start-auto">
              {group.workloads.map((w) => (
                <Link
                  key={w.ref}
                  href={cluster ? managerHref(cluster, w) : "#"}
                  title={`${w.name} (${w.kind})${w.reason ? `: ${w.reason}` : ""}`}
                  aria-label={`${w.kind} ${w.name}, ${w.status}`}
                  className={`h-5 w-5 rounded-[4px] transition-colors ${CELL[w.status]}`}
                />
              ))}
            </span>
            <span className={`text-right text-sm ${group.failing ? "text-fg" : "text-muted"}`}>
              {group.failing
                ? `${group.failing} of ${group.workloads.length} failing`
                : `${group.workloads.length} healthy`}
            </span>
          </li>
        ))}
      </ul>
      {!loading && workloads.length > 0 && (
        <div className="flex flex-wrap gap-x-5 gap-y-1 border-t border-border px-5 py-3 text-xs text-muted">
          <Legend className={CELL.healthy} label="Healthy" />
          <Legend className={CELL.warning} label="Degraded" />
          <Legend className={CELL.error} label="Failing" />
          <span>One square per workload. Select one to open it</span>
        </div>
      )}
    </>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`h-2.5 w-2.5 rounded-[2px] ${className}`} />
      {label}
    </span>
  );
}

function FailingList({
  loading,
  cluster,
  failing,
  checked,
}: {
  loading: boolean;
  cluster: string | null;
  failing: Workload[];
  checked: number;
}) {
  if (loading)
    return (
      <ul className="flex flex-col gap-4 px-5 pb-5 pt-2">
        {[0, 1, 2, 3].map((i) => (
          <li key={i} className="flex flex-col gap-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-3.5 w-full" />
          </li>
        ))}
      </ul>
    );
  if (failing.length === 0)
    return (
      <p className="px-5 pb-5 text-sm text-muted">
        Nothing is failing. Checked {checked} workload{checked === 1 ? "" : "s"}
      </p>
    );
  return (
    <>
      <ul className="flex flex-col divide-y divide-border border-t border-border">
        {failing.slice(0, FAILING_ROWS).map((w) => (
          <li key={w.ref} className="flex items-start gap-3 px-5 py-3">
            <span className="pt-1.5">
              <Dot tone={w.status === "error" ? "critical" : "warning"} />
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="flex items-baseline gap-2">
                <span className="truncate text-sm font-semibold">{w.name}</span>
                <span className="shrink-0 text-xs text-subtle">
                  {w.kind} in {w.namespace}
                </span>
              </span>
              {w.reason && <span className="line-clamp-2 text-sm text-muted">{w.reason}</span>}
            </span>
            {cluster && (
              <Link
                href={investigateHref(cluster, w)}
                className="shrink-0 pt-0.5 text-sm font-medium text-fg underline-offset-4 hover:underline"
              >
                Investigate
              </Link>
            )}
          </li>
        ))}
      </ul>
      {failing.length > FAILING_ROWS && (
        <p className="mt-auto border-t border-border px-5 py-3 text-sm text-muted">
          {failing.length - FAILING_ROWS} more on the map
        </p>
      )}
    </>
  );
}

function RecentInvestigations() {
  const recent = useQuery({
    queryKey: ["investigations", 5],
    queryFn: () => api.investigations(5),
  });
  if (recent.isPending)
    return (
      <div className="flex flex-col gap-4 px-5 pb-5 pt-2">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-4 w-full" />
        ))}
      </div>
    );
  if (recent.isError)
    return <p className="px-5 pb-5 text-sm text-muted">Could not load investigations</p>;
  if (recent.data.length === 0)
    return (
      <p className="px-5 pb-5 text-sm text-muted">
        No investigations yet. Run one from Cluster Doctor to see root causes here
      </p>
    );
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-xs text-subtle">
          <tr>
            <th className="px-5 pb-2 font-normal">Result</th>
            <th className="px-3 pb-2 font-normal">Scope</th>
            <th className="hidden px-3 pb-2 font-normal md:table-cell">Top finding</th>
            <th className="px-5 pb-2 text-right font-normal">When</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border border-t border-border">
          {recent.data.map((item) => (
            <tr key={item.id} className="transition-colors hover:bg-surface">
              <td className="whitespace-nowrap px-5 py-3">
                <Link
                  href={`/doctor?id=${item.id}`}
                  className="flex items-center gap-2.5 font-medium"
                >
                  <Dot tone={tone(item)} />
                  {headline(item)}
                </Link>
              </td>
              <td className="whitespace-nowrap px-3 py-3 text-muted">
                {item.namespace ?? "All namespaces"}
              </td>
              <td className="hidden max-w-0 truncate px-3 py-3 text-muted md:table-cell md:w-1/2">
                {item.summary ?? item.error ?? "–"}
              </td>
              <td className="whitespace-nowrap px-5 py-3 text-right text-muted">
                {timeAgo(item.created_at)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ClusterList() {
  const clusters = useQuery({ queryKey: ["clusters"], queryFn: api.clusters });
  if (clusters.isPending)
    return (
      <div className="flex flex-col gap-4 px-5 pb-5 pt-2">
        <Skeleton className="h-4 w-40" />
      </div>
    );
  if (clusters.isError)
    return <p className="px-5 pb-5 text-sm text-muted">Could not list clusters</p>;
  return (
    <ul className="flex flex-col divide-y divide-border border-t border-border">
      {clusters.data.map((c) => (
        <li key={c.id} className="flex items-center gap-3 px-5 py-3">
          <Dot tone={c.status?.reachable ? "healthy" : "critical"} />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-sm font-medium">{c.name}</span>
            <span className="truncate text-xs text-subtle">
              {c.status?.reachable
                ? `Kubernetes ${c.status.version}`
                : (c.status?.error ?? "Unreachable")}
            </span>
          </span>
          {c.is_default && <span className="text-xs text-subtle">Default</span>}
        </li>
      ))}
    </ul>
  );
}
